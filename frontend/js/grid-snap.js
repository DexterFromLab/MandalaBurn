// MandalaBurn - Grid & Snapping System
MB.GridSnap = {
    gridSize: 10,           // mm - visual grid spacing
    snapStep: 10,           // mm - snap resolution (defaults to grid size)
    snapEnabled: true,
    displayMode: 'dots',    // 'lines' | 'dots' | 'none'
    majorMultiplier: 5,     // major line every N grid lines (0 = off)
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

    // --- Snapping ---

    snap(point) {
        if (!this.snapEnabled) return point;
        const s = this.snapStep;
        return new paper.Point(
            Math.round(point.x / s) * s,
            Math.round(point.y / s) * s
        );
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
