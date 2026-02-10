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
                if (child instanceof paper.Raster && child.data.isRasterImage) {
                    objects.push({
                        type: 'raster',
                        imageDataUrl: child.data.imageDataUrl,
                        imageName: child.data.imageName,
                        imageSettings: { ...child.data.imageSettings },
                        position: { x: child.position.x, y: child.position.y },
                        bounds: { x: child.bounds.x, y: child.bounds.y,
                                  width: child.bounds.width, height: child.bounds.height },
                        rotation: child.rotation || 0,
                        opacity: child.opacity
                    });
                } else {
                    objects.push({
                        type: 'path',
                        json: child.exportJSON()
                    });
                }
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
                        if (obj.type === 'raster' && obj.imageDataUrl) {
                            const raster = new paper.Raster(obj.imageDataUrl);
                            raster.onLoad = function() {
                                // Restore size via bounds
                                if (obj.bounds && obj.bounds.width > 0 && obj.bounds.height > 0) {
                                    const sx = obj.bounds.width / raster.bounds.width;
                                    const sy = obj.bounds.height / raster.bounds.height;
                                    raster.scale(sx, sy);
                                }
                                if (obj.position) {
                                    raster.position = new paper.Point(obj.position.x, obj.position.y);
                                }
                                if (obj.rotation) raster.rotation = obj.rotation;
                                raster.opacity = obj.opacity !== undefined ? obj.opacity : 0.85;
                                // Store original image for processing
                                const origImg = new Image();
                                origImg.src = obj.imageDataUrl;
                                raster.data = {
                                    isUserItem: true,
                                    isRasterImage: true,
                                    imageName: obj.imageName || 'image',
                                    imageDataUrl: obj.imageDataUrl,
                                    _originalImage: origImg,
                                    imageSettings: obj.imageSettings || {
                                        dpi: 254, dithering: 'threshold', threshold: 128,
                                        brightness: 0, contrast: 0, invert: false,
                                        scanDirection: 'horizontal', bidirectional: true, overscan: 2.5
                                    }
                                };
                                layer.paperLayer.addChild(raster);
                                paper.view.update();
                            };
                        } else if (obj.json) {
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
        // Force ephemeral layers to be up-to-date
        if (MB.Symmetry) try { MB.Symmetry.rebuildAll(); } catch (e) {}
        if (MB.Mandala && MB.Mandala.active) try { MB.Mandala.rebuildMirrors(); } catch (e) {}

        // Hide non-visual layers (bg, grid, mandala guides, simulator)
        const bgLayer = MB.Canvas.bgLayer;
        bgLayer.visible = false;
        const mandalaGuides = MB.Mandala && MB.Mandala._guideLayer;
        if (mandalaGuides) mandalaGuides.visible = false;
        const simLayer = MB.Simulator && MB.Simulator.simLayer;
        if (simLayer) simLayer.visible = false;
        // Keep symmetry layer visible — contains correct visual for symmetry items
        // Keep mandala mirror layer visible — contains rotated copies

        const svg = paper.project.exportSVG({ asString: true });
        bgLayer.visible = true;
        if (mandalaGuides && MB.Mandala && MB.Mandala.active) mandalaGuides.visible = true;

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
