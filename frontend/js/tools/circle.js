// MandalaBurn - Circle/Ellipse Tool
(function() {
    let startPoint = null;
    let preview = null;
    const tool = new paper.Tool();
    tool.name = 'circle';

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;
        startPoint = MB.GridSnap.snap(event.point);
    };

    tool.onMouseDrag = function(event) {
        if (!startPoint) return;
        if (preview) preview.remove();

        let endPoint = MB.GridSnap.snap(event.point);

        // Shift = circle (square bounding box)
        if (event.modifiers.shift) {
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            endPoint = new paper.Point(
                startPoint.x + Math.sign(dx) * size,
                startPoint.y + Math.sign(dy) * size
            );
        }

        const rect = new paper.Rectangle(startPoint, endPoint);
        preview = new paper.Path.Ellipse({
            rectangle: rect,
            strokeColor: MB.Layers.getActiveColor(),
            strokeWidth: 1 / paper.view.zoom,
            dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom]
        });
    };

    tool.onMouseUp = function(event) {
        if (!startPoint) return;
        if (preview) { preview.remove(); preview = null; }

        let endPoint = MB.GridSnap.snap(event.point);

        if (event.modifiers.shift) {
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            endPoint = new paper.Point(
                startPoint.x + Math.sign(dx) * size,
                startPoint.y + Math.sign(dy) * size
            );
        }

        const from = startPoint;
        startPoint = null;

        if (Math.abs(from.x - endPoint.x) < 0.5 || Math.abs(from.y - endPoint.y) < 0.5) return;

        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        MB.History.snapshot();

        layer.paperLayer.activate();
        const rect = new paper.Rectangle(from, endPoint);
        const ellipse = new paper.Path.Ellipse({
            rectangle: rect,
            strokeColor: layer.color,
            strokeWidth: 0.5,
            fillColor: null
        });
        ellipse.data = { isUserItem: true };
    };

    MB.App.registerTool('circle', {
        activate() { tool.activate(); },
        deactivate() {
            if (preview) { preview.remove(); preview = null; }
            startPoint = null;
        },
        cancel() {
            if (preview) { preview.remove(); preview = null; }
            startPoint = null;
        }
    });
})();
