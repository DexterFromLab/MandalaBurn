// MandalaBurn - Rectangle Tool
(function() {
    let startPoint = null;
    let preview = null;
    const tool = new paper.Tool();
    tool.name = 'rect';

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;
        startPoint = MB.GridSnap.snap(event.point, event);
    };

    tool.onMouseDrag = function(event) {
        if (!startPoint) return;
        if (preview) preview.remove();

        let endPoint = MB.GridSnap.snap(event.point, event);

        // Shift = square
        if (event.modifiers.shift) {
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            endPoint = new paper.Point(
                startPoint.x + Math.sign(dx) * size,
                startPoint.y + Math.sign(dy) * size
            );
        }

        preview = new paper.Path.Rectangle({
            from: startPoint,
            to: endPoint,
            strokeColor: MB.Layers.getActiveColor(),
            strokeWidth: 1 / paper.view.zoom,
            dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom]
        });
    };

    tool.onMouseUp = function(event) {
        if (!startPoint) return;
        if (preview) { preview.remove(); preview = null; }

        let endPoint = MB.GridSnap.snap(event.point, event);

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

        // Don't create tiny rects
        if (Math.abs(from.x - endPoint.x) < 0.5 || Math.abs(from.y - endPoint.y) < 0.5) return;

        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        MB.History.snapshot();

        layer.paperLayer.activate();
        const rect = new paper.Path.Rectangle({
            from: from,
            to: endPoint,
            strokeColor: layer.color,
            strokeWidth: 0.5,
            fillColor: null
        });
        rect.data = { isUserItem: true };
    };

    MB.App.registerTool('rect', {
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
