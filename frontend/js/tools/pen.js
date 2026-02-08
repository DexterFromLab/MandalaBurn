// MandalaBurn - Pen Tool (Bezier curves)
(function() {
    let path = null;
    let currentSegment = null;
    let previewLine = null;
    let closeIndicator = null;

    const tool = new paper.Tool();
    tool.name = 'pen';

    function isSmooth() {
        const cb = document.getElementById('pen-smooth');
        return cb && cb.checked;
    }

    function constrainAngle(from, to) {
        const delta = to.subtract(from);
        const angle = Math.atan2(delta.y, delta.x);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = delta.length;
        return from.add(new paper.Point(
            Math.cos(snapAngle) * dist,
            Math.sin(snapAngle) * dist
        ));
    }

    function updatePenInfo() {
        const countEl = document.getElementById('pen-seg-count');
        const lenEl = document.getElementById('pen-length');
        if (!countEl || !lenEl) return;
        if (path && path.segments) {
            countEl.textContent = 'Pts: ' + path.segments.length;
            lenEl.textContent = 'Len: ' + path.length.toFixed(1);
        } else {
            countEl.textContent = 'Pts: 0';
            lenEl.textContent = 'Len: 0';
        }
    }

    function clearCloseIndicator() {
        if (closeIndicator) { closeIndicator.remove(); closeIndicator = null; }
    }

    function drawCloseIndicator(firstPt) {
        clearCloseIndicator();
        const z = paper.view.zoom;
        closeIndicator = new paper.Path.Circle({
            center: firstPt,
            radius: 6 / z,
            strokeColor: '#6cef8c',
            strokeWidth: 1.5 / z,
            fillColor: new paper.Color(0.42, 0.94, 0.55, 0.15)
        });
    }

    function isNearFirstPoint(point) {
        if (!path || path.segments.length < 2) return false;
        return point.getDistance(path.firstSegment.point) < 8 / paper.view.zoom;
    }

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        let point = MB.GridSnap.snap(event.point, event);
        if (event.modifiers.shift && path && path.segments.length > 0) {
            point = constrainAngle(path.lastSegment.point, point);
        }

        if (!path) {
            MB.History.snapshot();

            layer.paperLayer.activate();
            path = new paper.Path({
                strokeColor: layer.color,
                strokeWidth: 0.5,
                fillColor: null
            });
            path.data = { isUserItem: true };
            path.add(point);
            currentSegment = path.lastSegment;
        } else {
            // Check if clicking on first point to close
            if (path.segments.length > 1) {
                const firstPt = path.firstSegment.point;
                if (point.getDistance(firstPt) < 8 / paper.view.zoom) {
                    path.closePath();
                    if (isSmooth()) path.smooth({ type: 'continuous' });
                    finishPath();
                    return;
                }
            }
            path.add(point);
            currentSegment = path.lastSegment;

            // Auto-smooth previous segments if smooth mode
            if (isSmooth() && path.segments.length > 2) {
                const prev = path.segments[path.segments.length - 2];
                prev.smooth({ type: 'continuous' });
            }
        }
        updatePenInfo();
    };

    tool.onMouseDrag = function(event) {
        if (!currentSegment) return;
        let point = MB.GridSnap.snap(event.point, event);
        if (event.modifiers.shift) {
            point = constrainAngle(currentSegment.point, point);
        }
        const delta = point.subtract(currentSegment.point);

        if (event.modifiers.alt) {
            // Alt = break symmetry, only set handleOut (cusp)
            currentSegment.handleOut = delta;
            if (!currentSegment.data) currentSegment.data = {};
            currentSegment.data.nodeType = 'cusp';
        } else {
            currentSegment.handleOut = delta;
            currentSegment.handleIn = delta.negate();
        }
        updatePenInfo();
    };

    tool.onMouseMove = function(event) {
        if (!path || path.segments.length === 0) return;

        // Remove old preview
        if (previewLine) previewLine.remove();
        clearCloseIndicator();

        const lastSeg = path.lastSegment;
        let target = event.point;
        if (event.modifiers.shift) {
            target = constrainAngle(lastSeg.point, target);
        }

        // Close indicator when near first point
        if (isNearFirstPoint(target) && path.segments.length > 1) {
            drawCloseIndicator(path.firstSegment.point);
            target = path.firstSegment.point;
        }

        // Draw bezier preview if last segment has handleOut, otherwise straight line
        if (lastSeg.handleOut && lastSeg.handleOut.length > 0.1) {
            previewLine = new paper.Path({
                segments: [
                    new paper.Segment(lastSeg.point, null, lastSeg.handleOut),
                    new paper.Segment(target)
                ],
                strokeColor: MB.Layers.getActiveColor(),
                strokeWidth: 0.5 / paper.view.zoom,
                dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom]
            });
        } else {
            previewLine = new paper.Path.Line({
                from: lastSeg.point,
                to: target,
                strokeColor: MB.Layers.getActiveColor(),
                strokeWidth: 0.5 / paper.view.zoom,
                dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom]
            });
        }
    };

    function finishPath() {
        if (previewLine) { previewLine.remove(); previewLine = null; }
        clearCloseIndicator();

        if (!path || path.segments.length < 2) {
            if (path) path.remove();
        }

        path = null;
        currentSegment = null;
        updatePenInfo();
    }

    // Close path button
    document.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('pen-close-path');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (path && path.segments.length >= 2) {
                    path.closePath();
                    if (isSmooth()) path.smooth({ type: 'continuous' });
                    finishPath();
                }
            });
        }
    });

    MB.App.registerTool('pen', {
        activate() {
            tool.activate();
            updatePenInfo();
        },
        deactivate() {
            finishPath();
        },
        cancel() {
            if (previewLine) { previewLine.remove(); previewLine = null; }
            clearCloseIndicator();
            if (path) {
                if (path.segments.length >= 2) {
                    finishPath();
                } else {
                    path.remove();
                    path = null;
                    currentSegment = null;
                    updatePenInfo();
                }
            }
        }
    });
})();
