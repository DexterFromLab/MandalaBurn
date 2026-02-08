// MandalaBurn - Machine Settings, Jog Control, Laser Position
MB.Machine = {
    // Machine settings (saved to project)
    settings: {
        name: 'My Laser',
        model: '',
        controller: 'grbl',
        width: 300,
        height: 200,
        origin: 'top-left',
        maxSpeed: 6000,     // mm/min
        maxPower: 1000,     // S value for 100%
        resolution: 0.1,    // mm/step
        port: '',
        baud: 115200
    },

    // Runtime state
    connected: false,
    laserPointerOn: false,
    laserPos: { x: 0, y: 0 },
    ws: null,
    _posMarker: null,

    init() {
        this.initJogPanel();
        this.initSettingsDialog();
        this.initPositionMarker();

        // Wire machine-settings button in right panel
        const panelBtn = document.querySelector('.panel-wide-btn[data-action="machine-settings"]');
        if (panelBtn) panelBtn.addEventListener('click', () => this.openSettings());

        // Apply saved workspace size
        this.applyWorkspaceSize();
    },

    // ===================== Jog Panel =====================

    initJogPanel() {
        const panel = document.getElementById('jog-panel');
        if (!panel) return;

        // Jog button clicks
        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('.jog-btn');
            if (!btn) return;
            const action = btn.dataset.jog;
            this.handleJog(action, btn);
        });

        // Go-to button
        document.getElementById('goto-btn').addEventListener('click', () => {
            const x = parseFloat(document.getElementById('goto-x').value);
            const y = parseFloat(document.getElementById('goto-y').value);
            if (!isNaN(x) && !isNaN(y)) {
                this.sendGoto(x, y);
            }
        });
    },

    handleJog(action, btn) {
        const step = parseFloat(document.getElementById('jog-step').value) || 1;
        const speed = parseInt(document.getElementById('jog-speed').value) || 1000;

        switch (action) {
            case 'up':    this.sendJog(0, -step, speed); break;
            case 'down':  this.sendJog(0, step, speed); break;
            case 'left':  this.sendJog(-step, 0, speed); break;
            case 'right': this.sendJog(step, 0, speed); break;
            case 'home':  this.sendCommand('$H'); break;
            case 'stop':  this.sendCommand('!'); break;  // GRBL feed hold / emergency
            case 'set-origin':
                this.sendCommand('G92 X0 Y0');
                this.laserPos = { x: 0, y: 0 };
                this.updatePositionDisplay();
                break;
            case 'goto-origin': this.sendGoto(0, 0); break;
            case 'laser-toggle':
                this.laserPointerOn = !this.laserPointerOn;
                btn.classList.toggle('laser-on', this.laserPointerOn);
                if (this.laserPointerOn) {
                    // Very low power for positioning (0.5% of max)
                    this.sendCommand('M3 S' + Math.round(this.settings.maxPower * 0.005));
                } else {
                    this.sendCommand('M5 S0');
                }
                break;
        }
    },

    sendJog(dx, dy, speed) {
        if (!this.connected) {
            // Simulate movement locally
            this.laserPos.x += dx;
            this.laserPos.y += dy;
            this.updatePositionDisplay();
            this.updatePositionMarker();
            return;
        }
        // GRBL jog command: $J=G91 Xn Yn Fn
        const cmd = `$J=G91 X${dx} Y${dy} F${speed}`;
        this.sendCommand(cmd);
    },

    sendGoto(x, y) {
        const speed = parseInt(document.getElementById('jog-speed').value) || 1000;
        if (!this.connected) {
            this.laserPos.x = x;
            this.laserPos.y = y;
            this.updatePositionDisplay();
            this.updatePositionMarker();
            return;
        }
        this.sendCommand(`G90 G0 X${x} Y${y} F${speed}`);
    },

    sendCommand(cmd) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'gcode', data: cmd }));
        } else {
            // Not connected - log to status
            document.getElementById('status-info').textContent = 'Not connected: ' + cmd;
        }
    },

    updatePositionDisplay() {
        document.getElementById('laser-pos-x').textContent = 'X: ' + this.laserPos.x.toFixed(2);
        document.getElementById('laser-pos-y').textContent = 'Y: ' + this.laserPos.y.toFixed(2);
    },

    // ===================== Position Marker on Canvas =====================

    initPositionMarker() {
        this._posMarker = null;
        this.updatePositionMarker();
    },

    updatePositionMarker() {
        // Draw crosshair on canvas at laser position
        if (this._posMarker) this._posMarker.remove();

        const prevActive = paper.project.activeLayer;
        MB.Canvas.bgLayer.activate();

        const x = this.laserPos.x;
        const y = this.laserPos.y;
        const size = 6 / paper.view.zoom; // constant screen size

        const group = new paper.Group();

        // Crosshair lines
        const h = new paper.Path.Line({
            from: [x - size, y],
            to: [x + size, y],
            strokeColor: '#ff4444',
            strokeWidth: 1.2 / paper.view.zoom
        });
        const v = new paper.Path.Line({
            from: [x, y - size],
            to: [x, y + size],
            strokeColor: '#ff4444',
            strokeWidth: 1.2 / paper.view.zoom
        });
        // Small dot center
        const dot = new paper.Path.Circle({
            center: [x, y],
            radius: 1.5 / paper.view.zoom,
            fillColor: '#ff4444'
        });

        group.addChildren([h, v, dot]);
        group.locked = true;
        group.data = { isLaserMarker: true };
        this._posMarker = group;

        prevActive.activate();
    },

    // ===================== Connection (WebSocket) =====================

    connect() {
        if (this.connected) {
            this.disconnect();
            return;
        }

        this.setConnectionState('connecting');
        const wsUrl = `ws://${window.location.host}/ws/machine`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            this.setConnectionState('connected');
            // Send connection settings
            this.ws.send(JSON.stringify({
                type: 'connect',
                port: this.settings.port,
                baud: this.settings.baud
            }));
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.setConnectionState('disconnected');
        };

        this.ws.onerror = () => {
            this.connected = false;
            this.setConnectionState('disconnected');
            document.getElementById('status-info').textContent = 'Connection failed';
        };
    },

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.setConnectionState('disconnected');
    },

    handleMessage(msg) {
        switch (msg.type) {
            case 'position':
                this.laserPos.x = msg.x;
                this.laserPos.y = msg.y;
                this.updatePositionDisplay();
                this.updatePositionMarker();
                break;
            case 'status':
                document.getElementById('status-info').textContent = msg.text;
                break;
            case 'ports':
                this.populatePortList(msg.ports);
                break;
            case 'error':
                document.getElementById('status-info').textContent = 'Error: ' + msg.text;
                break;
            case 'connected':
                this.setConnectionState('connected');
                document.getElementById('status-info').textContent = 'Connected to ' + (msg.port || 'machine');
                break;
            case 'disconnected':
                this.connected = false;
                this.setConnectionState('disconnected');
                break;
        }
    },

    setConnectionState(state) {
        const el = document.getElementById('connection-status');
        el.className = 'conn-' + state;
        const label = el.querySelector('.conn-label');
        label.textContent = state.charAt(0).toUpperCase() + state.slice(1);
        el.title = state;
    },

    // ===================== Machine Settings Dialog =====================

    initSettingsDialog() {
        document.getElementById('ms-save').addEventListener('click', () => this.saveSettings());
        document.getElementById('ms-cancel').addEventListener('click', () => this.closeSettings());
        document.getElementById('ms-refresh-ports').addEventListener('click', () => this.requestPorts());

        // Connection status click = connect/disconnect
        document.getElementById('connection-status').addEventListener('click', () => this.connect());
    },

    openSettings() {
        const s = this.settings;
        document.getElementById('ms-name').value = s.name;
        document.getElementById('ms-model').value = s.model;
        document.getElementById('ms-controller').value = s.controller;
        document.getElementById('ms-width').value = s.width;
        document.getElementById('ms-height').value = s.height;
        document.getElementById('ms-origin').value = s.origin;
        document.getElementById('ms-max-speed').value = s.maxSpeed;
        document.getElementById('ms-max-power').value = s.maxPower;
        document.getElementById('ms-resolution').value = s.resolution;
        document.getElementById('ms-baud').value = s.baud;

        // Request port list from backend
        this.requestPorts();

        document.getElementById('machine-settings-dialog').classList.remove('hidden');
    },

    closeSettings() {
        document.getElementById('machine-settings-dialog').classList.add('hidden');
    },

    saveSettings() {
        this.settings.name = document.getElementById('ms-name').value;
        this.settings.model = document.getElementById('ms-model').value;
        this.settings.controller = document.getElementById('ms-controller').value;
        this.settings.width = parseFloat(document.getElementById('ms-width').value) || 300;
        this.settings.height = parseFloat(document.getElementById('ms-height').value) || 200;
        this.settings.origin = document.getElementById('ms-origin').value;
        this.settings.maxSpeed = parseFloat(document.getElementById('ms-max-speed').value) || 6000;
        this.settings.maxPower = parseFloat(document.getElementById('ms-max-power').value) || 1000;
        this.settings.resolution = parseFloat(document.getElementById('ms-resolution').value) || 0.1;
        this.settings.port = document.getElementById('ms-port').value;
        this.settings.baud = parseInt(document.getElementById('ms-baud').value) || 115200;

        this.applyWorkspaceSize();
        this.closeSettings();
        document.getElementById('status-info').textContent = 'Machine settings saved';
    },

    applyWorkspaceSize() {
        MB.Canvas.wsWidth = this.settings.width;
        MB.Canvas.wsHeight = this.settings.height;
        document.getElementById('canvas-w').value = this.settings.width;
        document.getElementById('canvas-h').value = this.settings.height;
        MB.Canvas.drawWorkspace();
    },

    requestPorts() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'list_ports' }));
        } else {
            // Fetch via REST
            fetch('/api/ports')
                .then(r => r.json())
                .then(data => this.populatePortList(data.ports || []))
                .catch(() => this.populatePortList([]));
        }
    },

    populatePortList(ports) {
        const select = document.getElementById('ms-port');
        const current = select.value;
        select.innerHTML = '<option value="">-- Select --</option>';
        ports.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.device || p;
            opt.textContent = (p.device || p) + (p.description ? ' - ' + p.description : '');
            select.appendChild(opt);
        });
        if (current) select.value = current;
    },

    // Serialize for project save
    toJSON() {
        return { ...this.settings };
    },

    // Load from project
    fromJSON(data) {
        if (!data) return;
        Object.assign(this.settings, data);
        this.applyWorkspaceSize();
    }
};
