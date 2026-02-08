// MandalaBurn - Edge Rulers (mm scale on canvas edges)
MB.Rulers = {
    _hCanvas: null,
    _vCanvas: null,
    _hCtx: null,
    _vCtx: null,
    _mouseProject: null, // current mouse position in project coords
    _rafPending: false,

    init() {
        this._hCanvas = document.getElementById('ruler-h');
        this._vCanvas = document.getElementById('ruler-v');
        if (!this._hCanvas || !this._vCanvas) return;

        this._hCtx = this._hCanvas.getContext('2d');
        this._vCtx = this._vCanvas.getContext('2d');

        // Track mouse for cursor indicator
        document.getElementById('main-canvas')?.addEventListener('mousemove', (e) => {
            const rect = e.target.getBoundingClientRect();
            this._mouseProject = paper.view.viewToProject(
                new paper.Point(e.clientX - rect.left, e.clientY - rect.top)
            );
            this._scheduleRedraw();
        });

        MB.App.on('view-changed', () => this._scheduleRedraw());
        window.addEventListener('resize', () => {
            this._resize();
            this.draw();
        });

        // Initial draw after a short delay (Paper.js needs to init)
        setTimeout(() => { this._resize(); this.draw(); }, 100);
    },

    _resize() {
        if (!this._hCanvas || !this._vCanvas) return;
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        this._hCanvas.width = w * dpr;
        this._hCanvas.height = 20 * dpr;
        this._hCanvas.style.width = w + 'px';
        this._hCtx.scale(dpr, dpr);

        this._vCanvas.width = 20 * dpr;
        this._vCanvas.height = h * dpr;
        this._vCanvas.style.height = h + 'px';
        this._vCtx.scale(dpr, dpr);
    },

    _scheduleRedraw() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this.draw();
        });
    },

    draw() {
        this._drawHorizontal();
        this._drawVertical();
    },

    _getTickInterval(zoom) {
        // Choose nice tick intervals based on zoom level
        const pixPerMm = zoom;
        const minPixBetweenTicks = 5;
        const candidates = [0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
        for (const c of candidates) {
            if (c * pixPerMm >= minPixBetweenTicks) return c;
        }
        return 1000;
    },

    _getMajorEvery(interval) {
        if (interval < 1) return Math.round(1 / interval);
        if (interval < 5) return 5;
        if (interval < 10) return 10;
        if (interval < 50) return 5;
        return 10;
    },

    _drawHorizontal() {
        const ctx = this._hCtx;
        const canvas = this._hCanvas;
        if (!ctx || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = 20;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#353550';
        ctx.fillRect(0, 0, w, h);

        const zoom = paper.view.zoom;
        const viewBounds = paper.view.bounds;
        const interval = this._getTickInterval(zoom);
        const majorEvery = this._getMajorEvery(interval);

        const startMm = Math.floor(viewBounds.left / interval) * interval;
        const endMm = Math.ceil(viewBounds.right / interval) * interval;

        ctx.strokeStyle = '#707080';
        ctx.fillStyle = '#a0a0b0';
        ctx.font = '9px Consolas, SF Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        let tickIdx = 0;
        for (let mm = startMm; mm <= endMm; mm += interval) {
            const viewPt = paper.view.projectToView(new paper.Point(mm, 0));
            const x = viewPt.x;
            if (x < 0 || x > w) { tickIdx++; continue; }

            const isMajor = Math.abs(Math.round(mm / interval) % majorEvery) === 0;
            const tickH = isMajor ? 12 : 5;

            ctx.beginPath();
            ctx.moveTo(x, h);
            ctx.lineTo(x, h - tickH);
            ctx.lineWidth = isMajor ? 1 : 0.5;
            ctx.stroke();

            if (isMajor) {
                const label = Number.isInteger(mm) ? mm.toString() : mm.toFixed(1);
                ctx.fillText(label, x, 1);
            }
            tickIdx++;
        }

        // Cursor indicator
        if (this._mouseProject) {
            const cx = paper.view.projectToView(this._mouseProject).x;
            if (cx >= 0 && cx <= w) {
                ctx.fillStyle = '#ef6c6c';
                ctx.beginPath();
                ctx.moveTo(cx - 4, h);
                ctx.lineTo(cx + 4, h);
                ctx.lineTo(cx, h - 6);
                ctx.closePath();
                ctx.fill();
            }
        }
    },

    _drawVertical() {
        const ctx = this._vCtx;
        const canvas = this._vCanvas;
        if (!ctx || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = 20;
        const h = canvas.height / dpr;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#353550';
        ctx.fillRect(0, 0, w, h);

        const zoom = paper.view.zoom;
        const viewBounds = paper.view.bounds;
        const interval = this._getTickInterval(zoom);
        const majorEvery = this._getMajorEvery(interval);

        const startMm = Math.floor(viewBounds.top / interval) * interval;
        const endMm = Math.ceil(viewBounds.bottom / interval) * interval;

        ctx.strokeStyle = '#707080';
        ctx.fillStyle = '#a0a0b0';
        ctx.font = '9px Consolas, SF Mono, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let mm = startMm; mm <= endMm; mm += interval) {
            const viewPt = paper.view.projectToView(new paper.Point(0, mm));
            const y = viewPt.y;
            if (y < 0 || y > h) continue;

            const isMajor = Math.abs(Math.round(mm / interval) % majorEvery) === 0;
            const tickW = isMajor ? 12 : 5;

            ctx.beginPath();
            ctx.moveTo(w, y);
            ctx.lineTo(w - tickW, y);
            ctx.lineWidth = isMajor ? 1 : 0.5;
            ctx.stroke();

            if (isMajor) {
                ctx.save();
                ctx.translate(8, y);
                ctx.rotate(-Math.PI / 2);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const label = Number.isInteger(mm) ? mm.toString() : mm.toFixed(1);
                ctx.fillText(label, 0, 0);
                ctx.restore();
            }
        }

        // Cursor indicator
        if (this._mouseProject) {
            const cy = paper.view.projectToView(this._mouseProject).y;
            if (cy >= 0 && cy <= h) {
                ctx.fillStyle = '#ef6c6c';
                ctx.beginPath();
                ctx.moveTo(w, cy - 4);
                ctx.lineTo(w, cy + 4);
                ctx.lineTo(w - 6, cy);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
};
