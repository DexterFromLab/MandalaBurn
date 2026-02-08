// MandalaBurn - Pen Tool (Bezier curves)
(function() {
    let path = null;
    let currentSegment = null;
    let handleOut = null;
    let previewLine = null;

    const tool = new paper.Tool();
    tool.name = 'pen';

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        const point = MB.GridSnap.snap(event.point);

        if (!path) {
            // Snapshot before starting a new path
            MB.History.snapshot();

            // Start new path
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
                    finishPath();
                    return;
                }
            }
            path.add(point);
            currentSegment = path.lastSegment;
        }
    };

    tool.onMouseDrag = function(event) {
        if (!currentSegment) return;
        // Dragging creates smooth handles
        const point = MB.GridSnap.snap(event.point);
        const delta = point.subtract(currentSegment.point);
        currentSegment.handleOut = delta;
        currentSegment.handleIn = delta.negate();
    };

    tool.onMouseMove = function(event) {
        if (!path || path.segments.length === 0) return;
        // Preview line from last point to cursor
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
    }

    MB.App.registerTool('pen', {
        activate() { tool.activate(); },
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
                }
            }
        }
    });
})();
