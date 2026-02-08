// MandalaBurn - Font Manager (opentype.js integration)
MB.FontManager = {
    fonts: {},       // name -> opentype.Font
    _loading: false,
    _loadingCount: 0,
    _failedFonts: [],

    // Default fonts from Google Fonts CDN
    defaultFonts: [
        // Sans-Serif
        { name: 'Roboto', url: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf' },
        { name: 'Roboto Bold', url: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuYjammT.ttf' },
        { name: 'Open Sans', url: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4n.ttf' },
        { name: 'Open Sans Bold', url: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1y4n.ttf' },
        { name: 'Lato', url: 'https://fonts.gstatic.com/s/lato/v25/S6uyw4BMUTPHvxk6WQev.ttf' },
        { name: 'Lato Bold', url: 'https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh6UVew-FHi_o.ttf' },
        { name: 'Montserrat', url: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-Y31cow.ttf' },
        { name: 'Montserrat Bold', url: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM70w-Y31cow.ttf' },
        { name: 'Oswald', url: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1_FvgUFoYgaQ.ttf' },
        { name: 'Raleway', url: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVvaooCPNLY3JQ.ttf' },
        { name: 'Poppins', url: 'https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrFJDUdVNF.ttf' },
        { name: 'Poppins Bold', url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLCz7V1tvEv-L.ttf' },
        { name: 'Nunito', url: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshRTM9iI7f.ttf' },
        { name: 'Ubuntu', url: 'https://fonts.gstatic.com/s/ubuntu/v21/4iCs6KVjbNBYlgo6eATxv0w.ttf' },
        { name: 'PT Sans', url: 'https://fonts.gstatic.com/s/ptsans/v18/jizaRExUiTo99u79P0WOwuGN.ttf' },
        { name: 'Fira Sans', url: 'https://fonts.gstatic.com/s/firasans/v18/va9E4kDNxMZdWfMOD5VfkILMSTc.ttf' },
        { name: 'Source Sans 3', url: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky461EN_iw6nw.ttf' },
        { name: 'Noto Sans', url: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d41X6zQ.ttf' },
        { name: 'Inter', url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrj72A.ttf' },
        // Serif
        { name: 'Playfair Display', url: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf' },
        { name: 'Merriweather', url: 'https://fonts.gstatic.com/s/merriweather/v33/u-4D0qyriQwlOrhSvowK_l5UcA6zuSYEqOzpPe3HOZJ5eX1WtLaQwmYiScCmDxhtNOKl8yDr3icqE1fyKvQ.ttf' },
        { name: 'Lora', url: 'https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787weuyJGmKpemQ.ttf' },
        { name: 'Abril Fatface', url: 'https://fonts.gstatic.com/s/abrilfatface/v25/zOL64pLDlL1D99S8g8PtiKchm-BsiuLg.ttf' },
        { name: 'Cinzel', url: 'https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnTYrvCk5Y.ttf' },
        // Display / Decorative
        { name: 'Bebas Neue', url: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW5rzAbj.ttf' },
        { name: 'Comfortaa', url: 'https://fonts.gstatic.com/s/comfortaa/v47/1Pt_g8LJRfWJmhDAuUsSQamb1W0lwk4S4WjMPrQVJz9d.ttf' },
        { name: 'Righteous', url: 'https://fonts.gstatic.com/s/righteous/v18/1cXxaUPXBpj2rGoU7C9mj3uCicA.ttf' },
        { name: 'Fredoka', url: 'https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3O8SLMFuONlNg.ttf' },
        { name: 'Bangers', url: 'https://fonts.gstatic.com/s/bangers/v25/FeVQS0BTqb0h60ACL5la37xj.ttf' },
        { name: 'Press Start 2P', url: 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK0nSgPRE4g.ttf' },
        { name: 'Anton', url: 'https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm0K08iggSg.ttf' },
        { name: 'Russo One', url: 'https://fonts.gstatic.com/s/russoone/v18/Z9XUDmZRWg6M1LvRYsH-yMOOnrk.ttf' },
        { name: 'Black Ops One', url: 'https://fonts.gstatic.com/s/blackopsone/v21/qWcsB6-ypo7xBdr6Xshe96H3WDzRsDkg.ttf' },
        { name: 'Orbitron', url: 'https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6xpmI0XjQ.ttf' },
        { name: 'Special Elite', url: 'https://fonts.gstatic.com/s/specialelite/v20/XLYgIZbkc4JPUL5CVArUVL0nhncET3Fs.ttf' },
        // Script / Handwriting
        { name: 'Dancing Script', url: 'https://fonts.gstatic.com/s/dancingscript/v29/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSoHTeB7ptE.ttf' },
        { name: 'Pacifico', url: 'https://fonts.gstatic.com/s/pacifico/v23/FwZY7-Qmy14u9lezJ96A4s6jpQ.ttf' },
        { name: 'Lobster', url: 'https://fonts.gstatic.com/s/lobster/v32/neILzCirqoswsqX9_oWsNKEy.ttf' },
        { name: 'Permanent Marker', url: 'https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004HaqIeLT4.ttf' },
        { name: 'Caveat', url: 'https://fonts.gstatic.com/s/caveat/v23/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9SIKjZhxO.ttf' },
        { name: 'Satisfy', url: 'https://fonts.gstatic.com/s/satisfy/v22/rP2Hp2yn6lkG50LoOZSCGheG.ttf' },
        { name: 'Great Vibes', url: 'https://fonts.gstatic.com/s/greatvibes/v21/RWmMoKWR9v4ksMfaWd_JN-XCg6MKDA.ttf' },
        { name: 'Sacramento', url: 'https://fonts.gstatic.com/s/sacramento/v17/buEzpo6gcdjy0EiZMBUG0CoV-txK.ttf' }
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
