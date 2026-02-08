// MandalaBurn - Properties Panel
MB.Properties = {
    _updating: false,

    init() {
        // Object property inputs
        ['prop-x', 'prop-y', 'prop-w', 'prop-h', 'prop-r'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                if (this._updating) return;
                this.applyObjectProperty(id, parseFloat(e.target.value));
            });
        });

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

        if (items.length === 0) {
            propX.value = ''; propY.value = ''; propW.value = ''; propH.value = ''; propR.value = '';
            propX.disabled = propY.disabled = propW.disabled = propH.disabled = propR.disabled = true;
        } else if (items.length === 1) {
            const item = items[0];
            const bounds = item.bounds;
            propX.value = bounds.x.toFixed(1);
            propY.value = bounds.y.toFixed(1);
            propW.value = bounds.width.toFixed(1);
            propH.value = bounds.height.toFixed(1);
            propR.value = (item.rotation || 0).toFixed(1);
            propX.disabled = propY.disabled = propW.disabled = propH.disabled = propR.disabled = false;
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
                    if (bounds.width > 0) item.scale(value / bounds.width, 1);
                    break;
                case 'prop-h':
                    if (bounds.height > 0) item.scale(1, value / bounds.height);
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
            }
        }
        this.updateObjectPanel(items);
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
