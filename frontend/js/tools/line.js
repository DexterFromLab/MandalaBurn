// MandalaBurn - Line Tool
(function() {
    let startPoint = null;
    let preview = null;
    const tool = new paper.Tool();
    tool.name = 'line';

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        const point = MB.GridSnap.snap(event.point, event);
        if (!startPoint) {
            startPoint = point;
        }
    };

    tool.onMouseMove = function(event) {
        if (startPoint) {
            if (preview) preview.remove();
            let endPoint = MB.GridSnap.snap(event.point, event);

            // Shift = constrain to 45 degree angles
            if (event.modifiers.shift) {
                endPoint = constrainAngle(startPoint, endPoint);
            }

            preview = new paper.Path.Line({
                from: startPoint,
                to: endPoint,
                strokeColor: MB.Layers.getActiveColor(),
                strokeWidth: 1 / paper.view.zoom,
                dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom]
            });
        }
    };

    tool.onMouseUp = function(event) {
        if (!startPoint) return;
        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        let endPoint = MB.GridSnap.snap(event.point, event);
        if (event.modifiers.shift) {
            endPoint = constrainAngle(startPoint, endPoint);
        }

        if (preview) preview.remove();
        preview = null;

        // Don't create zero-length lines
        if (startPoint.getDistance(endPoint) < 0.1) {
            startPoint = null;
            return;
        }

        const from = startPoint;
        startPoint = null;

        MB.History.snapshot();

        layer.paperLayer.activate();
        const line = new paper.Path.Line({
            from: from,
            to: endPoint,
            strokeColor: layer.color,
            strokeWidth: 0.5,
            strokeCap: 'round'
        });
        line.data = { isUserItem: true };
    };

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

    MB.App.registerTool('line', {
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
