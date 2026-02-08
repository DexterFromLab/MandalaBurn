// MandalaBurn - Job Sender (stream G-code to machine via WebSocket)
MB.JobSender = {
    state: 'idle',  // 'idle' | 'running' | 'paused'
    lines: [],
    lineIdx: 0,
    pending: 0,     // lines sent but not yet ack'd
    maxAhead: 3,    // flow control: max unacknowledged lines

    init() {
        this._wireUI();

        // Listen for 'ok' responses from machine
        const origHandler = MB.Machine.handleMessage.bind(MB.Machine);
        MB.Machine.handleMessage = (msg) => {
            if (msg.type === 'ok') {
                this._onOk();
            }
            origHandler(msg);
        };
    },

    start() {
        if (this.state === 'running') return;

        if (this.state === 'idle') {
            // Compile and generate G-code
            MB.Simulator.compile();
            const commands = MB.Simulator.commands;
            if (commands.length === 0) {
                document.getElementById('status-info').textContent =
                    'Nothing to send (no paths on output layers)';
                return;
            }
            const gcode = MB.GCode.generate(commands, MB.Machine.settings);
            this.lines = gcode.split('\n').filter(l => l.trim() && !l.startsWith(';'));
            this.lineIdx = 0;
            this.pending = 0;
        }

        this.state = 'running';
        this._updateUI();
        this._sendBatch();
    },

    pause() {
        if (this.state !== 'running') return;
        this.state = 'paused';
        // GRBL feed hold
        MB.Machine.sendCommand('!');
        this._updateUI();
    },

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'running';
        // GRBL resume
        MB.Machine.sendCommand('~');
        this._updateUI();
        this._sendBatch();
    },

    stop() {
        if (this.state === 'idle') return;
        // GRBL soft reset
        MB.Machine.sendCommand('\x18');
        this.state = 'idle';
        this.lines = [];
        this.lineIdx = 0;
        this.pending = 0;
        this._updateUI();
        document.getElementById('status-info').textContent = 'Job stopped';
    },

    _sendBatch() {
        if (this.state !== 'running') return;
        while (this.pending < this.maxAhead && this.lineIdx < this.lines.length) {
            MB.Machine.sendCommand(this.lines[this.lineIdx]);
            this.lineIdx++;
            this.pending++;
        }
        this._updateProgress();

        // Check if all lines sent and acknowledged
        if (this.lineIdx >= this.lines.length && this.pending === 0) {
            this.state = 'idle';
            this._updateUI();
            document.getElementById('status-info').textContent = 'Job complete!';
        }
    },

    _onOk() {
        if (this.state === 'idle') return;
        this.pending = Math.max(0, this.pending - 1);
        this._sendBatch();
    },

    _updateProgress() {
        const total = this.lines.length;
        const done = this.lineIdx - this.pending;
        const pct = total > 0 ? (done / total * 100) : 0;

        const bar = document.getElementById('job-progress-fill');
        const text = document.getElementById('job-progress-text');
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = done + ' / ' + total + ' lines (' + Math.round(pct) + '%)';
    },

    _updateUI() {
        const startBtn = document.getElementById('job-start');
        const pauseBtn = document.getElementById('job-pause');
        const stopBtn = document.getElementById('job-stop');

        if (startBtn) {
            startBtn.disabled = this.state === 'running';
            startBtn.textContent = this.state === 'paused' ? 'Resume' : 'Start';
        }
        if (pauseBtn) pauseBtn.disabled = this.state !== 'running';
        if (stopBtn) stopBtn.disabled = this.state === 'idle';

        this._updateProgress();
    },

    _wireUI() {
        const startBtn = document.getElementById('job-start');
        const pauseBtn = document.getElementById('job-pause');
        const stopBtn = document.getElementById('job-stop');

        if (startBtn) startBtn.addEventListener('click', () => {
            if (this.state === 'paused') this.resume();
            else this.start();
        });
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stop());
    }
};
