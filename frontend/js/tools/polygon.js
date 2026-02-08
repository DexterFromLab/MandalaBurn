// MandalaBurn - Polygon/Star Tool
(function() {
    let center = null;
    let preview = null;
    const tool = new paper.Tool();
    tool.name = 'polygon';

    function getSides() {
        return parseInt(document.getElementById('polygon-sides').value) || 5;
    }

    function isStar() {
        return document.getElementById('polygon-star').checked;
    }

    function getInnerRatio() {
        return parseFloat(document.getElementById('star-inner-ratio').value) || 0.5;
    }

    // Wire up star checkbox to show/hide ratio
    document.getElementById('polygon-star').addEventListener('change', (e) => {
        document.getElementById('star-ratio-label').classList.toggle('hidden', !e.target.checked);
    });

    function createPolygon(center, radius, sides, star, innerRatio) {
        const path = new paper.Path();
        const angleStep = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2; // Start from top

        if (star) {
            const innerRadius = radius * innerRatio;
            for (let i = 0; i < sides; i++) {
                const outerAngle = startAngle + i * angleStep;
                const innerAngle = outerAngle + angleStep / 2;
                path.add(new paper.Point(
                    center.x + Math.cos(outerAngle) * radius,
                    center.y + Math.sin(outerAngle) * radius
                ));
                path.add(new paper.Point(
                    center.x + Math.cos(innerAngle) * innerRadius,
                    center.y + Math.sin(innerAngle) * innerRadius
                ));
            }
        } else {
            for (let i = 0; i < sides; i++) {
                const angle = startAngle + i * angleStep;
                path.add(new paper.Point(
                    center.x + Math.cos(angle) * radius,
                    center.y + Math.sin(angle) * radius
                ));
            }
        }
        path.closePath();
        return path;
    }

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;
        center = MB.GridSnap.snap(event.point, event);
    };

    tool.onMouseDrag = function(event) {
        if (!center) return;
        if (preview) preview.remove();

        const radius = center.getDistance(event.point);
        if (radius < 1) return;

        preview = createPolygon(center, radius, getSides(), isStar(), getInnerRatio());
        preview.strokeColor = MB.Layers.getActiveColor();
        preview.strokeWidth = 1 / paper.view.zoom;
        preview.dashArray = [4 / paper.view.zoom, 4 / paper.view.zoom];
    };

    tool.onMouseUp = function(event) {
        if (!center) return;
        if (preview) { preview.remove(); preview = null; }

        const radius = center.getDistance(event.point);
        const c = center;
        center = null;

        if (radius < 1) return;

        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        const sides = getSides();
        const star = isStar();
        const ratio = getInnerRatio();

        MB.History.snapshot();

        layer.paperLayer.activate();
        const poly = createPolygon(c, radius, sides, star, ratio);
        poly.strokeColor = layer.color;
        poly.strokeWidth = 0.5;
        poly.fillColor = null;
        poly.data = {
            isUserItem: true,
            shapeType: 'polygon',
            shapeParams: { sides: sides, isStar: star, innerRatio: ratio, radius: radius }
        };
    };

    // Register parametric builder (builds centered at origin)
    MB.Parametric.registerBuilder('polygon', function(params) {
        return createPolygon(
            new paper.Point(0, 0),
            params.radius, params.sides, params.isStar, params.innerRatio
        );
    });

    MB.App.registerTool('polygon', {
        activate() { tool.activate(); },
        deactivate() {
            if (preview) { preview.remove(); preview = null; }
            center = null;
        },
        cancel() {
            if (preview) { preview.remove(); preview = null; }
            center = null;
        }
    });
})();
