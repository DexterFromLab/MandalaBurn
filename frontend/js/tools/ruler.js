// MandalaBurn - Ruler / Measurement Tool
(function() {
    let startPoint = null;
    let endPoint = null;
    let rulerGroup = null;
    let isDragging = false;

    // Attach mode state
    let pendingAnchorA = null; // { item, segmentIndex, point }
    let snapIndicator = null;

    const tool = new paper.Tool();
    tool.name = 'ruler';

    function isAttachMode() {
        const cb = document.getElementById('ruler-attach-mode');
        return cb && cb.checked;
    }

    function clearRuler() {
        if (rulerGroup) { rulerGroup.remove(); rulerGroup = null; }
    }

    function clearSnapIndicator() {
        if (snapIndicator) { snapIndicator.remove(); snapIndicator = null; }
    }

    function showSnapDot(point, color) {
        clearSnapIndicator();
        const z = paper.view.zoom;
        snapIndicator = new paper.Path.Circle({
            center: point,
            radius: 5 / z,
            strokeColor: color || '#5cb8ff',
            strokeWidth: 1.5 / z,
            fillColor: new paper.Color(0.36, 0.72, 1.0, 0.3)
        });
        snapIndicator.data = { isRulerItem: true };
    }

    function drawRuler(from, to) {
        clearRuler();
        if (!from || !to) return;
        if (from.getDistance(to) < 0.5) return;

        const z = paper.view.zoom;
        rulerGroup = new paper.Group();

        // Main line
        rulerGroup.addChild(new paper.Path.Line({
            from: from,
            to: to,
            strokeColor: '#efcf6c',
            strokeWidth: 1.5 / z,
            dashArray: [6 / z, 3 / z]
        }));

        // End markers (small crosshairs)
        [from, to].forEach(pt => {
            const s = 5 / z;
            rulerGroup.addChild(new paper.Path.Line({
                from: pt.subtract([s, s]),
                to: pt.add([s, s]),
                strokeColor: '#efcf6c',
                strokeWidth: 1 / z
            }));
            rulerGroup.addChild(new paper.Path.Line({
                from: pt.subtract([-s, s]),
                to: pt.add([-s, s]),
                strokeColor: '#efcf6c',
                strokeWidth: 1 / z
            }));
        });

        // Distance label
        const dist = from.getDistance(to);
        const mid = from.add(to).divide(2);
        const angle = to.subtract(from).angle;
        const offset = new paper.Point(0, -12 / z).rotate(angle > 90 || angle < -90 ? angle + 180 : angle);

        const text = new paper.PointText({
            point: mid.add(offset),
            content: dist.toFixed(1) + ' mm',
            fillColor: '#efcf6c',
            fontFamily: 'Consolas, SF Mono, monospace',
            fontSize: 11 / z,
            justification: 'center'
        });
        rulerGroup.addChild(text);

        // dx/dy dimension lines
        if (Math.abs(to.x - from.x) > 2 && Math.abs(to.y - from.y) > 2) {
            const corner = new paper.Point(to.x, from.y);
            rulerGroup.addChild(new paper.Path.Line({
                from: from,
                to: corner,
                strokeColor: new paper.Color(0.94, 0.81, 0.42, 0.4),
                strokeWidth: 0.5 / z,
                dashArray: [3 / z, 3 / z]
            }));
            rulerGroup.addChild(new paper.Path.Line({
                from: corner,
                to: to,
                strokeColor: new paper.Color(0.94, 0.81, 0.42, 0.4),
                strokeWidth: 0.5 / z,
                dashArray: [3 / z, 3 / z]
            }));
        }

        rulerGroup.data = { isRulerItem: true };

        // Update panel
        updatePanel(from, to);
    }

    // Preview line for attach mode (blue, from anchorA to cursor)
    function drawAttachPreview(from, to) {
        clearRuler();
        if (!from || !to) return;
        const z = paper.view.zoom;
        rulerGroup = new paper.Group();

        rulerGroup.addChild(new paper.Path.Line({
            from: from,
            to: to,
            strokeColor: '#5cb8ff',
            strokeWidth: 1.5 / z,
            dashArray: [6 / z, 3 / z]
        }));

        // Anchor dot at start
        rulerGroup.addChild(new paper.Path.Circle({
            center: from,
            radius: 3.5 / z,
            fillColor: '#5cb8ff'
        }));

        // Distance label
        const dist = from.getDistance(to);
        const mid = from.add(to).divide(2);
        const angle = to.subtract(from).angle;
        const offset = new paper.Point(0, -12 / z).rotate(angle > 90 || angle < -90 ? angle + 180 : angle);

        rulerGroup.addChild(new paper.PointText({
            point: mid.add(offset),
            content: dist.toFixed(1) + ' mm',
            fillColor: '#5cb8ff',
            fontFamily: 'Consolas, SF Mono, monospace',
            fontSize: 11 / z,
            justification: 'center'
        }));

        rulerGroup.data = { isRulerItem: true };
        updatePanel(from, to);
    }

    function updatePanel(from, to) {
        const dist = from.getDistance(to);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const distEl = document.getElementById('ruler-distance');
        const dxEl = document.getElementById('ruler-dx');
        const dyEl = document.getElementById('ruler-dy');
        const angleEl = document.getElementById('ruler-angle');

        if (distEl) distEl.textContent = dist.toFixed(2) + ' mm';
        if (dxEl) dxEl.textContent = dx.toFixed(2);
        if (dyEl) dyEl.textContent = dy.toFixed(2);
        if (angleEl) angleEl.textContent = angle.toFixed(1) + '\u00B0';
    }

    function clearPanel() {
        ['ruler-distance', 'ruler-dx', 'ruler-dy', 'ruler-angle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '\u2014';
        });
    }

    tool.onMouseDown = function(event) {
        if (isAttachMode()) {
            // Find nearest segment point
            const snap = MB.AttachedRulers.findNearestSegmentPoint(event.point);
            if (snap) {
                pendingAnchorA = snap;
                showSnapDot(snap.point);
                startPoint = snap.point;
                isDragging = true;
            } else {
                // No point found — show status message
                pendingAnchorA = null;
                isDragging = false;
                document.getElementById('status-info').textContent =
                    'No segment point nearby — click closer to a path point';
            }
            return;
        }

        // Normal ruler mode
        startPoint = MB.GridSnap.snap(event.point, event);
        endPoint = null;
        isDragging = true;
    };

    tool.onMouseDrag = function(event) {
        if (!isDragging || !startPoint) return;

        if (isAttachMode() && pendingAnchorA) {
            // Show preview line from anchor A to cursor, highlight nearby snap points
            const snap = MB.AttachedRulers.findNearestSegmentPoint(event.point);
            const targetPoint = snap ? snap.point : event.point;
            drawAttachPreview(pendingAnchorA.point, targetPoint);
            if (snap) {
                showSnapDot(snap.point);
            } else {
                clearSnapIndicator();
            }
            return;
        }

        // Normal ruler mode
        let pt = MB.GridSnap.snap(event.point, event);
        if (event.modifiers.shift) {
            const dx = pt.x - startPoint.x;
            const dy = pt.y - startPoint.y;
            const angle = Math.atan2(dy, dx);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const dist = startPoint.getDistance(pt);
            pt = startPoint.add(new paper.Point(Math.cos(snapAngle) * dist, Math.sin(snapAngle) * dist));
        }
        endPoint = pt;
        drawRuler(startPoint, endPoint);
    };

    tool.onMouseUp = function(event) {
        isDragging = false;
        clearSnapIndicator();

        if (isAttachMode() && pendingAnchorA) {
            // Find anchor B
            const snapB = MB.AttachedRulers.findNearestSegmentPoint(event.point);
            if (snapB && (snapB.item !== pendingAnchorA.item || snapB.segmentIndex !== pendingAnchorA.segmentIndex)) {
                // Create attached ruler
                MB.AttachedRulers.createRuler(
                    { item: pendingAnchorA.item, segmentIndex: pendingAnchorA.segmentIndex },
                    { item: snapB.item, segmentIndex: snapB.segmentIndex }
                );
                clearRuler(); // Remove preview
                document.getElementById('status-info').textContent = 'Attached ruler created';
            } else {
                clearRuler();
                if (!snapB) {
                    document.getElementById('status-info').textContent =
                        'No segment point at endpoint — drag to a path point';
                }
            }
            pendingAnchorA = null;
            return;
        }

        // Normal ruler mode
        if (startPoint && endPoint && startPoint.getDistance(endPoint) > 1) {
            drawRuler(startPoint, endPoint);
        }
    };

    // Clear button
    document.addEventListener('DOMContentLoaded', () => {
        const clearBtn = document.getElementById('ruler-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                clearRuler();
                clearPanel();
                startPoint = null;
                endPoint = null;
                pendingAnchorA = null;
                clearSnapIndicator();
            });
        }
    });

    MB.App.registerTool('ruler', {
        activate() { tool.activate(); },
        deactivate() {
            isDragging = false;
            pendingAnchorA = null;
            clearSnapIndicator();
        },
        cancel() {
            clearRuler();
            clearPanel();
            startPoint = null;
            endPoint = null;
            pendingAnchorA = null;
            clearSnapIndicator();
        }
    });
})();
