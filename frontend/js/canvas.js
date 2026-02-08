// MandalaBurn - Canvas management (Paper.js)
MB.Canvas = {
    workspace: null,    // Rectangle representing the material/work area
    wsWidth: 300,       // mm
    wsHeight: 200,      // mm
    _panning: false,
    _panStart: null,
    _spaceDown: false,

    init() {
        const canvas = document.getElementById('main-canvas');
        paper.setup(canvas);

        // Fit canvas buffer to container (replaces Paper.js 'resize' attribute)
        this._fitCanvasToContainer();

        // Create workspace layer (background, always at bottom)
        this.bgLayer = new paper.Layer({ name: 'background' });
        this.bgLayer.activate();

        this.drawWorkspace();

        // Set initial view
        this.zoomFit();

        // Mouse events for pan/zoom
        const container = document.getElementById('canvas-container');
        container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        container.addEventListener('mouseup', (e) => this.onMouseUp(e));
        container.addEventListener('contextmenu', (e) => e.preventDefault());

        // Space key for temporary pan
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input,select,textarea')) {
                e.preventDefault();
                this._spaceDown = true;
                document.getElementById('main-canvas').style.cursor = 'grab';
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spaceDown = false;
                this._panning = false;
                document.getElementById('main-canvas').style.cursor = '';
            }
        });

        // Track mouse position for status bar
        paper.view.onMouseMove = (e) => {
            const pt = e.point;
            document.getElementById('status-coords').textContent =
                `X: ${pt.x.toFixed(1)} Y: ${pt.y.toFixed(1)}`;
            // Show current snap step (Ctrl = fine)
            const gs = MB.GridSnap;
            if (gs.snapEnabled) {
                const s = gs._ctrlHeld ? gs.snapStep / 10 : gs.snapStep;
                document.getElementById('status-info').textContent =
                    'Snap: ' + s + 'mm' + (gs._ctrlHeld ? ' (fine)' : '');
            }
        };

        // Canvas settings inputs
        document.getElementById('canvas-w').addEventListener('change', (e) => {
            this.wsWidth = parseFloat(e.target.value) || 300;
            this.drawWorkspace();
        });
        document.getElementById('canvas-h').addEventListener('change', (e) => {
            this.wsHeight = parseFloat(e.target.value) || 200;
            this.drawWorkspace();
        });

        // Handle resize — update canvas buffer to match container
        const ro = new ResizeObserver(() => this._fitCanvasToContainer());
        ro.observe(container);
    },

    _fitCanvasToContainer() {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            paper.view.viewSize = new paper.Size(w, h);
        }
    },

    drawWorkspace() {
        this.bgLayer.activate();
        this.bgLayer.removeChildren();

        // Workspace background (white area = material)
        this.workspace = new paper.Path.Rectangle({
            point: [0, 0],
            size: [this.wsWidth, this.wsHeight],
            fillColor: '#ffffff',
            strokeColor: '#666688',
            strokeWidth: 0.5
        });

        // Re-draw grid on top of workspace
        if (MB.GridSnap) MB.GridSnap.drawGrid();

        // Activate user layer
        const activeLayer = MB.Layers && MB.Layers.getActiveLayer();
        if (activeLayer) activeLayer.paperLayer.activate();
    },

    // --- Zoom ---
    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY;
        const factor = delta > 0 ? 0.9 : 1.1;
        const canvas = document.getElementById('main-canvas');
        const rect = canvas.getBoundingClientRect();
        const mousePos = paper.view.viewToProject(new paper.Point(
            e.clientX - rect.left, e.clientY - rect.top
        ));
        this.zoomAt(mousePos, factor);
    },

    zoomAt(center, factor) {
        const newZoom = paper.view.zoom * factor;
        if (newZoom < 0.1 || newZoom > 200) return;

        const viewCenter = paper.view.center;
        const offset = center.subtract(viewCenter);
        const newCenter = center.subtract(offset.multiply(factor));

        paper.view.zoom = newZoom;
        paper.view.center = newCenter;
        this.updateZoomDisplay();
    },

    zoomIn() {
        paper.view.zoom *= 1.25;
        this.updateZoomDisplay();
    },

    zoomOut() {
        paper.view.zoom *= 0.8;
        this.updateZoomDisplay();
    },

    zoomFit() {
        const bounds = new paper.Rectangle(
            -10, -10,
            this.wsWidth + 20, this.wsHeight + 20
        );
        const viewSize = paper.view.viewSize;
        const zoomX = viewSize.width / bounds.width;
        const zoomY = viewSize.height / bounds.height;
        paper.view.zoom = Math.min(zoomX, zoomY) * 0.95;
        paper.view.center = bounds.center;
        this.updateZoomDisplay();
    },

    updateZoomDisplay() {
        document.getElementById('status-zoom').textContent =
            Math.round(paper.view.zoom * 100) + '%';
        MB.App.emit('view-changed');
    },

    // --- Pan ---
    onMouseDown(e) {
        // Middle mouse button or space+left click = pan
        if (e.button === 1 || (this._spaceDown && e.button === 0)) {
            e.preventDefault();
            this._panning = true;
            this._panStart = new paper.Point(e.clientX, e.clientY);
            document.getElementById('main-canvas').style.cursor = 'grabbing';
        }
    },

    onMouseMove(e) {
        if (this._panning && this._panStart) {
            const current = new paper.Point(e.clientX, e.clientY);
            const delta = this._panStart.subtract(current).divide(paper.view.zoom);
            paper.view.center = paper.view.center.add(delta);
            this._panStart = current;
            MB.App.emit('view-changed');
        }
    },

    onMouseUp(e) {
        if (this._panning) {
            this._panning = false;
            this._panStart = null;
            document.getElementById('main-canvas').style.cursor =
                this._spaceDown ? 'grab' : '';
        }
    },

    // Utility: convert screen coords to project coords
    screenToProject(x, y) {
        return paper.view.viewToProject(new paper.Point(x, y));
    }
};
