// MandalaBurn - Select Tool
(function() {
    let dragStart = null;
    let dragItems = [];
    let dragOffsets = [];
    let rubberBand = null;
    let mode = 'idle'; // idle, dragging, rubber-band

    const tool = new paper.Tool();
    tool.name = 'select';

    tool.onMouseDown = function(event) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        const hitResult = paper.project.hitTest(event.point, {
            fill: true,
            stroke: true,
            segments: false,
            tolerance: 5 / paper.view.zoom
        });

        if (hitResult && hitResult.item && hitResult.item.data && hitResult.item.data.isUserItem) {
            const item = hitResult.item;

            if (event.modifiers.shift) {
                // Toggle selection
                if (MB.App.selectedItems.includes(item)) {
                    MB.App.removeFromSelection(item);
                } else {
                    MB.App.addToSelection(item);
                }
            } else if (!MB.App.selectedItems.includes(item)) {
                MB.App.select(item);
            }

            // Start drag - capture state tentatively
            mode = 'dragging';
            MB.History.beginAction();
            dragStart = event.point;
            dragItems = [...MB.App.selectedItems];
            dragOffsets = dragItems.map(item => item.position.subtract(event.point));

        } else {
            // Click on empty space
            if (!event.modifiers.shift) {
                MB.App.clearSelection();
            }
            // Start rubber-band selection
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
        if (mode === 'dragging' && dragItems.length > 0) {
            let targetPoint = event.point;
            if (event.modifiers.shift) {
                // Constrain to axis
                const delta = event.point.subtract(dragStart);
                if (Math.abs(delta.x) > Math.abs(delta.y)) {
                    targetPoint = new paper.Point(event.point.x, dragStart.y);
                } else {
                    targetPoint = new paper.Point(dragStart.x, event.point.y);
                }
            }
            const snapped = MB.GridSnap.snap(targetPoint);
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
        if (mode === 'dragging' && dragItems.length > 0) {
            // Check if items actually moved
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
            // Window (left→right): fully contain; Crossing (right→left): intersect
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
    };

    tool.onKeyDown = function(event) {
        // Arrow keys for nudge
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
        activate() { tool.activate(); },
        deactivate() {}
    });
})();
