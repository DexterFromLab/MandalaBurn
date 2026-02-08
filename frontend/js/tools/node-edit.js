// MandalaBurn - Node Edit Tool (multi-select, node types, path ops)
(function() {
    let selectedPath = null;
    let selectedSegments = new Set();
    let selectedHandle = null; // 'handleIn' or 'handleOut'
    let activeHandleSeg = null;
    let dragStart = null;
    let lastDragPoint = null;
    let hasDragged = false;
    let nodeMarkers = [];
    let directionMarker = null;
    let rubberBand = null;
    let rubberStart = null;

    // Double-click detection
    let lastClickTime = 0;
    let lastClickPoint = null;

    const tool = new paper.Tool();
    tool.name = 'node-edit';

    const NODE_RADIUS = 4;
    const HANDLE_RADIUS = 3;

    // ---- Node type helpers ----

    function inferNodeType(seg) {
        if (seg.data && seg.data.nodeType) return seg.data.nodeType;
        const hIn = seg.handleIn ? seg.handleIn.length : 0;
        const hOut = seg.handleOut ? seg.handleOut.length : 0;
        if (hIn < 0.1 && hOut < 0.1) return 'corner';
        if (hIn > 0.1 && hOut > 0.1) {
            const dot = seg.handleIn.normalize().dot(seg.handleOut.normalize());
            if (dot < -0.99 && Math.abs(hIn - hOut) < 0.5) return 'smooth';
        }
        return 'cusp';
    }

    function setNodeType(seg, type) {
        if (!seg.data) seg.data = {};
        seg.data.nodeType = type;
        switch (type) {
            case 'corner': seg.clearHandles(); break;
            case 'smooth': seg.smooth({ type: 'continuous' }); break;
            case 'cusp': break;
        }
    }

    function cycleNodeType(seg) {
        const current = inferNodeType(seg);
        const next = current === 'corner' ? 'smooth' : current === 'smooth' ? 'cusp' : 'corner';
        setNodeType(seg, next);
        return next;
    }

    function initSegmentTypes(path) {
        if (!path || !path.segments) return;
        path.segments.forEach(seg => {
            if (!seg.data) seg.data = {};
            if (!seg.data.nodeType) seg.data.nodeType = inferNodeType(seg);
        });
    }

    // ---- Marker Drawing ----

    function clearMarkers() {
        nodeMarkers.forEach(m => m.remove());
        nodeMarkers = [];
        if (directionMarker) { directionMarker.remove(); directionMarker = null; }
    }

    function drawNodes(path) {
        clearMarkers();
        if (!path || !path.segments) return;

        const z = paper.view.zoom;
        const nr = NODE_RADIUS / z;
        const hr = HANDLE_RADIUS / z;

        path.segments.forEach((seg, idx) => {
            const type = inferNodeType(seg);
            const isSelected = selectedSegments.has(seg);

            // Draw handles
            ['handleIn', 'handleOut'].forEach(hType => {
                const h = seg[hType];
                if (!h || h.length < 0.01) return;
                const handlePt = seg.point.add(h);

                const stem = new paper.Path.Line({
                    from: seg.point, to: handlePt,
                    strokeColor: '#6c8fef', strokeWidth: 1 / z
                });
                stem.data = { isNodeMarker: true };
                nodeMarkers.push(stem);

                const isActive = activeHandleSeg === seg && selectedHandle === hType;
                const dot = new paper.Path.Circle({
                    center: handlePt,
                    radius: isActive ? hr * 1.4 : hr,
                    fillColor: isActive ? '#ffffff' : '#6c8fef',
                    strokeColor: isActive ? '#6c8fef' : '#ffffff',
                    strokeWidth: 0.5 / z
                });
                dot.data = { isNodeMarker: true, segmentIndex: idx, handleType: hType };
                nodeMarkers.push(dot);
            });

            // Node marker — shape depends on type
            let node;
            const fillColor = isSelected ? '#ffffff' : '#6c8fef';
            const strokeColor = isSelected ? '#6c8fef' : '#ffffff';

            if (type === 'corner') {
                node = new paper.Path.Rectangle({
                    center: seg.point, size: [nr * 2, nr * 2],
                    fillColor, strokeColor, strokeWidth: 0.5 / z
                });
                node.rotate(45);
            } else if (type === 'smooth') {
                node = new paper.Path.Circle({
                    center: seg.point, radius: nr,
                    fillColor, strokeColor, strokeWidth: 0.5 / z
                });
            } else {
                node = new paper.Path.Rectangle({
                    center: seg.point, size: [nr * 2, nr * 2],
                    fillColor, strokeColor, strokeWidth: 0.5 / z
                });
            }
            node.data = { isNodeMarker: true, segmentIndex: idx, isNode: true };
            nodeMarkers.push(node);
        });

        drawDirectionArrow(path);
        updateInfo();
        updateButtons();
    }

    function drawDirectionArrow(path) {
        if (directionMarker) { directionMarker.remove(); directionMarker = null; }
        if (!path || path.segments.length < 2) return;

        const z = paper.view.zoom;
        const first = path.firstSegment.point;
        let dir;
        if (path.firstSegment.handleOut && path.firstSegment.handleOut.length > 0.1) {
            dir = path.firstSegment.handleOut.normalize();
        } else {
            dir = path.segments[1].point.subtract(first).normalize();
        }

        const arrowLen = 10 / z;
        const arrowW = 4 / z;
        const tip = first.add(dir.multiply(arrowLen));
        const perp = dir.rotate(90).multiply(arrowW);

        directionMarker = new paper.Path({
            segments: [first.add(perp), tip, first.subtract(perp)],
            closed: true, fillColor: '#6cef8c', opacity: 0.7
        });
        directionMarker.data = { isNodeMarker: true };
        nodeMarkers.push(directionMarker);
    }

    // ---- Hit testing ----

    function hitNode(point) {
        const tolerance = 8 / paper.view.zoom;
        for (let i = nodeMarkers.length - 1; i >= 0; i--) {
            const m = nodeMarkers[i];
            if (m.data && m.data.isNode && selectedPath &&
                point.getDistance(selectedPath.segments[m.data.segmentIndex].point) < tolerance) {
                return m.data.segmentIndex;
            }
        }
        return -1;
    }

    function hitHandle(point) {
        const tolerance = 8 / paper.view.zoom;
        for (let i = nodeMarkers.length - 1; i >= 0; i--) {
            const m = nodeMarkers[i];
            if (m.data && m.data.handleType && selectedPath) {
                const seg = selectedPath.segments[m.data.segmentIndex];
                const handlePt = seg.point.add(seg[m.data.handleType]);
                if (point.getDistance(handlePt) < tolerance) {
                    return { segmentIndex: m.data.segmentIndex, handleType: m.data.handleType };
                }
            }
        }
        return null;
    }

    // ---- Info & button state ----

    function updateInfo() {
        const countEl = document.getElementById('ne-seg-count');
        const lenEl = document.getElementById('ne-path-len');
        if (!countEl || !lenEl) return;
        if (selectedPath && selectedPath.segments) {
            countEl.textContent = 'Nodes: ' + selectedPath.segments.length;
            lenEl.textContent = 'Len: ' + selectedPath.length.toFixed(1);
        } else {
            countEl.textContent = 'Nodes: 0';
            lenEl.textContent = 'Len: 0';
        }
    }

    function updateButtons() {
        const hasPath = !!selectedPath;
        const hasNodes = selectedSegments.size > 0;
        const isClosed = hasPath && selectedPath.closed;
        const isOpen = hasPath && !selectedPath.closed;

        // Middle node selected? (not first/last on open path)
        let hasMiddle = false;
        if (isOpen && hasNodes) {
            for (const seg of selectedSegments) {
                const idx = selectedPath.segments.indexOf(seg);
                if (idx > 0 && idx < selectedPath.segments.length - 1) {
                    hasMiddle = true;
                    break;
                }
            }
        }

        const set = (id, enabled) => {
            const el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        };

        set('ne-corner', hasNodes);
        set('ne-smooth', hasNodes);
        set('ne-cusp', hasNodes);
        set('ne-add', hasPath);
        set('ne-del', hasNodes && selectedPath && selectedPath.segments.length > 2);
        set('ne-close', isOpen);
        set('ne-open', isClosed);
        set('ne-break', hasMiddle);
        set('ne-reverse', hasPath);
        set('ne-simplify', hasPath);
        set('ne-flatten', hasPath);
    }

    // ---- Tool Handlers ----

    tool.onMouseDown = function(event) {
        hasDragged = false;

        // Double-click detection
        const now = Date.now();
        const isDoubleClick = (now - lastClickTime < 400) &&
            lastClickPoint && event.point.getDistance(lastClickPoint) < 5 / paper.view.zoom;

        if (isDoubleClick && selectedPath) {
            // Double-click on node = cycle type
            const nodeIdx = hitNode(event.point);
            if (nodeIdx >= 0) {
                const seg = selectedPath.segments[nodeIdx];
                MB.History.snapshot();
                const newType = cycleNodeType(seg);
                drawNodes(selectedPath);
                document.getElementById('status-info').textContent = 'Node: ' + newType;
                lastClickTime = 0;
                return;
            }
            lastClickTime = 0;
            return;
        }

        lastClickTime = now;
        lastClickPoint = event.point.clone();

        // Check if clicking on a handle
        if (selectedPath) {
            const hh = hitHandle(event.point);
            if (hh) {
                const seg = selectedPath.segments[hh.segmentIndex];
                selectedSegments.clear();
                selectedSegments.add(seg);
                selectedHandle = hh.handleType;
                activeHandleSeg = seg;
                dragStart = event.point;
                lastDragPoint = event.point;
                MB.History.beginAction();
                drawNodes(selectedPath);
                return;
            }
        }

        // Check if clicking on a node
        if (selectedPath) {
            const nodeIdx = hitNode(event.point);
            if (nodeIdx >= 0) {
                const seg = selectedPath.segments[nodeIdx];
                if (event.modifiers.shift) {
                    if (selectedSegments.has(seg)) {
                        selectedSegments.delete(seg);
                    } else {
                        selectedSegments.add(seg);
                    }
                } else if (!selectedSegments.has(seg)) {
                    selectedSegments.clear();
                    selectedSegments.add(seg);
                }
                selectedHandle = null;
                activeHandleSeg = null;
                dragStart = event.point;
                lastDragPoint = event.point;
                MB.History.beginAction();
                drawNodes(selectedPath);
                return;
            }
        }

        // Check if clicking on a path stroke
        const tolerance = 5 / paper.view.zoom;
        const hitResult = paper.project.hitTest(event.point, {
            stroke: true, fill: false, tolerance: tolerance
        });

        if (hitResult && hitResult.item && hitResult.item.data && hitResult.item.data.isUserItem) {
            if (hitResult.item === selectedPath) {
                // Click on already-selected path = add node at this point
                const nearest = selectedPath.getNearestLocation(event.point);
                if (nearest) {
                    MB.History.snapshot();
                    const newSeg = selectedPath.divideAt(nearest);
                    if (newSeg) {
                        if (!newSeg.data) newSeg.data = {};
                        newSeg.data.nodeType = inferNodeType(newSeg);
                        selectedSegments.clear();
                        selectedSegments.add(newSeg);
                        drawNodes(selectedPath);
                        document.getElementById('status-info').textContent = 'Node added';
                    }
                }
            } else {
                // Click on a different path = select it
                selectedPath = hitResult.item;
                initSegmentTypes(selectedPath);
                selectedSegments.clear();
                selectedHandle = null;
                activeHandleSeg = null;
                MB.App.select(selectedPath);
                drawNodes(selectedPath);
            }
        } else {
            // Empty space — start rubber-band or deselect
            if (selectedPath && !event.modifiers.shift) {
                rubberStart = event.point;
                rubberBand = new paper.Path.Rectangle({
                    from: event.point, to: event.point,
                    strokeColor: '#6c8fef', strokeWidth: 1 / paper.view.zoom,
                    dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom],
                    fillColor: new paper.Color(0.42, 0.56, 0.94, 0.08)
                });
            } else if (!selectedPath) {
                selectedSegments.clear();
                selectedHandle = null;
                activeHandleSeg = null;
                clearMarkers();
                updateButtons();
                MB.App.clearSelection();
            }
        }
    };

    tool.onMouseDrag = function(event) {
        if (!selectedPath && !rubberBand) return;
        hasDragged = true;

        if (rubberBand && rubberStart) {
            rubberBand.remove();
            rubberBand = new paper.Path.Rectangle({
                from: rubberStart, to: event.point,
                strokeColor: '#6c8fef', strokeWidth: 1 / paper.view.zoom,
                dashArray: [4 / paper.view.zoom, 4 / paper.view.zoom],
                fillColor: new paper.Color(0.42, 0.56, 0.94, 0.08)
            });
            return;
        }

        if (!dragStart) return;
        const point = MB.GridSnap.snap(event.point, event);

        if (selectedHandle && activeHandleSeg) {
            const delta = point.subtract(activeHandleSeg.point);
            const type = inferNodeType(activeHandleSeg);
            activeHandleSeg[selectedHandle] = delta;

            if (event.modifiers.alt) {
                if (!activeHandleSeg.data) activeHandleSeg.data = {};
                activeHandleSeg.data.nodeType = 'cusp';
            } else if (type === 'smooth') {
                const opposite = selectedHandle === 'handleIn' ? 'handleOut' : 'handleIn';
                activeHandleSeg[opposite] = delta.negate();
            }
            drawNodes(selectedPath);
        } else if (selectedSegments.size > 0) {
            const delta = point.subtract(MB.GridSnap.snap(lastDragPoint, event));
            if (delta.length > 0) {
                selectedSegments.forEach(seg => { seg.point = seg.point.add(delta); });
                drawNodes(selectedPath);
            }
        }
        lastDragPoint = event.point;
    };

    tool.onMouseUp = function(event) {
        if (rubberBand && rubberStart) {
            const rect = new paper.Rectangle(rubberStart, event.point);
            if (selectedPath && rect.width > 1 && rect.height > 1) {
                if (!event.modifiers.shift) selectedSegments.clear();
                selectedPath.segments.forEach(seg => {
                    if (rect.contains(seg.point)) selectedSegments.add(seg);
                });
                drawNodes(selectedPath);
            }
            rubberBand.remove();
            rubberBand = null;
            rubberStart = null;
            return;
        }

        if (hasDragged && dragStart) {
            MB.History.commitAction();
        } else if (dragStart) {
            MB.History.cancelAction();
        }
        dragStart = null;
        lastDragPoint = null;
        hasDragged = false;
        selectedHandle = null;
        activeHandleSeg = null;
        if (selectedPath) drawNodes(selectedPath);
    };

    tool.onMouseMove = function(event) {
        if (!selectedPath) return;
        const canvas = document.getElementById('main-canvas');

        const nodeIdx = hitNode(event.point);
        if (nodeIdx >= 0) { canvas.style.cursor = 'move'; return; }

        const hh = hitHandle(event.point);
        if (hh) { canvas.style.cursor = 'crosshair'; return; }

        const hit = paper.project.hitTest(event.point, {
            stroke: true, fill: false, tolerance: 5 / paper.view.zoom
        });
        if (hit && hit.item === selectedPath) { canvas.style.cursor = 'copy'; return; }

        canvas.style.cursor = '';
    };

    tool.onKeyDown = function(event) {
        if (!selectedPath) return;

        if (event.key === 'delete' || event.key === 'backspace') {
            deleteNodes();
            return;
        }

        if (!event.modifiers.control && !event.modifiers.meta) {
            if (event.key === 'c' && selectedSegments.size > 0) {
                MB.History.snapshot();
                selectedSegments.forEach(seg => setNodeType(seg, 'corner'));
                drawNodes(selectedPath);
                document.getElementById('status-info').textContent = 'Node: corner';
                event.preventDefault();
            } else if (event.key === 's' && selectedSegments.size > 0) {
                MB.History.snapshot();
                selectedSegments.forEach(seg => setNodeType(seg, 'smooth'));
                drawNodes(selectedPath);
                document.getElementById('status-info').textContent = 'Node: smooth';
                event.preventDefault();
            } else if (event.key === 'b' && selectedSegments.size > 0) {
                MB.History.snapshot();
                selectedSegments.forEach(seg => setNodeType(seg, 'cusp'));
                drawNodes(selectedPath);
                document.getElementById('status-info').textContent = 'Node: cusp';
                event.preventDefault();
            }
        }
    };

    // ---- Path Operations ----

    function addNode() {
        if (!selectedPath) return;
        MB.History.snapshot();

        if (selectedSegments.size > 0) {
            // Add at midpoint of selected segment's outgoing curve
            const seg = [...selectedSegments][0];
            const idx = selectedPath.segments.indexOf(seg);
            if (idx < 0) return;
            const curve = seg.curve;
            if (curve) {
                const loc = curve.getLocationAt(curve.length / 2);
                if (loc) {
                    const newSeg = selectedPath.divideAt(loc);
                    if (newSeg) {
                        if (!newSeg.data) newSeg.data = {};
                        newSeg.data.nodeType = inferNodeType(newSeg);
                        selectedSegments.clear();
                        selectedSegments.add(newSeg);
                    }
                }
            }
        } else if (selectedPath.curves.length > 0) {
            // Add at midpoint of first curve
            const curve = selectedPath.curves[0];
            const loc = curve.getLocationAt(curve.length / 2);
            if (loc) {
                const newSeg = selectedPath.divideAt(loc);
                if (newSeg) {
                    if (!newSeg.data) newSeg.data = {};
                    newSeg.data.nodeType = inferNodeType(newSeg);
                    selectedSegments.clear();
                    selectedSegments.add(newSeg);
                }
            }
        }
        drawNodes(selectedPath);
        document.getElementById('status-info').textContent = 'Node added';
    }

    function deleteNodes() {
        if (!selectedPath || selectedSegments.size === 0) return;
        if (selectedPath.segments.length <= 2) return;

        const toRemove = [...selectedSegments].filter(seg =>
            selectedPath.segments.includes(seg)
        );
        const remaining = selectedPath.segments.length - toRemove.length;
        if (remaining < 2) return;

        MB.History.snapshot();
        toRemove.forEach(seg => seg.remove());
        selectedSegments.clear();
        drawNodes(selectedPath);
        document.getElementById('status-info').textContent = 'Node deleted';
    }

    function closePath() {
        if (!selectedPath || selectedPath.closed) return;
        MB.History.snapshot();
        selectedPath.closePath();
        selectedSegments.clear();
        drawNodes(selectedPath);
        document.getElementById('status-info').textContent = 'Path closed';
    }

    function openPath() {
        if (!selectedPath || !selectedPath.closed) return;

        // Open at selected node, or first node
        let seg;
        if (selectedSegments.size > 0) {
            seg = [...selectedSegments][0];
        } else {
            seg = selectedPath.firstSegment;
        }
        const idx = selectedPath.segments.indexOf(seg);
        if (idx < 0) return;

        MB.History.snapshot();
        const segs = selectedPath.removeSegments();
        const reordered = [...segs.slice(idx), ...segs.slice(0, idx)];
        // Duplicate the first node at the end so no curve is lost
        reordered.push(reordered[0].clone());
        selectedPath.addSegments(reordered);
        selectedPath.closed = false;
        selectedSegments.clear();
        drawNodes(selectedPath);
        document.getElementById('status-info').textContent = 'Path opened';
    }

    function breakPath() {
        if (!selectedPath || selectedPath.closed) return;
        if (selectedSegments.size === 0) {
            document.getElementById('status-info').textContent = 'Select a middle node first';
            return;
        }

        const seg = [...selectedSegments][0];
        const idx = selectedPath.segments.indexOf(seg);
        if (idx <= 0 || idx >= selectedPath.segments.length - 1) {
            document.getElementById('status-info').textContent = 'Select a middle node (not endpoint)';
            return;
        }

        MB.History.snapshot();

        const newSegs = [];
        for (let i = idx; i < selectedPath.segments.length; i++) {
            newSegs.push(selectedPath.segments[i].clone());
        }
        selectedPath.removeSegments(idx + 1);

        const newPath = new paper.Path({
            segments: newSegs,
            strokeColor: selectedPath.strokeColor,
            strokeWidth: selectedPath.strokeWidth
        });
        newPath.data = { isUserItem: true };
        newPath.insertAbove(selectedPath);

        selectedSegments.clear();
        drawNodes(selectedPath);
        document.getElementById('status-info').textContent = 'Path split into 2';
        MB.App.emit('selection-changed', MB.App.selectedItems);
    }

    function reversePath() {
        if (!selectedPath) return;
        MB.History.snapshot();
        selectedPath.reverse();
        selectedSegments.clear();
        drawNodes(selectedPath);
        document.getElementById('status-info').textContent = 'Path reversed';
    }

    function simplifyPath() {
        if (!selectedPath) return;
        const tol = parseFloat(document.getElementById('ne-tolerance')?.value) || 2.5;
        MB.History.snapshot();
        selectedPath.simplify(tol);
        initSegmentTypes(selectedPath);
        selectedSegments.clear();
        drawNodes(selectedPath);
    }

    function flattenPath() {
        if (!selectedPath) return;
        const tol = parseFloat(document.getElementById('ne-tolerance')?.value) || 2.5;
        MB.History.snapshot();
        selectedPath.flatten(tol);
        initSegmentTypes(selectedPath);
        selectedSegments.clear();
        drawNodes(selectedPath);
    }

    // ---- Wire buttons ----

    document.addEventListener('DOMContentLoaded', () => {
        const wire = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        wire('ne-corner', () => {
            if (!selectedPath || selectedSegments.size === 0) return;
            MB.History.snapshot();
            selectedSegments.forEach(seg => setNodeType(seg, 'corner'));
            drawNodes(selectedPath);
        });
        wire('ne-smooth', () => {
            if (!selectedPath || selectedSegments.size === 0) return;
            MB.History.snapshot();
            selectedSegments.forEach(seg => setNodeType(seg, 'smooth'));
            drawNodes(selectedPath);
        });
        wire('ne-cusp', () => {
            if (!selectedPath || selectedSegments.size === 0) return;
            MB.History.snapshot();
            selectedSegments.forEach(seg => setNodeType(seg, 'cusp'));
            drawNodes(selectedPath);
        });
        wire('ne-add', addNode);
        wire('ne-del', deleteNodes);
        wire('ne-close', closePath);
        wire('ne-open', openPath);
        wire('ne-break', breakPath);
        wire('ne-reverse', reversePath);
        wire('ne-simplify', simplifyPath);
        wire('ne-flatten', flattenPath);
    });

    // Expose path ops for menu actions
    MB._nodeEditOps = {
        reverse: reversePath,
        split: breakPath,
        simplify: simplifyPath,
        flatten: flattenPath
    };

    // Redraw markers on zoom
    function onViewChanged() {
        if (selectedPath && MB.App.activeTool === 'node-edit') {
            drawNodes(selectedPath);
        }
    }

    MB.App.registerTool('node-edit', {
        activate() {
            tool.activate();
            MB.App.on('view-changed', onViewChanged);
            if (MB.App.selectedItems.length === 1 && MB.App.selectedItems[0] instanceof paper.Path) {
                selectedPath = MB.App.selectedItems[0];
                initSegmentTypes(selectedPath);
                drawNodes(selectedPath);
            }
            updateInfo();
            updateButtons();
        },
        deactivate() {
            MB.App.off('view-changed', onViewChanged);
            clearMarkers();
            selectedPath = null;
            selectedSegments.clear();
            selectedHandle = null;
            activeHandleSeg = null;
            if (rubberBand) { rubberBand.remove(); rubberBand = null; }
            document.getElementById('main-canvas').style.cursor = '';
        },
        cancel() {
            clearMarkers();
            selectedPath = null;
            selectedSegments.clear();
            selectedHandle = null;
            activeHandleSeg = null;
            if (rubberBand) { rubberBand.remove(); rubberBand = null; }
            updateButtons();
        }
    });
})();
