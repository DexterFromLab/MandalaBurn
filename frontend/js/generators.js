// MandalaBurn - Parametric Curve Generators
(function() {

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

MB.Generators = {
    _currentType: 'spirograph',
    _liveItem: null,        // currently live-edited item
    _snapshotDone: false,   // history snapshot taken for this editing session

    _presets: {
        spirograph: {
            'Classic':   { R: 50, r: 20, d: 15, mode: 'hypo' },
            'Star':      { R: 50, r: 30, d: 30, mode: 'hypo' },
            'Flower':    { R: 50, r: 10, d: 8,  mode: 'hypo' },
            'Epicycloid':{ R: 40, r: 15, d: 15, mode: 'epi'  }
        },
        rose: {
            '3 petals':  { a: 50, n: 3, d: 1 },
            '5 petals':  { a: 50, n: 5, d: 1 },
            '8 petals':  { a: 50, n: 4, d: 1 },
            'Clover':    { a: 50, n: 2, d: 1 },
            'Complex':   { a: 50, n: 5, d: 3 }
        },
        lissajous: {
            '3:2':       { A: 50, B: 50, a: 3, b: 2, delta: 0 },
            '3:4':       { A: 50, B: 50, a: 3, b: 4, delta: 0 },
            '5:4':       { A: 50, B: 50, a: 5, b: 4, delta: 90 },
            'Knot':      { A: 50, B: 50, a: 3, b: 2, delta: 45 }
        },
        harmonograph: {
            'Simple':    { size: 50, freqX: 3, freqY: 2, phaseX: 0,  phaseY: 0,  decay: 0.02, duration: 40 },
            'Complex':   { size: 50, freqX: 3.01, freqY: 2, phaseX: 90, phaseY: 0, decay: 0.01, duration: 60 },
            'Spiral':    { size: 50, freqX: 3, freqY: 3.01, phaseX: 0, phaseY: 90, decay: 0.015, duration: 50 }
        },
        guilloche: {
            'Classic':   { R: 50, r: 15, d1: 10, d2: 20, nLines: 80 },
            'Tight':     { R: 50, r: 8,  d1: 5,  d2: 12, nLines: 120 },
            'Wide':      { R: 50, r: 25, d1: 15, d2: 30, nLines: 60 }
        }
    },

    init() {
        this._wireUI();
        this._registerBuilders();
    },

    // --- Curve Builders (return paper.Path centered at origin) ---

    _buildSpirograph(params) {
        const R = params.R || 50;
        const r = params.r || 20;
        const d = params.d || 15;
        const epi = params.mode === 'epi';

        // Period: curve closes after lcm(R,r)/r revolutions of rolling circle
        const Ri = Math.round(R * 100);
        const ri = Math.round(r * 100);
        const g = gcd(Ri, ri);
        const revolutions = ri / g;
        const totalAngle = revolutions * 2 * Math.PI;
        const steps = Math.max(500, revolutions * 100);

        const path = new paper.Path();
        for (let i = 0; i < steps; i++) {
            const t = (i / steps) * totalAngle;
            let x, y;
            if (epi) {
                x = (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t);
                y = (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t);
            } else {
                x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
                y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
            }
            path.add(new paper.Point(x, y));
        }
        path.closePath();
        path.simplify(0.5);
        return path;
    },

    _buildRose(params) {
        const a = params.a || 50;
        const n = params.n || 3;
        const denom = params.d || 1;
        const k = n / denom;

        // Curve closes after denom*pi (if n*denom odd) or 2*denom*pi
        const isOdd = (n * denom) % 2 === 1;
        const totalAngle = isOdd ? denom * Math.PI : 2 * denom * Math.PI;
        const steps = Math.max(300, denom * 200);

        const path = new paper.Path();
        for (let i = 0; i < steps; i++) {
            const theta = (i / steps) * totalAngle;
            const r = a * Math.cos(k * theta);
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            path.add(new paper.Point(x, y));
        }
        path.closePath();
        path.simplify(0.3);
        return path;
    },

    _buildLissajous(params) {
        const A = params.A || 50;
        const B = params.B || 50;
        const a = params.a || 3;
        const b = params.b || 2;
        const delta = (params.delta || 0) * Math.PI / 180;
        const steps = 500;

        const path = new paper.Path();
        for (let i = 0; i < steps; i++) {
            const t = (i / steps) * 2 * Math.PI;
            const x = A * Math.sin(a * t + delta);
            const y = B * Math.sin(b * t);
            path.add(new paper.Point(x, y));
        }
        path.closePath();
        path.simplify(0.3);
        return path;
    },

    _buildHarmonograph(params) {
        const size = params.size || 50;
        const fx = params.freqX || 3;
        const fy = params.freqY || 2;
        const px = (params.phaseX || 0) * Math.PI / 180;
        const py = (params.phaseY || 0) * Math.PI / 180;
        const decay = params.decay || 0.02;
        const duration = params.duration || 40;
        const steps = 2000;

        const path = new paper.Path();
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * duration;
            const damp = Math.exp(-decay * t);
            if (damp < 0.001) break; // stop when amplitude is negligible
            const x = size * Math.sin(fx * t + px) * damp;
            const y = size * Math.sin(fy * t + py) * damp;
            path.add(new paper.Point(x, y));
        }
        // Harmonograph doesn't close — spirals inward
        path.simplify(0.3);
        return path;
    },

    _buildGuilloche(params) {
        const R = params.R || 50;
        const r = params.r || 15;
        const d1 = params.d1 || 10;
        const d2 = params.d2 || 20;

        const Ri = Math.round(R * 100);
        const ri = Math.round(r * 100);
        const g = gcd(Ri, ri);
        const revolutions = ri / g;
        const totalAngle = revolutions * 2 * Math.PI;
        const nLines = params.nLines || 80;

        // Weave between inner (d1) and outer (d2) spirograph curves
        const path = new paper.Path();
        for (let i = 0; i < nLines; i++) {
            const t = (i / nLines) * totalAngle;
            const d = (i % 2 === 0) ? d1 : d2;
            const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
            const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
            path.add(new paper.Point(x, y));
        }
        path.closePath();
        path.simplify(0.5);
        return path;
    },

    // --- Generation ---

    generate() {
        const layer = MB.Layers.getActiveLayer();
        if (!layer || layer.locked) return;

        const type = this._currentType;
        const params = this._readParams();
        const builder = MB.Parametric._builders[type];
        if (!builder) return;

        // Check if we can update existing live item in-place
        if (this._liveItem && this._liveItem.parent && this._liveItem.data &&
            this._liveItem.data.shapeType === type) {
            // Snapshot once per editing session
            if (!this._snapshotDone) {
                MB.History.snapshot();
                this._snapshotDone = true;
            }
            this._liveItem.data.shapeParams = { ...params };
            MB.Parametric.regenerate(this._liveItem);
            paper.view.update();
            return;
        }

        // Create new item
        MB.History.snapshot();
        this._snapshotDone = true;
        layer.paperLayer.activate();

        const path = builder(params);
        if (!path) return;

        // Position at mandala center if active, otherwise canvas center
        const center = (MB.Mandala.active && MB.Mandala.center)
            ? MB.Mandala.center
            : new paper.Point(MB.Canvas.wsWidth / 2, MB.Canvas.wsHeight / 2);
        path.position = center;

        path.strokeColor = layer.color;
        path.strokeWidth = 0.5;
        path.fillColor = null;
        path.data = {
            isUserItem: true,
            shapeType: type,
            shapeParams: { ...params }
        };

        this._liveItem = path;
        MB.App.select(path);
        document.getElementById('status-info').textContent =
            type.charAt(0).toUpperCase() + type.slice(1) +
            ' generated (' + path.segments.length + ' pts)';
    },

    // Reset live item (new editing session on next change)
    _resetLive() {
        this._liveItem = null;
        this._snapshotDone = false;
    },

    // --- Read params from UI ---

    _readParams() {
        const type = this._currentType;
        switch (type) {
            case 'spirograph': return {
                R: parseFloat(document.getElementById('gen-sp-R').value) || 50,
                r: parseFloat(document.getElementById('gen-sp-r').value) || 20,
                d: parseFloat(document.getElementById('gen-sp-d').value) || 15,
                mode: document.getElementById('gen-sp-epi').checked ? 'epi' : 'hypo'
            };
            case 'rose': return {
                a: parseFloat(document.getElementById('gen-rs-a').value) || 50,
                n: parseInt(document.getElementById('gen-rs-n').value) || 3,
                d: parseInt(document.getElementById('gen-rs-d').value) || 1
            };
            case 'lissajous': return {
                A: parseFloat(document.getElementById('gen-li-A').value) || 50,
                B: parseFloat(document.getElementById('gen-li-B').value) || 50,
                a: parseInt(document.getElementById('gen-li-a').value) || 3,
                b: parseInt(document.getElementById('gen-li-b').value) || 2,
                delta: parseInt(document.getElementById('gen-li-delta').value) || 0
            };
            case 'harmonograph': return {
                size: parseFloat(document.getElementById('gen-ha-size').value) || 50,
                freqX: parseFloat(document.getElementById('gen-ha-fx').value) || 3,
                freqY: parseFloat(document.getElementById('gen-ha-fy').value) || 2,
                phaseX: parseFloat(document.getElementById('gen-ha-px').value) || 0,
                phaseY: parseFloat(document.getElementById('gen-ha-py').value) || 0,
                decay: parseFloat(document.getElementById('gen-ha-decay').value) || 0.02,
                duration: 40
            };
            case 'guilloche': return {
                R: parseFloat(document.getElementById('gen-gu-R').value) || 50,
                r: parseFloat(document.getElementById('gen-gu-r').value) || 15,
                d1: parseFloat(document.getElementById('gen-gu-d1').value) || 10,
                d2: parseFloat(document.getElementById('gen-gu-d2').value) || 20,
                nLines: parseInt(document.getElementById('gen-gu-lines').value) || 80
            };
        }
        return {};
    },

    // --- Apply params to UI ---

    _applyParamsToUI(params, type) {
        switch (type || this._currentType) {
            case 'spirograph':
                document.getElementById('gen-sp-R').value = params.R || 50;
                document.getElementById('gen-sp-r').value = params.r || 20;
                document.getElementById('gen-sp-d').value = params.d || 15;
                document.getElementById('gen-sp-epi').checked = params.mode === 'epi';
                break;
            case 'rose':
                document.getElementById('gen-rs-a').value = params.a || 50;
                document.getElementById('gen-rs-n').value = params.n || 3;
                document.getElementById('gen-rs-d').value = params.d || 1;
                break;
            case 'lissajous':
                document.getElementById('gen-li-A').value = params.A || 50;
                document.getElementById('gen-li-B').value = params.B || 50;
                document.getElementById('gen-li-a').value = params.a || 3;
                document.getElementById('gen-li-b').value = params.b || 2;
                document.getElementById('gen-li-delta').value = params.delta || 0;
                document.getElementById('gen-li-delta-val').textContent = (params.delta || 0) + '\u00B0';
                break;
            case 'harmonograph':
                document.getElementById('gen-ha-size').value = params.size || 50;
                document.getElementById('gen-ha-fx').value = params.freqX || 3;
                document.getElementById('gen-ha-fy').value = params.freqY || 2;
                document.getElementById('gen-ha-px').value = params.phaseX || 0;
                document.getElementById('gen-ha-py').value = params.phaseY || 0;
                document.getElementById('gen-ha-decay').value = params.decay || 0.02;
                document.getElementById('gen-ha-decay-val').textContent = params.decay || 0.02;
                break;
            case 'guilloche':
                document.getElementById('gen-gu-R').value = params.R || 50;
                document.getElementById('gen-gu-r').value = params.r || 15;
                document.getElementById('gen-gu-d1').value = params.d1 || 10;
                document.getElementById('gen-gu-d2').value = params.d2 || 20;
                document.getElementById('gen-gu-lines').value = params.nLines || 80;
                break;
        }
    },

    // --- UI Wiring ---

    _wireUI() {
        const typeSelect = document.getElementById('gen-type');
        const presetSelect = document.getElementById('gen-preset');
        const generateBtn = document.getElementById('gen-generate');

        if (!typeSelect || !presetSelect || !generateBtn) return;

        // Type selector — switching type starts a new item
        typeSelect.addEventListener('change', () => {
            this._currentType = typeSelect.value;
            this._showParamsForType(this._currentType);
            this._populatePresets(this._currentType);
            this._resetLive();
            this.generate();
        });

        // Preset selector — apply and regenerate
        presetSelect.addEventListener('change', () => {
            const name = presetSelect.value;
            if (!name) return;
            const presets = this._presets[this._currentType];
            if (presets && presets[name]) {
                this._applyParamsToUI(presets[name]);
                this.generate();
            }
        });

        // Generate button — force new item
        generateBtn.addEventListener('click', () => {
            this._resetLive();
            this.generate();
        });

        // Live regenerate on any param input change
        const liveRegen = () => this.generate();
        const paramIds = [
            'gen-sp-R', 'gen-sp-r', 'gen-sp-d',
            'gen-rs-a', 'gen-rs-n', 'gen-rs-d',
            'gen-li-A', 'gen-li-B', 'gen-li-a', 'gen-li-b', 'gen-li-delta',
            'gen-ha-size', 'gen-ha-fx', 'gen-ha-fy', 'gen-ha-px', 'gen-ha-py', 'gen-ha-decay',
            'gen-gu-R', 'gen-gu-r', 'gen-gu-d1', 'gen-gu-d2', 'gen-gu-lines'
        ];
        paramIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', liveRegen);
        });
        // Checkbox
        const epiCb = document.getElementById('gen-sp-epi');
        if (epiCb) epiCb.addEventListener('change', liveRegen);

        // Range slider live labels
        const deltaSlider = document.getElementById('gen-li-delta');
        if (deltaSlider) {
            deltaSlider.addEventListener('input', () => {
                document.getElementById('gen-li-delta-val').textContent = deltaSlider.value + '\u00B0';
            });
        }
        const decaySlider = document.getElementById('gen-ha-decay');
        if (decaySlider) {
            decaySlider.addEventListener('input', () => {
                document.getElementById('gen-ha-decay-val').textContent =
                    parseFloat(decaySlider.value).toFixed(3);
            });
        }

        // Reset snapshot flag when slider drag ends (next drag = new undo point)
        const rangeIds = ['gen-li-delta', 'gen-ha-decay'];
        rangeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => { this._snapshotDone = false; });
        });

        // Initial state
        this._showParamsForType('spirograph');
        this._populatePresets('spirograph');
    },

    _showParamsForType(type) {
        document.querySelectorAll('.gen-params').forEach(el => {
            el.classList.toggle('hidden', el.id !== 'gen-' + type);
        });
    },

    _populatePresets(type) {
        const sel = document.getElementById('gen-preset');
        sel.innerHTML = '<option value="">Custom</option>';
        const presets = this._presets[type];
        if (!presets) return;
        for (const name of Object.keys(presets)) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        }
        // Auto-select first preset and apply
        const first = Object.keys(presets)[0];
        if (first) {
            sel.value = first;
            this._applyParamsToUI(presets[first]);
        }
    },

    // --- Parametric Builder Registration ---

    _registerBuilders() {
        const self = this;
        MB.Parametric.registerBuilder('spirograph', (p) => self._buildSpirograph(p));
        MB.Parametric.registerBuilder('rose', (p) => self._buildRose(p));
        MB.Parametric.registerBuilder('lissajous', (p) => self._buildLissajous(p));
        MB.Parametric.registerBuilder('harmonograph', (p) => self._buildHarmonograph(p));
        MB.Parametric.registerBuilder('guilloche', (p) => self._buildGuilloche(p));
    }
};

})();
