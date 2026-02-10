// MandalaBurn - Laser Simulator
MB.Simulator = {
    state: 'idle',      // 'idle' | 'running' | 'paused'
    commands: [],       // compiled job [{type, from, to, speed, power, color, airAssist, layerName, mode, pass, totalPasses}]
    cmdTimes: [],       // cumulative end-time for each command (seconds)
    totalTime: 0,
    simTime: 0,
    speedMult: 1,
    simLayer: null,
    marker: null,
    _lastFrame: 0,
    _rafId: null,
    _trailIdx: 0,       // index of last drawn trail command
    _currentPos: { x: 0, y: 0 },
    _currentTrailPath: null,   // current open polyline for batching cut segments
    _currentTrailColor: null,

    init() {
        // Create overlay layer (above all user layers)
        this.simLayer = new paper.Layer({ name: 'simulator' });
        this.simLayer.visible = false;
        // Ensure user layer is active
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();

        this._wireUI();
    },

    // ---- Job Compilation ----

    compile() {
        this.commands = [];
        this.cmdTimes = [];
        this.totalTime = 0;
        this._trailIdx = 0;
        this._currentPos = { x: 0, y: 0 };

        const rapidSpeed = (MB.Machine.settings.maxSpeed || 6000) / 60; // mm/min → mm/s

        // Force ephemeral layers to be up-to-date before compiling
        if (MB.Symmetry) try { MB.Symmetry.rebuildAll(); } catch (e) {}
        if (MB.Mandala && MB.Mandala.active) try { MB.Mandala.rebuildMirrors(); } catch (e) {}

        let pos = { x: 0, y: 0 };
        let _dbgOrig = 0, _dbgMandala = 0, _dbgSym = 0;

        const hasMandala = !!(MB.Mandala && MB.Mandala.active && MB.Mandala._mirrorLayer);

        MB.Layers.layers.forEach(layer => {
            if (!layer.output || !layer.visible) return;
            const ls = layer.laserSettings;
            const passes = ls.passes || 1;

            for (let pass = 1; pass <= passes; pass++) {
                layer.paperLayer.children.forEach(item => {
                    if (!item.data || !item.data.isUserItem) return;

                    const isHidden = item.data._hiddenBySym &&
                        MB.Symmetry && MB.Symmetry._symmetryLayer;

                    if (isHidden && !hasMandala) {
                        // Hidden by symmetry, no mandala: compile symmetry copies
                        MB.Symmetry._symmetryLayer.children.forEach(copy => {
                            if (copy.data && copy.data.symmetryOriginal === item) {
                                this._compileItem(copy, layer, ls, pass, passes, rapidSpeed, pos);
                                _dbgSym++;
                                if (this.commands.length > 0) {
                                    const last = this.commands[this.commands.length - 1];
                                    pos = { x: last.to.x, y: last.to.y };
                                }
                            }
                        });
                        return;
                    }

                    if (!isHidden) {
                        // Visible item: compile directly
                        this._compileItem(item, layer, ls, pass, passes, rapidSpeed, pos);
                        _dbgOrig++;
                        if (this.commands.length > 0) {
                            const last = this.commands[this.commands.length - 1];
                            pos = { x: last.to.x, y: last.to.y };
                        }
                    }
                    // Note: if hidden + mandala active, skip original — mandala copy at i=0 covers it

                    // Compile mandala copies of this item
                    if (hasMandala) {
                        MB.Mandala._mirrorLayer.children.forEach(copy => {
                            if (copy.data && copy.data.mandalaSource === item) {
                                this._compileItem(copy, layer, ls, pass, passes, rapidSpeed, pos);
                                _dbgMandala++;
                                if (this.commands.length > 0) {
                                    const last = this.commands[this.commands.length - 1];
                                    pos = { x: last.to.x, y: last.to.y };
                                }
                            }
                        });
                    }
                });
            }
        });

        console.log('[Simulator compile]', _dbgOrig, 'originals,', _dbgMandala, 'mandala,', _dbgSym, 'symmetry =', _dbgOrig + _dbgMandala + _dbgSym, 'items,', this.commands.length, 'commands');

        // Rapid back to origin at end
        if (pos.x !== 0 || pos.y !== 0) {
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            this.commands.push({
                type: 'rapid', from: { ...pos }, to: { x: 0, y: 0 },
                speed: rapidSpeed, power: 0, color: '#666',
                airAssist: false, layerName: '', mode: '', pass: 0, totalPasses: 0
            });
        }

        // Build cumulative time array
        let t = 0;
        this.cmdTimes = this.commands.map(cmd => {
            const dx = cmd.to.x - cmd.from.x;
            const dy = cmd.to.y - cmd.from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const duration = dist / (cmd.speed || 1);
            t += duration;
            return t;
        });
        this.totalTime = t;
    },

    _compileItem(item, layer, ls, pass, totalPasses, rapidSpeed, pos) {
        const color = layer.color;
        const baseCmd = {
            power: ls.power, color: color, airAssist: ls.airAssist,
            layerName: layer.name, mode: ls.mode, pass: pass, totalPasses: totalPasses
        };

        if (item instanceof paper.Group) {
            item.children.forEach(child => {
                if (child.data && child.data.isUserItem !== false) {
                    this._compileItem(child, layer, ls, pass, totalPasses, rapidSpeed, pos);
                    if (this.commands.length > 0) {
                        const last = this.commands[this.commands.length - 1];
                        pos.x = last.to.x;
                        pos.y = last.to.y;
                    }
                }
            });
            return;
        }

        if (item instanceof paper.CompoundPath) {
            item.children.forEach(child => {
                this._compilePath(child, ls.speed, rapidSpeed, baseCmd, pos);
                if (this.commands.length > 0) {
                    const last = this.commands[this.commands.length - 1];
                    pos.x = last.to.x;
                    pos.y = last.to.y;
                }
            });
            return;
        }

        if (item instanceof paper.Path) {
            this._compilePath(item, ls.speed, rapidSpeed, baseCmd, pos);
        }
    },

    _compilePath(path, cutSpeed, rapidSpeed, baseCmd, pos) {
        if (!path.segments || path.segments.length < 2) return;
        const len = path.length;
        if (len < 0.01) return;

        // Sample step: 0.5mm for smooth curves (matches real laser resolution)
        const step = 0.5;

        // First point — rapid move to start
        const startPt = path.getPointAt(0);
        if (!startPt) return;

        const rapDx = startPt.x - pos.x;
        const rapDy = startPt.y - pos.y;
        if (Math.abs(rapDx) > 0.01 || Math.abs(rapDy) > 0.01) {
            this.commands.push({
                type: 'rapid',
                from: { x: pos.x, y: pos.y },
                to: { x: startPt.x, y: startPt.y },
                speed: rapidSpeed,
                ...baseCmd, power: 0
            });
        }

        // Cut along path
        let prevPt = startPt;
        for (let offset = step; offset < len; offset += step) {
            const pt = path.getPointAt(offset);
            if (!pt) continue;
            this.commands.push({
                type: 'cut',
                from: { x: prevPt.x, y: prevPt.y },
                to: { x: pt.x, y: pt.y },
                speed: cutSpeed,
                ...baseCmd
            });
            prevPt = pt;
        }

        // Final segment to exact end (or back to start if closed)
        const endPt = path.closed ? startPt : path.getPointAt(len);
        if (endPt) {
            const dx = endPt.x - prevPt.x;
            const dy = endPt.y - prevPt.y;
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                this.commands.push({
                    type: 'cut',
                    from: { x: prevPt.x, y: prevPt.y },
                    to: { x: endPt.x, y: endPt.y },
                    speed: cutSpeed,
                    ...baseCmd
                });
            }
        }
    },

    // ---- Playback Controls ----

    play() {
        if (this.state === 'running') return;

        if (this.state === 'idle') {
            this.compile();
            if (this.commands.length === 0) {
                document.getElementById('status-info').textContent = 'Simulator: nothing to simulate (no paths on output layers)';
                return;
            }
            this.simTime = 0;
            this._trailIdx = 0;
            this._clearSimLayer();
            this.simLayer.visible = true;
        }

        // If paused at the very end, restart from beginning
        if (this.state === 'paused' && this.simTime >= this.totalTime) {
            this.simTime = 0;
            this._trailIdx = 0;
            this._clearSimLayer();
            this.simLayer.visible = true;
        }

        this.state = 'running';
        this._lastFrame = performance.now();
        this._rafId = requestAnimationFrame(ts => this._tick(ts));
        this._updateButtons();
    },

    pause() {
        if (this.state !== 'running') return;
        this.state = 'paused';
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._updateButtons();
    },

    stop() {
        this.state = 'idle';
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._clearSimLayer();
        this.simLayer.visible = false;
        this.simTime = 0;
        this._trailIdx = 0;
        this._currentPos = { x: 0, y: 0 };
        this._updateButtons();
        this._updateUI();
        // Reactivate user layer
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();
    },

    // ---- Animation ----

    _tick(timestamp) {
        if (this.state !== 'running') return;

        const dt = (timestamp - this._lastFrame) / 1000; // seconds
        this._lastFrame = timestamp;

        // Advance simulation time
        this.simTime += dt * this.speedMult;

        if (this.simTime >= this.totalTime) {
            this.simTime = this.totalTime;
            this._drawUpTo(this.simTime);
            this._updateUI();
            // Finished — go to paused so trail stays visible & replay works
            this.state = 'paused';
            this._rafId = null;
            this._updateButtons();
            document.getElementById('status-info').textContent = 'Simulator: complete';
            return;
        }

        this._drawUpTo(this.simTime);
        this._updateUI();

        this._rafId = requestAnimationFrame(ts => this._tick(ts));
    },

    _drawUpTo(time) {
        this.simLayer.activate();
        const zoom = paper.view.zoom;

        // Draw completed trail segments
        while (this._trailIdx < this.commands.length &&
               this.cmdTimes[this._trailIdx] <= time) {
            const cmd = this.commands[this._trailIdx];
            this._drawTrailSegment(cmd, zoom);
            this._trailIdx++;
        }

        // Find current command and interpolate position
        let cmdIdx = this._trailIdx;
        if (cmdIdx >= this.commands.length) cmdIdx = this.commands.length - 1;

        const cmd = this.commands[cmdIdx];
        if (!cmd) return;

        const cmdStart = cmdIdx > 0 ? this.cmdTimes[cmdIdx - 1] : 0;
        const cmdEnd = this.cmdTimes[cmdIdx];
        const cmdDur = cmdEnd - cmdStart;
        const elapsed = time - cmdStart;
        const t = cmdDur > 0 ? Math.min(1, elapsed / cmdDur) : 1;

        const cx = cmd.from.x + (cmd.to.x - cmd.from.x) * t;
        const cy = cmd.from.y + (cmd.to.y - cmd.from.y) * t;

        // Draw partial trail for current cutting segment
        if (cmd.type === 'cut' && t > 0 && t < 1) {
            // Remove previous partial trail
            if (this._partialTrail) { this._partialTrail.remove(); this._partialTrail = null; }
            this._partialTrail = new paper.Path.Line({
                from: [cmd.from.x, cmd.from.y],
                to: [cx, cy],
                strokeColor: cmd.color,
                strokeWidth: 1.5 / zoom
            });
        } else if (this._partialTrail) {
            this._partialTrail.remove();
            this._partialTrail = null;
        }

        this._drawMarker(cx, cy);
        this._currentPos = { x: cx, y: cy };

        // Reactivate user layer so tools still work
        const al = MB.Layers.getActiveLayer();
        if (al) al.paperLayer.activate();
    },

    _drawTrailSegment(cmd, zoom) {
        if (cmd.type === 'cut') {
            // Batch consecutive cuts into a single polyline path for performance
            if (this._currentTrailPath && this._currentTrailColor === cmd.color) {
                this._currentTrailPath.add(new paper.Point(cmd.to.x, cmd.to.y));
            } else {
                this._currentTrailPath = new paper.Path({
                    segments: [[cmd.from.x, cmd.from.y], [cmd.to.x, cmd.to.y]],
                    strokeColor: cmd.color,
                    strokeWidth: 1.5 / zoom,
                    parent: this.simLayer
                });
                this._currentTrailColor = cmd.color;
            }
        } else {
            // Rapid move breaks the polyline chain
            this._currentTrailPath = null;
            this._currentTrailColor = null;
            // Rapid move — faint dashed line
            new paper.Path.Line({
                from: [cmd.from.x, cmd.from.y],
                to: [cmd.to.x, cmd.to.y],
                strokeColor: '#888',
                strokeWidth: 0.5 / zoom,
                dashArray: [3 / zoom, 3 / zoom],
                opacity: 0.4,
                parent: this.simLayer
            });
        }
    },

    _drawMarker(x, y) {
        if (this.marker) this.marker.remove();
        const s = 8 / paper.view.zoom;
        const w = 2 / paper.view.zoom;
        this.marker = new paper.Group({
            children: [
                new paper.Path.Line({ from: [x - s, y - s], to: [x + s, y + s], strokeColor: '#ff3333', strokeWidth: w }),
                new paper.Path.Line({ from: [x + s, y - s], to: [x - s, y + s], strokeColor: '#ff3333', strokeWidth: w }),
                new paper.Path.Circle({ center: [x, y], radius: s * 0.3, strokeColor: '#ff3333', strokeWidth: w * 0.7, fillColor: null })
            ],
            parent: this.simLayer
        });
    },

    _clearSimLayer() {
        if (this.simLayer) this.simLayer.removeChildren();
        this.marker = null;
        this._partialTrail = null;
        this._currentTrailPath = null;
        this._currentTrailColor = null;
    },

    // ---- UI ----

    _wireUI() {
        document.getElementById('sim-play').addEventListener('click', () => this.play());
        document.getElementById('sim-pause').addEventListener('click', () => this.pause());
        document.getElementById('sim-stop').addEventListener('click', () => this.stop());

        // Speed buttons
        document.getElementById('sim-speed-group').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-speed]');
            if (!btn) return;
            this.speedMult = parseInt(btn.dataset.speed);
            document.querySelectorAll('#sim-speed-group .bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        // Progress bar click → seek
        document.getElementById('sim-progress').addEventListener('click', (e) => {
            // If idle with no compiled job, compile first
            if (this.state === 'idle') {
                this.compile();
                if (this.commands.length === 0) return;
            }
            if (this.totalTime <= 0) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.simTime = pct * this.totalTime;

            // Rebuild trail up to new time
            this._clearSimLayer();
            this._trailIdx = 0;
            this.simLayer.visible = true;
            this._drawUpTo(this.simTime);
            this._updateUI();

            // If was idle, transition to paused so controls work
            if (this.state === 'idle') {
                this.state = 'paused';
                this._updateButtons();
            }
        });
    },

    _updateButtons() {
        const playBtn = document.getElementById('sim-play');
        const pauseBtn = document.getElementById('sim-pause');
        const stopBtn = document.getElementById('sim-stop');

        playBtn.disabled = (this.state === 'running');
        pauseBtn.disabled = (this.state !== 'running');
        stopBtn.disabled = (this.state === 'idle');

        playBtn.textContent = this.state === 'paused' ? '\u25B6 Resume' : '\u25B6 Play';
    },

    _updateUI() {
        // Progress
        const pct = this.totalTime > 0 ? (this.simTime / this.totalTime * 100) : 0;
        document.getElementById('sim-progress-fill').style.width = pct + '%';

        // Time
        document.getElementById('sim-time').textContent =
            this._fmtTime(this.simTime) + ' / ' + this._fmtTime(this.totalTime);

        // Current command params
        let cmd = null;
        if (this.commands.length > 0) {
            // Find current command by time
            let idx = 0;
            for (let i = 0; i < this.cmdTimes.length; i++) {
                if (this.cmdTimes[i] >= this.simTime) { idx = i; break; }
                idx = i;
            }
            cmd = this.commands[idx];
        }

        if (cmd && cmd.layerName) {
            document.getElementById('sim-layer').textContent = cmd.layerName;
            document.getElementById('sim-pass').textContent = cmd.totalPasses > 0
                ? cmd.pass + ' / ' + cmd.totalPasses : '\u2014';
            document.getElementById('sim-speed').textContent = cmd.speed.toFixed(0) + ' mm/s';
            document.getElementById('sim-power').textContent = cmd.power + '%';
            document.getElementById('sim-air').textContent = cmd.airAssist ? 'ON' : 'OFF';
            document.getElementById('sim-mode').textContent = cmd.mode || '\u2014';
        } else {
            document.getElementById('sim-layer').textContent = '\u2014';
            document.getElementById('sim-pass').textContent = '\u2014';
            document.getElementById('sim-speed').textContent = '\u2014';
            document.getElementById('sim-power').textContent = '\u2014';
            document.getElementById('sim-air').textContent = '\u2014';
            document.getElementById('sim-mode').textContent = '\u2014';
        }
    },

    _fmtTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
};
