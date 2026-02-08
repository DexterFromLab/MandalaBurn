// MandalaBurn - Grid & Snapping System
MB.GridSnap = {
    gridSize: 10,           // mm - visual grid spacing
    snapStep: 10,           // mm - snap resolution (defaults to grid size)
    snapEnabled: true,
    _ctrlHeld: false,       // Ctrl = 10x finer snap
    displayMode: 'dots',    // 'lines' | 'dots' | 'none'
    majorMultiplier: 5,     // major line every N grid lines (0 = off)
    objectSnapEnabled: false,
    _snapIndicator: null,
    gridGroup: null,

    // Colors
    _minorColor: '#d0d0dc',
    _majorColor: '#b0b0c8',
    _dotColor: '#9090a8',
    _majorDotColor: '#b0b0c8',

    init() {
        this._initDisplayMode();
        this._initGridPresets();
        this._initSnapControls();
        this._initMajorSelect();
        this._initCustomInputs();
        this._initCtrlFineSnap();
    },

    // --- UI wiring ---

    _initDisplayMode() {
        const group = document.getElementById('grid-display-mode');
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.bg-btn');
            if (!btn) return;
            group.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.displayMode = btn.dataset.val;
            this.drawGrid();
        });
        // Set initial active
        this._setGroupActive('grid-display-mode', this.displayMode);
    },

    _initGridPresets() {
        const group = document.getElementById('grid-size-presets');
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.bg-btn');
            if (!btn) return;
            group.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.gridSize = parseFloat(btn.dataset.val);
            document.getElementById('grid-size').value = this.gridSize;
            this._syncSnapToGrid();
            this.drawGrid();
        });
    },

    _initSnapControls() {
        // Toggle button
        const toggleBtn = document.getElementById('snap-toggle');
        toggleBtn.addEventListener('click', () => {
            this.snapEnabled = !this.snapEnabled;
            toggleBtn.textContent = this.snapEnabled ? 'ON' : 'OFF';
            toggleBtn.classList.toggle('off', !this.snapEnabled);
        });

        // Object snap toggle
        const objSnapBtn = document.getElementById('obj-snap-toggle');
        if (objSnapBtn) {
            objSnapBtn.addEventListener('click', () => {
                this.objectSnapEnabled = !this.objectSnapEnabled;
                objSnapBtn.textContent = this.objectSnapEnabled ? 'ON' : 'OFF';
                objSnapBtn.classList.toggle('off', !this.objectSnapEnabled);
            });
        }

        // Snap step presets
        const group = document.getElementById('snap-step-presets');
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.bg-btn');
            if (!btn) return;
            group.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.snapStep = parseFloat(btn.dataset.val);
            document.getElementById('snap-step').value = this.snapStep;
        });
    },

    _initMajorSelect() {
        document.getElementById('grid-major').addEventListener('change', (e) => {
            this.majorMultiplier = parseInt(e.target.value) || 0;
            this.drawGrid();
        });
    },

    _initCustomInputs() {
        document.getElementById('grid-size').addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                this.gridSize = val;
                this._clearGroupActive('grid-size-presets');
                this._syncSnapToGrid();
                this.drawGrid();
            }
        });
        document.getElementById('snap-step').addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                this.snapStep = val;
                this._clearGroupActive('snap-step-presets');
            }
        });
    },

    _setGroupActive(groupId, value) {
        const group = document.getElementById(groupId);
        group.querySelectorAll('.bg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.val === String(value));
        });
    },

    _clearGroupActive(groupId) {
        document.getElementById(groupId).querySelectorAll('.bg-btn').forEach(b => {
            b.classList.remove('active');
        });
    },

    _syncSnapToGrid() {
        this.snapStep = this.gridSize;
        document.getElementById('snap-step').value = this.snapStep;
        this._setGroupActive('snap-step-presets', this.snapStep);
    },

    // --- Grid drawing ---

    drawGrid() {
        const bgLayer = MB.Canvas.bgLayer;
        if (this.gridGroup) this.gridGroup.remove();
        this.gridGroup = null;

        if (this.displayMode === 'none') {
            this._activateUserLayer();
            return;
        }

        bgLayer.activate();
        this.gridGroup = new paper.Group({ name: 'grid' });

        const w = MB.Canvas.wsWidth;
        const h = MB.Canvas.wsHeight;
        const step = this.gridSize;

        if (step <= 0) { this._activateUserLayer(); return; }

        // Limit number of elements for performance
        const maxElements = 10000;
        const countX = Math.floor(w / step);
        const countY = Math.floor(h / step);

        if (this.displayMode === 'lines') {
            this._drawLines(w, h, step, countX, countY, maxElements);
        } else if (this.displayMode === 'dots') {
            this._drawDots(w, h, step, countX, countY, maxElements);
        }

        this.gridGroup.locked = true;
        this._activateUserLayer();
    },

    _drawLines(w, h, step, countX, countY, maxElements) {
        if ((countX + countY) > maxElements) {
            // Too many lines, skip minor
            if (this.majorMultiplier > 0) {
                step = step * this.majorMultiplier;
            } else {
                this._activateUserLayer();
                return;
            }
        }

        const majorStep = this.majorMultiplier > 0 ? step * this.majorMultiplier : 0;

        // Minor vertical
        for (let x = step; x < w; x += step) {
            const isMajor = majorStep > 0 && Math.abs(x % majorStep) < 0.001;
            if (isMajor) continue; // draw major separately
            this.gridGroup.addChild(new paper.Path.Line({
                from: [x, 0], to: [x, h],
                strokeColor: this._minorColor,
                strokeWidth: 0.15
            }));
        }
        // Minor horizontal
        for (let y = step; y < h; y += step) {
            const isMajor = majorStep > 0 && Math.abs(y % majorStep) < 0.001;
            if (isMajor) continue;
            this.gridGroup.addChild(new paper.Path.Line({
                from: [0, y], to: [w, y],
                strokeColor: this._minorColor,
                strokeWidth: 0.15
            }));
        }

        // Major lines
        if (majorStep > 0) {
            for (let x = majorStep; x < w; x += majorStep) {
                this.gridGroup.addChild(new paper.Path.Line({
                    from: [x, 0], to: [x, h],
                    strokeColor: this._majorColor,
                    strokeWidth: 0.35
                }));
            }
            for (let y = majorStep; y < h; y += majorStep) {
                this.gridGroup.addChild(new paper.Path.Line({
                    from: [0, y], to: [w, y],
                    strokeColor: this._majorColor,
                    strokeWidth: 0.35
                }));
            }
        }
    },

    _drawDots(w, h, step, countX, countY, maxElements) {
        const totalDots = countX * countY;
        let drawStep = step;

        // If too many dots, increase spacing
        if (totalDots > maxElements) {
            const factor = Math.ceil(Math.sqrt(totalDots / maxElements));
            drawStep = step * factor;
        }

        const majorStep = this.majorMultiplier > 0 ? step * this.majorMultiplier : 0;
        const dotRadius = 0.3;
        const majorDotRadius = 0.5;

        for (let x = drawStep; x < w; x += drawStep) {
            for (let y = drawStep; y < h; y += drawStep) {
                const isMajor = majorStep > 0 &&
                    Math.abs(x % majorStep) < 0.001 &&
                    Math.abs(y % majorStep) < 0.001;

                this.gridGroup.addChild(new paper.Path.Circle({
                    center: [x, y],
                    radius: isMajor ? majorDotRadius : dotRadius,
                    fillColor: isMajor ? this._majorDotColor : this._dotColor
                }));
            }
        }
    },

    _activateUserLayer() {
        const activeLayer = MB.Layers && MB.Layers.getActiveLayer();
        if (activeLayer) activeLayer.paperLayer.activate();
    },

    // --- Ctrl fine-snap ---

    _initCtrlFineSnap() {
        // Track Ctrl from all event types for maximum reliability
        const update = (e) => { this._ctrlHeld = e.ctrlKey; };
        document.addEventListener('keydown', update, true);
        document.addEventListener('keyup', update, true);
        document.addEventListener('mousemove', update, true);
        document.addEventListener('mousedown', update, true);
        document.addEventListener('mouseup', update, true);
        window.addEventListener('blur', () => { this._ctrlHeld = false; });
    },

    // --- Snapping ---

    _getCtrl(event) {
        // Paper.js ToolEvent → dig out the raw DOM event
        if (event && event.event) return event.event.ctrlKey;
        // Raw DOM event
        if (event && typeof event.ctrlKey === 'boolean') return event.ctrlKey;
        // Fallback to tracked state
        return this._ctrlHeld;
    },

    snap(point, event) {
        this.clearSnapIndicator();

        // Object snap (higher priority)
        if (this.objectSnapEnabled) {
            const objSnap = this.snapToObjects(point);
            if (objSnap) {
                this.showSnapIndicator(objSnap);
                return objSnap;
            }
        }

        if (!this.snapEnabled) return point;
        const ctrl = this._getCtrl(event);
        const s = ctrl ? this.snapStep / 10 : this.snapStep;
        return new paper.Point(
            Math.round(point.x / s) * s,
            Math.round(point.y / s) * s
        );
    },

    snapToObjects(point) {
        const threshold = 8 / paper.view.zoom; // 8 screen pixels
        let best = null;
        let bestDist = threshold;

        const selectedSet = new Set(MB.App.selectedItems);

        MB.Layers.layers.forEach(layer => {
            if (!layer.visible) return;
            layer.paperLayer.children.forEach(item => {
                if (!item.data || !item.data.isUserItem) return;
                if (selectedSet.has(item)) return; // skip items being dragged

                // Check bounds snap points
                const b = item.bounds;
                const pts = [
                    b.center,
                    b.topLeft, b.topRight, b.bottomLeft, b.bottomRight,
                    new paper.Point(b.center.x, b.top),    // top-mid
                    new paper.Point(b.center.x, b.bottom),  // bottom-mid
                    new paper.Point(b.left, b.center.y),    // left-mid
                    new paper.Point(b.right, b.center.y)    // right-mid
                ];

                // Path segment points
                if (item instanceof paper.Path && item.segments) {
                    item.segments.forEach(seg => pts.push(seg.point));
                }
                if (item instanceof paper.CompoundPath && item.children) {
                    item.children.forEach(child => {
                        if (child.segments) {
                            child.segments.forEach(seg => pts.push(seg.point));
                        }
                    });
                }

                for (const pt of pts) {
                    const d = point.getDistance(pt);
                    if (d < bestDist) {
                        bestDist = d;
                        best = pt.clone();
                    }
                }
            });
        });

        return best;
    },

    showSnapIndicator(point) {
        this.clearSnapIndicator();
        const zoom = paper.view.zoom;
        const s = 6 / zoom;
        const w = 1.5 / zoom;

        const prevActive = paper.project.activeLayer;
        MB.Canvas.bgLayer.activate();

        this._snapIndicator = new paper.Group({
            children: [
                new paper.Path.Line({
                    from: [point.x - s, point.y],
                    to: [point.x + s, point.y],
                    strokeColor: '#ff8800',
                    strokeWidth: w
                }),
                new paper.Path.Line({
                    from: [point.x, point.y - s],
                    to: [point.x, point.y + s],
                    strokeColor: '#ff8800',
                    strokeWidth: w
                }),
                new paper.Path.Circle({
                    center: point,
                    radius: s * 0.6,
                    strokeColor: '#ff8800',
                    strokeWidth: w * 0.7,
                    fillColor: null
                })
            ]
        });

        prevActive.activate();
    },

    clearSnapIndicator() {
        if (this._snapIndicator) {
            this._snapIndicator.remove();
            this._snapIndicator = null;
        }
    },

    toggleGrid() {
        if (this.displayMode === 'none') {
            this.displayMode = 'dots';
        } else if (this.displayMode === 'dots') {
            this.displayMode = 'lines';
        } else {
            this.displayMode = 'none';
        }
        this._setGroupActive('grid-display-mode', this.displayMode);
        this.drawGrid();
        document.getElementById('status-info').textContent =
            'Grid: ' + this.displayMode;
    },

    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;
        const btn = document.getElementById('snap-toggle');
        btn.textContent = this.snapEnabled ? 'ON' : 'OFF';
        btn.classList.toggle('off', !this.snapEnabled);
        document.getElementById('status-info').textContent =
            'Snap ' + (this.snapEnabled ? 'ON' : 'OFF');
    }
};
