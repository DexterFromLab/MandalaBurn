// MandalaBurn - Path Offset/Inset
MB.PathOffset = {
    init() {
        this._wireUI();
    },

    openDialog() {
        const items = MB.App.selectedItems;
        if (items.length !== 1) {
            document.getElementById('status-info').textContent = 'Select exactly one path';
            return;
        }
        const item = items[0];
        if (!(item instanceof paper.Path) && !(item instanceof paper.CompoundPath)) {
            document.getElementById('status-info').textContent = 'Select a path (not a group)';
            return;
        }
        document.getElementById('offset-distance').value = 2;
        document.getElementById('offset-dialog').classList.remove('hidden');
    },

    apply() {
        const items = MB.App.selectedItems;
        if (items.length !== 1) return;
        const item = items[0];

        const dist = parseFloat(document.getElementById('offset-distance').value) || 2;

        MB.History.snapshot();

        let paths;
        if (item instanceof paper.CompoundPath) {
            paths = item.children.slice();
        } else {
            paths = [item];
        }

        const layer = MB.Layers.getActiveLayer();
        if (layer) layer.paperLayer.activate();

        const newPaths = [];
        for (const path of paths) {
            const offsetPath = this._offsetPath(path, dist);
            if (offsetPath) {
                offsetPath.data = { isUserItem: true };
                offsetPath.strokeColor = path.strokeColor || layer.color;
                offsetPath.fillColor = null;
                newPaths.push(offsetPath);
            }
        }

        document.getElementById('offset-dialog').classList.add('hidden');

        if (newPaths.length === 1) {
            MB.App.select(newPaths[0]);
        } else if (newPaths.length > 1) {
            const compound = new paper.CompoundPath({ children: newPaths });
            compound.data = { isUserItem: true };
            compound.strokeColor = paths[0].strokeColor || layer.color;
            compound.fillColor = null;
            MB.App.select(compound);
        }

        document.getElementById('status-info').textContent =
            'Created offset path (' + dist + 'mm)';
    },

    _offsetPath(path, dist) {
        // Flatten to small segments for uniform normals
        const flat = path.clone({ insert: false });
        flat.flatten(0.5); // 0.5mm tolerance

        const segs = flat.segments;
        if (segs.length < 2) return null;

        const closed = flat.closed;
        const points = segs.map(s => s.point.clone());
        const n = points.length;

        const offsetPoints = [];

        for (let i = 0; i < n; i++) {
            // Compute averaged normal from adjacent edges
            const prev = closed ? points[(i - 1 + n) % n] : (i > 0 ? points[i - 1] : null);
            const curr = points[i];
            const next = closed ? points[(i + 1) % n] : (i < n - 1 ? points[i + 1] : null);

            let nx = 0, ny = 0;

            if (prev) {
                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                nx += -dy / len;
                ny += dx / len;
            }
            if (next) {
                const dx = next.x - curr.x;
                const dy = next.y - curr.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                nx += -dy / len;
                ny += dx / len;
            }

            // Normalize
            const nLen = Math.sqrt(nx * nx + ny * ny) || 1;
            nx /= nLen;
            ny /= nLen;

            // Miter factor: limit to 4x distance to avoid spikes at sharp corners
            let miter = 1;
            if (prev && next) {
                const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
                const d2x = next.x - curr.x, d2y = next.y - curr.y;
                const l1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
                const l2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
                const n1x = -d1y / l1, n1y = d1x / l1;
                const dot = nx * n1x + ny * n1y;
                if (dot > 0.01) {
                    miter = Math.min(1 / dot, 4);
                }
            }

            offsetPoints.push(new paper.Point(
                curr.x + nx * dist * miter,
                curr.y + ny * dist * miter
            ));
        }

        flat.remove();

        // Build new path
        const newPath = new paper.Path({
            segments: offsetPoints,
            closed: closed
        });

        return newPath;
    },

    _wireUI() {
        document.getElementById('offset-apply').addEventListener('click', () => this.apply());
        document.getElementById('offset-cancel').addEventListener('click', () => {
            document.getElementById('offset-dialog').classList.add('hidden');
        });
    }
};
