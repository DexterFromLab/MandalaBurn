// MandalaBurn - Raster Image Import & Engraving
MB.ImageLayer = {

    init() {
        document.getElementById('file-import-image').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importImageFile(file);
            e.target.value = '';
        });
        this.initRasterPanel();
    },

    importImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.placeImage(e.target.result, file.name);
        };
        reader.readAsDataURL(file);
    },

    placeImage(dataUrl, name) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;
        MB.History.snapshot();
        layer.paperLayer.activate();

        // Preload the original image for later processing
        const origImg = new Image();
        origImg.onload = () => {
            const raster = new paper.Raster(origImg);
            // Scale so longest dimension fits ~40% of workspace
            const maxDim = Math.max(raster.width, raster.height);
            const targetMM = Math.min(100, Math.max(MB.Canvas.wsWidth, MB.Canvas.wsHeight) * 0.4);
            const scale = targetMM / maxDim;
            raster.scale(scale);

            // Center on workspace
            raster.position = new paper.Point(MB.Canvas.wsWidth / 2, MB.Canvas.wsHeight / 2);

            raster.data = {
                isUserItem: true,
                isRasterImage: true,
                imageName: name || 'image',
                imageDataUrl: dataUrl,
                _originalImage: origImg,
                imageSettings: {
                    dpi: 254,
                    dithering: 'threshold',
                    threshold: 128,
                    brightness: 0,
                    contrast: 0,
                    invert: false,
                    scanDirection: 'horizontal',
                    bidirectional: true,
                    overscan: 2.5
                }
            };

            raster.opacity = 0.85;

            MB.App.clearSelection();
            MB.App.selectedItems = [raster];
            raster.selected = true;
            MB.App.emit('selection-changed', MB.App.selectedItems);
            MB.ObjectsList.render();
            paper.view.update();
            document.getElementById('status-info').textContent = 'Image imported: ' + (name || 'image');
        };
        origImg.src = dataUrl;
    },

    // ---- Raster Properties Panel ----

    initRasterPanel() {
        const ids = [
            'param-raster-dpi', 'param-raster-dither', 'param-raster-threshold',
            'param-raster-brightness', 'param-raster-contrast', 'param-raster-invert',
            'param-raster-scan-dir', 'param-raster-bidir', 'param-raster-overscan'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            const evtName = (el.type === 'range' || el.type === 'checkbox') ? 'input' : 'change';
            el.addEventListener(evtName, () => {
                const item = MB.App.selectedItems[0];
                if (!item || !item.data || !item.data.isRasterImage) return;
                this._applyRasterSettings(item);
            });
        });
    },

    _applyRasterSettings(item) {
        const s = item.data.imageSettings;
        s.dpi = parseInt(document.getElementById('param-raster-dpi').value) || 254;
        s.dithering = document.getElementById('param-raster-dither').value;
        s.threshold = parseInt(document.getElementById('param-raster-threshold').value) || 128;
        s.brightness = parseInt(document.getElementById('param-raster-brightness').value) || 0;
        s.contrast = parseInt(document.getElementById('param-raster-contrast').value) || 0;
        s.invert = document.getElementById('param-raster-invert').checked;
        s.scanDirection = document.getElementById('param-raster-scan-dir').value;
        s.bidirectional = document.getElementById('param-raster-bidir').checked;
        s.overscan = parseFloat(document.getElementById('param-raster-overscan').value) || 2.5;

        // Update value labels
        const thVal = document.getElementById('param-raster-threshold-val');
        if (thVal) thVal.textContent = s.threshold;
        const brVal = document.getElementById('param-raster-brightness-val');
        if (brVal) brVal.textContent = s.brightness;
        const coVal = document.getElementById('param-raster-contrast-val');
        if (coVal) coVal.textContent = s.contrast;

        // Show/hide threshold row based on dithering mode
        const thRow = document.getElementById('param-raster-threshold-row');
        if (thRow) thRow.style.display = s.dithering === 'threshold' ? '' : 'none';

        // Live preview: update the raster's visual appearance on canvas
        this._updateRasterPreview(item);
    },

    _updateRasterPreview(rasterItem) {
        const settings = rasterItem.data.imageSettings;
        // Get the original unprocessed image
        let origImg = rasterItem.data._originalImage;
        if (!origImg) {
            // Fallback: load from data URL
            origImg = new Image();
            origImg.src = rasterItem.data.imageDataUrl;
            rasterItem.data._originalImage = origImg;
            origImg.onload = () => this._updateRasterPreview(rasterItem);
            return;
        }
        if (!origImg.complete || origImg.naturalWidth === 0) return;

        // Create offscreen canvas from original image
        const canvas = document.createElement('canvas');
        const w = origImg.naturalWidth || origImg.width;
        const h = origImg.naturalHeight || origImg.height;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(origImg, 0, 0);

        // Apply brightness/contrast
        if (settings.brightness !== 0 || settings.contrast !== 0) {
            this._adjustBrightnessContrast(ctx, w, h, settings.brightness || 0, settings.contrast || 0);
        }

        // Apply dithering/invert for visual preview
        const imgData = ctx.getImageData(0, 0, w, h);
        const processed = this._applyDithering(imgData, settings);

        // Write back as grayscale image
        const outData = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const v = 255 - processed[i]; // invert: burn value → display darkness
            outData.data[i * 4] = v;
            outData.data[i * 4 + 1] = v;
            outData.data[i * 4 + 2] = v;
            outData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(outData, 0, 0);

        // Write processed pixels directly to raster's canvas (no transform change)
        try {
            rasterItem.setImageData(outData, new paper.Point(0, 0));
        } catch (e) {
            // Fallback: use getContext directly
            const rctx = rasterItem.getContext(true);
            rctx.putImageData(outData, 0, 0);
        }
        paper.view.update();
    },

    populateRasterPanel(settings) {
        const s = settings || {};
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = !!val;
                else el.value = val;
            }
        };
        setVal('param-raster-dpi', s.dpi || 254);
        setVal('param-raster-dither', s.dithering || 'threshold');
        setVal('param-raster-threshold', s.threshold || 128);
        setVal('param-raster-brightness', s.brightness || 0);
        setVal('param-raster-contrast', s.contrast || 0);
        setVal('param-raster-invert', s.invert || false);
        setVal('param-raster-scan-dir', s.scanDirection || 'horizontal');
        setVal('param-raster-bidir', s.bidirectional !== false);
        setVal('param-raster-overscan', s.overscan || 2.5);

        // Value labels
        const thVal = document.getElementById('param-raster-threshold-val');
        if (thVal) thVal.textContent = s.threshold || 128;
        const brVal = document.getElementById('param-raster-brightness-val');
        if (brVal) brVal.textContent = s.brightness || 0;
        const coVal = document.getElementById('param-raster-contrast-val');
        if (coVal) coVal.textContent = s.contrast || 0;

        // Show/hide threshold row
        const thRow = document.getElementById('param-raster-threshold-row');
        if (thRow) thRow.style.display = (s.dithering || 'threshold') === 'threshold' ? '' : 'none';
    },

    // ---- Raster Engraving Compilation ----

    compileRaster(rasterItem, layer, ls, pass, totalPasses, rapidSpeed, pos) {
        const settings = rasterItem.data.imageSettings || {};
        const dpi = settings.dpi || 254;
        const lineSpacing = 25.4 / dpi; // mm between scan lines
        const bounds = rasterItem.bounds;
        const overscan = settings.overscan || 2.5;
        const bidir = settings.bidirectional !== false;
        const isHorizontal = settings.scanDirection !== 'vertical';

        const commands = [];
        const baseCmd = {
            color: layer.color,
            airAssist: ls.airAssist,
            layerName: layer.name,
            mode: 'image',
            pass: pass,
            totalPasses: totalPasses
        };

        // Get processed pixel data
        const canvas = this._getRasterCanvas(rasterItem, settings);
        if (!canvas) return { commands, pos };

        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const processed = this._applyDithering(imgData, settings);

        if (isHorizontal) {
            const numLines = Math.max(1, Math.round(bounds.height / lineSpacing));
            for (let row = 0; row < numLines; row++) {
                const y = bounds.top + (row + 0.5) * (bounds.height / numLines);
                const imgRow = Math.min(Math.floor((row / numLines) * canvas.height), canvas.height - 1);
                const reverse = bidir && (row % 2 === 1);

                const xStart = reverse ? bounds.right + overscan : bounds.left - overscan;
                const xEnd = reverse ? bounds.left - overscan : bounds.right + overscan;

                // Rapid move to line start
                commands.push({
                    type: 'rapid',
                    from: { x: pos.x, y: pos.y },
                    to: { x: xStart, y: y },
                    speed: rapidSpeed,
                    ...baseCmd, power: 0
                });
                pos = { x: xStart, y: y };

                // Scan the row with RLE optimization
                this._compileScanLine(commands, processed, canvas.width,
                    imgRow, bounds, y, reverse, ls, baseCmd);

                pos = { x: xEnd, y: y };
            }
        } else {
            // Vertical scan
            const numLines = Math.max(1, Math.round(bounds.width / lineSpacing));
            for (let col = 0; col < numLines; col++) {
                const x = bounds.left + (col + 0.5) * (bounds.width / numLines);
                const imgCol = Math.min(Math.floor((col / numLines) * canvas.width), canvas.width - 1);
                const reverse = bidir && (col % 2 === 1);

                const yStart = reverse ? bounds.bottom + overscan : bounds.top - overscan;
                const yEnd = reverse ? bounds.top - overscan : bounds.bottom + overscan;

                commands.push({
                    type: 'rapid',
                    from: { x: pos.x, y: pos.y },
                    to: { x: x, y: yStart },
                    speed: rapidSpeed,
                    ...baseCmd, power: 0
                });
                pos = { x: x, y: yStart };

                this._compileScanLineV(commands, processed, canvas.width, canvas.height,
                    imgCol, bounds, x, reverse, ls, baseCmd);

                pos = { x: x, y: yEnd };
            }
        }

        return { commands, pos };
    },

    _compileScanLine(commands, pixelData, imgWidth, imgRow, bounds, y, reverse, ls, baseCmd) {
        // RLE: merge consecutive pixels with similar power into single commands
        const powerQuant = 4; // quantize power to reduce segments
        const startCol = reverse ? imgWidth - 1 : 0;
        const endCol = reverse ? -1 : imgWidth;
        const colStep = reverse ? -1 : 1;

        let runStartX = reverse ? bounds.right : bounds.left;
        let runPower = -1;

        for (let col = startCol; col !== endCol; col += colStep) {
            const darkness = pixelData[imgRow * imgWidth + col];
            const rawPower = (darkness / 255) * ls.power;
            const power = Math.round(rawPower / powerQuant) * powerQuant;
            const pixX = bounds.left + ((col + 0.5) / imgWidth) * bounds.width;

            if (power !== runPower && runPower >= 0) {
                // Emit previous run
                commands.push({
                    type: 'cut',
                    from: { x: runStartX, y: y },
                    to: { x: pixX, y: y },
                    speed: ls.speed,
                    ...baseCmd,
                    power: runPower
                });
                runStartX = pixX;
            }
            if (runPower < 0) runStartX = reverse ? bounds.right + (baseCmd.overscan || 0) : bounds.left - (baseCmd.overscan || 0);
            runPower = power;
        }

        // Final run
        if (runPower >= 0) {
            const endX = reverse ? bounds.left : bounds.right;
            commands.push({
                type: 'cut',
                from: { x: runStartX, y: y },
                to: { x: endX, y: y },
                speed: ls.speed,
                ...baseCmd,
                power: runPower
            });
        }
    },

    _compileScanLineV(commands, pixelData, imgWidth, imgHeight, imgCol, bounds, x, reverse, ls, baseCmd) {
        const powerQuant = 4;
        const startRow = reverse ? imgHeight - 1 : 0;
        const endRow = reverse ? -1 : imgHeight;
        const rowStep = reverse ? -1 : 1;

        let runStartY = reverse ? bounds.bottom : bounds.top;
        let runPower = -1;

        for (let row = startRow; row !== endRow; row += rowStep) {
            const darkness = pixelData[row * imgWidth + imgCol];
            const rawPower = (darkness / 255) * ls.power;
            const power = Math.round(rawPower / powerQuant) * powerQuant;
            const pixY = bounds.top + ((row + 0.5) / imgHeight) * bounds.height;

            if (power !== runPower && runPower >= 0) {
                commands.push({
                    type: 'cut',
                    from: { x: x, y: runStartY },
                    to: { x: x, y: pixY },
                    speed: ls.speed,
                    ...baseCmd,
                    power: runPower
                });
                runStartY = pixY;
            }
            if (runPower < 0) runStartY = reverse ? bounds.bottom : bounds.top;
            runPower = power;
        }

        if (runPower >= 0) {
            const endY = reverse ? bounds.top : bounds.bottom;
            commands.push({
                type: 'cut',
                from: { x: x, y: runStartY },
                to: { x: x, y: endY },
                speed: ls.speed,
                ...baseCmd,
                power: runPower
            });
        }
    },

    // ---- Image Processing ----

    _getRasterCanvas(rasterItem, settings) {
        // Use stored original image (not the dithered preview canvas)
        const img = rasterItem.data._originalImage || rasterItem.image || rasterItem.canvas;
        if (!img) return null;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        if (canvas.width === 0 || canvas.height === 0) return null;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        if (settings.brightness !== 0 || settings.contrast !== 0) {
            this._adjustBrightnessContrast(ctx, canvas.width, canvas.height,
                settings.brightness || 0, settings.contrast || 0);
        }
        return canvas;
    },

    _applyDithering(imgData, settings) {
        const { width, height, data } = imgData;
        const pixels = new Uint8Array(width * height);

        // Convert to grayscale
        for (let i = 0; i < width * height; i++) {
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            const a = data[i * 4 + 3];
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            // Treat transparent as white
            if (a < 128) gray = 255;
            if (settings.invert) gray = 255 - gray;
            pixels[i] = Math.max(0, Math.min(255, Math.round(gray)));
        }

        switch (settings.dithering) {
            case 'threshold':
                return this._ditherThreshold(pixels, width, height, settings.threshold || 128);
            case 'ordered':
                return this._ditherOrdered(pixels, width, height);
            case 'floyd-steinberg':
                return this._ditherFloydSteinberg(pixels, width, height);
            case 'grayscale':
                // No dithering - invert so dark pixel = high power
                for (let i = 0; i < pixels.length; i++) {
                    pixels[i] = 255 - pixels[i];
                }
                return pixels;
            default:
                return this._ditherThreshold(pixels, width, height, 128);
        }
    },

    _ditherThreshold(pixels, w, h, threshold) {
        const out = new Uint8Array(w * h);
        for (let i = 0; i < pixels.length; i++) {
            out[i] = pixels[i] < threshold ? 255 : 0; // dark = burn = 255
        }
        return out;
    },

    _ditherOrdered(pixels, w, h) {
        const bayer = [
            [ 0, 8, 2, 10],
            [12, 4, 14,  6],
            [ 3, 11, 1,  9],
            [15, 7, 13,  5]
        ];
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const threshold = (bayer[y % 4][x % 4] / 16) * 255;
                out[i] = pixels[i] < threshold ? 255 : 0;
            }
        }
        return out;
    },

    _ditherFloydSteinberg(pixels, w, h) {
        const buf = new Float32Array(pixels);
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const old = buf[i];
                const newVal = old < 128 ? 0 : 255;
                out[i] = old < 128 ? 255 : 0; // inverted: dark = burn
                const err = old - newVal;
                if (x + 1 < w) buf[i + 1] += err * 7 / 16;
                if (y + 1 < h) {
                    if (x > 0) buf[i + w - 1] += err * 3 / 16;
                    buf[i + w] += err * 5 / 16;
                    if (x + 1 < w) buf[i + w + 1] += err * 1 / 16;
                }
            }
        }
        return out;
    },

    _adjustBrightnessContrast(ctx, w, h, brightness, contrast) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        const b = (brightness / 100) * 255;
        const c = (contrast + 100) / 100;
        for (let i = 0; i < d.length; i += 4) {
            for (let j = 0; j < 3; j++) {
                let v = d[i + j];
                v += b;
                v = ((v - 128) * c) + 128;
                d[i + j] = Math.max(0, Math.min(255, Math.round(v)));
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }
};
