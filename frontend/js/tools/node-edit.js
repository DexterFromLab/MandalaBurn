// MandalaBurn - Node Edit Tool
(function() {
    let selectedPath = null;
    let selectedSegment = null;
    let selectedHandle = null; // 'handleIn' or 'handleOut'
    let dragStart = null;
    let hasDragged = false;
    let nodeMarkers = [];

    const tool = new paper.Tool();
    tool.name = 'node-edit';

    const NODE_RADIUS = 4;
    const HANDLE_RADIUS = 3;

    function clearMarkers() {
        nodeMarkers.forEach(m => m.remove());
        nodeMarkers = [];
    }

    function drawNodes(path) {
        clearMarkers();
        if (!path || !path.segments) return;

        path.segments.forEach((seg, idx) => {
            // Draw handles first (below nodes)
            if (seg.handleIn && seg.handleIn.length > 0.01) {
                const handlePt = seg.point.add(seg.handleIn);
                const handleLine = new paper.Path.Line({
                    from: seg.point,
                    to: handlePt,
                    strokeColor: '#6c8fef',
                    strokeWidth: 1 / paper.view.zoom
                });
                handleLine.data = { isNodeMarker: true };
                nodeMarkers.push(handleLine);

                const handleDot = new paper.Path.Circle({
                    center: handlePt,
                    radius: HANDLE_RADIUS / paper.view.zoom,
                    fillColor: '#6c8fef',
                    strokeColor: '#ffffff',
                    strokeWidth: 0.5 / paper.view.zoom
                });
                handleDot.data = { isNodeMarker: true, segmentIndex: idx, handleType: 'handleIn' };
                nodeMarkers.push(handleDot);
            }

            if (seg.handleOut && seg.handleOut.length > 0.01) {
                const handlePt = seg.point.add(seg.handleOut);
                const handleLine = new paper.Path.Line({
                    from: seg.point,
                    to: handlePt,
                    strokeColor: '#6c8fef',
                    strokeWidth: 1 / paper.view.zoom
                });
                handleLine.data = { isNodeMarker: true };
                nodeMarkers.push(handleLine);

                const handleDot = new paper.Path.Circle({
                    center: handlePt,
                    radius: HANDLE_RADIUS / paper.view.zoom,
                    fillColor: '#6c8fef',
                    strokeColor: '#ffffff',
                    strokeWidth: 0.5 / paper.view.zoom
                });
                handleDot.data = { isNodeMarker: true, segmentIndex: idx, handleType: 'handleOut' };
                nodeMarkers.push(handleDot);
            }

            // Node point
            const isSelected = selectedSegment === seg;
            const node = new paper.Path.Rectangle({
                center: seg.point,
                size: [(NODE_RADIUS * 2) / paper.view.zoom, (NODE_RADIUS * 2) / paper.view.zoom],
                fillColor: isSelected ? '#ffffff' : '#6c8fef',
                strokeColor: '#ffffff',
                strokeWidth: 0.5 / paper.view.zoom
            });
            node.data = { isNodeMarker: true, segmentIndex: idx, isNode: true };
            nodeMarkers.push(node);
        });
    }

    tool.onMouseDown = function(event) {
        const tolerance = 8 / paper.view.zoom;
        hasDragged = false;

        // Check if clicking on a handle
        const handleHit = nodeMarkers.find(m =>
            m.data && m.data.handleType && m.contains(event.point)
        );
        if (handleHit && selectedPath) {
            selectedSegment = selectedPath.segments[handleHit.data.segmentIndex];
            selectedHandle = handleHit.data.handleType;
            dragStart = event.point;
            MB.History.beginAction();
            return;
        }

        // Check if clicking on a node
        const nodeHit = nodeMarkers.find(m =>
            m.data && m.data.isNode && m.contains(event.point)
        );
        if (nodeHit && selectedPath) {
            selectedSegment = selectedPath.segments[nodeHit.data.segmentIndex];
            selectedHandle = null;
            dragStart = event.point;
            MB.History.beginAction();
            drawNodes(selectedPath);
            return;
        }

        // Check if clicking on a path
        const hitResult = paper.project.hitTest(event.point, {
            stroke: true,
            fill: false,
            tolerance: tolerance
        });

        if (hitResult && hitResult.item && hitResult.item.data && hitResult.item.data.isUserItem) {
            selectedPath = hitResult.item;
            selectedSegment = null;
            selectedHandle = null;
            MB.App.select(selectedPath);
            drawNodes(selectedPath);
        } else {
            selectedPath = null;
            selectedSegment = null;
            selectedHandle = null;
            clearMarkers();
            MB.App.clearSelection();
        }
    };

    tool.onMouseDrag = function(event) {
        if (!selectedPath || !dragStart) return;

        hasDragged = true;
        const point = MB.GridSnap.snap(event.point);

        if (selectedHandle && selectedSegment) {
            // Drag handle
            const delta = point.subtract(selectedSegment.point);
            selectedSegment[selectedHandle] = delta;
            drawNodes(selectedPath);
        } else if (selectedSegment) {
            // Drag node
            selectedSegment.point = point;
            drawNodes(selectedPath);
        }
    };

    tool.onMouseUp = function(event) {
        if (hasDragged && dragStart) {
            MB.History.commitAction();
        } else {
            MB.History.cancelAction();
        }
        dragStart = null;
        hasDragged = false;
        if (selectedPath) drawNodes(selectedPath);
    };

    tool.onKeyDown = function(event) {
        if (!selectedPath) return;

        if (event.key === 'delete' || event.key === 'backspace') {
            // Delete selected node
            if (selectedSegment && selectedPath.segments.length > 2) {
                MB.History.snapshot();
                selectedSegment.remove();
                selectedSegment = null;
                drawNodes(selectedPath);
            }
        }
    };

    // Double-click to add node
    tool.onMouseDown = (function(originalHandler) {
        let lastClickTime = 0;
        let lastClickPoint = null;

        return function(event) {
            const now = Date.now();
            const isDoubleClick = (now - lastClickTime < 400) &&
                lastClickPoint && event.point.getDistance(lastClickPoint) < 5 / paper.view.zoom;

            if (isDoubleClick && selectedPath) {
                // Add a node at the nearest point on the path
                const nearest = selectedPath.getNearestLocation(event.point);
                if (nearest) {
                    MB.History.snapshot();
                    const newSeg = selectedPath.divideAt(nearest);
                    if (newSeg) {
                        selectedSegment = newSeg;
                        drawNodes(selectedPath);
                    }
                }
                lastClickTime = 0;
                return;
            }

            lastClickTime = now;
            lastClickPoint = event.point;
            originalHandler.call(this, event);
        };
    })(tool.onMouseDown);

    MB.App.registerTool('node-edit', {
        activate() { tool.activate(); },
        deactivate() {
            clearMarkers();
            selectedPath = null;
            selectedSegment = null;
        },
        cancel() {
            clearMarkers();
            selectedPath = null;
            selectedSegment = null;
        }
    });
})();
