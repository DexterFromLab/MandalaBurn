// MandalaBurn - Boolean Operations (Paper.js built-in)
MB.BooleanOps = {
    init() {
        document.getElementById('subtract-picker-cancel').addEventListener('click', () => {
            document.getElementById('subtract-picker-dialog').classList.add('hidden');
        });
    },

    _getValidPaths() {
        const items = MB.App.selectedItems;
        if (items.length < 2) {
            document.getElementById('status-info').textContent = 'Select at least 2 objects';
            return null;
        }
        const paths = items.filter(item => item instanceof paper.Path || item instanceof paper.CompoundPath);
        if (paths.length < 2) {
            document.getElementById('status-info').textContent = 'Selected objects must be paths';
            return null;
        }
        return paths;
    },

    _executeOp(operation, name, base, others) {
        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;

        MB.History.snapshot();

        let result = base.clone();
        for (let i = 0; i < others.length; i++) {
            let newResult;
            switch (operation) {
                case 'unite': newResult = result.unite(others[i]); break;
                case 'subtract': newResult = result.subtract(others[i]); break;
                case 'intersect': newResult = result.intersect(others[i]); break;
                case 'exclude': newResult = result.exclude(others[i]); break;
                case 'divide': newResult = result.divide(others[i]); break;
            }
            result.remove();
            result = newResult;
        }

        result.strokeColor = layer.color;
        result.strokeWidth = 0.5;
        result.fillColor = null;
        result.data = { isUserItem: true };

        layer.paperLayer.addChild(result);

        // Remove all originals
        const allPaths = [base, ...others];
        allPaths.forEach(p => p.remove());

        MB.App.select(result);
        document.getElementById('status-info').textContent = name + ' done';
    },

    _operate(operation, name) {
        const paths = this._getValidPaths();
        if (!paths) return;
        this._executeOp(operation, name, paths[0], paths.slice(1));
    },

    subtract() {
        const paths = this._getValidPaths();
        if (!paths) return;

        // Show picker dialog so user chooses the base
        const dialog = document.getElementById('subtract-picker-dialog');
        const container = document.getElementById('subtract-picker-items');
        container.innerHTML = '';

        paths.forEach((path, idx) => {
            const btn = document.createElement('button');

            const swatch = document.createElement('span');
            swatch.className = 'sp-swatch';
            swatch.style.background = path.strokeColor ? path.strokeColor.toCSS() : '#fff';
            btn.appendChild(swatch);

            const label = document.createElement('span');
            label.textContent = MB.ObjectsList._getTypeName(path) + ' (' +
                Math.round(path.bounds.width) + '\u00D7' + Math.round(path.bounds.height) +
                ' @ ' + Math.round(path.bounds.x) + ',' + Math.round(path.bounds.y) + ')';
            btn.appendChild(label);

            // Hover: highlight this path on canvas
            btn.addEventListener('mouseenter', () => {
                paths.forEach(p => p.selected = false);
                path.selected = true;
                paper.view.update();
            });
            btn.addEventListener('mouseleave', () => {
                paths.forEach(p => p.selected = true);
                paper.view.update();
            });

            btn.addEventListener('click', () => {
                dialog.classList.add('hidden');
                const others = paths.filter((_, i) => i !== idx);
                this._executeOp('subtract', 'Subtract', path, others);
            });

            container.appendChild(btn);
        });

        dialog.classList.remove('hidden');
    },

    unite() { this._operate('unite', 'Unite'); },
    intersect() { this._operate('intersect', 'Intersect'); },
    exclude() { this._operate('exclude', 'Exclude'); },
    divide() { this._operate('divide', 'Divide'); }
};
