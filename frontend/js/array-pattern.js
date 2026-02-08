// MandalaBurn - Array/Pattern (Rectangular & Circular)
MB.ArrayPattern = {
    init() {
        this._wireUI();
    },

    openDialog() {
        if (MB.App.selectedItems.length === 0) {
            document.getElementById('status-info').textContent = 'Select items first';
            return;
        }
        // Reset fields
        document.getElementById('array-rows').value = 3;
        document.getElementById('array-cols').value = 3;
        document.getElementById('array-gap-x').value = 5;
        document.getElementById('array-gap-y').value = 5;
        document.getElementById('array-circ-count').value = 6;
        document.getElementById('array-circ-radius').value = 50;

        // Show rectangular tab by default
        this._showTab('rect');
        document.getElementById('array-dialog').classList.remove('hidden');
    },

    _showTab(tab) {
        document.querySelectorAll('#array-dialog .array-tab-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('array-rect-opts').classList.toggle('hidden', tab !== 'rect');
        document.getElementById('array-circ-opts').classList.toggle('hidden', tab !== 'circ');
        this._activeTab = tab;
    },

    apply() {
        const items = MB.App.selectedItems;
        if (items.length === 0) return;

        MB.History.snapshot();
        const layer = MB.Layers.getActiveLayer();
        if (layer) layer.paperLayer.activate();

        let newItems;
        if (this._activeTab === 'circ') {
            newItems = this._applyCircular(items);
        } else {
            newItems = this._applyRectangular(items);
        }

        document.getElementById('array-dialog').classList.add('hidden');
        MB.App.select(items.concat(newItems));
        document.getElementById('status-info').textContent =
            'Created ' + newItems.length + ' copies in array';
    },

    _applyRectangular(items) {
        const rows = parseInt(document.getElementById('array-rows').value) || 3;
        const cols = parseInt(document.getElementById('array-cols').value) || 3;
        const gapX = parseFloat(document.getElementById('array-gap-x').value) || 0;
        const gapY = parseFloat(document.getElementById('array-gap-y').value) || 0;

        // Combined bounds of selected items
        let bounds = items[0].bounds.clone();
        for (let i = 1; i < items.length; i++) bounds = bounds.unite(items[i].bounds);

        const stepX = bounds.width + gapX;
        const stepY = bounds.height + gapY;
        const newItems = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === 0 && c === 0) continue; // skip original position
                for (const item of items) {
                    const clone = item.clone();
                    clone.data = { isUserItem: true };
                    clone.selected = false;
                    clone.translate(new paper.Point(c * stepX, r * stepY));
                    newItems.push(clone);
                }
            }
        }
        return newItems;
    },

    _applyCircular(items) {
        const count = parseInt(document.getElementById('array-circ-count').value) || 6;
        const radius = parseFloat(document.getElementById('array-circ-radius').value) || 50;

        // Center of selected items
        let bounds = items[0].bounds.clone();
        for (let i = 1; i < items.length; i++) bounds = bounds.unite(items[i].bounds);
        const center = bounds.center;

        const angleStep = 360 / count;
        const newItems = [];

        for (let i = 1; i < count; i++) {
            const angle = angleStep * i;
            const rad = angle * Math.PI / 180;
            const dx = Math.cos(rad) * radius - radius; // offset from original position
            const dy = Math.sin(rad) * radius;

            for (const item of items) {
                const clone = item.clone();
                clone.data = { isUserItem: true };
                clone.selected = false;
                clone.rotate(angle, center);
                newItems.push(clone);
            }
        }
        return newItems;
    },

    _wireUI() {
        // Tab switching
        document.querySelectorAll('#array-dialog .array-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this._showTab(btn.dataset.tab));
        });

        // Apply / Cancel
        document.getElementById('array-apply').addEventListener('click', () => this.apply());
        document.getElementById('array-cancel').addEventListener('click', () => {
            document.getElementById('array-dialog').classList.add('hidden');
        });
    }
};
