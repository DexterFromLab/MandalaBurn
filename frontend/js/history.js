// MandalaBurn - Undo/Redo (Snapshot / Memento Pattern)
MB.History = {
    undoStack: [],
    redoStack: [],
    _pending: null,
    maxStates: 50,

    init() {},

    // --- Public API ---

    // Capture current state before an action (simple version)
    snapshot() {
        this.undoStack.push(this._captureState());
        this.redoStack = [];
        this._trimStack();
        this._updateUI();
    },

    // For drag operations: capture tentatively, confirm or cancel later
    beginAction() {
        this._pending = this._captureState();
    },

    commitAction() {
        if (!this._pending) return;
        this.undoStack.push(this._pending);
        this._pending = null;
        this.redoStack = [];
        this._trimStack();
        this._updateUI();
    },

    cancelAction() {
        this._pending = null;
    },

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(this._captureState());
        const state = this.undoStack.pop();
        this._restoreState(state);
        this._updateUI();
    },

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(this._captureState());
        const state = this.redoStack.pop();
        this._restoreState(state);
        this._updateUI();
    },

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._pending = null;
        this._updateUI();
    },

    // --- Internal ---

    _captureState() {
        return {
            layers: MB.Layers.layers.map(layer => ({
                name: layer.name,
                color: layer.color,
                visible: layer.visible,
                locked: layer.locked,
                output: layer.output,
                laserSettings: { ...layer.laserSettings },
                objects: this._serializeLayer(layer)
            })),
            activeLayerIndex: MB.Layers.activeLayerIndex
        };
    },

    _serializeLayer(layer) {
        const objects = [];
        layer.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) {
                objects.push(child.exportJSON());
            }
        });
        return objects;
    },

    _restoreState(state) {
        // Clear selection
        MB.App.clearSelection();

        // Remove all existing layers
        MB.Layers.layers.forEach(l => l.paperLayer.remove());
        MB.Layers.layers = [];
        MB.Layers._nextId = 1;

        // Recreate layers from snapshot
        state.layers.forEach(layerData => {
            const paperLayer = new paper.Layer({ name: layerData.name });
            const layer = {
                id: 'layer-' + MB.Layers._nextId++,
                name: layerData.name,
                color: layerData.color,
                visible: layerData.visible !== false,
                locked: layerData.locked || false,
                output: layerData.output !== false,
                paperLayer: paperLayer,
                laserSettings: { ...layerData.laserSettings }
            };
            paperLayer.visible = layer.visible;
            // Do NOT set locked yet — it could block addChild
            MB.Layers.layers.push(layer);

            // Restore objects: create item via constructor (auto-adds to active layer),
            // then importJSON into same-type item to fill properties in-place
            paperLayer.activate();
            layerData.objects.forEach(jsonStr => {
                const parsed = JSON.parse(jsonStr);
                const typeName = parsed[0]; // "Path", "CompoundPath", "Raster", etc.
                if (typeName === 'Raster') {
                    // Raster needs direct importJSON (constructor doesn't work the same)
                    paperLayer.importJSON(jsonStr);
                } else {
                    const Ctor = paper[typeName];
                    if (Ctor) {
                        const item = new Ctor();    // adds to active layer
                        item.importJSON(jsonStr);    // same type → updates in place
                    }
                }
            });

            // Rebuild _originalImage for restored Raster items
            paperLayer.children.forEach(child => {
                if (child.data && child.data.isRasterImage && child.data.imageDataUrl) {
                    const origImg = new Image();
                    origImg.src = child.data.imageDataUrl;
                    child.data._originalImage = origImg;
                }
            });

            // Now safe to lock
            paperLayer.locked = layer.locked;
        });

        // Fallback: ensure at least one layer
        if (MB.Layers.layers.length === 0) {
            const paperLayer = new paper.Layer({ name: 'Cut' });
            MB.Layers.layers.push({
                id: 'layer-' + MB.Layers._nextId++,
                name: 'Cut',
                color: '#ff0000',
                visible: true,
                locked: false,
                output: true,
                paperLayer: paperLayer,
                laserSettings: { mode: 'cut', power: 80, speed: 10, passes: 1, airAssist: true }
            });
        }

        // Restore active layer
        const idx = Math.min(state.activeLayerIndex || 0, MB.Layers.layers.length - 1);
        MB.Layers.activeLayerIndex = idx;
        MB.Layers.layers[idx].paperLayer.activate();

        // Re-render UI
        MB.Layers.renderLayerList();
        MB.App.emit('active-layer-changed', MB.Layers.getActiveLayer());
    },

    _trimStack() {
        while (this.undoStack.length > this.maxStates) {
            this.undoStack.shift();
        }
    },

    _updateUI() {
        const u = this.undoStack.length;
        const r = this.redoStack.length;
        const parts = [];
        if (u > 0) parts.push('Undo(' + u + ')');
        if (r > 0) parts.push('Redo(' + r + ')');
        document.getElementById('status-info').textContent = parts.join(' | ');
    }
};
