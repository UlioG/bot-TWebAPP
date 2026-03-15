/**
 * wizard.js - Wizard Osservazione completo
 * Supporta: scale (stair_subsection), prospetti, CDP, NDR wall count
 *
 * Flow per elemento:
 * Pareti:         element -> wall -> counterwall -> [cdp] -> pre_check -> position -> phenomenon -> ...
 * Soffitto/Pav:   element -> pre_check -> position -> phenomenon -> ...
 * Balcone:        element -> balcone_sub -> [counterwall] -> pre_check -> position -> phenomenon -> ...
 * Elemento/Varco: element -> infisso_type -> infisso_location -> infisso_wall -> infisso_which -> infisso_sub_pos -> pre_check -> phenomenon -> ...
 * Scala:          stair_subsection -> element(mapped) -> pre_check -> ...
 * Prospetti:      element(ELEMENTS_PROSPETTI) -> wall -> pre_check -> ...
 */
const WizardView = {
    sopId: null,
    roomName: null,
    step: 'element',
    obs: {},
    _sop: null,

    async render(container, params) {
        this.sopId = params[0];
        this.roomName = params[1] ? decodeURIComponent(params[1]) : null;

        if (!this.sopId || !this.roomName) { App.navigate('home', true); return; }

        this._sop = await DB.getSopralluogo(this.sopId);
        if (!this._sop) { App.navigate('home', true); return; }

        // Determina tipo room
        const rooms = Events.getActiveRooms(this._sop);
        const room = rooms[this.roomName];
        const isStair = room && CONFIG.isStairRoom(this.roomName);
        const isProsp = CONFIG.isProspettoRoom(this.roomName);

        // Avviso se il vano ha testo custom nel riepilogo
        if (room && room.custom_room_text) {
            UI.toast('\u26A0\uFE0F Attenzione: le modifiche manuali al testo del vano nel riepilogo verranno perse', 4000);
        }

        // Reset wizard state
        this.obs = this._emptyObs();

        // Prospetti: leggi contesto piano/HREF da ProspettiView
        if (isProsp && typeof ProspettiView !== 'undefined') {
            this.obs.prosp_floor = ProspettiView._lastProspFloor || null;
            this.obs.prosp_href = ProspettiView._lastProspHref || null;
        }

        // Scala: parti da stair_subsection
        if (isStair) {
            this.step = 'stair_subsection';
        } else if (isProsp) {
            this.step = 'element_prospetto';
        } else {
            this.step = 'element';
        }

        this.renderStep(container);
    },

    _emptyObs() {
        return {
            element: null, wall: null, has_counterwall: false, balcone_sub: null,
            positions_selected: [], position: null, phenomenon: null,
            specifics: [], attributes: [], prosecutions: [],
            notes: '', photo_id: null, non_visibile: false, parz_ingombra: false,
            infisso_type: null, infisso_location: null, infisso_wall: null,
            infisso_which: null, infisso_confine: null, infisso_sub_pos: null,
            stair_subsection: null, has_cdp: false,
            prosp_floor: null, prosp_href: null
        };
    },

    renderStep(container) {
        if (!container) container = document.getElementById('app-content');

        switch (this.step) {
            case 'stair_subsection': return this._renderStairSubsection(container);
            case 'stair_gradino': return this._renderStairGradino(container);
            case 'element_prospetto': return this._renderElementProspetto(container);
            case 'element': return this._renderElement(container);
            case 'wall': return this._renderWall(container);
            case 'counterwall': return this._renderCounterwall(container);
            case 'cdp': return this._renderCDP(container);
            case 'balcone_sub': return this._renderBalconeSub(container);
            case 'pre_check': return this._renderPreCheck(container);
            case 'parziale_choice': return this._renderParzialeChoice(container);
            case 'infisso_type': return this._renderInfissoType(container);
            case 'infisso_confine': return this._renderInfissoConfine(container);
            case 'infisso_location': return this._renderInfissoLocation(container);
            case 'infisso_wall': return this._renderInfissoWall(container);
            case 'infisso_which': return this._renderInfissoWhich(container);
            case 'infisso_sub_pos': return this._renderInfissoSubPos(container);
            case 'position': return this._renderPosition(container);
            case 'position_elemento': return this._renderPositionElemento(container);
            case 'phenomenon': return this._renderPhenomenon(container);
            case 'specifics': return this._renderSpecifics(container);
            case 'details': return this._renderDetails(container);
            case 'prosecution': return this._renderProsecution(container);
            case 'prosecution_target': return this._renderProsecutionTarget(container);
            case 'notes': return this._renderNotes(container);
            case 'photo': return this._renderPhoto(container);
            case 'confirm': return this._renderConfirm(container);
        }
    },

    goBack() {
        const elem = this.obs.element;
        const isProsp = CONFIG.isProspettoRoom(this.roomName);
        const isStair = this.obs.stair_subsection != null;

        const prevMap = {
            'stair_subsection': null,
            'stair_gradino': 'element',
            'element_prospetto': null,
            'element': null,
            'wall': isStair ? 'stair_subsection' : (isProsp ? 'element_prospetto' : 'element'),
            'counterwall': 'wall',
            'cdp': 'counterwall',
            'balcone_sub': 'element',
            'pre_check': this._preCheckBackTarget(),
            'infisso_type': isProsp ? 'element_prospetto' : 'element',
            'infisso_confine': 'infisso_type',
            'infisso_location': this.obs.infisso_confine !== null ? 'infisso_confine' : 'infisso_type',
            'infisso_wall': 'infisso_location',
            'infisso_which': 'infisso_wall',
            'infisso_sub_pos': 'infisso_which',
            'position': 'pre_check',
            'position_elemento': 'position',
            'phenomenon': (elem === 'Elemento/Varco' || (CONFIG.STAIR_GRADINO_ELEMENTS && CONFIG.STAIR_GRADINO_ELEMENTS.includes(elem))) ? 'pre_check' : 'position',
            'specifics': 'phenomenon',
            'details': 'specifics',
            'prosecution': 'details',
            'prosecution_target': 'prosecution',
            'notes': 'prosecution',
            'photo': 'notes',
            'confirm': 'photo'
        };

        const prev = prevMap[this.step];
        if (prev) {
            this.step = prev;
            this.renderStep();
        } else {
            App.navigate(`rooms/${this.sopId}/${encodeURIComponent(this.roomName)}`);
        }
    },

    /**
     * Determina lo step dopo pre_check:
     * - Elemento/Varco: salta position, va a phenomenon
     * - Pedata/Sottogrado: position gia' impostata nello step gradino, va a phenomenon
     * - Tutti gli altri: va a position
     */
    _afterPreCheckStep() {
        const elem = this.obs.element;
        if (elem === 'Elemento/Varco') return 'phenomenon';
        if (CONFIG.STAIR_GRADINO_ELEMENTS && CONFIG.STAIR_GRADINO_ELEMENTS.includes(elem)) return 'phenomenon';
        return 'position';
    },

    _preCheckBackTarget() {
        const elem = this.obs.element;
        const isProsp = CONFIG.isProspettoRoom(this.roomName);
        if (elem === 'Pareti' && isProsp) return 'element_prospetto';
        if (elem === 'Pareti') return this.obs.has_cdp !== null ? 'cdp' : 'counterwall';
        if (elem === 'Balcone') {
            return this.obs.balcone_sub && this.obs.balcone_sub.startsWith('Parete') ? 'counterwall' : 'balcone_sub';
        }
        if (elem === 'Elemento/Varco') return 'infisso_sub_pos';
        // Pedata/Sottogrado: torna a stair_gradino
        if (CONFIG.STAIR_GRADINO_ELEMENTS && CONFIG.STAIR_GRADINO_ELEMENTS.includes(elem)) return 'stair_gradino';
        return this.obs.stair_subsection ? 'stair_subsection' : 'element';
    },

    _header(title, subtitle) {
        return UI.wizardHeader(title, subtitle);
    },

    _backBtn() {
        return `<div style="padding: 8px 16px;"><button class="btn btn-secondary" id="btn-wiz-back">Indietro</button></div>`;
    },

    _bindBack() {
        document.getElementById('btn-wiz-back')?.addEventListener('click', () => this.goBack());
    },

    // ========== STAIR SUBSECTION ==========

    _renderStairSubsection(container) {
        UI.setTitle('Sotto-sezione Scala');
        const rampCount = (this._sop && this._sop.stair_ramp_count) || 2;
        const subsections = CONFIG.generateStairSubsections(rampCount);

        let html = this._header(this.roomName, 'Seleziona la sotto-sezione');
        html += UI.buttonGrid(subsections.map(s => ({ value: s, label: s })), { cols: 1 });
        html += `<div style="padding: 8px 16px;"><button class="btn btn-outline" id="btn-ss-manual">✏️ Inserisci Manualmente</button></div>`;
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.stair_subsection = btn.dataset.value;
                const elements = CONFIG.getStairElements(this.obs.stair_subsection);
                if (elements.length === 1) {
                    this.obs.element = elements[0];
                    this.step = 'pre_check';
                } else {
                    this.step = 'element';
                }
                this.renderStep();
            });
        });

        // Scrivi a mano sotto-sezione
        document.getElementById('btn-ss-manual')?.addEventListener('click', () => {
            UI.promptInput('Sotto-sezione', 'Es. Pianerottolo intermedio, Rampa 3', (val) => {
                if (!val) return;
                this.obs.stair_subsection = val;
                this.step = 'element';
                this.renderStep();
            });
        });
    },

    // ========== STAIR GRADINO (Pedata/Sottogrado) ==========

    _renderStairGradino(container) {
        UI.setTitle('Quale gradino?');
        const elemLabel = this.obs.element; // 'Pedata' o 'Sottogrado'

        let html = this._header(elemLabel, 'Indica quale gradino e direzione');
        html += `<div style="padding: 0 16px;">
            ${UI.formInput({
                label: 'Gradino',
                placeholder: 'Es. 3\u00B0 a salire, ultimo a scendere',
                id: 'field-gradino'
            }).trim()}
        </div>`;
        html += `<div style="padding: 16px;">
            <button class="btn btn-primary" id="btn-gradino-ok">Avanti</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        // Focus sull'input
        const input = document.getElementById('field-gradino');
        if (input) setTimeout(() => input.focus(), 100);

        document.getElementById('btn-gradino-ok')?.addEventListener('click', () => {
            const val = (input?.value || '').trim();
            if (!val) {
                UI.toast('Inserisci il gradino');
                return;
            }
            this.obs.position = val;
            this.step = 'pre_check';
            this.renderStep();
        });

        this._bindBack();
    },

    // ========== ELEMENT (PROSPETTI) ==========

    _renderElementProspetto(container) {
        UI.setTitle('Elemento Prospetto');
        let html = this._header('Prospetti', 'Seleziona elemento');
        html += UI.buttonGrid(CONFIG.ELEMENTS_PROSPETTI.map(e => ({ value: e, label: e })));
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.element = btn.dataset.value;
                if (this.obs.element === 'Elemento/Varco') {
                    this.step = 'infisso_type';
                } else {
                    // Prospetti: il prospetto È la parete (bot riga 2541)
                    // Skip wall/counterwall/CDP — auto-set wall = nome prospetto
                    this.obs.wall = this.roomName; // es. "Prospetto B"
                    this.step = 'pre_check';
                }
                this.renderStep();
            });
        });
    },

    // ========== ELEMENT (standard) ==========

    _renderElement(container) {
        UI.setTitle('Elemento');
        const isStair = this.obs.stair_subsection != null;
        let elements;

        if (isStair) {
            elements = CONFIG.getStairElements(this.obs.stair_subsection);
        } else {
            // Rileva destinazione vano per Balcone/Terrazzo
            const rooms = this._sop ? Events.getActiveRooms(this._sop) : {};
            const room = rooms[this.roomName];
            const destination = room?.destination || null;
            elements = CONFIG.getElements(false, false, null, destination);
        }

        let html = this._header(this.roomName, 'Seleziona elemento');
        html += UI.buttonGrid(elements.map(e => ({ value: e, label: e })));
        html += `<div style="padding: 8px 16px;"><button class="btn btn-outline" id="btn-el-manual">✏️ Inserisci Manualmente</button></div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.element = btn.dataset.value;
                if (this.obs.element === 'Pareti') this.step = 'wall';
                else if (this.obs.element === 'Balcone') this.step = 'balcone_sub';
                else if (this.obs.element === 'Sotto balcone superiore') this.step = 'pre_check';
                else if (this.obs.element === 'Elemento/Varco') this.step = 'infisso_type';
                else if (CONFIG.STAIR_GRADINO_ELEMENTS && CONFIG.STAIR_GRADINO_ELEMENTS.includes(this.obs.element)) this.step = 'stair_gradino';
                else this.step = 'pre_check';
                this.renderStep();
            });
        });

        // Scrivi a mano elemento
        document.getElementById('btn-el-manual')?.addEventListener('click', () => {
            UI.promptInput('Elemento manuale', 'Es. Cornicione, Gronda, Architrave', (val) => {
                if (!val) return;
                this.obs.element = val;
                this.step = 'pre_check';
                this.renderStep();
            });
        });
        this._bindBack();
    },

    // ========== WALL ==========

    _renderWall(container) {
        UI.setTitle('Parete');
        const isProsp = CONFIG.isProspettoRoom(this.roomName);
        const labels = isProsp ? CONFIG.PROSPETTO_DEFAULT_LABELS : CONFIG.WALL_LABELS;

        // Custom walls dal sopralluogo
        const rooms = this._sop ? Events.getActiveRooms(this._sop) : {};
        const room = rooms[this.roomName] || {};
        const customWalls = room.custom_walls || [];

        let html = this._header('Pareti', 'Seleziona la parete');

        // Griglia pareti standard + custom
        const allLabels = [...labels];
        for (const cw of customWalls) {
            if (!allLabels.includes(cw)) allLabels.push(cw);
        }
        html += UI.buttonGrid(allLabels);

        // Scrivi a Mano + NDR Tutte le Pareti
        html += `<div style="padding: 8px 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-outline" id="btn-wall-manual">✏️ Inserisci Manualmente</button>
            <button class="btn btn-secondary" id="btn-wall-ndr-all" style="background: #2e7d32; color: white;">🟢 NDR Tutte le Pareti</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.wall = btn.dataset.value;
                this.step = 'counterwall';
                this.renderStep();
            });
        });

        // Scrivi a Mano parete
        document.getElementById('btn-wall-manual')?.addEventListener('click', () => {
            UI.promptInput('Parete personalizzata', 'Es. Parete E, Parete vano ascensore', async (val) => {
                if (!val) return;
                // Salva come custom wall nel vano
                if (!customWalls.includes(val)) {
                    customWalls.push(val);
                    await Events.dispatch('set_custom_walls', this.sopId, {
                        room_name: this.roomName,
                        custom_walls: customWalls
                    });
                }
                this.obs.wall = val;
                this.step = 'counterwall';
                this.renderStep();
            });
        });

        // NDR Tutte le Pareti
        document.getElementById('btn-wall-ndr-all')?.addEventListener('click', () => {
            this._askWallCountForNdr();
        });

        this._bindBack();
    },

    // ========== COUNTERWALL ==========

    _renderCounterwall(container) {
        UI.setTitle('Controparete');
        let html = this._header(this.obs.wall || 'Parete', 'Ha una controparete?');
        html += `<div style="padding: 0 16px;" class="btn-grid">
            <button class="btn-choice" data-value="true">Si'</button>
            <button class="btn-choice" data-value="false">No</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.has_counterwall = btn.dataset.value === 'true';
                // CDP check (for walls with CDP question)
                this.step = 'cdp';
                this.renderStep();
            });
        });
        this._bindBack();
    },

    // ========== CDP (Carta Da Parati) ==========

    _renderCDP(container) {
        UI.setTitle('Carta da Parati');
        let html = this._header(this.obs.wall || 'Parete', 'E\' presente carta da parati?');
        html += `<div style="padding: 0 16px;" class="btn-grid">
            <button class="btn-choice" data-value="true">Si'</button>
            <button class="btn-choice" data-value="false">No</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.has_cdp = btn.dataset.value === 'true';
                this.step = 'pre_check';
                this.renderStep();
            });
        });
        this._bindBack();
    },

    // ========== BALCONE SUB ==========

    _renderBalconeSub(container) {
        UI.setTitle('Elemento Balcone');
        let html = this._header('Balcone', 'Seleziona parte del balcone');
        html += UI.buttonGrid(CONFIG.BALCONE_SUB_ELEMENTS, { cols: 2 });
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.balcone_sub = btn.dataset.value;
                if (this.obs.balcone_sub.startsWith('Parete')) {
                    this.step = 'counterwall';
                } else {
                    this.step = 'pre_check';
                }
                this.renderStep();
            });
        });
        this._bindBack();
    },

    // ========== PRE-CHECK ==========

    _renderPreCheck(container) {
        const label = this._getCurrentLabel();
        UI.setTitle('Pre-Check');
        let html = this._header(label, 'Controllo preliminare');

        html += '<div style="padding: 0 16px; display:flex; flex-direction:column; gap:8px;">';
        for (const opt of CONFIG.PRE_CHECK) {
            html += `<button class="btn btn-outline pre-check-btn" data-value="${opt.value}" style="text-align:left;">
                <span style="margin-right:8px;">${opt.icon}</span> ${opt.label}
            </button>`;
        }
        html += '</div>';
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.pre-check-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const val = btn.dataset.value;
                if (val === 'NDR') {
                    // NDR su Pareti senza parete specifica → chiedi wall_count per split
                    if (this.obs.element === 'Pareti' && !this.obs.wall) {
                        this._askWallCountForNdr();
                        return;
                    }
                    await Events.dispatch('set_room_ndr', this.sopId, {
                        room_name: this.roomName, element: this.obs.element,
                        wall: this.obs.wall, balcone_sub: this.obs.balcone_sub,
                        has_counterwall: this.obs.has_counterwall,
                        stair_subsection: this.obs.stair_subsection,
                        has_cdp: this.obs.has_cdp
                    });
                    UI.toast('NDR registrato');
                    this._returnToRoom();
                } else if (val === 'NON_VISIBILE') {
                    await Events.dispatch('set_room_non_visibile', this.sopId, {
                        room_name: this.roomName, element: this.obs.element,
                        wall: this.obs.wall, balcone_sub: this.obs.balcone_sub,
                        has_counterwall: this.obs.has_counterwall,
                        stair_subsection: this.obs.stair_subsection
                    });
                    UI.toast('Non visibile registrato');
                    this._returnToRoom();
                } else if (val === 'INGOMBRA') {
                    await Events.dispatch('set_room_ingombra', this.sopId, {
                        room_name: this.roomName, element: this.obs.element,
                        wall: this.obs.wall, balcone_sub: this.obs.balcone_sub,
                        has_counterwall: this.obs.has_counterwall,
                        stair_subsection: this.obs.stair_subsection
                    });
                    UI.toast('Ingombra registrato');
                    this._returnToRoom();
                } else if (val === 'PARZIALE') {
                    this.obs.parz_ingombra = true;
                    this.obs.notes = 'Parzialmente Ingombra';
                    this.step = 'parziale_choice';
                    this.renderStep();
                } else {
                    // PROCEDI
                    this.step = this._afterPreCheckStep();
                    this.renderStep();
                }
            });
        });
        this._bindBack();
    },

    // ========== PARZIALE CHOICE (NDR o difetto) ==========

    _renderParzialeChoice(container) {
        const label = this._getCurrentLabel();
        UI.setTitle('Parzialmente Ingombra');
        let html = this._header(label, 'Parzialmente ingombra — cosa vuoi fare?');
        html += `<div style="padding: 0 16px; display:flex; flex-direction:column; gap:12px;">
            <button class="btn btn-secondary" id="btn-parz-ndr" style="background: #2e7d32; color: white; font-size:15px;">
                🟢 NDR — Nulla da rilevare
            </button>
            <button class="btn btn-primary" id="btn-parz-difetto" style="font-size:15px;">
                🔍 Ho trovato un difetto — Procedi
            </button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        // NDR diretto
        document.getElementById('btn-parz-ndr')?.addEventListener('click', async () => {
            await Events.dispatch('set_room_ndr', this.sopId, {
                room_name: this.roomName, element: this.obs.element,
                wall: this.obs.wall, balcone_sub: this.obs.balcone_sub,
                has_counterwall: this.obs.has_counterwall,
                stair_subsection: this.obs.stair_subsection,
                has_cdp: this.obs.has_cdp,
                parz_ingombra: true
            });
            UI.toast('🟢 Parzialmente ingombra NDR registrato');
            this._returnToRoom();
        });

        // Difetto → continua wizard
        document.getElementById('btn-parz-difetto')?.addEventListener('click', () => {
            this.step = this._afterPreCheckStep();
            this.renderStep();
        });

        this._bindBack();
    },

    // ========== INFISSO STEPS ==========

    _renderInfissoType(container) {
        UI.setTitle('Tipo Elemento/Varco');
        const isProsp = CONFIG.isProspettoRoom(this.roomName);
        const subElems = isProsp ? CONFIG.VARCO_SUB_ELEMENTS_PROSPETTI : CONFIG.getVarcoSubElements();

        let html = this._header('Elemento/Varco', 'Seleziona il tipo');
        html += UI.buttonGrid(subElems.map(e => ({ value: e, label: e })), { cols: 2 });
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.infisso_type = btn.dataset.value;
                // Porta interna → chiedi vano confinante (allineato a bot.py)
                if (this.obs.infisso_type.toLowerCase().includes('porta interna')) {
                    this.step = 'infisso_confine';
                } else {
                    this.step = 'infisso_location';
                }
                this.renderStep();
            });
        });
        this._bindBack();
    },

    // ========== INFISSO CONFINE (Vs quale vano?) ==========

    _renderInfissoConfine(container) {
        UI.setTitle('Vano Confinante');
        let html = this._header('Porta interna', 'Verso quale vano confina?');

        // Lista vani esistenti (escluso il vano corrente)
        const rooms = this._sop ? Events.getActiveRooms(this._sop) : {};
        const roomNames = Object.keys(rooms).filter(n => n !== this.roomName);

        if (roomNames.length > 0) {
            const choices = roomNames.map(n => ({ value: n, label: n }));
            choices.push({ value: '__manual__', label: '✏️ Scrivi a mano' });
            choices.push({ value: '__skip__', label: 'Salta' });
            html += UI.buttonGrid(choices, { cols: 2 });
        } else {
            html += `<div style="padding: 0 16px;">
                ${UI.formInput({ id: 'confine-manual', placeholder: 'Es. Cucina, Bagno, Corridoio' }).trim()}
            </div>
            <div style="padding: 8px 16px; display:flex; gap:8px;">
                <button class="btn btn-primary" id="btn-confine-ok" style="flex:1;">Avanti</button>
                <button class="btn btn-secondary" id="btn-confine-skip" style="flex:1;">Salta</button>
            </div>`;
        }
        html += this._backBtn();
        container.innerHTML = html;

        if (roomNames.length > 0) {
            container.querySelectorAll('.btn-choice').forEach(btn => {
                btn.addEventListener('click', () => {
                    const val = btn.dataset.value;
                    if (val === '__skip__') {
                        this.obs.infisso_confine = null;
                        this.step = 'infisso_location';
                        this.renderStep();
                    } else if (val === '__manual__') {
                        // Re-render con input manuale
                        this._renderInfissoConfineManual(container);
                    } else {
                        // Estrai il nome del vano dalla label (potrebbe essere "1. Cucina")
                        const roomData = rooms[val];
                        const confName = roomData?.destination || roomData?.room_name || val;
                        this.obs.infisso_confine = confName;
                        this.step = 'infisso_location';
                        this.renderStep();
                    }
                });
            });
        } else {
            document.getElementById('btn-confine-ok')?.addEventListener('click', () => {
                const val = (document.getElementById('confine-manual')?.value || '').trim();
                this.obs.infisso_confine = val || null;
                this.step = 'infisso_location';
                this.renderStep();
            });
            document.getElementById('btn-confine-skip')?.addEventListener('click', () => {
                this.obs.infisso_confine = null;
                this.step = 'infisso_location';
                this.renderStep();
            });
        }
        this._bindBack();
    },

    _renderInfissoConfineManual(container) {
        let html = this._header('Porta interna', 'Scrivi il vano confinante');
        html += `<div style="padding: 0 16px;">
            ${UI.formInput({ id: 'confine-manual', placeholder: 'Es. Cucina, Bagno, Corridoio' }).trim()}
        </div>
        <div style="padding: 8px 16px; display:flex; gap:8px;">
            <button class="btn btn-primary" id="btn-confine-ok" style="flex:1;">Avanti</button>
            <button class="btn btn-secondary" id="btn-confine-skip" style="flex:1;">Salta</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        const input = document.getElementById('confine-manual');
        if (input) setTimeout(() => input.focus(), 100);

        document.getElementById('btn-confine-ok')?.addEventListener('click', () => {
            this.obs.infisso_confine = (input?.value || '').trim() || null;
            this.step = 'infisso_location';
            this.renderStep();
        });
        document.getElementById('btn-confine-skip')?.addEventListener('click', () => {
            this.obs.infisso_confine = null;
            this.step = 'infisso_location';
            this.renderStep();
        });
        this._bindBack();
    },

    _renderInfissoLocation(container) {
        UI.setTitle('Posizione');
        let html = this._header(this.obs.infisso_type, 'Dove si trova?');
        html += UI.buttonGrid(CONFIG.VARCO_LOCATIONS, { cols: 2 });
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.infisso_location = btn.dataset.value;
                if (this.obs.infisso_location.startsWith('Parete')) {
                    this.obs.infisso_wall = this.obs.infisso_location;
                    this.step = 'infisso_which';
                } else {
                    this.step = 'infisso_which';
                }
                this.renderStep();
            });
        });
        this._bindBack();
    },

    _renderInfissoWall(container) {
        UI.setTitle('Parete Infisso');
        let html = this._header(this.obs.infisso_type, 'Su quale parete?');
        html += UI.buttonGrid(CONFIG.WALL_LABELS);
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.infisso_wall = btn.dataset.value;
                this.step = 'infisso_which';
                this.renderStep();
            });
        });
        this._bindBack();
    },

    _renderInfissoWhich(container) {
        UI.setTitle('Identificazione');
        const loc = this.obs.infisso_wall || this.obs.infisso_location || '';
        let html = this._header(`${this.obs.infisso_type} - ${loc}`, 'Identifica quale (es. 1 da SX)');
        html += `<div style="padding: 0 16px;">
            ${UI.formInput({ id: 'infisso-which', placeholder: 'Es. 1 da SX, unico, centrale' }).trim()}
        </div>
        <div style="padding: 8px 16px;"><button class="btn btn-primary" id="btn-next">Avanti</button></div>`;
        html += this._backBtn();
        container.innerHTML = html;

        const input = document.getElementById('infisso-which');
        setTimeout(() => input.focus(), 100);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-next').click(); });

        document.getElementById('btn-next').addEventListener('click', () => {
            const val = input.value.trim();
            if (!val) { UI.toast('Inserisci un valore'); return; }
            this.obs.infisso_which = val;
            this.step = 'infisso_sub_pos';
            this.renderStep();
        });
        this._bindBack();
    },

    _renderInfissoSubPos(container) {
        UI.setTitle('Dettaglio');
        let html = this._header(`${this.obs.infisso_type} ${this.obs.infisso_which}`, 'Parte specifica');
        html += UI.buttonGrid(CONFIG.VARCO_DEFECT_POSITIONS, { cols: 3 });
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.obs.infisso_sub_pos = btn.dataset.value;
                this.step = 'pre_check';
                this.renderStep();
            });
        });
        this._bindBack();
    },

    // ========== POSITION ==========

    _renderPosition(container) {
        const label = this._getCurrentLabel();
        const isProsp = CONFIG.isProspettoRoom(this.roomName);
        const positions = CONFIG.getPositions(this.obs.element, isProsp);
        const selected = this.obs.positions_selected || [];

        UI.setTitle('Posizione');
        let html = this._header(label, 'Seleziona posizione (multipla)');

        if (selected.length > 0) {
            html += `<div style="padding:4px 16px; color:var(--hint); font-size:13px;">Selezionati: <strong style="color:var(--text);">${selected.join(', ')}</strong></div>`;
        }

        html += '<div style="padding: 8px 16px;" class="chip-list">';
        for (const p of positions) {
            const sel = selected.includes(p) ? ' selected' : '';
            html += `<button class="menu-chip check${sel}" data-value="${UI._escapeHtml(p)}">${selected.includes(p) ? '✅ ' : ''}${UI._escapeHtml(p)}</button>`;
        }
        html += '</div>';

        html += `<div style="padding: 8px 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-pos-ok">Procedi</button>
            <button class="btn btn-outline" id="btn-pos-manual">Scrivi a mano</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.menu-chip.check').forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.value;
                const idx = this.obs.positions_selected.indexOf(val);
                if (idx >= 0) this.obs.positions_selected.splice(idx, 1);
                else this.obs.positions_selected.push(val);
                this.renderStep();
            });
        });

        document.getElementById('btn-pos-ok').addEventListener('click', () => {
            if (this.obs.positions_selected.length === 0) { UI.toast('Seleziona almeno una posizione'); return; }
            this.obs.position = this.obs.positions_selected.join(', ');
            if (this.obs.positions_selected.includes('presso elemento')) {
                this.step = 'position_elemento';
            } else {
                this.step = 'phenomenon';
            }
            this.renderStep();
        });

        document.getElementById('btn-pos-manual').addEventListener('click', () => {
            this.step = 'position_elemento';
            this.renderStep();
        });
        this._bindBack();
    },

    _renderPositionElemento(container) {
        UI.setTitle('Dettaglio Posizione');
        let html = this._header('Posizione', 'Specifica la posizione');
        html += `<div style="padding: 0 16px;">
            ${UI.formInput({ id: 'pos-elem', placeholder: 'Es. porta, finestra 1 da SX' }).trim()}
        </div>
        <div style="padding: 8px 16px;"><button class="btn btn-primary" id="btn-next">Avanti</button></div>`;
        html += this._backBtn();
        container.innerHTML = html;

        const input = document.getElementById('pos-elem');
        setTimeout(() => input.focus(), 100);

        document.getElementById('btn-next').addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                const filtered = this.obs.positions_selected.filter(p => p !== 'presso elemento');
                filtered.push(`presso ${val}`);
                this.obs.positions_selected = filtered;
                this.obs.position = filtered.join(', ');
            }
            this.step = 'phenomenon';
            this.renderStep();
        });
        this._bindBack();
    },

    // ========== PHENOMENON ==========

    _renderPhenomenon(container) {
        const label = this._getCurrentLabel();
        const phenomena = CONFIG.getPhenomena(this.obs.element);

        UI.setTitle('Fenomeno');
        let html = this._header(label, 'Seleziona il difetto');
        html += UI.chipList(phenomena);

        if (this.obs.parz_ingombra || this.obs.non_visibile) {
            html += `<div style="padding:8px 16px;"><button class="menu-chip" data-value="NDR">🟢 NDR</button></div>`;
        }
        // Scrivi a Mano
        html += `<div style="padding:8px 16px;"><button class="btn btn-outline" id="btn-phen-manual">✏️ SCRIVI A MANO</button></div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.menu-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.obs.phenomenon = chip.dataset.value;
                this.step = this.obs.phenomenon === 'NDR' ? 'notes' : 'specifics';
                this.renderStep();
            });
        });

        // Scrivi a Mano fenomeno
        document.getElementById('btn-phen-manual')?.addEventListener('click', () => {
            UI.promptInput('Scrivi a Mano', 'Scrivi la descrizione completa del difetto', (val) => {
                if (!val) return;
                this.obs.phenomenon = val;
                this.step = 'notes';
                this.renderStep();
            }, { multiline: true });
        });
        this._bindBack();
    },

    // ========== SPECIFICS ==========

    _renderSpecifics(container) {
        const selected = this.obs.specifics || [];
        UI.setTitle('Specifiche');
        let html = this._header(this.obs.phenomenon || '', 'Specifiche (multipla)');

        if (selected.length > 0) {
            html += `<div style="padding:4px 16px; color:var(--hint); font-size:13px;">Sel: <strong style="color:var(--text);">${selected.join(', ')}</strong></div>`;
        }

        html += '<div style="padding: 8px 16px;" class="chip-list">';
        for (const s of CONFIG.DEFECT_SPECIFICS) {
            const sel = selected.includes(s) ? ' selected' : '';
            html += `<button class="menu-chip check${sel}" data-value="${UI._escapeHtml(s)}">${selected.includes(s) ? '✅ ' : ''}${UI._escapeHtml(s)}</button>`;
        }
        html += '</div>';

        html += `<div style="padding:8px 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-proceed">Procedi</button>
            <button class="btn btn-secondary" id="btn-skip">Salta</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.menu-chip.check').forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.value;
                const idx = this.obs.specifics.indexOf(val);
                if (idx >= 0) this.obs.specifics.splice(idx, 1);
                else this.obs.specifics.push(val);
                this.renderStep();
            });
        });

        document.getElementById('btn-proceed').addEventListener('click', () => { this.step = 'details'; this.renderStep(); });
        document.getElementById('btn-skip').addEventListener('click', () => { this.obs.specifics = []; this.step = 'details'; this.renderStep(); });
        this._bindBack();
    },

    // ========== ATTRIBUTES ==========

    _renderDetails(container) {
        const selected = this.obs.attributes || [];
        UI.setTitle('Attributi');
        let html = this._header(this.obs.phenomenon || '', 'Attributi (multipla)');

        if (selected.length > 0) {
            html += `<div style="padding:4px 16px; color:var(--hint); font-size:13px;">Sel: <strong style="color:var(--text);">${selected.join(', ')}</strong></div>`;
        }

        html += '<div style="padding: 8px 16px;" class="chip-list">';
        for (const a of CONFIG.ATTRIBUTES) {
            const sel = selected.includes(a) ? ' selected' : '';
            html += `<button class="menu-chip check${sel}" data-value="${UI._escapeHtml(a)}">${selected.includes(a) ? '✅ ' : ''}${UI._escapeHtml(a)}</button>`;
        }
        html += '</div>';

        html += `<div style="padding:8px 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-outline" id="btn-det-manual">✏️ AGGIUNGI MANUALE</button>
            <button class="btn btn-primary" id="btn-proceed">Procedi</button>
            <button class="btn btn-secondary" id="btn-skip">Salta</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.menu-chip.check').forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.value;
                const idx = this.obs.attributes.indexOf(val);
                if (idx >= 0) this.obs.attributes.splice(idx, 1);
                else this.obs.attributes.push(val);
                this.renderStep();
            });
        });

        // Aggiungi manuale
        document.getElementById('btn-det-manual')?.addEventListener('click', () => {
            UI.promptInput('Attributo manuale', 'Es. larghezza 3mm, profondita\' 2cm', (val) => {
                if (!val) return;
                this.obs.attributes.push(val);
                this.renderStep();
            });
        });

        document.getElementById('btn-proceed').addEventListener('click', () => { this.step = 'prosecution'; this.renderStep(); });
        document.getElementById('btn-skip').addEventListener('click', () => { this.obs.attributes = []; this.step = 'prosecution'; this.renderStep(); });
        this._bindBack();
    },

    // ========== PROSECUTION ==========

    _renderProsecution(container) {
        UI.setTitle('Prosecuzione');
        let html = this._header(this.obs.phenomenon || '', 'Il difetto prosegue?');
        if (this.obs.prosecutions.length > 0) {
            html += `<div style="padding:4px 16px; color:var(--hint); font-size:13px;">Prosegue su: <strong style="color:var(--text);">${this.obs.prosecutions.join(', ')}</strong></div>`;
        }
        html += `<div style="padding: 0 16px;" class="btn-grid">
            <button class="btn-choice" data-value="yes">Si'</button>
            <button class="btn-choice" data-value="no">No</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this.step = btn.dataset.value === 'yes' ? 'prosecution_target' : 'notes';
                this.renderStep();
            });
        });
        this._bindBack();
    },

    _renderProsecutionTarget(container) {
        UI.setTitle('Dove Prosegue');
        let html = this._header('Prosecuzione', 'Seleziona superficie');
        if (this.obs.prosecutions.length > 0) {
            html += `<div style="padding:4px 16px; color:var(--hint); font-size:13px;">Gia' aggiunti: <strong style="color:var(--text);">${this.obs.prosecutions.join(', ')}</strong></div>`;
        }
        html += UI.buttonGrid(CONFIG.PROSECUTION_TARGETS, { cols: 2 });
        html += `<div style="padding:8px 16px;"><button class="btn btn-primary" id="btn-done">Fine</button></div>`;
        html += this._backBtn();
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.value;
                if (!this.obs.prosecutions.includes(t)) this.obs.prosecutions.push(t);
                this.renderStep();
            });
        });
        document.getElementById('btn-done').addEventListener('click', () => { this.step = 'notes'; this.renderStep(); });
        this._bindBack();
    },

    // ========== NOTES ==========

    _renderNotes(container) {
        UI.setTitle('Note');
        let html = this._header('Note', 'Opzionale');
        html += `<div style="padding: 0 16px;">
            <textarea class="form-input form-textarea" id="wiz-notes" rows="3" placeholder="Note aggiuntive...">${UI._escapeHtml(this.obs.notes || '')}</textarea>
        </div>
        <div style="padding: 8px 16px;"><button class="btn btn-primary" id="btn-next">Avanti</button></div>`;
        html += this._backBtn();
        container.innerHTML = html;

        document.getElementById('btn-next').addEventListener('click', () => {
            this.obs.notes = document.getElementById('wiz-notes').value.trim();
            this.step = 'photo';
            this.renderStep();
        });
        this._bindBack();
    },

    // ========== PHOTO ==========

    _renderPhoto(container) {
        UI.setTitle('Foto Dettaglio');
        let html = this._header('Foto', 'Scatta o seleziona foto');
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-photo-cam">📷 Scatta Foto</button>
            <button class="btn btn-outline" id="btn-photo-gal">🖼 Galleria</button>
            <button class="btn btn-secondary" id="btn-photo-skip">Salta</button>
        </div>`;
        html += this._backBtn();
        container.innerHTML = html;

        const savePhoto = async (result) => {
            if (!result) return;
            const { id, filename } = await Photos.save(this.sopId, this.roomName, 'dettaglio', result.blob, result.thumbnail);
            this.obs.photo_id = id;
            await Events.dispatch('add_photo', this.sopId, {
                room_name: this.roomName, photo_id: id, type: 'dettaglio', filename
            });
            UI.toast('Foto salvata');
            this.step = 'confirm';
            this.renderStep();
        };

        document.getElementById('btn-photo-cam').addEventListener('click', async () => savePhoto(await Photos.takePhoto()));
        document.getElementById('btn-photo-gal').addEventListener('click', async () => savePhoto(await Photos.fromGallery()));
        document.getElementById('btn-photo-skip').addEventListener('click', () => {
            this.obs.photo_id = null;
            this.step = 'confirm';
            this.renderStep();
        });
        this._bindBack();
    },

    // ========== CONFIRM ==========

    async _renderConfirm(container) {
        UI.setTitle('Conferma');
        const esc = UI._escapeHtml;

        let previewText = '';
        if (typeof Formatters !== 'undefined' && Formatters.formatObservationText) {
            previewText = Formatters.formatObservationText(this.obs, { includeVF: false });
        } else {
            previewText = [this.obs.element, this.obs.wall, this.obs.phenomenon].filter(Boolean).join(' ');
        }

        let html = this._header('Riepilogo', this.roomName);
        html += UI.previewBox(previewText);

        // Details
        html += '<div class="section"><div class="section-body">';
        const rows = [
            ['Elemento', this.obs.stair_subsection || this.obs.wall || this.obs.balcone_sub || this.obs.element],
            this.obs.has_counterwall ? ['Controparete', 'Si\''] : null,
            this.obs.has_cdp ? ['CDP', 'Si\''] : null,
            this.obs.infisso_type ? ['Varco', `${this.obs.infisso_type}${this.obs.infisso_confine ? ' (Vs ' + this.obs.infisso_confine + ')' : ''} ${this.obs.infisso_which || ''}`] : null,
            this.obs.position ? ['Posizione', this.obs.position] : null,
            this.obs.phenomenon ? ['Fenomeno', this.obs.phenomenon] : null,
            this.obs.specifics.length > 0 ? ['Specifiche', this.obs.specifics.join(', ')] : null,
            this.obs.attributes.length > 0 ? ['Attributi', this.obs.attributes.join(', ')] : null,
            this.obs.prosecutions.length > 0 ? ['Prosegue', this.obs.prosecutions.join(', ')] : null,
            this.obs.notes ? ['Note', this.obs.notes] : null,
            ['Foto', this.obs.photo_id ? 'Si\'' : 'No']
        ].filter(Boolean);

        for (const [label, value] of rows) {
            html += `<div class="cell" style="cursor:default;"><div class="cell-body">
                <div class="cell-subtitle">${esc(label)}</div>
                <div class="cell-title">${esc(value)}</div>
            </div></div>`;
        }
        html += '</div></div>';

        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-save">Salva</button>
            <button class="btn btn-outline" id="btn-save-new">Salva e Nuova</button>
            <button class="btn btn-secondary" id="btn-cancel">Annulla</button>
        </div><div style="height:32px;"></div>`;

        container.innerHTML = html;

        document.getElementById('btn-save').addEventListener('click', async () => {
            await this._saveObs();
            this._returnToRoom();
        });

        document.getElementById('btn-save-new').addEventListener('click', async () => {
            await this._saveObs();
            this.obs = this._emptyObs();
            const rooms = Events.getActiveRooms(this._sop);
            const room = rooms[this.roomName];
            const isStair = room && CONFIG.isStairRoom(this.roomName);
            const isProsp = CONFIG.isProspettoRoom(this.roomName);
            this.step = isStair ? 'stair_subsection' : (isProsp ? 'element_prospetto' : 'element');
            this.renderStep();
        });

        document.getElementById('btn-cancel').addEventListener('click', () => this._returnToRoom());
    },

    async _saveObs() {
        // NDR auto-remove: se si aggiunge un difetto su una parete che aveva NDR, rimuovi l'NDR
        if (this.obs.phenomenon && this.obs.phenomenon !== 'NDR') {
            const freshSop = await DB.getSopralluogo(this.sopId);
            const rooms = freshSop ? (Events.getActiveRooms(freshSop)) : {};
            const room = rooms[this.roomName];
            if (room && room.observations) {
                const hasNdr = room.observations.some(obs => {
                    if (obs.phenomenon !== 'NDR') return false;
                    // NDR generico su Pareti (senza wall) → rimuovi se stiamo aggiungendo difetto su una parete
                    if (this.obs.element === 'Pareti' && this.obs.wall && obs.element === 'Pareti' && !obs.wall) return true;
                    // NDR specifico su stessa parete
                    if (this.obs.wall && obs.wall === this.obs.wall && obs.element === this.obs.element) return true;
                    // NDR su stesso elemento (non Pareti)
                    if (!this.obs.wall && obs.element === this.obs.element && !obs.wall) return true;
                    return false;
                });
                if (hasNdr) {
                    await Events.dispatch('remove_ndr', this.sopId, {
                        room_name: this.roomName,
                        element: this.obs.element,
                        wall: this.obs.wall || null
                    });
                }
            }
        }

        await Events.dispatch('add_observation', this.sopId, {
            room_name: this.roomName,
            element: this.obs.element,
            wall: this.obs.wall,
            has_counterwall: this.obs.has_counterwall,
            has_cdp: this.obs.has_cdp,
            balcone_sub: this.obs.balcone_sub,
            position: this.obs.position,
            positions_selected: this.obs.positions_selected,
            phenomenon: this.obs.phenomenon,
            specifics: this.obs.specifics,
            attributes: this.obs.attributes,
            prosecutions: this.obs.prosecutions,
            notes: this.obs.notes,
            photo_id: this.obs.photo_id,
            non_visibile: this.obs.non_visibile,
            parz_ingombra: this.obs.parz_ingombra,
            infisso_type: this.obs.infisso_type,
            infisso_location: this.obs.infisso_location,
            infisso_wall: this.obs.infisso_wall,
            infisso_which: this.obs.infisso_which,
            infisso_confine: this.obs.infisso_confine,
            infisso_sub_pos: this.obs.infisso_sub_pos,
            stair_subsection: this.obs.stair_subsection,
            prosp_floor: this.obs.prosp_floor,
            prosp_href: this.obs.prosp_href
        });
        UI.toast('Osservazione salvata');
    },

    _returnToRoom() {
        App.navigate(`rooms/${this.sopId}/${encodeURIComponent(this.roomName)}`);
    },

    /**
     * NDR su Pareti generico: chiede quante pareti ha il vano,
     * salva wall_count, poi fa split_pareti_ndr per creare NDR individuali
     */
    _askWallCountForNdr() {
        const container = document.getElementById('app-content');
        if (!container) return;

        let html = this._header('NDR Pareti', 'Quante pareti ha il vano?');
        html += UI.buttonGrid([
            { value: '3', label: '3 Pareti' },
            { value: '4', label: '4 Pareti' },
            { value: '5', label: '5 Pareti' },
            { value: '6', label: '6 Pareti' }
        ], { cols: 2 });
        html += this._backBtn();

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                const wallCount = parseInt(btn.dataset.value);
                // Salva wall_count sul vano
                await Events.dispatch('set_room_wall_count', this.sopId, {
                    room_name: this.roomName,
                    wall_count: wallCount
                });
                // Registra NDR generico (verrà subito splittato)
                await Events.dispatch('set_room_ndr', this.sopId, {
                    room_name: this.roomName,
                    element: this.obs.element,
                    wall: null,
                    balcone_sub: this.obs.balcone_sub,
                    has_counterwall: this.obs.has_counterwall,
                    stair_subsection: this.obs.stair_subsection,
                    has_cdp: this.obs.has_cdp
                });
                // Split in NDR individuali per parete
                await Events.dispatch('split_pareti_ndr', this.sopId, {
                    room_name: this.roomName,
                    wall_count: wallCount
                });
                // Salva CDP sul vano se indicato
                if (this.obs.has_cdp) {
                    await Events.dispatch('set_room_cdp', this.sopId, {
                        room_name: this.roomName,
                        has_cdp: true
                    });
                }
                UI.toast(`NDR registrato su ${wallCount} pareti`);
                this._returnToRoom();
            });
        });
        this._bindBack();
    },


    _getCurrentLabel() {
        if (this.obs.stair_subsection) return this.obs.stair_subsection;
        if (this.obs.wall) {
            let l = this.obs.wall;
            if (this.obs.has_counterwall) l += ' (c/p)';
            return l;
        }
        if (this.obs.balcone_sub) return `Balcone - ${this.obs.balcone_sub}`;
        if (this.obs.infisso_type) return `${this.obs.infisso_type} ${this.obs.infisso_which || ''}`.trim();
        return this.obs.element || '?';
    }
};
