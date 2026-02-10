// MandalaBurn - Attached Rulers (Dimension Lines Following Path Points)
MB.AttachedRulers = {
    _rulers: [],
    _rulersLayer: null,
    _nextId: 1,
    _rafId: null,

    init() {
        this._rulersLayer = new paper.Layer({ name: 'attached-rulers' });
        this._rulersLayer.visible = true;

        // Reactivate user layer
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();

        this._startLiveUpdate();

        // Wire "Clear All" button
        const btn = document.getElementById('ruler-clear-attached');
        if (btn) btn.addEventListener('click', () => this.removeAll());
    },

    // ---- Live Update Loop ----

    _startLiveUpdate() {
        if (this._rafId) return;
        const self = this;
        const update = () => {
            self._doRebuild();
            self._rafId = requestAnimationFrame(update);
        };
        this._rafId = requestAnimationFrame(update);
    },

    _doRebuild() {
        try {
            this._rebuildAll();
        } catch (e) {}
    },

    _rebuildAll() {
        let removed = false;
        for (let i = this._rulers.length - 1; i >= 0; i--) {
            const r = this._rulers[i];
            // Check anchors still valid
            if (!this._isAnchorValid(r.anchorA) || !this._isAnchorValid(r.anchorB)) {
                if (r.group) r.group.remove();
                this._rulers.splice(i, 1);
                removed = true;
                continue;
            }
            this._rebuildRuler(r);
        }
        if (removed) this._updateCount();
    },

    _isAnchorValid(anchor) {
        if (!anchor || !anchor.item) return false;
        // Item still in scene?
        if (!anchor.item.parent) return false;
        // For Groups, check bounds exist
        if (anchor.item instanceof paper.Group) return true;
        // Segment still exists?
        if (!anchor.item.segments) return false;
        if (anchor.segmentIndex >= anchor.item.segments.length) return false;
        return true;
    },

    _getAnchorPoint(anchor) {
        if (anchor.item instanceof paper.Group) {
            // Groups don't have segments — use bounds snap points
            return anchor.item.bounds.center;
        }
        return anchor.item.segments[anchor.segmentIndex].point;
    },

    // ---- Ruler Visual ----

    _rebuildRuler(r) {
        const from = this._getAnchorPoint(r.anchorA);
        const to = this._getAnchorPoint(r.anchorB);
        if (!from || !to) return;

        // Remove old visual
        if (r.group) r.group.remove();

        const z = paper.view.zoom;
        const color = '#5cb8ff';
        const g = new paper.Group();

        // Main dashed line
        g.addChild(new paper.Path.Line({
            from: from,
            to: to,
            strokeColor: color,
            strokeWidth: 1.5 / z,
            dashArray: [6 / z, 3 / z]
        }));

        // Anchor dots (filled circles)
        [from, to].forEach(pt => {
            g.addChild(new paper.Path.Circle({
                center: pt,
                radius: 3.5 / z,
                fillColor: color,
                strokeColor: null
            }));
        });

        // Distance label
        const dist = from.getDistance(to);
        const mid = from.add(to).divide(2);
        const angle = to.subtract(from).angle;
        const offset = new paper.Point(0, -12 / z).rotate(
            angle > 90 || angle < -90 ? angle + 180 : angle
        );

        g.addChild(new paper.PointText({
            point: mid.add(offset),
            content: dist.toFixed(1) + ' mm',
            fillColor: color,
            fontFamily: 'Consolas, SF Mono, monospace',
            fontSize: 11 / z,
            justification: 'center'
        }));

        // dx/dy dimension lines
        if (Math.abs(to.x - from.x) > 2 && Math.abs(to.y - from.y) > 2) {
            const corner = new paper.Point(to.x, from.y);
            const dimColor = new paper.Color(0.36, 0.72, 1.0, 0.35);
            g.addChild(new paper.Path.Line({
                from: from, to: corner,
                strokeColor: dimColor,
                strokeWidth: 0.5 / z,
                dashArray: [3 / z, 3 / z]
            }));
            g.addChild(new paper.Path.Line({
                from: corner, to: to,
                strokeColor: dimColor,
                strokeWidth: 0.5 / z,
                dashArray: [3 / z, 3 / z]
            }));
        }

        g.data = { isRulerItem: true, isAttachedRuler: true };
        this._rulersLayer.addChild(g);
        r.group = g;
    },

    // ---- API ----

    createRuler(anchorA, anchorB) {
        const r = {
            id: 'aruler-' + this._nextId++,
            anchorA: { ...anchorA },
            anchorB: { ...anchorB },
            group: null
        };
        this._rulers.push(r);
        this._rebuildRuler(r);
        this._updateCount();
        return r;
    },

    removeRuler(id) {
        const idx = this._rulers.findIndex(r => r.id === id);
        if (idx >= 0) {
            if (this._rulers[idx].group) this._rulers[idx].group.remove();
            this._rulers.splice(idx, 1);
            this._updateCount();
        }
    },

    removeAll() {
        this._rulers.forEach(r => { if (r.group) r.group.remove(); });
        this._rulers = [];
        this._updateCount();
    },

    // ---- Find Nearest Segment Point ----

    findNearestSegmentPoint(canvasPoint) {
        const threshold = 10 / paper.view.zoom;
        let best = null;
        let bestDist = threshold;

        MB.Layers.layers.forEach(layer => {
            if (!layer.visible) return;
            layer.paperLayer.children.forEach(item => {
                if (!item.data || !item.data.isUserItem) return;
                if (!item.visible) return;

                const checkSegments = (path, rootItem) => {
                    if (!path.segments) return;
                    for (let i = 0; i < path.segments.length; i++) {
                        const d = canvasPoint.getDistance(path.segments[i].point);
                        if (d < bestDist) {
                            bestDist = d;
                            best = { item: rootItem, segmentIndex: i, point: path.segments[i].point.clone() };
                        }
                    }
                };

                if (item instanceof paper.Path) {
                    checkSegments(item, item);
                } else if (item instanceof paper.CompoundPath && item.children) {
                    // For CompoundPath, attach to the specific child path
                    item.children.forEach(child => {
                        if (child.segments) {
                            for (let i = 0; i < child.segments.length; i++) {
                                const d = canvasPoint.getDistance(child.segments[i].point);
                                if (d < bestDist) {
                                    bestDist = d;
                                    best = { item: child, segmentIndex: i, point: child.segments[i].point.clone() };
                                }
                            }
                        }
                    });
                } else if (item instanceof paper.Group && item.children) {
                    item.children.forEach(child => {
                        if (child instanceof paper.Path) checkSegments(child, child);
                    });
                }
            });
        });

        return best;
    },

    // ---- Undo/Redo Reconnection ----

    /**
     * Before undo/redo: save ruler anchors as positional references
     * (layerIndex, childIndex, segmentIndex) since item objects will be destroyed.
     */
    saveAnchorsBeforeRestore() {
        this._savedAnchors = this._rulers.map(r => ({
            id: r.id,
            anchorA: this._anchorToPosition(r.anchorA),
            anchorB: this._anchorToPosition(r.anchorB)
        }));
        // Remove all visuals (items about to be destroyed)
        this._rulers.forEach(r => { if (r.group) r.group.remove(); });
        this._rulers = [];
    },

    _anchorToPosition(anchor) {
        if (!anchor || !anchor.item) return null;
        // Find layer and child index
        for (let li = 0; li < MB.Layers.layers.length; li++) {
            const layer = MB.Layers.layers[li];
            const children = layer.paperLayer.children;
            for (let ci = 0; ci < children.length; ci++) {
                if (children[ci] === anchor.item) {
                    return { layerIdx: li, childIdx: ci, segIdx: anchor.segmentIndex };
                }
                // Check inside CompoundPath/Group
                if (children[ci].children) {
                    for (let si = 0; si < children[ci].children.length; si++) {
                        if (children[ci].children[si] === anchor.item) {
                            return { layerIdx: li, childIdx: ci, subIdx: si, segIdx: anchor.segmentIndex };
                        }
                    }
                }
            }
        }
        return null;
    },

    /**
     * After undo/redo: reconnect rulers to newly created items by position.
     */
    reconnectAfterRestore() {
        if (!this._savedAnchors) return;
        const saved = this._savedAnchors;
        this._savedAnchors = null;

        saved.forEach(sr => {
            const a = this._positionToAnchor(sr.anchorA);
            const b = this._positionToAnchor(sr.anchorB);
            if (a && b) {
                const r = {
                    id: sr.id,
                    anchorA: a,
                    anchorB: b,
                    group: null
                };
                this._rulers.push(r);
                this._rebuildRuler(r);
            }
        });
        this._updateCount();
    },

    _positionToAnchor(pos) {
        if (!pos) return null;
        if (pos.layerIdx >= MB.Layers.layers.length) return null;
        const layer = MB.Layers.layers[pos.layerIdx];
        if (pos.childIdx >= layer.paperLayer.children.length) return null;
        let item = layer.paperLayer.children[pos.childIdx];
        // Navigate into sub-item if needed
        if (pos.subIdx !== undefined && item.children && pos.subIdx < item.children.length) {
            item = item.children[pos.subIdx];
        }
        if (!item.segments || pos.segIdx >= item.segments.length) return null;
        return { item: item, segmentIndex: pos.segIdx };
    },

    // ---- Serialization for Project Save/Load ----

    serialize() {
        return this._rulers.map(r => ({
            anchorA: this._anchorToPosition(r.anchorA),
            anchorB: this._anchorToPosition(r.anchorB)
        })).filter(r => r.anchorA && r.anchorB);
    },

    restore(data) {
        if (!data || !Array.isArray(data)) return;
        data.forEach(rd => {
            const a = this._positionToAnchor(rd.anchorA);
            const b = this._positionToAnchor(rd.anchorB);
            if (a && b) {
                this.createRuler(a, b);
            }
        });
    },

    // ---- UI ----

    _updateCount() {
        const el = document.getElementById('ruler-attached-count');
        if (el) el.textContent = this._rulers.length + ' ruler' + (this._rulers.length !== 1 ? 's' : '');
    }
};
