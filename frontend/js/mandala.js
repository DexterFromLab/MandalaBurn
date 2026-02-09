// MandalaBurn - Mandala Editor (Live Radial Symmetry Mirroring)
MB.Mandala = {
    active: false,
    center: null,           // paper.Point
    segments: 8,
    mirror: true,
    showGuides: true,
    showRings: true,
    ringSpacing: 20,        // mm between rings
    _sourceLayerId: null,   // layer ID where mandala was activated

    _guideLayer: null,
    _mirrorLayer: null,
    _tool: null,            // paper.Tool for center placement
    _rafId: null,

    init() {
        // Create guide layer (above background, below user layers)
        const bgLayer = MB.Canvas.bgLayer;
        this._guideLayer = new paper.Layer({ name: 'mandala-guides' });
        this._guideLayer.visible = false;
        this._guideLayer.insertAbove(bgLayer);

        // Create mirror layer (above everything for live mirror copies)
        this._mirrorLayer = new paper.Layer({ name: 'mandala-mirrors' });
        this._mirrorLayer.visible = false;
        this._mirrorLayer.locked = true;  // prevent hit-testing on mirrors

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
            // If clicking on an existing user object, select it and switch to select tool
            const hitResult = paper.project.hitTest(event.point, {
                fill: true, stroke: true, segments: false,
                tolerance: 5 / paper.view.zoom
            });
            if (hitResult && hitResult.item) {
                let topItem = null;
                let check = hitResult.item;
                while (check && check !== check.layer) {
                    if (check.data && check.data.isUserItem) topItem = check;
                    check = check.parent;
                }
                if (topItem) {
                    MB.App.select(topItem);
                    MB.App.setTool('select');
                    return;
                }
            }

            const point = MB.GridSnap.snap(event.point, event);
            this.setCenter(point);
            // Auto-switch to select tool so user can start drawing immediately
            setTimeout(() => {
                MB.App.setTool('select');
                document.getElementById('status-info').textContent =
                    'Mandala center set. Draw with any tool \u2014 shapes will be mirrored live.';
            }, 0);
        };

        this._tool.onMouseMove = (event) => {
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
        this._mirrorLayer.visible = true;
        this._tool.activate();
        this._syncToolbarButton();
        this._startLiveUpdate();

        if (this.center) {
            this.drawGuides();
            document.getElementById('status-info').textContent =
                'Click canvas to move mandala center, or switch to a drawing tool.';
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
            this._sourceLayerId = null;
            this._guideLayer.visible = false;
            this._mirrorLayer.visible = false;
            this.clearGuides();
            this._clearMirrors();
            this._stopLiveUpdate();
            document.getElementById('status-info').textContent = 'Mandala mode off.';
        } else {
            this.active = true;
            this._guideLayer.visible = true;
            this._mirrorLayer.visible = true;
            this._startLiveUpdate();
            if (this.center) {
                this.drawGuides();
                this.rebuildMirrors();
                document.getElementById('status-info').textContent =
                    'Mandala mode active. Draw with any tool for radial symmetry.';
            } else {
                // Need to set center first — switch to mandala tool
                MB.App.setTool('mandala');
            }
        }
        this._syncToolbarButton();
        MB.App._updateToolOptions(MB.App.activeTool);
    },

    _syncToolbarButton() {
        const btn = document.querySelector('.tool-btn[data-tool="mandala"]');
        if (btn) btn.classList.toggle('mandala-active', this.active);
    },

    // ---- Center Point ----

    setCenter(point) {
        this.center = new paper.Point(point.x, point.y);
        // Remember which layer mandala operates on
        const al = MB.Layers.getActiveLayer();
        if (al) this._sourceLayerId = al.id;
        document.getElementById('mandala-cx').value = point.x.toFixed(1);
        document.getElementById('mandala-cy').value = point.y.toFixed(1);
        this.drawGuides();
    },

    // ---- Flatten (convert to permanent object) ----

    flatten() {
        if (!this.active || !this.center) return;

        // Only flatten items on the mandala source layer
        const sourceLayer = MB.Layers.layers.find(l => l.id === this._sourceLayerId);
        if (!sourceLayer) return;

        const sourceItems = [];
        sourceLayer.paperLayer.children.forEach(item => {
            if (item.data && item.data.isUserItem) {
                sourceItems.push(item);
            }
        });
        if (sourceItems.length === 0) return;

        MB.History.snapshot();

        const angleStep = 360 / this.segments;
        const allItems = [];

        for (const item of sourceItems) {
            // Remove per-object symmetry before flattening (make permanent)
            if (item.data._hiddenBySym) {
                item.visible = true;
                delete item.data._hiddenBySym;
            }
            if (item.data.symmetry) delete item.data.symmetry;

            allItems.push(item); // keep original (sector 0)

            const origin = new paper.Point(0, 0);
            for (let i = 1; i < this.segments; i++) {
                const copy = item.clone();
                copy.data = { isUserItem: true };
                copy.selected = false;

                // Step 1: Rotate to evenly-spaced position
                copy.rotate(angleStep * i, this.center);

                // Step 2: Flip in place across the radial direction (if mirror)
                if (this.mirror) {
                    const angle = angleStep * i;
                    const cc = copy.bounds.center;
                    copy.translate(cc.negate());
                    copy.rotate(-angle, origin);
                    copy.scale(1, -1, origin);
                    copy.rotate(angle, origin);
                    copy.translate(cc);
                }

                allItems.push(copy);
            }
        }

        // Group everything into one object
        const layer = MB.Layers.getActiveLayer();
        if (layer) layer.paperLayer.activate();

        const group = new paper.Group(allItems);
        group.data = { isUserItem: true };

        // Turn off mandala mode
        this.toggleActive();

        // Select the flattened group
        MB.App.select(group);

        document.getElementById('status-info').textContent =
            'Mandala flattened to group (' + allItems.length + ' items). You can now edit, boolean, export.';
    },

    // ---- Live Mirror System ----

    rebuildMirrors() {
        this._clearMirrors();
        if (!this.active || !this.center || this.segments <= 1) return;

        const angleStep = 360 / this.segments;

        // Only mirror items on the layer where mandala was activated
        const sourceLayer = MB.Layers.layers.find(l => l.id === this._sourceLayerId);
        if (!sourceLayer || !sourceLayer.visible) return;

        const sourceItems = [];
        sourceLayer.paperLayer.children.forEach(item => {
            if (item.data && item.data.isUserItem) {
                sourceItems.push(item);
            }
        });

        // Create mirrors for each source item
        for (const item of sourceItems) {
            this._createItemMirrors(item, angleStep);
        }
    },

    _createItemMirrors(item, angleStep) {
        // Temporarily restore visibility if hidden by symmetry (so clones are visible)
        const wasHidden = !item.visible && item.data && item.data._hiddenBySym;
        if (wasHidden) item.visible = true;

        const origin = new paper.Point(0, 0);
        const startI = wasHidden ? 0 : 1;

        // Single loop: exactly `segments` elements total (including original at i=0).
        // All copies are positioned by pure rotation (evenly spaced).
        // Mirror flips each copy IN PLACE across its radial direction,
        // preserving position but changing orientation.
        for (let i = startI; i < this.segments; i++) {
            const copy = item.clone();
            copy.data = { isMandalaCopy: true, mandalaSource: item };
            copy.selected = false;

            // Step 1: Rotate to evenly-spaced position
            if (i > 0) {
                copy.rotate(angleStep * i, this.center);
            }

            // Step 2: Flip in place across the radial direction (if mirror)
            if (this.mirror) {
                const angle = angleStep * i;
                const cc = copy.bounds.center;
                copy.translate(cc.negate());
                copy.rotate(-angle, origin);
                copy.scale(1, -1, origin);
                copy.rotate(angle, origin);
                copy.translate(cc);
            }

            this._mirrorLayer.addChild(copy);
        }

        // Restore hidden state if item was hidden by symmetry
        if (wasHidden) item.visible = false;
    },

    _clearMirrors() {
        if (this._mirrorLayer) this._mirrorLayer.removeChildren();
    },

    _startLiveUpdate() {
        if (this._rafId) return;
        const update = () => {
            if (!this.active) {
                this._rafId = null;
                return;
            }
            this.rebuildMirrors();
            this._rafId = requestAnimationFrame(update);
        };
        this._rafId = requestAnimationFrame(update);
    },

    _stopLiveUpdate() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    // ---- Guide Rendering ----

    drawGuides() {
        this.clearGuides();
        if (!this.center) return;
        this._guideLayer.activate();

        const zoom = paper.view.zoom;
        const len = Math.max(MB.Canvas.wsWidth, MB.Canvas.wsHeight) * 1.5;
        // Radial guide lines — one per segment
        if (this.showGuides) {
            for (let i = 0; i < this.segments; i++) {
                const angle = (i / this.segments) * 2 * Math.PI;
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
            MB.App.setTool('mandala');
        });

        // Flatten button
        document.getElementById('mandala-flatten').addEventListener('click', () => {
            this.flatten();
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
        if (MB.Mandala.active) {
            // Already active — toggle off and return to select
            MB.Mandala.toggleActive();
            setTimeout(() => MB.App.setTool('select'), 0);
            return;
        }
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
