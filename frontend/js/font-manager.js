// MandalaBurn - Font Manager (opentype.js integration)
MB.FontManager = {
    fonts: {},       // name -> opentype.Font
    _loading: false,
    _loadingCount: 0,
    _failedFonts: [],

    // Default fonts from Google Fonts CDN
    defaultFonts: [
        { name: 'Roboto', url: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf' },
        { name: 'Roboto Bold', url: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuYjammT.ttf' },
        { name: 'Open Sans', url: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4n.ttf' },
        { name: 'Open Sans Bold', url: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1y4n.ttf' },
        { name: 'Playfair Display', url: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf' }
    ],

    async init() {
        // Load default fonts in background
        this._updateFontSelect();
        for (const f of this.defaultFonts) {
            this.loadFromURL(f.name, f.url).catch(() => {
                console.warn('Failed to load font:', f.name);
            });
        }

        // Wire upload button
        const uploadInput = document.getElementById('text-font-upload');
        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.loadFromFile(file);
                e.target.value = '';
            });
        }
    },

    async loadFromURL(name, url) {
        this._loadingCount++;
        this._updateFontSelect();
        return new Promise((resolve, reject) => {
            opentype.load(url, (err, font) => {
                this._loadingCount--;
                if (err) {
                    this._failedFonts.push(name);
                    this._updateFontSelect();
                    reject(err);
                    return;
                }
                this.fonts[name] = font;
                this._updateFontSelect();
                MB.App.emit('font-loaded', name);
                resolve(font);
            });
        });
    },

    async loadFromFile(file) {
        const buf = await file.arrayBuffer();
        try {
            const font = opentype.parse(buf);
            const name = font.names.fontFamily?.en || file.name.replace(/\.\w+$/, '');
            this.fonts[name] = font;
            this._updateFontSelect();
            // Auto-select the newly uploaded font
            const sel = document.getElementById('text-font');
            if (sel) sel.value = name;
            document.getElementById('status-info').textContent = 'Font loaded: ' + name;
        } catch (e) {
            document.getElementById('status-info').textContent = 'Font error: ' + e.message;
        }
    },

    getFont(name) {
        return this.fonts[name] || null;
    },

    getFirstFont() {
        const names = Object.keys(this.fonts);
        return names.length > 0 ? this.fonts[names[0]] : null;
    },

    getFontNames() {
        return Object.keys(this.fonts);
    },

    _updateFontSelect() {
        const sel = document.getElementById('text-font');
        if (!sel) return;
        const currentVal = sel.value;
        const names = this.getFontNames();

        sel.innerHTML = '';
        if (names.length === 0) {
            if (this._loadingCount > 0) {
                sel.innerHTML = '<option value="">Loading (' + this._loadingCount + ')...</option>';
            } else if (this._failedFonts.length > 0) {
                sel.innerHTML = '<option value="">Failed - upload .ttf</option>';
            } else {
                sel.innerHTML = '<option value="">Loading...</option>';
            }
            return;
        }
        names.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });

        // Restore selection if still available
        if (currentVal && names.includes(currentVal)) {
            sel.value = currentVal;
        }
    }
};
