// MandalaBurn - Per-Object Symmetry Modifier
MB.Symmetry = {
    _symmetryLayer: null,
    _rafId: null,
    _lastSelKey: '',

    init() {
        // Create ephemeral layer for symmetry copies (locked = not selectable)
        this._symmetryLayer = new paper.Layer({ name: 'symmetry-mirrors' });
        this._symmetryLayer.locked = true;
        this._symmetryLayer.visible = true;

        // Reactivate user layer
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();

        this._wireUI();
        this._startLiveUpdate();
        console.log('[Symmetry] init OK, layer:', this._symmetryLayer.name);
    },

    // --- Live Update Loop ---
    _startLiveUpdate() {
        if (this._rafId) return;
        const self = this;
        const update = () => {
            self._doRebuild();
            self._rafId = requestAnimationFrame(update);
        };
        this._rafId = requestAnimationFrame(update);
    },

    _stopLiveUpdate() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    _doRebuild() {
        try {
            this.rebuildAll();
            // Poll selection state to keep panel in sync
            const sel = MB.App.selectedItems;
            const key = sel.length + ':' + sel.map(i => i.id).join(',');
            if (key !== this._lastSelKey) {
                this._lastSelKey = key;
                this._updatePanel(sel);
            }
        } catch (e) {
            // Prevent rAF loop from dying on error
        }
    },

    // --- Rebuild Ephemeral Copies ---
    rebuildAll() {
        this._symmetryLayer.removeChildren();

        for (let li = 0; li < MB.Layers.layers.length; li++) {
            const layer = MB.Layers.layers[li];
            if (!layer.visible) continue;
            // Snapshot children array to avoid mutation during iteration
            const kids = layer.paperLayer.children.slice();
            for (let ki = 0; ki < kids.length; ki++) {
                const item = kids[ki];
                if (item.data && item.data.isUserItem && item.data.symmetry) {
                    this._rebuildForItem(item);
                }
            }
        }
    },

    _rebuildForItem(item) {
        const sym = item.data.symmetry;
        if (!sym) return;

        const center = item.bounds.center;
        const axisAngle = sym.axisAngle || 0;
        const origin = new paper.Point(0, 0);

        // Collect mirror copies (sources for rotational step)
        const mirrorCopies = [];

        // Mirror H: flip across vertical axis (left-right)
        if (sym.mirrorH) {
            const mh = item.clone();
            mh.data = {};
            mh.selected = false;
            this._symmetryLayer.addChild(mh);
            mh.translate(center.negate());
            mh.rotate(-axisAngle, origin);
            mh.scale(-1, 1, origin);
            mh.rotate(axisAngle, origin);
            mh.translate(center);
            mirrorCopies.push(mh);
        }

        // Mirror V: flip across horizontal axis (top-bottom)
        if (sym.mirrorV) {
            const mv = item.clone();
            mv.data = {};
            mv.selected = false;
            this._symmetryLayer.addChild(mv);
            mv.translate(center.negate());
            mv.rotate(-axisAngle, origin);
            mv.scale(1, -1, origin);
            mv.rotate(axisAngle, origin);
            mv.translate(center);
            mirrorCopies.push(mv);
        }

        // Mirror H+V combined (180-degree point symmetry)
        if (sym.mirrorH && sym.mirrorV) {
            const mhv = item.clone();
            mhv.data = {};
            mhv.selected = false;
            this._symmetryLayer.addChild(mhv);
            mhv.translate(center.negate());
            mhv.rotate(-axisAngle, origin);
            mhv.scale(-1, -1, origin);
            mhv.rotate(axisAngle, origin);
            mhv.translate(center);
            mirrorCopies.push(mhv);
        }

        // Rotational copies
        if (sym.rotational >= 2) {
            const angleStep = 360 / sym.rotational;

            // Rotate the original (copies i=1..N-1)
            for (let i = 1; i < sym.rotational; i++) {
                const rc = item.clone();
                rc.data = {};
                rc.selected = false;
                this._symmetryLayer.addChild(rc);
                rc.rotate(angleStep * i, center);
            }

            // Rotate each mirror copy too
            for (const src of mirrorCopies) {
                for (let i = 1; i < sym.rotational; i++) {
                    const rc = src.clone();
                    rc.data = {};
                    rc.selected = false;
                    this._symmetryLayer.addChild(rc);
                    rc.rotate(angleStep * i, center);
                }
            }
        }
    },

    // --- API ---
    hasSymmetry(item) {
        if (!item || !item.data || !item.data.symmetry) return false;
        const s = item.data.symmetry;
        return !!(s.mirrorH || s.mirrorV || (s.rotational >= 2));
    },

    setSymmetry(item, props) {
        if (!item || !item.data) return;
        if (!item.data.symmetry) {
            item.data.symmetry = { mirrorH: false, mirrorV: false, rotational: 0, axisAngle: 0 };
        }
        Object.assign(item.data.symmetry, props);
        // Clean up if nothing active
        if (!this.hasSymmetry(item)) {
            delete item.data.symmetry;
        }
    },

    removeSymmetry(item) {
        if (item && item.data) {
            delete item.data.symmetry;
        }
    },

    // --- Flatten: make ephemeral copies permanent ---
    flatten(items) {
        if (!items || items.length === 0) return;
        const toFlatten = items.filter(i => this.hasSymmetry(i));
        if (toFlatten.length === 0) return;

        MB.History.snapshot();

        for (const item of toFlatten) {
            const sym = item.data.symmetry;
            const center = item.bounds.center;
            const axisAngle = sym.axisAngle || 0;
            const origin = new paper.Point(0, 0);
            const layer = item.parent;

            const newItems = [];

            // Mirror H
            if (sym.mirrorH) {
                const mh = item.clone();
                mh.data = { isUserItem: true };
                mh.selected = false;
                layer.addChild(mh);
                mh.translate(center.negate());
                mh.rotate(-axisAngle, origin);
                mh.scale(-1, 1, origin);
                mh.rotate(axisAngle, origin);
                mh.translate(center);
                newItems.push(mh);
            }

            // Mirror V
            if (sym.mirrorV) {
                const mv = item.clone();
                mv.data = { isUserItem: true };
                mv.selected = false;
                layer.addChild(mv);
                mv.translate(center.negate());
                mv.rotate(-axisAngle, origin);
                mv.scale(1, -1, origin);
                mv.rotate(axisAngle, origin);
                mv.translate(center);
                newItems.push(mv);
            }

            // Mirror H+V
            if (sym.mirrorH && sym.mirrorV) {
                const mhv = item.clone();
                mhv.data = { isUserItem: true };
                mhv.selected = false;
                layer.addChild(mhv);
                mhv.translate(center.negate());
                mhv.rotate(-axisAngle, origin);
                mhv.scale(-1, -1, origin);
                mhv.rotate(axisAngle, origin);
                mhv.translate(center);
                newItems.push(mhv);
            }

            // Rotational copies
            if (sym.rotational >= 2) {
                const angleStep = 360 / sym.rotational;
                const allSources = [item, ...newItems];
                for (const src of allSources) {
                    for (let i = 1; i < sym.rotational; i++) {
                        const rc = src.clone();
                        rc.data = { isUserItem: true };
                        rc.selected = false;
                        layer.addChild(rc);
                        rc.rotate(angleStep * i, center);
                    }
                }
            }

            // Remove symmetry from original
            delete item.data.symmetry;
        }

        MB.App.emit('selection-changed', MB.App.selectedItems);
        document.getElementById('status-info').textContent =
            'Symmetry flattened to permanent items';
    },

    // --- UI Wiring ---
    _wireUI() {
        const mirrorH = document.getElementById('sym-mirror-h');
        const mirrorV = document.getElementById('sym-mirror-v');
        const rotInput = document.getElementById('sym-rotational');
        const axisInput = document.getElementById('sym-axis-angle');
        const flattenBtn = document.getElementById('sym-flatten-btn');
        const removeBtn = document.getElementById('sym-remove-btn');
        const presets = document.getElementById('sym-rot-presets');

        if (!mirrorH || !mirrorV || !rotInput || !axisInput || !flattenBtn || !removeBtn || !presets) {
            console.warn('Symmetry: panel elements not found');
            return;
        }

        mirrorH.addEventListener('change', () => {
            const items = MB.App.selectedItems;
            if (items.length === 0) return;
            MB.History.snapshot();
            items.forEach(item => this.setSymmetry(item, { mirrorH: mirrorH.checked }));
        });

        mirrorV.addEventListener('change', () => {
            const items = MB.App.selectedItems;
            if (items.length === 0) return;
            MB.History.snapshot();
            items.forEach(item => this.setSymmetry(item, { mirrorV: mirrorV.checked }));
        });

        rotInput.addEventListener('change', () => {
            const items = MB.App.selectedItems;
            if (items.length === 0) return;
            const val = parseInt(rotInput.value) || 0;
            MB.History.snapshot();
            items.forEach(item => this.setSymmetry(item, { rotational: val < 2 ? 0 : val }));
            this._syncPresetButtons(val);
        });

        presets.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-val]');
            if (!btn) return;
            const val = parseInt(btn.dataset.val);
            rotInput.value = val;
            rotInput.dispatchEvent(new Event('change'));
        });

        axisInput.addEventListener('change', () => {
            const items = MB.App.selectedItems;
            if (items.length === 0) return;
            const val = parseFloat(axisInput.value) || 0;
            MB.History.snapshot();
            items.forEach(item => this.setSymmetry(item, { axisAngle: val }));
        });

        flattenBtn.addEventListener('click', () => {
            this.flatten(MB.App.selectedItems);
        });

        removeBtn.addEventListener('click', () => {
            const items = MB.App.selectedItems;
            if (items.length === 0) return;
            MB.History.snapshot();
            items.forEach(item => this.removeSymmetry(item));
            this._updatePanel(items);
        });
    },

    _syncPresetButtons(val) {
        document.querySelectorAll('#sym-rot-presets .bg-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.val) === val);
        });
    },

    _updatePanel(items) {
        console.log('[Symmetry] _updatePanel called, items:', items ? items.length : 'null');
        const mirrorH = document.getElementById('sym-mirror-h');
        const mirrorV = document.getElementById('sym-mirror-v');
        const rotInput = document.getElementById('sym-rotational');
        const axisInput = document.getElementById('sym-axis-angle');
        const flattenBtn = document.getElementById('sym-flatten-btn');
        const removeBtn = document.getElementById('sym-remove-btn');
        if (!mirrorH) return;

        if (!items || items.length === 0) {
            mirrorH.checked = false; mirrorH.disabled = true;
            mirrorV.checked = false; mirrorV.disabled = true;
            rotInput.value = 0; rotInput.disabled = true;
            axisInput.value = 0; axisInput.disabled = true;
            flattenBtn.disabled = true;
            removeBtn.disabled = true;
            this._syncPresetButtons(-1);
            return;
        }

        mirrorH.disabled = false;
        mirrorV.disabled = false;
        rotInput.disabled = false;
        axisInput.disabled = false;

        if (items.length === 1) {
            const sym = (items[0].data && items[0].data.symmetry) || {};
            mirrorH.checked = !!sym.mirrorH;
            mirrorV.checked = !!sym.mirrorV;
            rotInput.value = sym.rotational || 0;
            axisInput.value = sym.axisAngle || 0;
            this._syncPresetButtons(sym.rotational || 0);
        } else {
            const allH = items.every(i => i.data && (i.data.symmetry || {}).mirrorH);
            const allV = items.every(i => i.data && (i.data.symmetry || {}).mirrorV);
            mirrorH.checked = allH;
            mirrorV.checked = allV;
            rotInput.value = '';
            axisInput.value = '';
            this._syncPresetButtons(-1);
        }

        const anySym = items.some(i => this.hasSymmetry(i));
        flattenBtn.disabled = !anySym;
        removeBtn.disabled = !anySym;

        // Auto-expand panel when symmetry is active
        const panel = document.getElementById('symmetry-panel');
        if (panel && anySym) {
            panel.classList.remove('collapsed');
        }
    }
};
