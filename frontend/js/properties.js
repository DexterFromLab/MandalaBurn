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

        // Parametric flatten button
        const flattenBtn = document.getElementById('param-flatten-btn');
        if (flattenBtn) {
            flattenBtn.addEventListener('click', () => {
                const item = MB.App.selectedItems[0];
                if (item && MB.Parametric.isParametric(item)) {
                    MB.History.snapshot();
                    MB.Parametric.flatten(item);
                    MB.App.emit('selection-changed', MB.App.selectedItems);
                }
            });
        }

        // Parametric rect inputs
        this._wireParamInput('param-rect-w', (item, val) => {
            item.data.shapeParams.width = val;
        });
        this._wireParamInput('param-rect-h', (item, val) => {
            item.data.shapeParams.height = val;
        });

        // Parametric ellipse inputs
        this._wireParamInput('param-ellipse-rx', (item, val) => {
            item.data.shapeParams.radiusX = val;
        });
        this._wireParamInput('param-ellipse-ry', (item, val) => {
            item.data.shapeParams.radiusY = val;
        });

        // Parametric polygon inputs
        this._wireParamInput('param-poly-sides', (item, val) => {
            item.data.shapeParams.sides = Math.round(val);
        });
        this._wireParamInput('param-poly-radius', (item, val) => {
            item.data.shapeParams.radius = val;
        });

        const polyStarCb = document.getElementById('param-poly-star');
        if (polyStarCb) {
            polyStarCb.addEventListener('change', () => {
                const item = MB.App.selectedItems[0];
                if (!item || !MB.Parametric.isParametric(item)) return;
                MB.History.snapshot();
                item.data.shapeParams.isStar = polyStarCb.checked;
                MB.Parametric.regenerate(item);
                this.updateObjectPanel(MB.App.selectedItems);
            });
        }

        const polyRatio = document.getElementById('param-poly-ratio');
        if (polyRatio) {
            polyRatio.addEventListener('input', () => {
                const item = MB.App.selectedItems[0];
                if (!item || !MB.Parametric.isParametric(item)) return;
                const val = parseFloat(polyRatio.value);
                const ratioVal = document.getElementById('param-poly-ratio-val');
                if (ratioVal) ratioVal.textContent = val.toFixed(2);
                item.data.shapeParams.innerRatio = val;
                MB.Parametric.regenerate(item);
                paper.view.update();
            });
        }

        // Parametric text inputs
        this._wireParamTextInput('param-text-content', (item, val) => {
            item.data.shapeParams.text = val;
        });
        this._wireParamSelect('param-text-font', (item, val) => {
            item.data.shapeParams.fontName = val;
        });
        this._wireParamInput('param-text-size', (item, val) => {
            item.data.shapeParams.fontSize = val;
        });
        this._wireParamInput('param-text-spacing', (item, val) => {
            item.data.shapeParams.spacing = val;
        });
        this._wireParamInput('param-text-line-h', (item, val) => {
            item.data.shapeParams.lineHeight = val;
        });

        const textUniteCb = document.getElementById('param-text-unite');
        if (textUniteCb) {
            textUniteCb.addEventListener('change', () => {
                const item = MB.App.selectedItems[0];
                if (!item || !MB.Parametric.isParametric(item)) return;
                MB.History.snapshot();
                item.data.shapeParams.unite = textUniteCb.checked;
                MB.Parametric.regenerate(item);
                paper.view.update();
            });
        }

        // Generator parametric inputs
        this._wireParamInput('param-sp-R', (item, val) => { item.data.shapeParams.R = val; });
        this._wireParamInput('param-sp-r', (item, val) => { item.data.shapeParams.r = val; });
        this._wireParamInput('param-sp-d', (item, val) => { item.data.shapeParams.d = val; });
        const epiCb = document.getElementById('param-sp-epi');
        if (epiCb) {
            epiCb.addEventListener('change', () => {
                const item = MB.App.selectedItems[0];
                if (!item || !MB.Parametric.isParametric(item)) return;
                MB.History.snapshot();
                item.data.shapeParams.mode = epiCb.checked ? 'epi' : 'hypo';
                MB.Parametric.regenerate(item);
                paper.view.update();
            });
        }
        this._wireParamInput('param-rs-a', (item, val) => { item.data.shapeParams.a = val; });
        this._wireParamInput('param-rs-n', (item, val) => { item.data.shapeParams.n = Math.round(val); });
        this._wireParamInput('param-rs-d', (item, val) => { item.data.shapeParams.d = Math.round(val); });
        this._wireParamInput('param-li-A', (item, val) => { item.data.shapeParams.A = val; });
        this._wireParamInput('param-li-B', (item, val) => { item.data.shapeParams.B = val; });
        this._wireParamInput('param-li-a', (item, val) => { item.data.shapeParams.a = Math.round(val); });
        this._wireParamInput('param-li-b', (item, val) => { item.data.shapeParams.b = Math.round(val); });
        this._wireParamInput('param-li-delta', (item, val) => { item.data.shapeParams.delta = val; });
        this._wireParamInput('param-li-loops', (item, val) => { item.data.shapeParams.loops = Math.round(val); });
        this._wireParamInput('param-ha-size', (item, val) => { item.data.shapeParams.size = val; });
        this._wireParamInput('param-ha-fx', (item, val) => { item.data.shapeParams.freqX = val; });
        this._wireParamInput('param-ha-fy', (item, val) => { item.data.shapeParams.freqY = val; });
        this._wireParamInput('param-ha-px', (item, val) => { item.data.shapeParams.phaseX = val; });
        this._wireParamInput('param-ha-py', (item, val) => { item.data.shapeParams.phaseY = val; });
        this._wireParamInput('param-ha-decay', (item, val) => { item.data.shapeParams.decay = val; });
        this._wireParamInput('param-gu-R', (item, val) => { item.data.shapeParams.R = val; });
        this._wireParamInput('param-gu-r', (item, val) => { item.data.shapeParams.r = val; });
        this._wireParamInput('param-gu-d1', (item, val) => { item.data.shapeParams.d1 = val; });
        this._wireParamInput('param-gu-d2', (item, val) => { item.data.shapeParams.d2 = val; });
        this._wireParamInput('param-gu-lines', (item, val) => { item.data.shapeParams.nLines = Math.round(val); });

        // Arc text slider (live preview)
        const arcSlider = document.getElementById('param-text-arc');
        if (arcSlider) {
            let arcSnapped = false;
            arcSlider.addEventListener('input', () => {
                const item = MB.App.selectedItems[0];
                if (!item || !MB.Parametric.isParametric(item)) return;
                const val = parseInt(arcSlider.value);
                const arcLabel = document.getElementById('param-text-arc-val');
                if (arcLabel) arcLabel.textContent = val + '\u00B0';
                if (!arcSnapped) { MB.History.snapshot(); arcSnapped = true; }
                item.data.shapeParams.arcAngle = val;
                MB.Parametric.regenerate(item);
                paper.view.update();
            });
            arcSlider.addEventListener('change', () => { arcSnapped = false; });
        }

        // Listen for selection changes
        MB.App.on('selection-changed', (items) => this.updateObjectPanel(items));
        MB.App.on('active-layer-changed', (layer) => this.updateLaserPanel(layer));
    },

    _wireParamInput(id, apply) {
        const el = document.getElementById(id);
        if (!el) return;
        let snapped = false;
        // Live preview on input (not just on Enter/blur)
        el.addEventListener('input', () => {
            const item = MB.App.selectedItems[0];
            if (!item || !MB.Parametric.isParametric(item)) return;
            const val = parseFloat(el.value);
            if (isNaN(val)) return;
            if (!snapped) { MB.History.snapshot(); snapped = true; }
            apply(item, val);
            MB.Parametric.regenerate(item);
            paper.view.update();
        });
        el.addEventListener('change', () => { snapped = false; });
    },

    _wireParamTextInput(id, apply) {
        const el = document.getElementById(id);
        if (!el) return;
        let snapped = false;
        let timer = null;
        // Debounced live preview for text content (300ms)
        el.addEventListener('input', () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const item = MB.App.selectedItems[0];
                if (!item || !MB.Parametric.isParametric(item)) return;
                if (!snapped) { MB.History.snapshot(); snapped = true; }
                apply(item, el.value);
                MB.Parametric.regenerate(item);
                paper.view.update();
            }, 300);
        });
        el.addEventListener('change', () => { snapped = false; });
    },

    _wireParamSelect(id, apply) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            const item = MB.App.selectedItems[0];
            if (!item || !MB.Parametric.isParametric(item)) return;
            MB.History.snapshot();
            apply(item, el.value);
            MB.Parametric.regenerate(item);
            paper.view.update();
        });
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

        const paramProps = document.getElementById('param-props');

        if (items.length === 0) {
            propX.value = ''; propY.value = ''; propW.value = ''; propH.value = ''; propR.value = '';
            propX.disabled = propY.disabled = propW.disabled = propH.disabled = propR.disabled = true;
            if (lengthRow) lengthRow.style.display = 'none';
            if (paramProps) paramProps.classList.add('hidden');
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

            // Parametric properties
            this._updateParamPanel(item, paramProps);

            // Auto-expand Object panel when parametric item is selected
            if (MB.Parametric && MB.Parametric.isParametric(item)) {
                const objPanel = document.getElementById('object-properties');
                if (objPanel) objPanel.classList.remove('collapsed');
            }
        } else {
            if (paramProps) paramProps.classList.add('hidden');
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
            // Sync parametric params after scaling
            if ((propId === 'prop-w' || propId === 'prop-h') && MB.Parametric.isParametric(item)) {
                this._syncParamsFromBounds(item);
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
    },

    _updateParamPanel(item, paramProps) {
        if (!paramProps) return;

        // Hide all param groups
        paramProps.querySelectorAll('.param-group').forEach(g => g.classList.add('hidden'));

        if (!MB.Parametric.isParametric(item)) {
            paramProps.classList.add('hidden');
            return;
        }

        paramProps.classList.remove('hidden');
        const type = item.data.shapeType;
        const params = item.data.shapeParams;
        const typeLabel = document.getElementById('param-type-label');

        // Type label
        const typeNames = { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', text: 'Text',
            spirograph: 'Spirograph', rose: 'Rose Curve', lissajous: 'Lissajous',
            harmonograph: 'Harmonograph', guilloche: 'Guilloche' };
        if (typeLabel) typeLabel.textContent = typeNames[type] || type;

        // Show the matching group
        const group = document.getElementById('param-' + type);
        if (group) group.classList.remove('hidden');

        // Populate fields
        switch (type) {
            case 'rect':
                this._setVal('param-rect-w', params.width);
                this._setVal('param-rect-h', params.height);
                break;
            case 'ellipse':
                this._setVal('param-ellipse-rx', params.radiusX);
                this._setVal('param-ellipse-ry', params.radiusY);
                break;
            case 'polygon':
                this._setVal('param-poly-sides', params.sides);
                this._setVal('param-poly-radius', params.radius);
                const starCb = document.getElementById('param-poly-star');
                if (starCb) starCb.checked = !!params.isStar;
                const ratioSlider = document.getElementById('param-poly-ratio');
                const ratioRow = document.getElementById('param-poly-ratio-row');
                if (ratioSlider) ratioSlider.value = params.innerRatio || 0.5;
                const ratioVal = document.getElementById('param-poly-ratio-val');
                if (ratioVal) ratioVal.textContent = (params.innerRatio || 0.5).toFixed(2);
                if (ratioRow) ratioRow.style.display = params.isStar ? '' : 'none';
                break;
            case 'text':
                this._setVal('param-text-content', params.text, true);
                this._setVal('param-text-size', params.fontSize);
                this._setVal('param-text-spacing', params.spacing);
                this._setVal('param-text-line-h', params.lineHeight);
                const uniteCb = document.getElementById('param-text-unite');
                if (uniteCb) uniteCb.checked = params.unite !== false;
                // Arc angle
                const arcS = document.getElementById('param-text-arc');
                const arcV = document.getElementById('param-text-arc-val');
                const arcVal = params.arcAngle || 0;
                if (arcS) arcS.value = arcVal;
                if (arcV) arcV.textContent = arcVal + '\u00B0';
                // Populate font select
                this._populateParamFontSelect(params.fontName);
                break;
            case 'spirograph':
                this._setVal('param-sp-R', params.R);
                this._setVal('param-sp-r', params.r);
                this._setVal('param-sp-d', params.d);
                const spEpi = document.getElementById('param-sp-epi');
                if (spEpi) spEpi.checked = params.mode === 'epi';
                break;
            case 'rose':
                this._setVal('param-rs-a', params.a);
                this._setVal('param-rs-n', params.n);
                this._setVal('param-rs-d', params.d);
                break;
            case 'lissajous':
                this._setVal('param-li-A', params.A);
                this._setVal('param-li-B', params.B);
                this._setVal('param-li-a', params.a);
                this._setVal('param-li-b', params.b);
                this._setVal('param-li-delta', params.delta);
                this._setVal('param-li-loops', params.loops);
                break;
            case 'harmonograph':
                this._setVal('param-ha-size', params.size);
                this._setVal('param-ha-fx', params.freqX);
                this._setVal('param-ha-fy', params.freqY);
                this._setVal('param-ha-px', params.phaseX);
                this._setVal('param-ha-py', params.phaseY);
                this._setVal('param-ha-decay', params.decay);
                break;
            case 'guilloche':
                this._setVal('param-gu-R', params.R);
                this._setVal('param-gu-r', params.r);
                this._setVal('param-gu-d1', params.d1);
                this._setVal('param-gu-d2', params.d2);
                this._setVal('param-gu-lines', params.nLines);
                break;
        }
    },

    _setVal(id, val, isText) {
        const el = document.getElementById(id);
        if (!el) return;
        if (isText) {
            el.value = val || '';
        } else {
            el.value = typeof val === 'number' ? val.toFixed(1) : (val || '');
        }
    },

    _syncParamsFromBounds(item) {
        if (!MB.Parametric.isParametric(item)) return;
        const type = item.data.shapeType;
        const params = item.data.shapeParams;
        const b = item.bounds;
        switch (type) {
            case 'rect':
                params.width = b.width;
                params.height = b.height;
                break;
            case 'ellipse':
                params.radiusX = b.width / 2;
                params.radiusY = b.height / 2;
                break;
            case 'polygon':
                params.radius = Math.max(b.width, b.height) / 2;
                break;
            case 'text':
                params.fontSize = params.fontSize * (b.width / (item._prevWidth || b.width));
                break;
        }
    },

    _populateParamFontSelect(currentFont) {
        const sel = document.getElementById('param-text-font');
        if (!sel) return;
        const names = MB.FontManager.getFontNames();
        sel.innerHTML = '';
        names.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
        if (currentFont && names.includes(currentFont)) {
            sel.value = currentFont;
        }
    }
};
