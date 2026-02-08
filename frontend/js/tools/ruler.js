// MandalaBurn - Ruler / Measurement Tool
(function() {
    let startPoint = null;
    let endPoint = null;
    let rulerGroup = null;
    let isDragging = false;

    const tool = new paper.Tool();
    tool.name = 'ruler';

    function clearRuler() {
        if (rulerGroup) { rulerGroup.remove(); rulerGroup = null; }
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
        startPoint = MB.GridSnap.snap(event.point, event);
        endPoint = null;
        isDragging = true;
    };

    tool.onMouseDrag = function(event) {
        if (!isDragging || !startPoint) return;
        let pt = MB.GridSnap.snap(event.point, event);
        if (event.modifiers.shift) {
            // Constrain to 45-degree angles
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
            });
        }
    });

    MB.App.registerTool('ruler', {
        activate() { tool.activate(); },
        deactivate() {
            // Keep ruler visible when switching tools
            isDragging = false;
        },
        cancel() {
            clearRuler();
            clearPanel();
            startPoint = null;
            endPoint = null;
        }
    });
})();
