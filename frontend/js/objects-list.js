// MandalaBurn - Objects List Panel
MB.ObjectsList = {
    _hoveredItem: null,

    init() {
        MB.App.on('selection-changed', () => this.render());
        MB.App.on('active-layer-changed', () => this.render());
        MB.App.on('layers-changed', () => this.render());
        // Re-render after mouse actions on canvas (catches new item creation from tools)
        document.getElementById('main-canvas').addEventListener('mouseup', () => {
            setTimeout(() => this.render(), 0);
        });
    },

    render() {
        const container = document.getElementById('objects-list');
        if (!container) return;
        container.innerHTML = '';

        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        const items = [];
        layer.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) items.push(child);
        });

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'obj-empty';
            empty.textContent = 'No objects';
            container.appendChild(empty);
            return;
        }

        // Count per type for naming
        const typeCounts = {};

        items.forEach((item, idx) => {
            const typeName = this._getTypeName(item);
            typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
            const label = typeName + ' ' + typeCounts[typeName];

            const div = document.createElement('div');
            div.className = 'obj-item';
            if (MB.App.selectedItems.includes(item)) {
                div.classList.add('selected');
            }

            // Drag handle for reorder
            const handle = document.createElement('span');
            handle.className = 'obj-drag-handle';
            handle.textContent = '\u2261'; // ≡
            handle.title = 'Drag to reorder';
            div.appendChild(handle);

            // Make row draggable
            div.draggable = true;
            div.dataset.itemIdx = idx;

            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', idx);
                div.classList.add('dragging');
                this._dragIdx = idx;
            });
            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
                container.querySelectorAll('.obj-item').forEach(el => {
                    el.classList.remove('drop-above', 'drop-below');
                });
            });
            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = div.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const above = e.clientY < mid;
                div.classList.toggle('drop-above', above);
                div.classList.toggle('drop-below', !above);
            });
            div.addEventListener('dragleave', () => {
                div.classList.remove('drop-above', 'drop-below');
            });
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('drop-above', 'drop-below');
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                const toIdx = idx;
                if (fromIdx === toIdx) return;

                const rect = div.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const above = e.clientY < mid;

                this._reorderItem(items, fromIdx, toIdx, above);
            });

            // Color swatch
            const swatch = document.createElement('span');
            swatch.className = 'obj-color';
            swatch.style.background = item.strokeColor ? item.strokeColor.toCSS() : layer.color;
            div.appendChild(swatch);

            // Icon
            const icon = document.createElement('span');
            icon.className = 'obj-icon';
            icon.textContent = this._getIcon(item);
            div.appendChild(icon);

            // Symmetry badge
            if (MB.Symmetry && MB.Symmetry.hasSymmetry(item)) {
                const symBadge = document.createElement('span');
                symBadge.className = 'obj-sym-badge';
                symBadge.textContent = '\u29BF';
                symBadge.title = 'Has symmetry modifier';
                div.appendChild(symBadge);
            }

            // Name
            const name = document.createElement('span');
            name.className = 'obj-name';
            name.textContent = label;
            div.appendChild(name);

            // Click handlers
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    // Toggle in selection
                    if (MB.App.selectedItems.includes(item)) {
                        MB.App.removeFromSelection(item);
                    } else {
                        MB.App.addToSelection(item);
                    }
                } else {
                    MB.App.select(item);
                }
            });

            // Hover: highlight on canvas
            div.addEventListener('mouseenter', () => {
                if (!MB.App.selectedItems.includes(item)) {
                    this._hoveredItem = item;
                    item.selected = true;
                    paper.view.update();
                }
            });
            div.addEventListener('mouseleave', () => {
                if (this._hoveredItem === item && !MB.App.selectedItems.includes(item)) {
                    item.selected = false;
                    this._hoveredItem = null;
                    paper.view.update();
                }
            });

            container.appendChild(div);
        });
    },

    _reorderItem(items, fromIdx, toIdx, above) {
        const item = items[fromIdx];
        const target = items[toIdx];
        if (!item || !target || item === target) return;

        MB.History.snapshot();
        if (above) {
            item.insertBelow(target);
        } else {
            item.insertAbove(target);
        }
        this.render();
    },

    _getTypeName(item) {
        // Use parametric shapeType if available
        if (item.data && item.data.shapeType) {
            const names = { rect: 'Rect', ellipse: 'Ellipse', polygon: 'Polygon', text: 'Text' };
            return names[item.data.shapeType] || item.data.shapeType;
        }
        if (item instanceof paper.CompoundPath) return 'Compound';
        if (item instanceof paper.Path) {
            if (item.closed) {
                const segs = item.segments.length;
                if (segs === 4) return 'Rect';
                if (segs >= 8 && item.bounds.width > 0) return 'Shape';
                return 'Path';
            }
            if (item.segments.length === 2) return 'Line';
            return 'Path';
        }
        if (item instanceof paper.Group) return 'Group';
        return 'Object';
    },

    _getIcon(item) {
        // Use parametric shapeType for icons
        if (item.data && item.data.shapeType) {
            const icons = { rect: '\u25AD', ellipse: '\u25CB', polygon: '\u2B23', text: 'T' };
            return icons[item.data.shapeType] || '\u25A1';
        }
        if (item instanceof paper.CompoundPath) return '\u29C9'; // ⧉
        if (item instanceof paper.Path) {
            if (item.closed) {
                if (item.segments.length === 4) return '\u25AD'; // ▭
                return '\u25CB'; // ○
            }
            if (item.segments.length === 2) return '\u2571'; // ╱
            return '\u223F'; // ∿
        }
        if (item instanceof paper.Group) return '\u29C9'; // ⧉
        return '\u25A1'; // □
    }
};
