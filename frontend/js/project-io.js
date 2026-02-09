// MandalaBurn - Project Save/Load & SVG Import/Export
MB.ProjectIO = {
    init() {
        document.getElementById('file-open-project').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.loadProjectFile(file);
            e.target.value = '';
        });

        document.getElementById('file-import-svg').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importSVGFile(file);
            e.target.value = '';
        });
    },

    // --- Project Save ---
    saveProject() {
        const data = this.serializeProject();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (data.name || 'project') + '.mandala';
        a.click();
        URL.revokeObjectURL(url);
        document.getElementById('status-info').textContent = 'Project saved';
    },

    serializeProject() {
        const project = {
            version: '1.0',
            name: 'MandalaBurn Project',
            machine: MB.Machine.toJSON(),
            canvas: {
                width: MB.Canvas.wsWidth,
                height: MB.Canvas.wsHeight,
                gridSize: MB.GridSnap.gridSize,
                gridVisible: MB.GridSnap.gridVisible,
                snapEnabled: MB.GridSnap.snapEnabled
            },
            layers: MB.Layers.layers.map(layer => ({
                id: layer.id,
                name: layer.name,
                color: layer.color,
                visible: layer.visible,
                locked: layer.locked,
                laserSettings: { ...layer.laserSettings },
                objects: this.serializeLayerObjects(layer)
            }))
        };
        return project;
    },

    serializeLayerObjects(layer) {
        const objects = [];
        layer.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) {
                objects.push({
                    type: 'path',
                    json: child.exportJSON()
                });
            }
        });
        return objects;
    },

    // --- Project Load ---
    loadProjectFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.loadProject(data);
            } catch (err) {
                document.getElementById('status-info').textContent = 'Error loading project: ' + err.message;
            }
        };
        reader.readAsText(file);
    },

    loadProject(data) {
        // Clear current state
        MB.App.clearSelection();
        MB.History.clear();

        // Remove existing layers
        MB.Layers.layers.forEach(l => l.paperLayer.remove());
        MB.Layers.layers = [];
        MB.Layers._nextId = 1;

        // Machine settings
        if (data.machine) {
            MB.Machine.fromJSON(data.machine);
        }

        // Canvas settings
        if (data.canvas) {
            MB.Canvas.wsWidth = data.canvas.width || 300;
            MB.Canvas.wsHeight = data.canvas.height || 200;
            document.getElementById('canvas-w').value = MB.Canvas.wsWidth;
            document.getElementById('canvas-h').value = MB.Canvas.wsHeight;
            if (data.canvas.gridSize) {
                MB.GridSnap.gridSize = data.canvas.gridSize;
                document.getElementById('grid-size').value = MB.GridSnap.gridSize;
            }
            MB.Canvas.drawWorkspace();
        }

        // Load layers
        if (data.layers && data.layers.length > 0) {
            data.layers.forEach(layerData => {
                const layer = MB.Layers.addLayer(layerData.name, layerData.color);
                layer.visible = layerData.visible !== false;
                layer.locked = layerData.locked || false;
                layer.paperLayer.visible = layer.visible;
                layer.paperLayer.locked = layer.locked;
                if (layerData.laserSettings) {
                    layer.laserSettings = { ...layer.laserSettings, ...layerData.laserSettings };
                }
                // Load objects
                if (layerData.objects) {
                    layer.paperLayer.activate();
                    layerData.objects.forEach(obj => {
                        if (obj.json) {
                            const item = new paper.Item();
                            item.importJSON(obj.json);
                            layer.paperLayer.addChild(item);
                        }
                    });
                }
            });
        } else {
            MB.Layers.addLayer('Cut', '#ff0000');
        }

        MB.Layers.setActiveLayer(0);
        MB.Layers.renderLayerList();
        MB.Canvas.zoomFit();
        document.getElementById('status-info').textContent = 'Project loaded';
    },

    // --- New Project ---
    newProject() {
        MB.App.clearSelection();
        MB.History.clear();
        MB.Layers.layers.forEach(l => l.paperLayer.remove());
        MB.Layers.layers = [];
        MB.Layers._nextId = 1;
        MB.Canvas.wsWidth = 300;
        MB.Canvas.wsHeight = 200;
        document.getElementById('canvas-w').value = 300;
        document.getElementById('canvas-h').value = 200;
        MB.Canvas.drawWorkspace();
        MB.Layers.addLayer('Cut', '#ff0000');
        MB.Canvas.zoomFit();
        document.getElementById('status-info').textContent = 'New project';
    },

    // --- SVG Export ---
    exportSVG() {
        // Temporarily hide non-user items
        const bgLayer = MB.Canvas.bgLayer;
        bgLayer.visible = false;
        const symLayer = MB.Symmetry && MB.Symmetry._symmetryLayer;
        if (symLayer) symLayer.visible = false;

        const svg = paper.project.exportSVG({ asString: true });
        bgLayer.visible = true;
        if (symLayer) symLayer.visible = true;

        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mandalaburn-export.svg';
        a.click();
        URL.revokeObjectURL(url);
        document.getElementById('status-info').textContent = 'SVG exported';
    },

    // --- SVG Import ---
    importSVGFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.importSVG(e.target.result);
        };
        reader.readAsText(file);
    },

    importSVG(svgString) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        layer.paperLayer.activate();

        paper.project.importSVG(svgString, {
            expandShapes: true,
            onLoad: (item) => {
                // Flatten groups and mark all paths as user items
                const paths = [];
                function collectPaths(group) {
                    if (group.children) {
                        group.children.forEach(child => collectPaths(child));
                    }
                    if (group instanceof paper.Path || group instanceof paper.CompoundPath) {
                        paths.push(group);
                    }
                }
                collectPaths(item);

                paths.forEach(p => {
                    // Move to active layer
                    const clone = p.clone();
                    clone.strokeColor = layer.color;
                    clone.strokeWidth = 0.5;
                    clone.fillColor = null;
                    clone.data = { isUserItem: true };
                    layer.paperLayer.addChild(clone);
                });

                // Remove the imported group
                item.remove();

                MB.Canvas.zoomFit();
                document.getElementById('status-info').textContent =
                    'Imported ' + paths.length + ' paths from SVG';
            }
        });
    }
};
