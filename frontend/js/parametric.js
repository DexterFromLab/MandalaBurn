// MandalaBurn - Parametric Shape System
// Keeps shape creation parameters in item.data so shapes remain editable.
// Destructive ops (node-edit, booleans) call flatten() to convert to plain path.
MB.Parametric = {
    _builders: {},  // shapeType → builder function(params) → paper.Item

    registerBuilder(type, fn) {
        this._builders[type] = fn;
    },

    isParametric(item) {
        return !!(item && item.data && item.data.shapeType);
    },

    /**
     * Strip parametric metadata — item becomes a plain path.
     */
    flatten(item) {
        if (!this.isParametric(item)) return;
        delete item.data.shapeType;
        delete item.data.shapeParams;
    },

    flattenAll(items) {
        if (!items) return;
        items.forEach(i => this.flatten(i));
    },

    /**
     * Regenerate a parametric item from its stored params.
     * For Path items (rect, ellipse, polygon): rebuild segments in-place.
     * For CompoundPath items (text): replace item entirely.
     * Returns the (possibly new) item.
     */
    regenerate(item) {
        if (!this.isParametric(item)) return item;

        const type = item.data.shapeType;
        const params = item.data.shapeParams;
        const builder = this._builders[type];
        if (!builder) return item;

        if (item instanceof paper.Path) {
            // Path-based shapes: rebuild segments in-place
            const oldPos = item.position.clone();
            const oldRot = item.rotation;

            // Reset rotation so we can replace segments cleanly
            if (oldRot) item.rotate(-oldRot, oldPos);

            const temp = builder(params);
            if (!temp) return item;

            // Position temp at origin, then we transplant segments
            const tempCenter = temp.bounds.center;

            item.removeSegments();
            temp.segments.forEach(seg => {
                item.addSegment(seg.clone());
            });
            item.closed = temp.closed;
            temp.remove();

            // Re-center to old position and restore rotation
            item.position = oldPos;
            if (oldRot) item.rotate(oldRot, oldPos);

            return item;
        } else if (item instanceof paper.CompoundPath) {
            // CompoundPath (text): must replace entirely
            const oldPos = item.position.clone();
            const oldRot = item.rotation;

            const newItem = builder(params);
            if (!newItem) return item;

            // Preserve position: move new item so its center matches old
            newItem.position = oldPos;
            if (oldRot) newItem.rotate(oldRot, oldPos);

            // Copy style
            newItem.strokeColor = item.strokeColor;
            newItem.strokeWidth = item.strokeWidth;
            newItem.fillColor = item.fillColor;

            // Copy data (including shapeType/shapeParams)
            newItem.data = Object.assign({}, item.data);

            // Insert at same position in layer
            const parent = item.parent;
            const idx = parent ? parent.children.indexOf(item) : -1;
            if (parent && idx >= 0) {
                parent.insertChild(idx, newItem);
            }
            item.remove();

            // Update selection
            const selIdx = MB.App.selectedItems.indexOf(item);
            if (selIdx >= 0) {
                MB.App.selectedItems[selIdx] = newItem;
            }

            return newItem;
        }

        return item;
    }
};
