// MandalaBurn - Pen Tool (Bezier curves)
(function() {
    let path = null;
    let currentSegment = null;
    let handleOut = null;
    let previewLine = null;

    const tool = new paper.Tool();
    tool.name = 'pen';

    function isSmooth() {
        const cb = document.getElementById('pen-smooth');
        return cb && cb.checked;
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

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        const point = MB.GridSnap.snap(event.point, event);

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
        const point = MB.GridSnap.snap(event.point, event);
        const delta = point.subtract(currentSegment.point);
        currentSegment.handleOut = delta;
        currentSegment.handleIn = delta.negate();
        updatePenInfo();
    };

    tool.onMouseMove = function(event) {
        if (!path || path.segments.length === 0) return;
        if (previewLine) previewLine.remove();
        const lastPt = path.lastSegment.point;
        previewLine = new paper.Path.Line({
            from: lastPt,
            to: event.point,
            strokeColor: MB.Layers.getActiveColor(),
            strokeWidth: 0.5 / paper.view.zoom,
            dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom]
        });
    };

    function finishPath() {
        if (previewLine) { previewLine.remove(); previewLine = null; }

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
