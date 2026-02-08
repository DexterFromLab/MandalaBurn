// MandalaBurn - Properties Panel
MB.Properties = {
    _updating: false,
    _lockAspect: true,

    init() {
        // Object property inputs
        ['prop-x', 'prop-y', 'prop-w', 'prop-h', 'prop-r'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                if (this._updating) return;
                MB.History.snapshot();
                this.applyObjectProperty(id, parseFloat(e.target.value));
            });
        });

        // Lock aspect ratio toggle
        const lockBtn = document.getElementById('prop-lock-wh');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => {
                this._lockAspect = !this._lockAspect;
                lockBtn.classList.toggle('on', this._lockAspect);
                lockBtn.classList.toggle('off', !this._lockAspect);
                lockBtn.innerHTML = this._lockAspect ? '&#x1F512;' : '&#x1F513;';
            });
        }

        // Laser setting inputs in right panel (synced with layer table)
        document.getElementById('laser-mode').addEventListener('change', (e) => {
            const layer = MB.Layers.getActiveLayer();
            if (layer) {
                layer.laserSettings.mode = e.target.value;
                MB.Layers.renderLayerList();
            }
        });
        document.getElementById('laser-power').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('laser-power-val').textContent = val + '%';
            const layer = MB.Layers.getActiveLayer();
            if (layer) {
                layer.laserSettings.power = val;
                MB.Layers.renderLayerList();
            }
        });
        document.getElementById('laser-speed').addEventListener('change', (e) => {
            const layer = MB.Layers.getActiveLayer();
            if (layer) {
                layer.laserSettings.speed = parseFloat(e.target.value) || 10;
                MB.Layers.renderLayerList();
            }
        });
        document.getElementById('laser-passes').addEventListener('change', (e) => {
            const layer = MB.Layers.getActiveLayer();
            if (layer) {
                layer.laserSettings.passes = parseInt(e.target.value) || 1;
                MB.Layers.renderLayerList();
            }
        });

        // Listen for selection changes
        MB.App.on('selection-changed', (items) => this.updateObjectPanel(items));
        MB.App.on('active-layer-changed', (layer) => this.updateLaserPanel(layer));
    },

    updateObjectPanel(items) {
        this._updating = true;
        const propX = document.getElementById('prop-x');
        const propY = document.getElementById('prop-y');
        const propW = document.getElementById('prop-w');
        const propH = document.getElementById('prop-h');
        const propR = document.getElementById('prop-r');
        const lengthRow = document.getElementById('prop-length-row');
        const lengthVal = document.getElementById('prop-length');

        if (items.length === 0) {
            propX.value = ''; propY.value = ''; propW.value = ''; propH.value = ''; propR.value = '';
            propX.disabled = propY.disabled = propW.disabled = propH.disabled = propR.disabled = true;
            if (lengthRow) lengthRow.style.display = 'none';
        } else if (items.length === 1) {
            const item = items[0];
            const bounds = item.bounds;
            propX.value = bounds.x.toFixed(1);
            propY.value = bounds.y.toFixed(1);
            propW.value = bounds.width.toFixed(1);
            propH.value = bounds.height.toFixed(1);
            propR.value = (item.rotation || 0).toFixed(1);
            propX.disabled = propY.disabled = propW.disabled = propH.disabled = propR.disabled = false;

            // Curve length
            if (lengthRow && lengthVal) {
                if (item instanceof paper.Path) {
                    lengthRow.style.display = '';
                    lengthVal.textContent = item.length.toFixed(1);
                } else if (item instanceof paper.CompoundPath) {
                    lengthRow.style.display = '';
                    let total = 0;
                    item.children.forEach(c => { if (c.length) total += c.length; });
                    lengthVal.textContent = total.toFixed(1);
                } else {
                    lengthRow.style.display = 'none';
                }
            }
        } else {
            let combinedBounds = null;
            items.forEach(item => {
                combinedBounds = combinedBounds ? combinedBounds.unite(item.bounds) : item.bounds.clone();
            });
            if (combinedBounds) {
                propX.value = combinedBounds.x.toFixed(1);
                propY.value = combinedBounds.y.toFixed(1);
                propW.value = combinedBounds.width.toFixed(1);
                propH.value = combinedBounds.height.toFixed(1);
            }
            propR.value = '';
            propX.disabled = propY.disabled = false;
            propW.disabled = propH.disabled = false;
            propR.disabled = true;
            if (lengthRow) lengthRow.style.display = 'none';
        }
        this._updating = false;
    },

    applyObjectProperty(propId, value) {
        const items = MB.App.selectedItems;
        if (items.length === 0 || isNaN(value)) return;

        if (items.length === 1) {
            const item = items[0];
            const bounds = item.bounds;
            switch (propId) {
                case 'prop-x': item.position.x += value - bounds.x; break;
                case 'prop-y': item.position.y += value - bounds.y; break;
                case 'prop-w':
                    if (bounds.width > 0) {
                        const sx = value / bounds.width;
                        if (this._lockAspect) {
                            item.scale(sx, sx);
                        } else {
                            item.scale(sx, 1);
                        }
                    }
                    break;
                case 'prop-h':
                    if (bounds.height > 0) {
                        const sy = value / bounds.height;
                        if (this._lockAspect) {
                            item.scale(sy, sy);
                        } else {
                            item.scale(1, sy);
                        }
                    }
                    break;
                case 'prop-r':
                    item.rotation = value;
                    break;
            }
        } else {
            let combinedBounds = null;
            items.forEach(item => {
                combinedBounds = combinedBounds ? combinedBounds.unite(item.bounds) : item.bounds.clone();
            });
            if (combinedBounds) {
                let dx = 0, dy = 0;
                if (propId === 'prop-x') dx = value - combinedBounds.x;
                if (propId === 'prop-y') dy = value - combinedBounds.y;
                if (dx || dy) {
                    items.forEach(item => item.position = item.position.add(new paper.Point(dx, dy)));
                }
                if (propId === 'prop-w' && combinedBounds.width > 0) {
                    const sx = value / combinedBounds.width;
                    const sy = this._lockAspect ? sx : 1;
                    const center = combinedBounds.center;
                    items.forEach(item => {
                        const offset = item.position.subtract(center);
                        item.position = center.add(offset.multiply(new paper.Point(sx, sy)));
                        item.scale(sx, sy);
                    });
                }
                if (propId === 'prop-h' && combinedBounds.height > 0) {
                    const sy = value / combinedBounds.height;
                    const sx = this._lockAspect ? sy : 1;
                    const center = combinedBounds.center;
                    items.forEach(item => {
                        const offset = item.position.subtract(center);
                        item.position = center.add(offset.multiply(new paper.Point(sx, sy)));
                        item.scale(sx, sy);
                    });
                }
            }
        }
        this.updateObjectPanel(items);
        MB.App.emit('selection-changed', items);
    },

    updateLaserPanel(layer) {
        if (!layer) return;
        const ls = layer.laserSettings;
        document.getElementById('laser-mode').value = ls.mode;
        document.getElementById('laser-power').value = ls.power;
        document.getElementById('laser-power-val').textContent = ls.power + '%';
        document.getElementById('laser-speed').value = ls.speed;
        document.getElementById('laser-passes').value = ls.passes;
    }
};
