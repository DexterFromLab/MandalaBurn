// MandalaBurn - Text Tool (font to paths with unite)
(function() {
    let preview = null;
    let placementMode = false;

    const tool = new paper.Tool();
    tool.name = 'text';

    // ---- Helpers ----

    function getOptions() {
        return {
            text: (document.getElementById('text-input')?.value || '').trim(),
            fontName: document.getElementById('text-font')?.value || '',
            size: parseFloat(document.getElementById('text-size')?.value) || 20,
            spacing: parseFloat(document.getElementById('text-spacing')?.value) || 0,
            lineHeight: parseFloat(document.getElementById('text-line-height')?.value) || 1.3,
            unite: document.getElementById('text-unite')?.checked !== false
        };
    }

    function getSelectedFont() {
        const opts = getOptions();
        return MB.FontManager.getFont(opts.fontName) || MB.FontManager.getFirstFont();
    }

    /**
     * Convert text to Paper.js paths using opentype.js
     * Returns array of CompoundPath (one per glyph/letter) positioned correctly
     */
    function textToPaths(text, font, x, y, fontSize, letterSpacing) {
        if (!font || !text) return [];

        const paths = [];
        const scale = fontSize / font.unitsPerEm;
        let cursorX = x;

        for (let i = 0; i < text.length; i++) {
            const glyph = font.charToGlyph(text[i]);
            if (!glyph || glyph.index === 0) {
                // Space or unknown char — advance cursor
                cursorX += (glyph ? glyph.advanceWidth || font.unitsPerEm * 0.3 : font.unitsPerEm * 0.3) * scale + letterSpacing;
                continue;
            }

            // Get path for this glyph
            const otPath = glyph.getPath(cursorX, y, fontSize);
            const pathData = otPath.toPathData(3);

            if (pathData && pathData.length > 1) {
                try {
                    const paperPath = new paper.CompoundPath(pathData);
                    if (paperPath.children.length > 0 || (paperPath.segments && paperPath.segments.length > 0)) {
                        paths.push(paperPath);
                    } else {
                        paperPath.remove();
                    }
                } catch (e) {
                    // Skip invalid path data
                }
            }

            // Advance cursor: glyph width + kerning + letter spacing
            let advance = glyph.advanceWidth * scale;
            if (i < text.length - 1) {
                const nextGlyph = font.charToGlyph(text[i + 1]);
                const kerning = font.getKerningValue(glyph, nextGlyph);
                advance += kerning * scale;
            }
            cursorX += advance + letterSpacing;
        }

        return paths;
    }

    /**
     * Unite glyph paths and fix winding directions for holes (A, B, D, etc.)
     */
    function unitePaths(paths) {
        if (paths.length <= 1) return paths[0] || null;

        let result = paths[0];
        for (let i = 1; i < paths.length; i++) {
            try {
                const merged = result.unite(paths[i]);
                result.remove();
                paths[i].remove();
                result = merged;
            } catch (e) {
                paths[i].remove();
            }
        }

        // Fix winding directions so counters (holes) render correctly
        if (result instanceof paper.CompoundPath && result.reorient) {
            result.reorient(true, true);
        }

        return result;
    }

    /**
     * Convert multiline text to Paper.js paths, then optionally unite overlaps
     */
    function createTextPaths(baseX, baseY) {
        const opts = getOptions();
        const font = getSelectedFont();
        if (!font || !opts.text) return null;

        const lines = opts.text.split('\n');
        const lineStep = opts.size * opts.lineHeight;
        const allPaths = [];

        for (let li = 0; li < lines.length; li++) {
            const lineText = lines[li];
            if (!lineText.trim()) continue;
            const lineY = baseY + li * lineStep;
            const linePaths = textToPaths(lineText, font, baseX, lineY, opts.size, opts.spacing);
            allPaths.push(...linePaths);
        }

        if (allPaths.length === 0) return null;

        let result;

        if (opts.unite && allPaths.length > 1) {
            result = unitePaths(allPaths);
        } else if (allPaths.length > 1) {
            // Group without uniting
            result = new paper.CompoundPath({ children: [] });
            allPaths.forEach(p => {
                if (p instanceof paper.CompoundPath) {
                    p.children.slice().forEach(child => result.addChild(child.clone()));
                    p.remove();
                } else {
                    result.addChild(p);
                }
            });
        } else {
            result = allPaths[0];
        }

        return result;
    }

    function clearPreview() {
        if (preview) { preview.remove(); preview = null; }
    }

    function drawPreview(point) {
        clearPreview();
        const opts = getOptions();
        const font = getSelectedFont();
        if (!font || !opts.text) return;

        const result = createTextPaths(point.x, point.y);
        if (!result) return;

        result.strokeColor = MB.Layers.getActiveColor();
        result.strokeWidth = 0.5 / paper.view.zoom;
        result.fillColor = null;
        result.dashArray = [4 / paper.view.zoom, 4 / paper.view.zoom];
        result.opacity = 0.6;
        preview = result;
    }

    // ---- Tool handlers ----

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        const opts = getOptions();
        const font = getSelectedFont();
        if (!font) {
            document.getElementById('status-info').textContent = 'No font loaded yet';
            return;
        }
        if (!opts.text) {
            document.getElementById('status-info').textContent =
                'Type text in the panel first, then click here to place it.';
            // Flash textarea to draw attention
            const input = document.getElementById('text-input');
            if (input) {
                input.style.outline = '2px solid var(--warning)';
                setTimeout(() => { input.style.outline = ''; input.focus(); }, 1500);
            }
            return;
        }

        clearPreview();

        const point = MB.GridSnap.snap(event.point, event);

        MB.History.snapshot();
        layer.paperLayer.activate();

        const result = createTextPaths(point.x, point.y);
        if (!result) return;

        result.strokeColor = layer.color;
        result.strokeWidth = 0.5;
        result.fillColor = null;
        result.data = {
            isUserItem: true,
            shapeType: 'text',
            shapeParams: {
                text: opts.text,
                fontName: opts.fontName,
                fontSize: opts.size,
                spacing: opts.spacing,
                lineHeight: opts.lineHeight,
                unite: opts.unite,
                arcAngle: 0
            }
        };

        document.getElementById('status-info').textContent =
            'Text placed (' + (result.children ? result.children.length : 1) + ' paths)';
        MB.App.select(result);
    };

    tool.onMouseMove = function(event) {
        const opts = getOptions();
        if (!opts.text) return;
        drawPreview(event.point);
    };

    // ---- Registration ----

    /**
     * Apply arc/bend transformation to a path item.
     * Positive angle = text curves upward (rainbow), negative = downward.
     */
    function applyArcTransform(item, arcAngleDeg) {
        if (!arcAngleDeg || arcAngleDeg === 0) return;

        const bounds = item.bounds.clone();
        const arcRad = arcAngleDeg * Math.PI / 180;
        const textWidth = bounds.width;
        if (textWidth < 0.01) return;

        const R = textWidth / Math.abs(arcRad);
        const centerX = bounds.center.x;
        const refY = arcRad > 0 ? bounds.bottom : bounds.top;
        const arcCenterY = arcRad > 0 ? refY + R : refY - R;

        function xformSeg(seg) {
            const px = seg.point.x;
            const py = seg.point.y;
            let theta, r;

            if (arcRad > 0) {
                theta = (px - centerX) / R;
                r = R + (refY - py);
                seg.point = new paper.Point(
                    centerX + r * Math.sin(theta),
                    arcCenterY - r * Math.cos(theta)
                );
            } else {
                theta = -(px - centerX) / R;
                r = R + (py - refY);
                seg.point = new paper.Point(
                    centerX + r * Math.sin(theta),
                    arcCenterY + r * Math.cos(theta)
                );
            }

            const angleDeg = theta * 180 / Math.PI;
            if (seg.handleIn && seg.handleIn.length > 0) {
                seg.handleIn = seg.handleIn.rotate(angleDeg);
            }
            if (seg.handleOut && seg.handleOut.length > 0) {
                seg.handleOut = seg.handleOut.rotate(angleDeg);
            }
        }

        function walk(it) {
            if (it instanceof paper.CompoundPath) {
                it.children.forEach(walk);
            } else if (it instanceof paper.Path) {
                it.segments.forEach(xformSeg);
            }
        }
        walk(item);
    }

    // Register parametric builder for text
    MB.Parametric.registerBuilder('text', function(params) {
        const font = MB.FontManager.getFont(params.fontName) || MB.FontManager.getFirstFont();
        if (!font || !params.text) return null;

        const lines = params.text.split('\n');
        const lineStep = params.fontSize * params.lineHeight;
        const allPaths = [];

        for (let li = 0; li < lines.length; li++) {
            const lineText = lines[li];
            if (!lineText.trim()) continue;
            const lineY = li * lineStep;
            const linePaths = textToPaths(lineText, font, 0, lineY, params.fontSize, params.spacing);
            allPaths.push(...linePaths);
        }

        if (allPaths.length === 0) return null;

        let result;
        if (params.unite && allPaths.length > 1) {
            result = unitePaths(allPaths);
        } else if (allPaths.length > 1) {
            result = new paper.CompoundPath({ children: [] });
            allPaths.forEach(p => {
                if (p instanceof paper.CompoundPath) {
                    p.children.slice().forEach(child => result.addChild(child.clone()));
                    p.remove();
                } else {
                    result.addChild(p);
                }
            });
        } else {
            result = allPaths[0];
        }

        // Apply arc transform if set
        if (params.arcAngle && params.arcAngle !== 0) {
            applyArcTransform(result, params.arcAngle);
        }

        return result;
    });

    MB.App.registerTool('text', {
        activate() {
            tool.activate();
            // Focus the text input
            const input = document.getElementById('text-input');
            if (input) setTimeout(() => input.focus(), 50);
            // Show guidance
            const fontCount = MB.FontManager.getFontNames().length;
            if (fontCount === 0) {
                document.getElementById('status-info').textContent =
                    'Loading fonts... Type text in the panel, then click canvas to place.';
            } else {
                document.getElementById('status-info').textContent =
                    'Type text in the panel, then click canvas to place.';
            }
        },
        deactivate() {
            clearPreview();
        },
        cancel() {
            clearPreview();
        }
    });
})();
