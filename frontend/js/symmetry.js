// MandalaBurn - Per-Object Symmetry Modifier
MB.Symmetry = {
    _symmetryLayer: null,
    _rafId: null,
    _lastSelKey: '',

    init() {
        // Create ephemeral layer for symmetry copies (unlocked for hit-test proxy)
        this._symmetryLayer = new paper.Layer({ name: 'symmetry-mirrors' });
        this._symmetryLayer.visible = true;

        // Reactivate user layer
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();

        this._wireUI();
        this._startLiveUpdate();

        // Direct event listener — reliable panel sync even if rAF rebuild fails
        MB.App.on('selection-changed', (sel) => {
            this._updatePanel(Array.isArray(sel) ? sel : MB.App.selectedItems);
        });
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
        } catch (e) {
            // Prevent rAF loop from dying on rebuild error
        }
        // Always sync panel regardless of rebuild errors
        try {
            const sel = MB.App.selectedItems;
            const key = sel.length + ':' + sel.map(i => i.id).join(',');
            if (key !== this._lastSelKey) {
                this._lastSelKey = key;
                this._updatePanel(sel);
            }
        } catch (e) {
            // Prevent rAF loop from dying on panel error
        }
    },

    // --- Rebuild Ephemeral Copies ---
    rebuildAll() {
        this._symmetryLayer.removeChildren();

        for (let li = 0; li < MB.Layers.layers.length; li++) {
            const layer = MB.Layers.layers[li];
            if (!layer.visible) continue;
            const kids = layer.paperLayer.children.slice();
            for (let ki = 0; ki < kids.length; ki++) {
                const item = kids[ki];
                if (!item.data || !item.data.isUserItem) continue;
                if (item.data.symmetry) {
                    // Temporarily restore visibility so clone() copies are visible
                    item.visible = true;
                    const copies = this._rebuildForItem(item);
                    // Hide original — only mirror copies visible
                    item.visible = false;
                    item.data._hiddenBySym = true;
                    // Propagate selection to mirror copies
                    const isSelected = MB.App.selectedItems.includes(item);
                    item.selected = false; // No selection highlight on hidden original
                    if (isSelected) {
                        copies.forEach(c => { c.selected = true; });
                    }
                } else if (item.data._hiddenBySym) {
                    // Symmetry was removed — restore visibility
                    item.visible = true;
                    delete item.data._hiddenBySym;
                }
            }
        }
    },

    _rebuildForItem(item) {
        const sym = item.data.symmetry;
        if (!sym) return [];

        const center = item.bounds.center;
        const axisAngle = sym.axisAngle || 0;
        const origin = new paper.Point(0, 0);
        const allCopies = [];
        const copyData = { isSymmetryCopy: true, symmetryOriginal: item };

        // Helper: create a clone linked back to original
        const makeClone = () => {
            const c = item.clone();
            c.data = { isSymmetryCopy: true, symmetryOriginal: item };
            c.selected = false;
            this._symmetryLayer.addChild(c);
            allCopies.push(c);
            return c;
        };

        // Single combined mirror copy (H, V, or H+V in one transform)
        let mirrorCopy = null;
        if (sym.mirrorH || sym.mirrorV) {
            const mc = makeClone();
            mc.translate(center.negate());
            mc.rotate(-axisAngle, origin);
            mc.scale(sym.mirrorH ? -1 : 1, sym.mirrorV ? -1 : 1, origin);
            mc.rotate(axisAngle, origin);
            mc.translate(center);
            mirrorCopy = mc;
        }

        // Rotational copies
        if (sym.rotational >= 2) {
            const angleStep = 360 / sym.rotational;

            // Rotate the original (copies i=1..N-1)
            for (let i = 1; i < sym.rotational; i++) {
                const rc = makeClone();
                rc.rotate(angleStep * i, center);
            }

            // Rotate mirror copy too
            if (mirrorCopy) {
                for (let i = 1; i < sym.rotational; i++) {
                    const rc = mirrorCopy.clone();
                    rc.data = { isSymmetryCopy: true, symmetryOriginal: item };
                    rc.selected = false;
                    this._symmetryLayer.addChild(rc);
                    rc.rotate(angleStep * i, center);
                    allCopies.push(rc);
                }
            }
        }

        return allCopies;
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
            if (item.data._hiddenBySym) {
                item.visible = true;
                delete item.data._hiddenBySym;
            }
        }
    },

    removeSymmetry(item) {
        if (item && item.data) {
            delete item.data.symmetry;
            if (item.data._hiddenBySym) {
                item.visible = true;
                delete item.data._hiddenBySym;
            }
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

            // Single combined mirror copy
            let mirrorCopy = null;
            if (sym.mirrorH || sym.mirrorV) {
                const mc = item.clone();
                mc.data = { isUserItem: true };
                mc.selected = false;
                layer.addChild(mc);
                mc.translate(center.negate());
                mc.rotate(-axisAngle, origin);
                mc.scale(sym.mirrorH ? -1 : 1, sym.mirrorV ? -1 : 1, origin);
                mc.rotate(axisAngle, origin);
                mc.translate(center);
                mirrorCopy = mc;
                newItems.push(mc);
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

            // Remove symmetry from original, restore visibility
            delete item.data.symmetry;
            item.visible = true;
            delete item.data._hiddenBySym;
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
