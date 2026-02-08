// MandalaBurn - Application Core
window.MB = window.MB || {};

MB.App = {
    activeTool: null,
    _transformMode: 'move',
    tools: {},
    selectedItems: [],
    clipboard: [],
    _pasteOffset: 0,

    // Tools that have an options panel
    _toolsWithOptions: ['select', 'pen', 'ruler', 'polygon', 'node-edit', 'text', 'mandala'],

    // Default layer colors (LightBurn style)
    layerColors: [
        '#ff0000', '#0000ff', '#00aa00', '#ff8800',
        '#00cccc', '#ff00ff', '#888800', '#8800ff',
        '#ff4444', '#4444ff', '#44aa44', '#ffaa44'
    ],

    init() {
        MB.Canvas.init();
        MB.GridSnap.init();
        MB.Layers.init();
        MB.Properties.init();
        MB.History.init();
        MB.ObjectsList.init();
        MB.Rulers.init();
        MB.BooleanOps.init();
        MB.Machine.init();
        MB.ProjectIO.init();
        MB.FontManager.init();
        MB.Mandala.init();
        MB.Simulator.init();
        MB.ArrayPattern.init();
        MB.PathOffset.init();
        MB.JobSender.init();

        this.initMenus();
        this.initToolOptions();
        this.initKeyboard();
        this.initCollapsiblePanels();
        this._initContextMenu();

        // Track transform mode for toolbar button highlights
        this.on('transform-mode-changed', (mode) => {
            this._transformMode = mode;
            document.querySelectorAll('.tool-btn[data-transform-mode]').forEach(btn => {
                btn.classList.toggle('active', this.activeTool === 'select' &&
                    btn.dataset.transformMode === mode);
            });
            // Also update sub-options visibility
            const scaleOpts = document.getElementById('scale-opts');
            const rotateOpts = document.getElementById('rotate-opts');
            if (scaleOpts) scaleOpts.classList.toggle('hidden', mode !== 'scale');
            if (rotateOpts) rotateOpts.classList.toggle('hidden', mode !== 'rotate');
        });

        this.setTool('select');
    },

    // --- Event Bus ---
    _listeners: {},
    on(event, fn) {
        (this._listeners[event] = this._listeners[event] || []).push(fn);
    },
    off(event, fn) {
        const arr = this._listeners[event];
        if (arr) this._listeners[event] = arr.filter(f => f !== fn);
    },
    emit(event, data) {
        (this._listeners[event] || []).forEach(fn => fn(data));
    },

    // --- Tool Management ---
    registerTool(name, tool) {
        this.tools[name] = tool;
    },

    setTool(name) {
        if (this.activeTool && this.tools[this.activeTool] && this.tools[this.activeTool].deactivate) {
            this.tools[this.activeTool].deactivate();
        }
        this.activeTool = name;
        if (this.tools[name] && this.tools[name].activate) {
            this.tools[name].activate();
        }
        // Update toolbar UI
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            if (btn.dataset.transformMode) {
                // Transform buttons: active only when select tool + matching mode
                btn.classList.toggle('active', name === 'select' &&
                    btn.dataset.transformMode === this._transformMode);
            } else {
                btn.classList.toggle('active', btn.dataset.tool === name && !btn.dataset.transformMode);
            }
        });
        // Update tool options panel
        this._updateToolOptions(name);
        // Status
        document.getElementById('status-tool').textContent = name.charAt(0).toUpperCase() + name.slice(1);
        this.emit('tool-changed', name);
    },

    _updateToolOptions(name) {
        const panel = document.getElementById('tool-options');
        if (!panel) return;
        // Show mandala options when mandala mode is active, even with other tools
        const showMandala = MB.Mandala && MB.Mandala.active && name !== 'mandala';
        const hasOpts = this._toolsWithOptions.includes(name) || showMandala;
        panel.classList.toggle('hidden', !hasOpts);
        panel.querySelectorAll('.tool-opts').forEach(opts => {
            if (showMandala && opts.dataset.tool === 'mandala') {
                opts.classList.add('active');
            } else {
                opts.classList.toggle('active', opts.dataset.tool === name);
            }
        });
    },

    // --- Tool Options Panel ---
    initToolOptions() {
        const panel = document.getElementById('tool-options');
        if (!panel) return;

        // Select tool: transform mode buttons
        panel.querySelectorAll('.to-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.to-btn[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.mode;
                const scaleOpts = document.getElementById('scale-opts');
                const rotateOpts = document.getElementById('rotate-opts');
                if (scaleOpts) scaleOpts.classList.toggle('hidden', mode !== 'scale');
                if (rotateOpts) rotateOpts.classList.toggle('hidden', mode !== 'rotate');
                this.emit('transform-mode-changed', mode);
            });
        });

        // Rotate quick buttons
        panel.querySelectorAll('.to-btn[data-rotate]').forEach(btn => {
            btn.addEventListener('click', () => {
                const angle = parseFloat(btn.dataset.rotate);
                if (this.selectedItems.length > 0) {
                    MB.History.snapshot();
                    this.selectedItems.forEach(item => {
                        item.rotate(angle, item.bounds.center);
                    });
                    this.emit('selection-changed', this.selectedItems);
                }
            });
        });

        // Rotate angle input
        const rotAngle = document.getElementById('rotate-angle');
        if (rotAngle) {
            rotAngle.addEventListener('change', () => {
                const angle = parseFloat(rotAngle.value) || 0;
                if (this.selectedItems.length > 0 && angle !== 0) {
                    MB.History.snapshot();
                    this.selectedItems.forEach(item => {
                        item.rotate(angle, item.bounds.center);
                    });
                    rotAngle.value = 0;
                    this.emit('selection-changed', this.selectedItems);
                }
            });
        }
    },

    // --- Selection ---
    select(items) {
        this.clearSelection();
        if (!Array.isArray(items)) items = [items];
        this.selectedItems = items.filter(Boolean);
        this.selectedItems.forEach(item => {
            item.selected = true;
        });

        this.emit('selection-changed', this.selectedItems);
    },

    addToSelection(item) {
        if (!item || this.selectedItems.includes(item)) return;
        this.selectedItems.push(item);
        item.selected = true;
        this.emit('selection-changed', this.selectedItems);
    },

    removeFromSelection(item) {
        const idx = this.selectedItems.indexOf(item);
        if (idx >= 0) {
            this.selectedItems.splice(idx, 1);
            item.selected = false;
            this.emit('selection-changed', this.selectedItems);
        }
    },

    clearSelection() {
        this.selectedItems.forEach(item => {
            if (item && !item._removed) item.selected = false;
        });
        this.selectedItems = [];
        this.emit('selection-changed', []);
    },

    deleteSelected() {
        if (this.selectedItems.length === 0) return;
        MB.History.snapshot();
        this.selectedItems.forEach(item => item.remove());
        this.clearSelection();
    },

    // --- Copy / Cut / Paste / Duplicate ---
    copySelected() {
        if (this.selectedItems.length === 0) return;
        this.clipboard = this.selectedItems.map(item => item.exportJSON());
        this._pasteOffset = 10;
        document.getElementById('status-info').textContent =
            'Copied ' + this.clipboard.length + ' item(s)';
    },

    cutSelected() {
        if (this.selectedItems.length === 0) return;
        this.copySelected();
        MB.History.snapshot();
        this.selectedItems.forEach(item => item.remove());
        this.clearSelection();
        document.getElementById('status-info').textContent =
            'Cut ' + this.clipboard.length + ' item(s)';
    },

    pasteClipboard() {
        if (!this.clipboard || this.clipboard.length === 0) return;
        MB.History.snapshot();
        const layer = MB.Layers.getActiveLayer();
        if (layer) layer.paperLayer.activate();
        const newItems = [];
        for (const json of this.clipboard) {
            const item = paper.project.activeLayer.importJSON(json);
            item.data = item.data || {};
            item.data.isUserItem = true;
            item.translate(new paper.Point(this._pasteOffset, this._pasteOffset));
            newItems.push(item);
        }
        this._pasteOffset += 10;
        this.select(newItems);
        document.getElementById('status-info').textContent =
            'Pasted ' + newItems.length + ' item(s)';
    },

    duplicateSelected() {
        if (this.selectedItems.length === 0) return;
        MB.History.snapshot();
        const newItems = [];
        for (const item of this.selectedItems) {
            const clone = item.clone();
            clone.data = clone.data || {};
            clone.data.isUserItem = true;
            clone.translate(new paper.Point(10, 10));
            clone.selected = false;
            newItems.push(clone);
        }
        this.select(newItems);
        document.getElementById('status-info').textContent =
            'Duplicated ' + newItems.length + ' item(s)';
    },

    // --- Collapsible Panels ---
    initCollapsiblePanels() {
        document.querySelectorAll('.panel-header.collapsible').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.panel-section').classList.toggle('collapsed');
            });
        });
    },

    // --- Menus ---
    initMenus() {
        const dropdown = document.getElementById('menu-dropdown');
        let activeMenu = null;

        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menuName = btn.dataset.menu;
                if (activeMenu === menuName) {
                    dropdown.classList.add('hidden');
                    activeMenu = null;
                    return;
                }
                activeMenu = menuName;
                dropdown.style.left = btn.offsetLeft + 'px';
                dropdown.classList.remove('hidden');
                dropdown.querySelectorAll('.menu-items').forEach(m => m.classList.remove('active'));
                dropdown.querySelector(`.menu-items[data-menu="${menuName}"]`).classList.add('active');
            });
        });

        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            activeMenu = null;
        });

        // Menu actions
        dropdown.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (btn) {
                this.handleAction(btn.dataset.action);
                dropdown.classList.add('hidden');
                activeMenu = null;
            }
        });

        // Toolbar actions (boolean ops etc)
        document.getElementById('toolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('.tool-btn[data-action]');
            if (btn) this.handleAction(btn.dataset.action);
            const toolBtn = e.target.closest('.tool-btn[data-tool]');
            if (toolBtn) {
                this.setTool(toolBtn.dataset.tool);
                // If transform mode button, also set the mode
                if (toolBtn.dataset.transformMode) {
                    const mode = toolBtn.dataset.transformMode;
                    document.querySelectorAll('.to-btn[data-mode]').forEach(b => b.classList.remove('active'));
                    const modeBtn = document.querySelector(`.to-btn[data-mode="${mode}"]`);
                    if (modeBtn) modeBtn.classList.add('active');
                    this.emit('transform-mode-changed', mode);
                }
            }
        });
    },

    handleAction(action) {
        switch (action) {
            case 'undo': MB.History.undo(); break;
            case 'redo': MB.History.redo(); break;
            case 'copy': this.copySelected(); break;
            case 'cut': this.cutSelected(); break;
            case 'paste': this.pasteClipboard(); break;
            case 'duplicate': this.duplicateSelected(); break;
            case 'select-all': this.selectAll(); break;
            case 'delete-selected': this.deleteSelected(); break;
            case 'group-selected': this.groupSelected(); break;
            case 'ungroup-selected': this.ungroupSelected(); break;
            case 'bool-unite': MB.BooleanOps.unite(); break;
            case 'bool-subtract': MB.BooleanOps.subtract(); break;
            case 'bool-intersect': MB.BooleanOps.intersect(); break;
            case 'bool-exclude': MB.BooleanOps.exclude(); break;
            case 'bool-divide': MB.BooleanOps.divide(); break;
            case 'new-project': MB.ProjectIO.newProject(); break;
            case 'open-project': document.getElementById('file-open-project').click(); break;
            case 'save-project': MB.ProjectIO.saveProject(); break;
            case 'import-svg': document.getElementById('file-import-svg').click(); break;
            case 'export-svg': MB.ProjectIO.exportSVG(); break;
            case 'zoom-in': MB.Canvas.zoomIn(); break;
            case 'zoom-out': MB.Canvas.zoomOut(); break;
            case 'zoom-fit': MB.Canvas.zoomFit(); break;
            case 'toggle-grid': MB.GridSnap.toggleGrid(); break;
            case 'toggle-snap': MB.GridSnap.toggleSnap(); break;
            case 'split-to-layer': MB.Layers.splitSelectionToNewLayer(); break;
            case 'move-to-layer': MB.Layers.showMoveToLayerDialog(); break;
            case 'merge-layers': MB.Layers.mergeDown(); break;
            case 'machine-settings': MB.Machine.openSettings(); break;
            case 'machine-connect': MB.Machine.connect(); break;
            case 'machine-home': MB.Machine.sendCommand('$H'); break;
            case 'machine-set-origin': MB.Machine.sendCommand('G92 X0 Y0'); break;
            case 'machine-goto-origin': MB.Machine.sendGoto(0, 0); break;
            case 'machine-frame': MB.Machine.frameJob && MB.Machine.frameJob(); break;
            case 'path-reverse': MB._nodeEditOps && MB._nodeEditOps.reverse(); break;
            case 'path-simplify': MB._nodeEditOps && MB._nodeEditOps.simplify(); break;
            case 'path-flatten': MB._nodeEditOps && MB._nodeEditOps.flatten(); break;
            case 'align-left': MB.Align.alignLeft(); break;
            case 'align-right': MB.Align.alignRight(); break;
            case 'align-top': MB.Align.alignTop(); break;
            case 'align-bottom': MB.Align.alignBottom(); break;
            case 'align-center-h': MB.Align.centerH(); break;
            case 'align-center-v': MB.Align.centerV(); break;
            case 'distribute-h': MB.Align.distributeH(); break;
            case 'distribute-v': MB.Align.distributeV(); break;
            case 'export-gcode': MB.GCode.exportFile(); break;
            case 'array-pattern': MB.ArrayPattern.openDialog(); break;
            case 'path-offset': MB.PathOffset.openDialog(); break;
        }
    },

    selectAll() {
        const layer = MB.Layers.getActiveLayer();
        if (!layer) return;
        const items = [];
        layer.paperLayer.children.forEach(child => {
            if (child.data && child.data.isUserItem) items.push(child);
        });
        this.select(items);
    },

    // --- Group / Ungroup ---
    groupSelected() {
        const items = this.selectedItems;
        if (items.length < 2) return;
        MB.History.snapshot();
        const group = new paper.Group(items);
        group.data = { isUserItem: true };
        this.select(group);
        document.getElementById('status-info').textContent = 'Grouped ' + items.length + ' items';
    },

    ungroupSelected() {
        const items = this.selectedItems;
        if (items.length !== 1 || !(items[0] instanceof paper.Group)) return;
        MB.History.snapshot();
        const group = items[0];
        const children = group.children.slice();
        const parent = group.parent;
        children.forEach(child => {
            child.data = child.data || {};
            child.data.isUserItem = true;
            parent.addChild(child);
        });
        group.remove();
        this.select(children);
        document.getElementById('status-info').textContent = 'Ungrouped ' + children.length + ' items';
    },

    // --- Canvas Context Menu ---
    showCanvasContextMenu(clientX, clientY, event) {
        const menu = document.getElementById('canvas-context-menu');
        if (!menu) return;

        // Hit-test at click point to auto-select
        const canvas = document.getElementById('main-canvas');
        const rect = canvas.getBoundingClientRect();
        const viewPt = new paper.Point(clientX - rect.left, clientY - rect.top);
        const projectPt = paper.view.viewToProject(viewPt);

        const hit = paper.project.hitTest(projectPt, {
            fill: true, stroke: true, segments: true, tolerance: 8 / paper.view.zoom
        });
        if (hit && hit.item) {
            // Walk to topmost isUserItem (so Groups are selected, not children)
            let target = null;
            let current = hit.item;
            while (current && current !== current.layer) {
                if (current.data && current.data.isUserItem) target = current;
                current = current.parent;
            }
            if (target && !this.selectedItems.includes(target)) {
                this.select(target);
            }
        }

        // Enable/disable buttons based on selection
        const items = this.selectedItems;
        const copyBtn = menu.querySelector('[data-action="ctx-copy"]');
        const cutBtn = menu.querySelector('[data-action="ctx-cut"]');
        const pasteBtn = menu.querySelector('[data-action="ctx-paste"]');
        const dupBtn = menu.querySelector('[data-action="ctx-duplicate"]');
        const groupBtn = menu.querySelector('[data-action="group"]');
        const ungroupBtn = menu.querySelector('[data-action="ungroup"]');
        const flattenBtn = menu.querySelector('[data-action="flatten-to-path"]');
        const deleteBtn = menu.querySelector('[data-action="delete-selected"]');

        if (copyBtn) copyBtn.disabled = items.length === 0;
        if (cutBtn) cutBtn.disabled = items.length === 0;
        if (pasteBtn) pasteBtn.disabled = !this.clipboard || this.clipboard.length === 0;
        if (dupBtn) dupBtn.disabled = items.length === 0;
        if (groupBtn) groupBtn.disabled = items.length < 2;
        if (ungroupBtn) ungroupBtn.disabled = !(items.length === 1 && items[0] instanceof paper.Group);
        if (flattenBtn) flattenBtn.disabled = !(items.length === 1 && MB.Parametric && MB.Parametric.isParametric(items[0]));
        if (deleteBtn) deleteBtn.disabled = items.length === 0;

        // Position menu
        menu.style.left = clientX + 'px';
        menu.style.top = clientY + 'px';
        menu.classList.remove('hidden');

        // Prevent going off-screen
        requestAnimationFrame(() => {
            const mr = menu.getBoundingClientRect();
            if (mr.right > window.innerWidth) menu.style.left = (clientX - mr.width) + 'px';
            if (mr.bottom > window.innerHeight) menu.style.top = (clientY - mr.height) + 'px';
        });

        // Close handler
        const close = () => {
            menu.classList.add('hidden');
            document.removeEventListener('click', close);
            document.removeEventListener('contextmenu', close);
        };
        setTimeout(() => {
            document.addEventListener('click', close);
            document.addEventListener('contextmenu', close);
        }, 0);
    },

    _initContextMenu() {
        const menu = document.getElementById('canvas-context-menu');
        if (!menu) return;
        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn || btn.disabled) return;
            const action = btn.dataset.action;
            switch (action) {
                case 'ctx-copy': this.copySelected(); break;
                case 'ctx-cut': this.cutSelected(); break;
                case 'ctx-paste': this.pasteClipboard(); break;
                case 'ctx-duplicate': this.duplicateSelected(); break;
                case 'group': this.groupSelected(); break;
                case 'ungroup': this.ungroupSelected(); break;
                case 'flatten-to-path':
                    if (this.selectedItems.length === 1 && MB.Parametric.isParametric(this.selectedItems[0])) {
                        MB.History.snapshot();
                        MB.Parametric.flatten(this.selectedItems[0]);
                        this.emit('selection-changed', this.selectedItems);
                    }
                    break;
                case 'delete-selected': this.deleteSelected(); break;
            }
            menu.classList.add('hidden');
        });
    },

    // --- Keyboard ---
    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't capture when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;

            // Ctrl/Cmd shortcuts
            if (ctrl && e.key === 'z') { e.preventDefault(); MB.History.undo(); }
            else if (ctrl && e.key === 'Z') { e.preventDefault(); MB.History.redo(); }
            else if (ctrl && e.key === 'a') { e.preventDefault(); this.selectAll(); }
            else if (ctrl && (e.key === 'c' || e.key === 'C') && !shift) { e.preventDefault(); this.copySelected(); }
            else if (ctrl && (e.key === 'x' || e.key === 'X') && !shift) { e.preventDefault(); this.cutSelected(); }
            else if (ctrl && (e.key === 'v' || e.key === 'V') && !shift) { e.preventDefault(); this.pasteClipboard(); }
            else if (ctrl && (e.key === 'd' || e.key === 'D') && !shift) { e.preventDefault(); this.duplicateSelected(); }
            else if (ctrl && shift && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); this.ungroupSelected(); }
            else if (ctrl && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); this.groupSelected(); }
            // Single-key shortcuts (only when Ctrl/Cmd is NOT held)
            else if (!ctrl && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); this.deleteSelected(); }
            else if (!ctrl && (e.key === 'v' || e.key === 'V')) { this.setTool('select'); }
            else if (!ctrl && (e.key === 'l' || e.key === 'L')) { this.setTool('line'); }
            else if (!ctrl && (e.key === 'p' || e.key === 'P')) { this.setTool('pen'); }
            else if (!ctrl && (e.key === 'r' || e.key === 'R')) { this.setTool('rect'); }
            else if (!ctrl && (e.key === 'c' || e.key === 'C') && this.activeTool !== 'node-edit') { this.setTool('circle'); }
            else if (!ctrl && (e.key === 'q' || e.key === 'Q')) { this.setTool('polygon'); }
            else if (!ctrl && (e.key === 'n' || e.key === 'N')) { this.setTool('node-edit'); }
            else if (!ctrl && (e.key === 'm' || e.key === 'M')) { this.setTool('ruler'); }
            else if (!ctrl && (e.key === 't' || e.key === 'T')) { this.setTool('text'); }
            else if (!ctrl && (e.key === 'd' || e.key === 'D')) { MB.Mandala.toggleActive(); }
            else if (!ctrl && (e.key === 'g' || e.key === 'G')) { MB.GridSnap.toggleGrid(); }
            else if (!ctrl && (e.key === 's' || e.key === 'S') && this.activeTool !== 'node-edit') { MB.GridSnap.toggleSnap(); }
            // Transform mode shortcuts (1/2/3) — work from any tool
            else if (!ctrl && e.key === '1') {
                this.setTool('select');
                document.querySelector('.to-btn[data-mode="move"]')?.click();
            }
            else if (!ctrl && e.key === '2') {
                this.setTool('select');
                document.querySelector('.to-btn[data-mode="scale"]')?.click();
            }
            else if (!ctrl && e.key === '3') {
                this.setTool('select');
                document.querySelector('.to-btn[data-mode="rotate"]')?.click();
            }
            else if (e.key === 'Escape') {
                if (this.tools[this.activeTool] && this.tools[this.activeTool].cancel) {
                    this.tools[this.activeTool].cancel();
                } else {
                    this.clearSelection();
                }
            }
        });
    }
};

// Boot
window.addEventListener('load', () => {
    paper.install(window);
    MB.App.init();
});
