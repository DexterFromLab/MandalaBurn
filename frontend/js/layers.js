// MandalaBurn - Layer System (table-based with inline laser params)
MB.Layers = {
    layers: [],
    activeLayerIndex: 0,
    _nextId: 1,

    init() {
        this.addLayer('Cut', '#ff0000');

        // Toolbar button handlers
        document.getElementById('add-layer').addEventListener('click', () => {
            const idx = this.layers.length;
            const color = MB.App.layerColors[idx % MB.App.layerColors.length];
            this.addLayer('Layer ' + (idx + 1), color);
        });
        document.getElementById('remove-layer').addEventListener('click', () => this.removeActiveLayer());
        document.getElementById('duplicate-layer').addEventListener('click', () => this.duplicateActiveLayer());
        document.getElementById('merge-layers').addEventListener('click', () => this.mergeDown());
        document.getElementById('merge-all-layers').addEventListener('click', () => this.mergeAll());
        document.getElementById('split-to-layer').addEventListener('click', () => this.splitSelectionToNewLayer());
        document.getElementById('move-to-layer').addEventListener('click', () => this.showMoveToLayerDialog());
        document.getElementById('move-layer-up').addEventListener('click', () => this.moveLayer(this.activeLayerIndex, -1));
        document.getElementById('move-layer-down').addEventListener('click', () => this.moveLayer(this.activeLayerIndex, 1));
        document.getElementById('move-to-layer-cancel').addEventListener('click', () => {
            document.getElementById('move-to-layer-dialog').classList.add('hidden');
        });

        // Right-click context menu on layer table
        document.getElementById('layer-list').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const tr = e.target.closest('tr[data-index]');
            if (tr) {
                this.setActiveLayer(parseInt(tr.dataset.index));
                this.showLayerContextMenu(e.clientX, e.clientY);
            }
        });
    },

    // --- Core layer operations ---

    addLayer(name, color) {
        const paperLayer = new paper.Layer({ name: name });
        const layer = {
            id: 'layer-' + this._nextId++,
            name: name,
            color: color || '#ff0000',
            visible: true,
            locked: false,
            output: true,       // whether this layer produces G-code output
            paperLayer: paperLayer,
            laserSettings: {
                mode: 'cut',
                power: 80,
                speed: 10,
                passes: 1,
                airAssist: true
            }
        };
        this.layers.push(layer);
        this.setActiveLayer(this.layers.length - 1);
        this.renderLayerList();
        MB.App.emit('layers-changed', this.layers);
        return layer;
    },

    removeActiveLayer() {
        if (this.layers.length <= 1) return;
        MB.History.snapshot();
        const idx = this.activeLayerIndex;
        const layer = this.layers[idx];
        MB.App.clearSelection();
        layer.paperLayer.remove();
        this.layers.splice(idx, 1);
        this.activeLayerIndex = Math.min(idx, this.layers.length - 1);
        this.layers[this.activeLayerIndex].paperLayer.activate();
        this.renderLayerList();
        MB.App.emit('layers-changed', this.layers);
        MB.App.emit('active-layer-changed', this.getActiveLayer());
    },

    duplicateActiveLayer() {
        const src = this.getActiveLayer();
        if (!src) return;
        MB.History.snapshot();
        const newLayer = this.addLayer(src.name + ' copy', src.color);
        newLayer.laserSettings = { ...src.laserSettings };
        // Clone all user items
        src.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) {
                const clone = child.clone();
                newLayer.paperLayer.addChild(clone);
            }
        });
        this.renderLayerList();
    },

    setActiveLayer(index) {
        if (index < 0 || index >= this.layers.length) return;
        this.activeLayerIndex = index;
        this.layers[index].paperLayer.activate();
        this.renderLayerList();
        MB.App.emit('active-layer-changed', this.getActiveLayer());
    },

    getActiveLayer() {
        return this.layers[this.activeLayerIndex] || null;
    },

    getLayerById(id) {
        return this.layers.find(l => l.id === id);
    },

    getLayerForItem(item) {
        return this.layers.find(l => l.paperLayer === item.layer);
    },

    moveLayer(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.layers.length) return;
        const temp = this.layers[index];
        this.layers[index] = this.layers[newIndex];
        this.layers[newIndex] = temp;
        if (direction < 0) {
            temp.paperLayer.moveAbove(this.layers[index].paperLayer);
        } else {
            temp.paperLayer.moveBelow(this.layers[index].paperLayer);
        }
        this.activeLayerIndex = newIndex;
        this.renderLayerList();
    },

    // --- Merge operations ---

    mergeDown() {
        const idx = this.activeLayerIndex;
        if (idx >= this.layers.length - 1) return; // Nothing below
        MB.History.snapshot();
        const srcLayer = this.layers[idx];
        const dstLayer = this.layers[idx + 1];

        MB.App.clearSelection();

        // Move all user items from src to dst
        const children = [...srcLayer.paperLayer.children];
        children.forEach(child => {
            if (child.data && child.data.isUserItem) {
                child.strokeColor = dstLayer.color;
                dstLayer.paperLayer.addChild(child);
            }
        });

        // Remove source layer
        srcLayer.paperLayer.remove();
        this.layers.splice(idx, 1);
        this.activeLayerIndex = Math.min(idx, this.layers.length - 1);
        this.layers[this.activeLayerIndex].paperLayer.activate();
        this.renderLayerList();
        MB.App.emit('layers-changed', this.layers);
        MB.App.emit('active-layer-changed', this.getActiveLayer());
    },

    mergeAll() {
        if (this.layers.length <= 1) return;
        MB.History.snapshot();
        MB.App.clearSelection();

        const dstLayer = this.layers[0];
        for (let i = 1; i < this.layers.length; i++) {
            const srcLayer = this.layers[i];
            if (!srcLayer.visible) continue;
            const children = [...srcLayer.paperLayer.children];
            children.forEach(child => {
                if (child.data && child.data.isUserItem) {
                    child.strokeColor = dstLayer.color;
                    dstLayer.paperLayer.addChild(child);
                }
            });
            srcLayer.paperLayer.remove();
        }

        this.layers = [dstLayer];
        this.activeLayerIndex = 0;
        dstLayer.paperLayer.activate();
        this.renderLayerList();
        MB.App.emit('layers-changed', this.layers);
        MB.App.emit('active-layer-changed', this.getActiveLayer());
    },

    // --- Split / Move selection ---

    splitSelectionToNewLayer() {
        const items = MB.App.selectedItems;
        if (items.length === 0) return;
        MB.History.snapshot();

        const idx = this.layers.length;
        const color = MB.App.layerColors[idx % MB.App.layerColors.length];
        const newLayer = this.addLayer('Split ' + idx, color);

        items.forEach(item => {
            item.strokeColor = newLayer.color;
            newLayer.paperLayer.addChild(item);
        });

        MB.App.clearSelection();
        this.renderLayerList();
    },

    moveSelectionToLayer(targetLayer) {
        const items = MB.App.selectedItems;
        if (items.length === 0 || !targetLayer) return;
        MB.History.snapshot();

        items.forEach(item => {
            item.strokeColor = targetLayer.color;
            targetLayer.paperLayer.addChild(item);
        });

        MB.App.clearSelection();
        this.renderLayerList();
    },

    showMoveToLayerDialog() {
        if (MB.App.selectedItems.length === 0) return;

        const dialog = document.getElementById('move-to-layer-dialog');
        const options = document.getElementById('move-to-layer-options');
        options.innerHTML = '';

        this.layers.forEach((layer, idx) => {
            if (idx === this.activeLayerIndex) return; // Skip current layer
            const btn = document.createElement('button');
            const swatch = document.createElement('span');
            swatch.className = 'mtl-swatch';
            swatch.style.background = layer.color;
            btn.appendChild(swatch);
            btn.appendChild(document.createTextNode(layer.name));
            btn.addEventListener('click', () => {
                this.moveSelectionToLayer(layer);
                dialog.classList.add('hidden');
            });
            options.appendChild(btn);
        });

        dialog.classList.remove('hidden');
    },

    // --- Context menu ---

    showLayerContextMenu(x, y) {
        // Remove existing context menu
        const old = document.querySelector('.layer-context-menu');
        if (old) old.remove();

        const menu = document.createElement('div');
        menu.className = 'context-menu layer-context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        const actions = [
            { label: 'Rename', fn: () => this.startRenameInTable(this.activeLayerIndex) },
            { label: 'Duplicate', fn: () => this.duplicateActiveLayer() },
            { label: 'Merge Down', fn: () => this.mergeDown() },
            { label: '---' },
            { label: 'Split Selection Here', fn: () => this.splitSelectionToNewLayer() },
            { label: 'Move Selection To...', fn: () => this.showMoveToLayerDialog() },
            { label: '---' },
            { label: 'Delete Layer', fn: () => this.removeActiveLayer(), danger: true }
        ];

        actions.forEach(a => {
            if (a.label === '---') {
                const sep = document.createElement('div');
                sep.className = 'menu-separator';
                menu.appendChild(sep);
                return;
            }
            const btn = document.createElement('button');
            btn.textContent = a.label;
            if (a.danger) btn.style.color = 'var(--danger)';
            btn.addEventListener('click', () => { a.fn(); menu.remove(); });
            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        // Close on click outside
        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', close);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', close), 0);
    },

    // --- Table rendering ---

    renderLayerList() {
        const tbody = document.getElementById('layer-list');
        tbody.innerHTML = '';

        this.layers.forEach((layer, idx) => {
            const tr = document.createElement('tr');
            tr.className = idx === this.activeLayerIndex ? 'active' : '';
            tr.dataset.index = idx;

            // Color
            const tdColor = document.createElement('td');
            tdColor.className = 'lc-color';
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'lt-color';
            colorInput.value = layer.color;
            colorInput.addEventListener('input', (e) => {
                e.stopPropagation();
                layer.color = e.target.value;
                this.updateLayerItemColors(layer);
            });
            colorInput.addEventListener('click', (e) => e.stopPropagation());
            tdColor.appendChild(colorInput);

            // Name
            const tdName = document.createElement('td');
            tdName.className = 'lc-name';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = layer.name;
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.startRenameInTable(idx);
            });
            tdName.appendChild(nameSpan);

            // Mode
            const tdMode = document.createElement('td');
            tdMode.className = 'lc-mode';
            const modeSelect = document.createElement('select');
            modeSelect.className = 'lt-select';
            ['cut', 'engrave', 'score'].forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
                if (layer.laserSettings.mode === m) opt.selected = true;
                modeSelect.appendChild(opt);
            });
            modeSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                layer.laserSettings.mode = e.target.value;
                MB.App.emit('active-layer-changed', this.getActiveLayer());
            });
            modeSelect.addEventListener('click', (e) => e.stopPropagation());
            tdMode.appendChild(modeSelect);

            // Power
            const tdPower = document.createElement('td');
            tdPower.className = 'lc-power power-cell';
            const powerInput = document.createElement('input');
            powerInput.type = 'number';
            powerInput.className = 'lt-input';
            powerInput.min = 0; powerInput.max = 100; powerInput.step = 1;
            powerInput.value = layer.laserSettings.power;
            const powerBar = document.createElement('div');
            powerBar.className = 'power-bar';
            powerBar.style.width = layer.laserSettings.power + '%';
            powerInput.addEventListener('change', (e) => {
                e.stopPropagation();
                const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                layer.laserSettings.power = val;
                e.target.value = val;
                powerBar.style.width = val + '%';
                MB.App.emit('active-layer-changed', this.getActiveLayer());
            });
            powerInput.addEventListener('click', (e) => e.stopPropagation());
            tdPower.appendChild(powerInput);
            tdPower.appendChild(powerBar);

            // Speed
            const tdSpeed = document.createElement('td');
            tdSpeed.className = 'lc-speed';
            const speedInput = document.createElement('input');
            speedInput.type = 'number';
            speedInput.className = 'lt-input';
            speedInput.min = 1; speedInput.max = 99999; speedInput.step = 1;
            speedInput.value = layer.laserSettings.speed;
            speedInput.addEventListener('change', (e) => {
                e.stopPropagation();
                layer.laserSettings.speed = parseFloat(e.target.value) || 10;
                MB.App.emit('active-layer-changed', this.getActiveLayer());
            });
            speedInput.addEventListener('click', (e) => e.stopPropagation());
            tdSpeed.appendChild(speedInput);

            // Passes
            const tdPasses = document.createElement('td');
            tdPasses.className = 'lc-passes';
            const passesInput = document.createElement('input');
            passesInput.type = 'number';
            passesInput.className = 'lt-input';
            passesInput.min = 1; passesInput.max = 100; passesInput.step = 1;
            passesInput.value = layer.laserSettings.passes;
            passesInput.addEventListener('change', (e) => {
                e.stopPropagation();
                layer.laserSettings.passes = parseInt(e.target.value) || 1;
                MB.App.emit('active-layer-changed', this.getActiveLayer());
            });
            passesInput.addEventListener('click', (e) => e.stopPropagation());
            tdPasses.appendChild(passesInput);

            // Air Assist
            const tdAir = document.createElement('td');
            tdAir.className = 'lc-air';
            const airBtn = document.createElement('button');
            airBtn.className = 'lt-toggle ' + (layer.laserSettings.airAssist ? 'on' : 'off');
            airBtn.innerHTML = '&#x2B24;'; // filled circle
            airBtn.title = layer.laserSettings.airAssist ? 'Air: ON' : 'Air: OFF';
            airBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.laserSettings.airAssist = !layer.laserSettings.airAssist;
                airBtn.className = 'lt-toggle ' + (layer.laserSettings.airAssist ? 'on' : 'off');
                airBtn.title = layer.laserSettings.airAssist ? 'Air: ON' : 'Air: OFF';
            });
            tdAir.appendChild(airBtn);

            // Output (whether layer produces G-code)
            const tdOutput = document.createElement('td');
            tdOutput.className = 'lc-output';
            const outBtn = document.createElement('button');
            outBtn.className = 'lt-toggle ' + (layer.output ? 'on' : 'off');
            outBtn.innerHTML = '&#x26A1;'; // lightning bolt
            outBtn.title = layer.output ? 'Output: ON' : 'Output: OFF';
            outBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.output = !layer.output;
                outBtn.className = 'lt-toggle ' + (layer.output ? 'on' : 'off');
                outBtn.title = layer.output ? 'Output: ON' : 'Output: OFF';
            });
            tdOutput.appendChild(outBtn);

            // Visibility
            const tdVis = document.createElement('td');
            tdVis.className = 'lc-vis';
            const visBtn = document.createElement('button');
            visBtn.className = 'lt-toggle ' + (layer.visible ? 'on' : 'off');
            visBtn.innerHTML = '&#x25C9;'; // fisheye
            visBtn.title = layer.visible ? 'Visible' : 'Hidden';
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                layer.paperLayer.visible = layer.visible;
                visBtn.className = 'lt-toggle ' + (layer.visible ? 'on' : 'off');
                visBtn.title = layer.visible ? 'Visible' : 'Hidden';
            });
            tdVis.appendChild(visBtn);

            // Lock
            const tdLock = document.createElement('td');
            tdLock.className = 'lc-lock';
            const lockBtn = document.createElement('button');
            lockBtn.className = 'lt-toggle ' + (layer.locked ? 'on' : 'off');
            lockBtn.innerHTML = layer.locked ? '&#x1f512;' : '&#x1f513;';
            lockBtn.title = layer.locked ? 'Locked' : 'Unlocked';
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.locked = !layer.locked;
                layer.paperLayer.locked = layer.locked;
                lockBtn.innerHTML = layer.locked ? '&#x1f512;' : '&#x1f513;';
                lockBtn.className = 'lt-toggle ' + (layer.locked ? 'on' : 'off');
                lockBtn.title = layer.locked ? 'Locked' : 'Unlocked';
            });
            tdLock.appendChild(lockBtn);

            // Assemble row
            tr.appendChild(tdColor);
            tr.appendChild(tdName);
            tr.appendChild(tdMode);
            tr.appendChild(tdPower);
            tr.appendChild(tdSpeed);
            tr.appendChild(tdPasses);
            tr.appendChild(tdAir);
            tr.appendChild(tdOutput);
            tr.appendChild(tdVis);
            tr.appendChild(tdLock);

            // Row click = select layer
            tr.addEventListener('click', () => this.setActiveLayer(idx));

            tbody.appendChild(tr);
        });
    },

    startRenameInTable(index) {
        const layer = this.layers[index];
        const tbody = document.getElementById('layer-list');
        const row = tbody.querySelector(`tr[data-index="${index}"]`);
        if (!row) return;
        const nameCell = row.querySelector('.lc-name');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'layer-rename-input';
        input.value = layer.name;
        nameCell.innerHTML = '';
        nameCell.appendChild(input);
        input.focus();
        input.select();

        const finish = () => {
            layer.name = input.value.trim() || layer.name;
            this.renderLayerList();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = layer.name; input.blur(); }
            e.stopPropagation();
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    },

    updateLayerItemColors(layer) {
        layer.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) {
                child.strokeColor = layer.color;
            }
        });
    },

    getActiveColor() {
        const layer = this.getActiveLayer();
        return layer ? layer.color : '#ff0000';
    },

    // Count user items in a layer
    getItemCount(layer) {
        let count = 0;
        layer.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) count++;
        });
        return count;
    }
};
