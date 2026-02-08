// MandalaBurn - Align & Distribute
MB.Align = {
    alignLeft() {
        const items = MB.App.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const minX = Math.min(...items.map(i => i.bounds.left));
        items.forEach(i => i.translate(new paper.Point(minX - i.bounds.left, 0)));
        MB.App.emit('selection-changed', items);
    },

    alignRight() {
        const items = MB.App.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const maxX = Math.max(...items.map(i => i.bounds.right));
        items.forEach(i => i.translate(new paper.Point(maxX - i.bounds.right, 0)));
        MB.App.emit('selection-changed', items);
    },

    alignTop() {
        const items = MB.App.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const minY = Math.min(...items.map(i => i.bounds.top));
        items.forEach(i => i.translate(new paper.Point(0, minY - i.bounds.top)));
        MB.App.emit('selection-changed', items);
    },

    alignBottom() {
        const items = MB.App.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const maxY = Math.max(...items.map(i => i.bounds.bottom));
        items.forEach(i => i.translate(new paper.Point(0, maxY - i.bounds.bottom)));
        MB.App.emit('selection-changed', items);
    },

    centerH() {
        const items = MB.App.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const bounds = this._combinedBounds(items);
        const cx = bounds.center.x;
        items.forEach(i => i.translate(new paper.Point(cx - i.bounds.center.x, 0)));
        MB.App.emit('selection-changed', items);
    },

    centerV() {
        const items = MB.App.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const bounds = this._combinedBounds(items);
        const cy = bounds.center.y;
        items.forEach(i => i.translate(new paper.Point(0, cy - i.bounds.center.y)));
        MB.App.emit('selection-changed', items);
    },

    distributeH() {
        const items = MB.App.selectedItems;
        if (items.length < 3) return;
        MB.History.snapshot();
        const sorted = items.slice().sort((a, b) => a.bounds.center.x - b.bounds.center.x);
        const first = sorted[0].bounds.center.x;
        const last = sorted[sorted.length - 1].bounds.center.x;
        const step = (last - first) / (sorted.length - 1);
        sorted.forEach((item, i) => {
            const target = first + step * i;
            item.translate(new paper.Point(target - item.bounds.center.x, 0));
        });
        MB.App.emit('selection-changed', items);
    },

    distributeV() {
        const items = MB.App.selectedItems;
        if (items.length < 3) return;
        MB.History.snapshot();
        const sorted = items.slice().sort((a, b) => a.bounds.center.y - b.bounds.center.y);
        const first = sorted[0].bounds.center.y;
        const last = sorted[sorted.length - 1].bounds.center.y;
        const step = (last - first) / (sorted.length - 1);
        sorted.forEach((item, i) => {
            const target = first + step * i;
            item.translate(new paper.Point(0, target - item.bounds.center.y));
        });
        MB.App.emit('selection-changed', items);
    },

    _combinedBounds(items) {
        let b = items[0].bounds.clone();
        for (let i = 1; i < items.length; i++) {
            b = b.unite(items[i].bounds);
        }
        return b;
    }
};
