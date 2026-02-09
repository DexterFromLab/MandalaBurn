// MandalaBurn - Select Tool (Move / Scale / Rotate with handles)
(function() {
    let dragStart = null;
    let dragItems = [];
    let dragOffsets = [];
    let rubberBand = null;
    let mode = 'idle'; // idle, dragging, rubber-band, scaling, rotating, anchor-drag
    let transformMode = 'move'; // move, scale, rotate
    let handles = [];
    let anchorMarker = null;
    let anchorPoint = null; // paper.Point
    let activeHandle = null; // { type: 'scale'|'rotate', index, pos }
    let origBounds = null;
    let origItemStates = []; // [{position, bounds, geometry}]
    let hasDragged = false;
    let lastClickTime = 0;
    let lastClickPoint = null;

    const HANDLE_SIZE = 6;
    const ROTATE_OFFSET = 20;

    const tool = new paper.Tool();
    tool.name = 'select';

    // Listen for transform mode changes from the tool options panel
    MB.App.on('transform-mode-changed', (m) => {
        transformMode = m;
        redrawHandles();
    });

    MB.App.on('selection-changed', () => {
        if (MB.App.activeTool === 'select') redrawHandles();
    });

    // ---- Handle Drawing ----

    function clearHandles() {
        handles.forEach(h => h.remove());
        handles = [];
        if (anchorMarker) { anchorMarker.remove(); anchorMarker = null; }
    }

    function redrawHandles() {
        clearHandles();
        const items = MB.App.selectedItems;
        if (items.length === 0 || transformMode === 'move') return;

        // Compute combined bounds
        let bounds = null;
        items.forEach(item => {
            bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
        });
        if (!bounds || bounds.width === 0 && bounds.height === 0) return;

        const z = paper.view.zoom;
        const hs = HANDLE_SIZE / z;

        if (transformMode === 'scale') {
            // 8 handles: 4 corners + 4 midpoints
            const pts = [
                { pos: bounds.topLeft, cursor: 'nw', idx: 0 },
                { pos: bounds.topCenter, cursor: 'n', idx: 1 },
                { pos: bounds.topRight, cursor: 'ne', idx: 2 },
                { pos: bounds.rightCenter, cursor: 'e', idx: 3 },
                { pos: bounds.bottomRight, cursor: 'se', idx: 4 },
                { pos: bounds.bottomCenter, cursor: 's', idx: 5 },
                { pos: bounds.bottomLeft, cursor: 'sw', idx: 6 },
                { pos: bounds.leftCenter, cursor: 'w', idx: 7 }
            ];
            pts.forEach(p => {
                const h = new paper.Path.Rectangle({
                    center: p.pos,
                    size: [hs, hs],
                    fillColor: '#ffffff',
                    strokeColor: '#6c8fef',
                    strokeWidth: 1 / z
                });
                h.data = { isHandle: true, handleType: 'scale', handleIndex: p.idx, handlePos: p.pos };
                handles.push(h);
            });

            // Anchor = opposite corner by default (center)
            if (!anchorPoint) anchorPoint = bounds.center;
        }

        if (transformMode === 'rotate') {
            // Bounding box outline
            const outline = new paper.Path.Rectangle({
                rectangle: bounds,
                strokeColor: '#6c8fef',
                strokeWidth: 1 / z,
                dashArray: [4 / z, 4 / z],
                fillColor: null
            });
            outline.data = { isHandle: true };
            handles.push(outline);

            // Rotation handle — circle above top center
            const rotPt = bounds.topCenter.subtract(new paper.Point(0, ROTATE_OFFSET / z));
            const line = new paper.Path.Line({
                from: bounds.topCenter,
                to: rotPt,
                strokeColor: '#6c8fef',
                strokeWidth: 1 / z
            });
            line.data = { isHandle: true };
            handles.push(line);

            const rotHandle = new paper.Path.Circle({
                center: rotPt,
                radius: hs * 0.7,
                fillColor: '#ffffff',
                strokeColor: '#6c8fef',
                strokeWidth: 1 / z
            });
            rotHandle.data = { isHandle: true, handleType: 'rotate', handlePos: rotPt };
            handles.push(rotHandle);

            // Anchor = center by default
            if (!anchorPoint) anchorPoint = bounds.center;
        }

        // Draw anchor marker (crosshair)
        if (anchorPoint && (transformMode === 'scale' || transformMode === 'rotate')) {
            const as = 8 / z;
            const g = new paper.Group();
            g.addChild(new paper.Path.Line({
                from: anchorPoint.subtract([as, 0]),
                to: anchorPoint.add([as, 0]),
                strokeColor: '#ef6c6c',
                strokeWidth: 1.5 / z
            }));
            g.addChild(new paper.Path.Line({
                from: anchorPoint.subtract([0, as]),
                to: anchorPoint.add([0, as]),
                strokeColor: '#ef6c6c',
                strokeWidth: 1.5 / z
            }));
            g.addChild(new paper.Path.Circle({
                center: anchorPoint,
                radius: 3 / z,
                strokeColor: '#ef6c6c',
                strokeWidth: 1 / z,
                fillColor: null
            }));
            g.data = { isHandle: true, handleType: 'anchor' };
            anchorMarker = g;
            handles.push(g);
        }
    }

    function hitHandle(point) {
        const tolerance = 8 / paper.view.zoom;
        for (let i = handles.length - 1; i >= 0; i--) {
            const h = handles[i];
            if (!h.data || !h.data.handleType) continue;
            if (h.data.handleType === 'anchor') {
                if (point.getDistance(anchorPoint) < tolerance) {
                    return { type: 'anchor' };
                }
            } else if (h.data.handleType === 'rotate') {
                if (point.getDistance(h.data.handlePos) < tolerance) {
                    return { type: 'rotate' };
                }
            } else if (h.data.handleType === 'scale') {
                if (point.getDistance(h.data.handlePos) < tolerance) {
                    return { type: 'scale', index: h.data.handleIndex, pos: h.data.handlePos };
                }
            }
        }
        return null;
    }

    // Compute opposite anchor for scale handle
    function getScaleAnchor(handleIndex, bounds) {
        // 0=TL 1=TC 2=TR 3=RC 4=BR 5=BC 6=BL 7=LC
        const opposites = [4, 5, 6, 7, 0, 1, 2, 3]; // opposite handle index
        const pts = [
            bounds.topLeft, bounds.topCenter, bounds.topRight, bounds.rightCenter,
            bounds.bottomRight, bounds.bottomCenter, bounds.bottomLeft, bounds.leftCenter
        ];
        return pts[opposites[handleIndex]];
    }

    // Save geometry as raw numeric coordinates (no Paper.js objects)
    function saveGeometry(item) {
        function savePathSegs(path) {
            return path.segments.map(seg => ({
                px: seg.point.x, py: seg.point.y,
                hix: seg.handleIn.x, hiy: seg.handleIn.y,
                hox: seg.handleOut.x, hoy: seg.handleOut.y
            }));
        }
        if (item instanceof paper.CompoundPath) {
            return { type: 'compound', children: item.children.map(c => savePathSegs(c)) };
        }
        if (item instanceof paper.Group) {
            return { type: 'group', children: item.children.map(c => saveGeometry(c)) };
        }
        if (item instanceof paper.Path) {
            return { type: 'path', segments: savePathSegs(item) };
        }
        return null;
    }

    // Restore geometry in-place from raw coordinates
    function restoreGeometry(item, saved) {
        function restorePathSegs(path, segs) {
            for (let i = 0; i < path.segments.length && i < segs.length; i++) {
                const seg = path.segments[i], s = segs[i];
                seg.point.set(s.px, s.py);
                seg.handleIn.set(s.hix, s.hiy);
                seg.handleOut.set(s.hox, s.hoy);
            }
        }
        if (!saved) return;
        if (saved.type === 'path' && item instanceof paper.Path) {
            restorePathSegs(item, saved.segments);
        } else if (saved.type === 'compound' && item instanceof paper.CompoundPath) {
            item.children.forEach((child, i) => {
                if (saved.children[i]) restorePathSegs(child, saved.children[i]);
            });
        } else if (saved.type === 'group' && item instanceof paper.Group) {
            item.children.forEach((child, i) => {
                if (saved.children[i]) restoreGeometry(child, saved.children[i]);
            });
        }
    }

    // Manual point-by-point rotation — pure trigonometry, bypasses Paper.js transforms
    function manualRotate(item, angleDeg, center) {
        const rad = angleDeg * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        function rotateSegs(path) {
            for (let i = 0; i < path.segments.length; i++) {
                const seg = path.segments[i];
                // Rotate point around center
                const dx = seg.point.x - center.x, dy = seg.point.y - center.y;
                seg.point.set(center.x + dx * cos - dy * sin,
                              center.y + dx * sin + dy * cos);
                // Rotate handles (relative to point, rotate around origin)
                const hix = seg.handleIn.x, hiy = seg.handleIn.y;
                seg.handleIn.set(hix * cos - hiy * sin, hix * sin + hiy * cos);
                const hox = seg.handleOut.x, hoy = seg.handleOut.y;
                seg.handleOut.set(hox * cos - hoy * sin, hox * sin + hoy * cos);
            }
        }
        if (item instanceof paper.CompoundPath) {
            item.children.forEach(child => rotateSegs(child));
        } else if (item instanceof paper.Group) {
            item.children.forEach(child => manualRotate(child, angleDeg, center));
        } else if (item instanceof paper.Path) {
            rotateSegs(item);
        }
    }

    // Manual point-by-point scaling — direct coordinate math
    function manualScale(item, sx, sy, center) {
        function scaleSegs(path) {
            for (let i = 0; i < path.segments.length; i++) {
                const seg = path.segments[i];
                seg.point.set(center.x + (seg.point.x - center.x) * sx,
                              center.y + (seg.point.y - center.y) * sy);
                seg.handleIn.set(seg.handleIn.x * sx, seg.handleIn.y * sy);
                seg.handleOut.set(seg.handleOut.x * sx, seg.handleOut.y * sy);
            }
        }
        if (item instanceof paper.CompoundPath) {
            item.children.forEach(child => scaleSegs(child));
        } else if (item instanceof paper.Group) {
            item.children.forEach(child => manualScale(child, sx, sy, center));
        } else if (item instanceof paper.Path) {
            scaleSegs(item);
        }
    }

    // Compute geometric centroid of all segment points across items
    function computeCentroid(items) {
        let sumX = 0, sumY = 0, count = 0;
        function addPts(item) {
            if (item instanceof paper.CompoundPath) {
                item.children.forEach(c => addPts(c));
            } else if (item instanceof paper.Group) {
                item.children.forEach(c => addPts(c));
            } else if (item instanceof paper.Path) {
                for (let i = 0; i < item.segments.length; i++) {
                    sumX += item.segments[i].point.x;
                    sumY += item.segments[i].point.y;
                    count++;
                }
            }
        }
        items.forEach(item => addPts(item));
        return count > 0 ? new paper.Point(sumX / count, sumY / count) : null;
    }

    function captureItemStates() {
        return MB.App.selectedItems.map(item => ({
            position: item.position.clone(),
            bounds: item.bounds.clone(),
            geometry: saveGeometry(item)
        }));
    }

    // ---- Tool Handlers ----

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;
        hasDragged = false;

        // Double-click detection → enter node-edit
        const now = Date.now();
        const isDoubleClick = (now - lastClickTime < 400) &&
            lastClickPoint && event.point.getDistance(lastClickPoint) < 5 / paper.view.zoom;
        lastClickTime = now;
        lastClickPoint = event.point.clone();

        if (isDoubleClick) {
            const dblHit = paper.project.hitTest(event.point, {
                fill: true, stroke: true, segments: false,
                tolerance: 5 / paper.view.zoom
            });
            // Walk up parent chain for CompoundPath/Group children
            let dblItem = dblHit ? dblHit.item : null;
            if (dblItem && !(dblItem.data && dblItem.data.isUserItem)) {
                // Check symmetry proxy first
                let check = dblItem;
                while (check) {
                    if (check.data && check.data.symmetryOriginal) {
                        dblItem = check.data.symmetryOriginal;
                        break;
                    }
                    if (check === check.layer) { check = null; break; }
                    check = check.parent;
                }
                // If not a symmetry proxy, walk for isUserItem
                if (!check) {
                    while (dblItem && dblItem.parent && dblItem.parent !== dblItem.layer) {
                        dblItem = dblItem.parent;
                        if (dblItem.data && dblItem.data.isUserItem) break;
                    }
                    if (!(dblItem && dblItem.data && dblItem.data.isUserItem)) dblItem = null;
                }
            }
            if (dblItem) {
                const item = dblItem;
                if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
                    if (!MB.App.selectedItems.includes(item)) {
                        MB.App.select(item);
                    }
                    MB.App.setTool('node-edit');
                    return;
                }
            }
        }

        // Check handle hit first
        if (MB.App.selectedItems.length > 0 && transformMode !== 'move') {
            const hh = hitHandle(event.point);
            if (hh) {
                if (hh.type === 'anchor') {
                    mode = 'anchor-drag';
                    dragStart = event.point;
                    return;
                }
                if (hh.type === 'scale') {
                    mode = 'scaling';
                    activeHandle = hh;
                    MB.History.beginAction();
                    let bounds = null;
                    MB.App.selectedItems.forEach(item => {
                        bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
                    });
                    origBounds = bounds;
                    origItemStates = captureItemStates();
                    anchorPoint = getScaleAnchor(hh.index, bounds);
                    dragStart = event.point;
                    redrawHandles();
                    return;
                }
                if (hh.type === 'rotate') {
                    mode = 'rotating';
                    MB.History.beginAction();
                    let bounds = null;
                    MB.App.selectedItems.forEach(item => {
                        bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
                    });
                    origBounds = bounds;
                    // Default anchor = centroid of visible copies (or original if no symmetry)
                    if (!anchorPoint) {
                        // For items hidden by symmetry, use mirror copies' centroid
                        if (MB.Symmetry && MB.Symmetry._symmetryLayer) {
                            const copies = [];
                            MB.Symmetry._symmetryLayer.children.forEach(c => {
                                if (c.data && c.data.symmetryOriginal &&
                                    MB.App.selectedItems.includes(c.data.symmetryOriginal)) {
                                    copies.push(c);
                                }
                            });
                            if (copies.length > 0) {
                                anchorPoint = computeCentroid(copies);
                            }
                        }
                        if (!anchorPoint) {
                            anchorPoint = computeCentroid(MB.App.selectedItems) || bounds.center;
                        }
                    }
                    dragStart = event.point;
                    origItemStates = captureItemStates();
                    return;
                }
            }
        }

        // Normal selection
        const hitResult = paper.project.hitTest(event.point, {
            fill: true,
            stroke: true,
            segments: false,
            tolerance: 5 / paper.view.zoom
        });

        // Walk up parent chain to find the topmost isUserItem ancestor
        // (so clicking inside a Group selects the Group, not a child)
        let hitItem = hitResult ? hitResult.item : null;
        if (hitItem) {
            let topItem = null;
            let current = hitItem;
            while (current && current !== current.layer) {
                if (current.data && current.data.isUserItem) topItem = current;
                current = current.parent;
            }
            hitItem = topItem;
        }

        // Symmetry proxy: clicking mirror copy selects the original
        if (!hitItem && hitResult && hitResult.item) {
            let check = hitResult.item;
            while (check) {
                if (check.data && check.data.symmetryOriginal) {
                    hitItem = check.data.symmetryOriginal;
                    break;
                }
                if (check === check.layer) break;
                check = check.parent;
            }
        }

        if (hitItem) {
            const item = hitItem;

            if (event.modifiers.shift) {
                if (MB.App.selectedItems.includes(item)) {
                    MB.App.removeFromSelection(item);
                } else {
                    MB.App.addToSelection(item);
                }
            } else if (!MB.App.selectedItems.includes(item)) {
                MB.App.select(item);
            }

            mode = 'dragging';
            MB.History.beginAction();
            dragStart = event.point;
            dragItems = [...MB.App.selectedItems];
            dragOffsets = dragItems.map(it => it.position.subtract(event.point));

        } else {
            if (!event.modifiers.shift) {
                MB.App.clearSelection();
            }
            mode = 'rubber-band';
            dragStart = event.point;
            rubberBand = new paper.Path.Rectangle({
                from: event.point,
                to: event.point,
                strokeColor: '#6c8fef',
                strokeWidth: 1 / paper.view.zoom,
                dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom],
                fillColor: new paper.Color(0.42, 0.56, 0.94, 0.1)
            });
        }
    };

    tool.onMouseDrag = function(event) {
        hasDragged = true;

        if (mode === 'anchor-drag') {
            anchorPoint = MB.GridSnap.snap(event.point, event);
            redrawHandles();
            return;
        }

        if (mode === 'scaling') {
            const items = MB.App.selectedItems;
            if (items.length === 0 || !origBounds) return;

            const lockAspect = document.getElementById('lock-aspect')?.checked;

            // Compute scale factors from anchor
            const anchor = anchorPoint;
            const origDist = dragStart.subtract(anchor);
            const newDist = event.point.subtract(anchor);

            let sx = origDist.x !== 0 ? newDist.x / origDist.x : 1;
            let sy = origDist.y !== 0 ? newDist.y / origDist.y : 1;

            // Handle midpoint handles (constrain to one axis)
            const idx = activeHandle.index;
            if (idx === 1 || idx === 5) sx = 1; // top/bottom center: only Y
            if (idx === 3 || idx === 7) sy = 1; // left/right center: only X

            if (lockAspect && idx !== 1 && idx !== 5 && idx !== 3 && idx !== 7) {
                const uniform = Math.max(Math.abs(sx), Math.abs(sy));
                sx = sx < 0 ? -uniform : uniform;
                sy = sy < 0 ? -uniform : uniform;
            }

            // Restore original geometry, then manually scale each point
            items.forEach((item, i) => {
                restoreGeometry(item, origItemStates[i].geometry);
                manualScale(item, sx, sy, anchor);
            });

            document.getElementById('status-info').textContent =
                'W: ' + (origBounds.width * Math.abs(sx)).toFixed(1) +
                ' H: ' + (origBounds.height * Math.abs(sy)).toFixed(1);

            clearHandles();
            return;
        }

        if (mode === 'rotating') {
            const items = MB.App.selectedItems;
            if (items.length === 0) return;

            const anchor = anchorPoint;
            const startAngle = dragStart.subtract(anchor).angle;
            const curAngle = event.point.subtract(anchor).angle;
            let deltaAngle = curAngle - startAngle;

            // Snap to 15 degrees
            if (event.modifiers.shift || document.getElementById('rotate-snap-15')?.checked) {
                deltaAngle = Math.round(deltaAngle / 15) * 15;
            }

            // Restore original geometry, then manually rotate each point
            // Mirror (single axis) reverses rotation direction — negate to compensate
            items.forEach((item, i) => {
                restoreGeometry(item, origItemStates[i].geometry);
                let angle = deltaAngle;
                if (item.data && item.data.symmetry) {
                    const s = item.data.symmetry;
                    if (!!s.mirrorH !== !!s.mirrorV) angle = -deltaAngle;
                }
                manualRotate(item, angle, anchor);
            });

            document.getElementById('status-info').textContent = 'Angle: ' + deltaAngle.toFixed(1) + '\u00B0';
            clearHandles();
            return;
        }

        if (mode === 'dragging' && dragItems.length > 0) {
            let targetPoint = event.point;
            if (event.modifiers.shift) {
                const delta = event.point.subtract(dragStart);
                if (Math.abs(delta.x) > Math.abs(delta.y)) {
                    targetPoint = new paper.Point(event.point.x, dragStart.y);
                } else {
                    targetPoint = new paper.Point(dragStart.x, event.point.y);
                }
            }
            const snapped = MB.GridSnap.snap(targetPoint, event);
            dragItems.forEach((item, i) => {
                item.position = snapped.add(dragOffsets[i]);
            });
            MB.App.emit('selection-changed', MB.App.selectedItems);

        } else if (mode === 'rubber-band' && rubberBand) {
            rubberBand.remove();
            const isCrossing = event.point.x < dragStart.x;
            const zoom = paper.view.zoom;
            rubberBand = new paper.Path.Rectangle({
                from: dragStart,
                to: event.point,
                strokeColor: isCrossing ? '#6cef8c' : '#6c8fef',
                strokeWidth: 1 / zoom,
                dashArray: isCrossing ? [4 / zoom, 4 / zoom] : [],
                fillColor: isCrossing
                    ? new paper.Color(0.42, 0.94, 0.55, 0.1)
                    : new paper.Color(0.42, 0.56, 0.94, 0.1)
            });
        }
    };

    tool.onMouseUp = function(event) {
        if (mode === 'scaling' || mode === 'rotating') {
            if (hasDragged) {
                MB.History.commitAction();
            } else {
                MB.History.cancelAction();
            }
            anchorPoint = null;
            activeHandle = null;
            origBounds = null;
            origItemStates = [];
            redrawHandles();
            MB.App.emit('selection-changed', MB.App.selectedItems);

        } else if (mode === 'anchor-drag') {
            // anchor already moved in drag

        } else if (mode === 'dragging' && dragItems.length > 0) {
            const hasMoved = dragItems.some((item, i) => {
                const originalPos = dragStart.add(dragOffsets[i]);
                return item.position.getDistance(originalPos) > 0.01;
            });
            if (hasMoved) {
                MB.History.commitAction();
            } else {
                MB.History.cancelAction();
            }

        } else if (mode === 'rubber-band' && rubberBand) {
            const rect = new paper.Rectangle(dragStart, event.point);
            const isCrossing = event.point.x < dragStart.x;
            const layer = MB.Layers.getActiveLayer();
            if (layer) {
                const items = [];
                layer.paperLayer.children.forEach(child => {
                    if (child.data && child.data.isUserItem &&
                        (isCrossing ? rect.intersects(child.bounds) : rect.contains(child.bounds))) {
                        items.push(child);
                    }
                });
                if (items.length > 0) {
                    if (event.modifiers.shift) {
                        items.forEach(item => MB.App.addToSelection(item));
                    } else {
                        MB.App.select(items);
                    }
                }
            }
            rubberBand.remove();
            rubberBand = null;
        }

        mode = 'idle';
        dragStart = null;
        dragItems = [];
        dragOffsets = [];
        hasDragged = false;
    };

    tool.onKeyDown = function(event) {
        const items = MB.App.selectedItems;
        if (items.length === 0) return;
        const step = event.modifiers.shift ? MB.GridSnap.gridSize : 1;
        let delta = null;
        switch (event.key) {
            case 'up': delta = new paper.Point(0, -step); break;
            case 'down': delta = new paper.Point(0, step); break;
            case 'left': delta = new paper.Point(-step, 0); break;
            case 'right': delta = new paper.Point(step, 0); break;
        }
        if (delta) {
            event.preventDefault();
            MB.History.snapshot();
            items.forEach(item => item.position = item.position.add(delta));
            MB.App.emit('selection-changed', MB.App.selectedItems);
        }
    };

    MB.App.registerTool('select', {
        activate() {
            tool.activate();
            redrawHandles();
        },
        deactivate() {
            clearHandles();
            anchorPoint = null;
        }
    });
})();
