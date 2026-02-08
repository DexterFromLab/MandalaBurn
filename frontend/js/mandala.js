// MandalaBurn - Mandala Editor (Radial Symmetry Drawing)
MB.Mandala = {
    active: false,
    center: null,           // paper.Point
    segments: 8,
    mirror: true,
    showGuides: true,
    showRings: true,
    ringSpacing: 20,        // mm between rings

    _guideLayer: null,
    _processing: false,
    _settingCenter: false,  // waiting for center click
    _tool: null,            // paper.Tool for center placement

    init() {
        // Create guide layer (above background, below user layers)
        const bgLayer = MB.Canvas.bgLayer;
        this._guideLayer = new paper.Layer({ name: 'mandala-guides' });
        this._guideLayer.visible = false;
        // Move guide layer right above background
        this._guideLayer.insertAbove(bgLayer);

        // Activate user layer
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();

        this._createTool();
        this._wireUI();

        // Redraw guides on zoom/pan (zoom-independent sizing)
        MB.App.on('view-changed', () => {
            if (this.active && this.center) this.drawGuides();
        });
    },

    _createTool() {
        this._tool = new paper.Tool();
        this._tool.name = 'mandala';

        this._tool.onMouseDown = (event) => {
            const point = MB.GridSnap.snap(event.point, event);
            this.setCenter(point);
            document.getElementById('status-info').textContent =
                'Mandala center set. Switch to a drawing tool to start creating.';
        };

        this._tool.onMouseMove = (event) => {
            // Show crosshair preview at mouse pos if no center yet
            if (!this.center) {
                document.getElementById('status-info').textContent =
                    'Click canvas to set mandala center point.';
            }
        };
    },

    // ---- Activation ----

    activate() {
        this.active = true;
        this._guideLayer.visible = true;
        this._tool.activate();

        if (this.center) {
            this.drawGuides();
            document.getElementById('status-info').textContent =
                'Mandala mode active. Draw with any tool for radial symmetry.';
        } else {
            document.getElementById('status-info').textContent =
                'Click canvas to set mandala center point.';
        }
    },

    deactivate() {
        // Don't deactivate mandala mode when switching tools —
        // only deactivate when explicitly toggled off
    },

    toggleActive() {
        if (this.active) {
            this.active = false;
            this._guideLayer.visible = false;
            this.clearGuides();
            document.getElementById('status-info').textContent = 'Mandala mode off.';
        } else {
            this.activate();
        }
    },

    // ---- Center Point ----

    setCenter(point) {
        this.center = new paper.Point(point.x, point.y);
        document.getElementById('mandala-cx').value = point.x.toFixed(1);
        document.getElementById('mandala-cy').value = point.y.toFixed(1);
        this.drawGuides();
    },

    // ---- Guide Rendering ----

    drawGuides() {
        this.clearGuides();
        if (!this.center) return;
        this._guideLayer.activate();

        const zoom = paper.view.zoom;
        const len = Math.max(MB.Canvas.wsWidth, MB.Canvas.wsHeight) * 1.5;
        const totalSlices = this.mirror ? this.segments * 2 : this.segments;

        // Radial guide lines
        if (this.showGuides) {
            for (let i = 0; i < totalSlices; i++) {
                const angle = (i / totalSlices) * 2 * Math.PI;
                const isMirrorLine = this.mirror && (i % 2 === 1);
                new paper.Path.Line({
                    from: this.center,
                    to: [
                        this.center.x + Math.cos(angle) * len,
                        this.center.y + Math.sin(angle) * len
                    ],
                    strokeColor: isMirrorLine ? '#ef6c6c' : '#6c8fef',
                    strokeWidth: (isMirrorLine ? 0.3 : 0.5) / zoom,
                    dashArray: [4 / zoom, 4 / zoom],
                    opacity: isMirrorLine ? 0.25 : 0.4,
                    parent: this._guideLayer
                });
            }
        }

        // Concentric rings
        if (this.showRings && this.ringSpacing > 0) {
            const maxR = len;
            for (let r = this.ringSpacing; r <= maxR; r += this.ringSpacing) {
                new paper.Path.Circle({
                    center: this.center,
                    radius: r,
                    strokeColor: '#6c8fef',
                    strokeWidth: 0.3 / zoom,
                    dashArray: [2 / zoom, 4 / zoom],
                    opacity: 0.25,
                    fillColor: null,
                    parent: this._guideLayer
                });
            }
        }

        // Center marker
        const s = 10 / zoom;
        const w = 1.5 / zoom;
        new paper.Path.Line({
            from: [this.center.x - s, this.center.y],
            to: [this.center.x + s, this.center.y],
            strokeColor: '#ff3333', strokeWidth: w,
            parent: this._guideLayer
        });
        new paper.Path.Line({
            from: [this.center.x, this.center.y - s],
            to: [this.center.x, this.center.y + s],
            strokeColor: '#ff3333', strokeWidth: w,
            parent: this._guideLayer
        });
        new paper.Path.Circle({
            center: this.center, radius: s * 0.4,
            strokeColor: '#ff3333', strokeWidth: w * 0.7,
            fillColor: null,
            parent: this._guideLayer
        });

        // Reactivate user layer
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();
    },

    clearGuides() {
        if (this._guideLayer) this._guideLayer.removeChildren();
    },

    // ---- Item Replication ----

    _onNewSelection(items) {
        if (!this.active || !this.center || this._processing) return;

        // Find items that need replication:
        // - Must be isUserItem
        // - Must NOT be a mandala group already
        // - Must NOT be inside a mandala group
        const toReplicate = [];
        for (const item of items) {
            if (!item || !item.data || !item.data.isUserItem) continue;
            if (item.data.isMandalaGroup) continue;
            if (item.parent && item.parent.data && item.parent.data.isMandalaGroup) continue;
            // Skip if this is a guide or simulator item
            if (item.layer === this._guideLayer) continue;
            toReplicate.push(item);
        }

        if (toReplicate.length === 0) return;

        this._processing = true;
        try {
            for (const item of toReplicate) {
                this._replicateItem(item);
            }
        } finally {
            this._processing = false;
        }
    },

    _replicateItem(item) {
        const angleStep = 360 / this.segments;
        const copies = [item];

        // Create rotated copies
        for (let i = 1; i < this.segments; i++) {
            const copy = item.clone();
            copy.rotate(angleStep * i, this.center);
            copies.push(copy);
        }

        // Mirror copies if enabled
        if (this.mirror) {
            const mirrorCopies = [];
            for (let i = 0; i < this.segments; i++) {
                const mc = copies[i].clone();
                // Reflect across radial line at angle (i * angleStep)
                // Method: translate to origin, reflect across the line, translate back
                const refAngle = i * angleStep;
                // Paper.js trick: scale(-1,1) + rotate to get reflection across arbitrary axis
                const refRad = refAngle * Math.PI / 180;
                // Transform: move center to origin, reflect, move back
                mc.translate(this.center.negate());
                // Reflect across line at refAngle from x-axis:
                // rotate(-refAngle), scale(1,-1), rotate(refAngle)
                mc.rotate(-refAngle, new paper.Point(0, 0));
                mc.scale(1, -1, new paper.Point(0, 0));
                mc.rotate(refAngle, new paper.Point(0, 0));
                mc.translate(this.center);
                mirrorCopies.push(mc);
            }
            copies.push(...mirrorCopies);
        }

        // Group all copies
        const layer = item.layer || (MB.Layers.getActiveLayer() && MB.Layers.getActiveLayer().paperLayer);
        const group = new paper.Group(copies);
        group.data = { isUserItem: true, isMandalaGroup: true, mandalaSegments: this.segments };

        // Ensure group is in the correct layer
        if (layer && group.layer !== layer) {
            layer.addChild(group);
        }

        MB.App.selectedItems = [group];
        group.selected = true;
        MB.App.emit('selection-changed', MB.App.selectedItems);
    },

    // ---- UI Wiring ----

    _wireUI() {
        // Segment count input
        const segInput = document.getElementById('mandala-segments');
        segInput.addEventListener('input', () => {
            this.segments = parseInt(segInput.value) || 8;
            this._syncPresetButtons();
            if (this.center) this.drawGuides();
        });

        // Segment preset buttons
        document.getElementById('mandala-seg-presets').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-val]');
            if (!btn) return;
            this.segments = parseInt(btn.dataset.val);
            segInput.value = this.segments;
            this._syncPresetButtons();
            if (this.center) this.drawGuides();
        });

        // Mirror toggle
        document.getElementById('mandala-mirror').addEventListener('change', (e) => {
            this.mirror = e.target.checked;
            if (this.center) this.drawGuides();
        });

        // Guide toggles
        document.getElementById('mandala-guides').addEventListener('change', (e) => {
            this.showGuides = e.target.checked;
            if (this.center) this.drawGuides();
        });
        document.getElementById('mandala-rings').addEventListener('change', (e) => {
            this.showRings = e.target.checked;
            if (this.center) this.drawGuides();
        });

        // Ring spacing
        document.getElementById('mandala-ring-spacing').addEventListener('input', (e) => {
            this.ringSpacing = parseFloat(e.target.value) || 20;
            if (this.center) this.drawGuides();
        });

        // Center coordinate inputs
        document.getElementById('mandala-cx').addEventListener('change', (e) => {
            const x = parseFloat(e.target.value);
            const y = parseFloat(document.getElementById('mandala-cy').value);
            if (!isNaN(x) && !isNaN(y)) {
                this.setCenter(new paper.Point(x, y));
            }
        });
        document.getElementById('mandala-cy').addEventListener('change', (e) => {
            const x = parseFloat(document.getElementById('mandala-cx').value);
            const y = parseFloat(e.target.value);
            if (!isNaN(x) && !isNaN(y)) {
                this.setCenter(new paper.Point(x, y));
            }
        });

        // "Click to set center" button
        document.getElementById('mandala-set-center').addEventListener('click', () => {
            // Switch to mandala tool to place center
            MB.App.setTool('mandala');
        });
    },

    _syncPresetButtons() {
        document.querySelectorAll('#mandala-seg-presets .bg-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.val) === this.segments);
        });
    }
};

// Register mandala as a tool
MB.App.registerTool('mandala', {
    activate() {
        MB.Mandala.activate();
    },
    deactivate() {
        // Keep mandala mode active — only the tool changes
        // Mandala deactivates only via explicit toggle
        MB.Mandala.deactivate();
    },
    cancel() {
        MB.Mandala.toggleActive();
    }
});
