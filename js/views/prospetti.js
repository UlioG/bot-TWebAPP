/**
 * prospetti.js - Gestione Prospetti (Parti Comuni)
 * Flusso: Rivestimento -> Selezione (A-H) -> Lista -> Entry -> Piano -> HREF -> Wizard
 * Architettura: Events.dispatch() per tutte le mutazioni
 */
const ProspettiView = {
    sopId: null,
    _view: 'init',
    _currentProspetto: null,
    _tempRiv: {},
    _tempHref: {},
    _tempProspFloor: '',

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.setTitle('Prospetti');
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        // Determina stato iniziale
        if (sop.prosp_selected && sop.prosp_selected.length > 0) {
            this._view = 'list';
        } else if (sop.prosp_rivestimento) {
            this._view = 'selection';
        } else {
            this._view = 'rivestimento';
        }

        this._renderView(container, sop);
    },

    async _renderView(container, sop) {
        if (!sop) sop = await DB.getSopralluogo(this.sopId);
        switch (this._view) {
            case 'rivestimento': this._renderRivestimento(container, sop); break;
            case 'riv_materiale': this._renderRivMateriale(container, sop); break;
            case 'riv_piani': this._renderRivPiani(container, sop); break;
            case 'selection': this._renderSelection(container, sop); break;
            case 'list': this._renderList(container, sop); break;
            case 'entry': this._renderEntry(container, sop); break;
            case 'prosp_floor': this._renderProspFloor(container, sop); break;
            case 'prosp_floor_between': this._renderProspFloorBetween(container, sop); break;
            case 'prosp_href_case': this._renderHrefCase(container, sop); break;
            case 'prosp_href_type': this._renderHrefType(container, sop); break;
            case 'prosp_href_num': this._renderHrefNum(container, sop); break;
            case 'prosp_href_dir': this._renderHrefDir(container, sop); break;
            case 'prosp_href_num2': this._renderHrefNum2(container, sop); break;
        }
    },

    // ========== RIVESTIMENTO ==========

    _renderRivestimento(container, sop) {
        const esc = UI._escapeHtml;
        let html = UI.wizardHeader('Rivestimento', 'L\'edificio ha un rivestimento esterno?');

        html += UI.buttonGrid([
            { value: 'totale', label: 'Si\', totale' },
            { value: 'parziale', label: 'Si\', parziale' },
            { value: 'no', label: 'No / Salta' }
        ], { cols: 3 });

        html += `<div style="padding: 16px;">
            <button class="btn btn-secondary" id="btn-back-rooms" style="width:100%;">← Torna ai Vani</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                const val = btn.dataset.value;
                if (val === 'no') {
                    await Events.dispatch('update_setup', this.sopId, {
                        prosp_rivestimento: { tipo: 'no' }
                    });
                    this._view = 'selection';
                    this._renderView(container);
                } else {
                    this._tempRiv = { tipo: val };
                    this._view = 'riv_materiale';
                    this._renderView(container);
                }
            });
        });

        document.getElementById('btn-back-rooms').addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });
    },

    _renderRivMateriale(container, sop) {
        let html = UI.wizardHeader('Materiale Rivestimento', 'Descrivi il materiale (opzionale)');
        html += UI.formInput({
            label: 'Materiale',
            placeholder: 'Es. Travertino, Intonaco...',
            id: 'field-riv-materiale',
            value: ''
        });
        html += `<div style="padding: 16px; display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="btn-riv-skip" style="flex:1;">Salta</button>
            <button class="btn btn-primary" id="btn-riv-next" style="flex:1;">Avanti</button>
        </div>`;

        container.innerHTML = html;

        const nextAction = async () => {
            const input = document.getElementById('field-riv-materiale');
            this._tempRiv.materiale = input ? input.value.trim() : '';
            if (this._tempRiv.tipo === 'parziale') {
                this._view = 'riv_piani';
                this._renderView(container);
            } else {
                await Events.dispatch('update_setup', this.sopId, {
                    prosp_rivestimento: this._tempRiv
                });
                this._view = 'selection';
                this._renderView(container);
            }
        };

        document.getElementById('btn-riv-skip').addEventListener('click', async () => {
            this._tempRiv.materiale = '';
            await nextAction();
        });
        document.getElementById('btn-riv-next').addEventListener('click', nextAction);
    },

    _renderRivPiani(container, sop) {
        let html = UI.wizardHeader('Piani Rivestiti', 'Indica i piani con rivestimento');
        html += UI.formInput({
            label: 'Piani',
            placeholder: 'Es. Piano 1 e Piano 2',
            id: 'field-riv-piani',
            value: ''
        });
        html += `<div style="padding: 16px; display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="btn-piani-skip" style="flex:1;">Salta</button>
            <button class="btn btn-primary" id="btn-piani-next" style="flex:1;">Avanti</button>
        </div>`;

        container.innerHTML = html;

        const finalize = async () => {
            const input = document.getElementById('field-riv-piani');
            this._tempRiv.piani = input ? input.value.trim() : '';
            await Events.dispatch('update_setup', this.sopId, {
                prosp_rivestimento: this._tempRiv
            });
            this._view = 'selection';
            this._renderView(container);
        };

        document.getElementById('btn-piani-skip').addEventListener('click', () => {
            this._tempRiv.piani = '';
            finalize();
        });
        document.getElementById('btn-piani-next').addEventListener('click', finalize);
    },

    // ========== SELEZIONE PROSPETTI (checkbox A-H) ==========

    _renderSelection(container, sop) {
        const esc = UI._escapeHtml;
        const selected = new Set(sop.prosp_selected || []);

        let html = UI.wizardHeader('Seleziona Prospetti', 'Tocca per selezionare/deselezionare');

        // Griglia A-H
        const labels = CONFIG.PROSPETTO_DEFAULT_LABELS || [];
        const btns = labels.map(label => {
            const letter = label.replace('Prospetto ', '');
            const sel = selected.has(label) ? ' selected' : '';
            return `<button class="btn-choice${sel}" data-value="${esc(label)}">${esc(letter)}</button>`;
        }).join('');
        html += `<div class="btn-grid btn-grid-3" id="prosp-grid">${btns}</div>`;

        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-secondary" id="btn-prosp-custom" style="width:100%;">Aggiungi Personalizzato</button>
            <button class="btn btn-primary" id="btn-prosp-confirm" style="width:100%;">Conferma Selezione</button>
        </div>`;

        container.innerHTML = html;

        // Toggle selezione
        container.querySelectorAll('#prosp-grid .btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.value;
                if (selected.has(val)) {
                    selected.delete(val);
                    btn.classList.remove('selected');
                } else {
                    selected.add(val);
                    btn.classList.add('selected');
                }
            });
        });

        // Custom
        document.getElementById('btn-prosp-custom').addEventListener('click', () => {
            UI.promptInput('Nome Prospetto', 'Es. Prospetto Interno', (val) => {
                selected.add(val);
                this._renderView(container, sop); // re-render
            });
        });

        // Conferma
        document.getElementById('btn-prosp-confirm').addEventListener('click', async () => {
            if (selected.size === 0) {
                UI.toast('Seleziona almeno un prospetto');
                return;
            }

            const ordered = Array.from(selected).sort((a, b) => {
                const ia = labels.indexOf(a);
                const ib = labels.indexOf(b);
                return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
            });

            // Crea room per ogni prospetto
            for (const prosp of ordered) {
                const rooms = Events.getActiveRooms(sop);
                if (!rooms[prosp]) {
                    await Events.dispatch('add_vano', this.sopId, {
                        room_number: prosp,
                        room_name: 'Prospetto',
                        full_name: prosp,
                        destination: 'PROSPETTO'
                    });
                }
            }

            await Events.dispatch('update_setup', this.sopId, {
                prosp_selected: ordered
            });

            this._view = 'list';
            this._renderView(container);
        });
    },

    // ========== LISTA PROSPETTI ==========

    async _renderList(container, sop) {
        if (!sop) sop = await DB.getSopralluogo(this.sopId);
        const esc = UI._escapeHtml;
        const prospetti = sop.prosp_selected || [];

        let html = '';

        // Info rivestimento
        if (sop.prosp_rivestimento && sop.prosp_rivestimento.tipo !== 'no') {
            let rivText = sop.prosp_rivestimento.tipo;
            if (sop.prosp_rivestimento.materiale) rivText += ` - ${sop.prosp_rivestimento.materiale}`;
            if (sop.prosp_rivestimento.piani) rivText += ` (${sop.prosp_rivestimento.piani})`;
            html += UI.contextHeader(`Rivestimento: ${rivText}`, '🧱');
        }

        // Celle prospetti
        let cells = '';
        for (const prosp of prospetti) {
            const room = (sop.rooms || {})[prosp] || {};
            const obs = room.observations || [];
            const obsCount = obs.length;
            const hasNdr = obs.some(o => o.phenomenon === 'NDR');

            let subtitle = '';
            if (room.status && room.status !== 'accessible') {
                const labels = { non_accessibile: 'Non Accessibile', non_valutabile: 'Non Valutabile' };
                subtitle = labels[room.status] || room.status;
            } else if (obsCount > 0) {
                const ndrCount = obs.filter(o => o.phenomenon === 'NDR').length;
                const defectCount = obsCount - ndrCount;
                const parts = [];
                if (defectCount > 0) parts.push(`${defectCount} difett${defectCount === 1 ? 'o' : 'i'}`);
                if (ndrCount > 0) parts.push(`${ndrCount} NDR`);
                subtitle = parts.join(', ');
            } else {
                subtitle = 'Da analizzare';
            }

            const icon = obsCount > 0 ? '✅' : '⬜';
            cells += UI.cell({
                icon: icon,
                title: prosp,
                subtitle: subtitle,
                dataId: prosp
            });
        }

        if (cells) {
            html += UI.section('PROSPETTI', cells);
        } else {
            html += UI.emptyState('🏛', 'Nessun prospetto', 'Torna indietro e seleziona i prospetti');
        }

        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-secondary" id="btn-edit-selection" style="width:100%;">Modifica Selezione</button>
            <button class="btn btn-secondary" id="btn-back-rooms" style="width:100%;">← Torna ai Vani</button>
        </div>`;

        container.innerHTML = html;

        // Click prospetto
        container.querySelectorAll('.cell[data-id]').forEach(cell => {
            cell.addEventListener('click', () => {
                this._currentProspetto = cell.dataset.id;
                this._view = 'entry';
                this._renderView(container);
            });
        });

        document.getElementById('btn-edit-selection')?.addEventListener('click', () => {
            this._view = 'selection';
            this._renderView(container);
        });

        document.getElementById('btn-back-rooms')?.addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });
    },

    // ========== SINGOLO PROSPETTO ==========

    async _renderEntry(container, sop) {
        if (!sop) sop = await DB.getSopralluogo(this.sopId);
        const esc = UI._escapeHtml;
        const prosp = this._currentProspetto;
        if (!prosp) { this._view = 'list'; this._renderView(container, sop); return; }

        const room = (sop.rooms || {})[prosp] || {};
        const observations = room.observations || [];

        let html = UI.wizardHeader(prosp, `${observations.length} osservazion${observations.length === 1 ? 'e' : 'i'}`);

        // Lista osservazioni
        if (observations.length > 0) {
            let obsHtml = '';
            for (let i = 0; i < observations.length; i++) {
                obsHtml += UI.observationCard(observations[i], i);
            }
            html += UI.section('OSSERVAZIONI', obsHtml);
        } else {
            html += UI.emptyState('', 'Nessuna osservazione', '');
        }

        // Azioni
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-add-obs" style="width:100%;">+ Aggiungi Osservazione</button>
            <button class="btn btn-secondary" id="btn-ndr" style="width:100%; background: #2e7d32; color: white;">🟢 NDR</button>
            <button class="btn btn-secondary" id="btn-status" style="width:100%;">Modifica Stato</button>
            <button class="btn btn-secondary" id="btn-back-list" style="width:100%;">← Lista Prospetti</button>
        </div>`;

        container.innerHTML = html;

        // Delete osservazione
        container.querySelectorAll('.obs-btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.obsIndex);
                UI.confirmAction(`Eliminare osservazione ${idx + 1}?`, async () => {
                    await Events.dispatch('delete_observation', this.sopId, {
                        room_name: prosp,
                        observation_index: idx
                    });
                    this._renderView(container);
                });
            });
        });

        // Aggiungi osservazione (piano -> href -> wizard)
        document.getElementById('btn-add-obs').addEventListener('click', () => {
            this._tempProspFloor = '';
            this._tempHref = {};
            this._view = 'prosp_floor';
            this._renderView(container, sop);
        });

        // NDR intero prospetto (come bot: element = 'Intero Vano')
        document.getElementById('btn-ndr').addEventListener('click', async () => {
            await Events.dispatch('set_room_ndr', this.sopId, {
                room_name: prosp,
                element: 'Intero Vano'
            });
            UI.toast('🟢 NDR salvato');
            this._renderView(container);
        });

        // Stato
        document.getElementById('btn-status').addEventListener('click', () => {
            this._renderProspStatus(container, sop);
        });

        // Indietro
        document.getElementById('btn-back-list').addEventListener('click', () => {
            this._view = 'list';
            this._renderView(container);
        });
    },

    // ========== PIANO PROSPETTO ==========

    _renderProspFloor(container, sop) {
        let html = UI.wizardHeader('Piano', 'A quale piano si riferisce il difetto?');

        const floors = (sop.building_floors && sop.building_floors.length > 0)
            ? sop.building_floors
            : CONFIG.PREDEFINED_FLOORS;

        html += UI.floorGrid(floors);

        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-secondary" id="btn-floor-between" style="width:100%;">Tra due piani</button>
            <button class="btn btn-secondary" id="btn-floor-manual" style="width:100%;">Scrivi a Mano</button>
            <button class="btn btn-secondary" id="btn-floor-skip" style="width:100%;">Salta</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice, .btn-floor').forEach(btn => {
            btn.addEventListener('click', () => {
                this._tempProspFloor = btn.dataset.value;
                this._view = 'prosp_href_case';
                this._renderView(container, sop);
            });
        });

        document.getElementById('btn-floor-between').addEventListener('click', () => {
            this._prosp_floor_step = 1;
            this._prosp_floor_first = '';
            this._view = 'prosp_floor_between';
            this._renderView(container, sop);
        });

        document.getElementById('btn-floor-manual').addEventListener('click', () => {
            UI.promptInput('Piano', 'Scrivi il piano', (val) => {
                this._tempProspFloor = val;
                this._view = 'prosp_href_case';
                this._renderView(container, sop);
            });
        });

        document.getElementById('btn-floor-skip').addEventListener('click', () => {
            this._tempProspFloor = '';
            this._view = 'prosp_href_case';
            this._renderView(container, sop);
        });
    },

    // ========== TRA DUE PIANI ==========

    _renderProspFloorBetween(container, sop) {
        const step = this._prosp_floor_step || 1;
        let html = UI.wizardHeader(step === 1 ? 'Primo Piano' : 'Secondo Piano', 'Seleziona');

        const floors = (sop.building_floors && sop.building_floors.length > 0)
            ? sop.building_floors
            : CONFIG.PREDEFINED_FLOORS;

        html += UI.floorGrid(floors);
        container.innerHTML = html;

        container.querySelectorAll('.btn-choice, .btn-floor').forEach(btn => {
            btn.addEventListener('click', () => {
                const abbr = CONFIG.getFloorAbbr(btn.dataset.value) || btn.dataset.value;
                if (step === 1) {
                    this._prosp_floor_first = abbr;
                    this._prosp_floor_step = 2;
                    this._renderView(container, sop);
                } else {
                    this._tempProspFloor = `tra ${this._prosp_floor_first} e ${abbr}`;
                    this._view = 'prosp_href_case';
                    this._renderView(container, sop);
                }
            });
        });
    },

    // ========== HREF: CASO ==========

    _renderHrefCase(container, sop) {
        let html = UI.wizardHeader('Posizione Orizzontale', 'Riferimento spaziale del difetto');

        html += UI.buttonGrid([
            { value: 'tra', label: '↔ Tra N e N+1' },
            { value: 'presso', label: '📌 Presso N' },
            { value: 'prima', label: '◀ Prima di 1' },
            { value: 'dopo', label: '▶ Dopo N' },
            { value: 'skip', label: 'Nessun riferimento' }
        ], { cols: 1 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.value;
                if (val === 'skip') {
                    this._tempHref = {};
                    this._goToWizard(sop);
                } else {
                    this._tempHref = { case: val };
                    this._view = 'prosp_href_type';
                    this._renderView(container, sop);
                }
            });
        });
    },

    // ========== HREF: TIPO ==========

    _renderHrefType(container, sop) {
        let html = UI.wizardHeader('Tipo Riferimento', 'Seleziona il tipo di elemento');

        const types = CONFIG.PROSP_HREF_TYPES || ['finestra', 'balcone', 'portafinestra'];
        html += UI.buttonGrid(types.map(t => ({ value: t, label: t })), { cols: 3 });

        html += `<div style="padding: 16px;">
            <button class="btn btn-secondary" id="btn-href-custom" style="width:100%;">Scrivi a Mano</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this._tempHref.type = btn.dataset.value;
                this._view = 'prosp_href_num';
                this._renderView(container, sop);
            });
        });

        document.getElementById('btn-href-custom').addEventListener('click', () => {
            UI.promptInput('Tipo', 'Es. portone, colonna...', (val) => {
                this._tempHref.type = val;
                this._view = 'prosp_href_num';
                this._renderView(container, sop);
            });
        });
    },

    // ========== HREF: NUMERO ==========

    _renderHrefNum(container, sop) {
        let html = UI.wizardHeader('Numero', 'Seleziona il numero');

        const nums = [];
        for (let i = 1; i <= 10; i++) nums.push({ value: String(i), label: String(i) });
        html += UI.buttonGrid(nums, { cols: 5 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this._tempHref.num = btn.dataset.value;
                this._view = 'prosp_href_dir';
                this._renderView(container, sop);
            });
        });
    },

    // ========== HREF: DIREZIONE ==========

    _renderHrefDir(container, sop) {
        let html = UI.wizardHeader('Contando da', 'Da che lato si conta?');

        html += UI.buttonGrid([
            { value: 'da SX', label: '← da SX' },
            { value: 'da DX', label: 'da DX →' }
        ], { cols: 1 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this._tempHref.dir = btn.dataset.value;

                if (this._tempHref.case === 'tra' && !this._tempHref.num2) {
                    this._view = 'prosp_href_num2';
                    this._renderView(container, sop);
                    return;
                }

                this._goToWizard(sop);
            });
        });
    },

    // ========== HREF: SECONDO NUMERO (per "tra") ==========

    _renderHrefNum2(container, sop) {
        let html = UI.wizardHeader('Secondo Numero', 'Seleziona il secondo numero');

        const nums = [];
        for (let i = 1; i <= 10; i++) nums.push({ value: String(i), label: String(i) });
        html += UI.buttonGrid(nums, { cols: 5 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this._tempHref.num2 = btn.dataset.value;
                this._goToWizard(sop);
            });
        });
    },

    // ========== NAVIGA AL WIZARD ==========

    _goToWizard(sop) {
        // Costruisci stringa HREF
        let hrefStr = '';
        if (this._tempHref.case && this._tempHref.type && this._tempHref.num) {
            const dir = this._tempHref.dir || '';
            if (this._tempHref.case === 'tra' && this._tempHref.num2) {
                hrefStr = `tra ${this._tempHref.type} ${this._tempHref.num} ${dir} e ${this._tempHref.type} ${this._tempHref.num2} ${dir}`;
            } else if (this._tempHref.case === 'presso') {
                hrefStr = `presso ${this._tempHref.type} ${this._tempHref.num} ${dir}`;
            } else if (this._tempHref.case === 'prima') {
                hrefStr = `prima di ${this._tempHref.type} ${this._tempHref.num} ${dir}`;
            } else if (this._tempHref.case === 'dopo') {
                hrefStr = `dopo ${this._tempHref.type} ${this._tempHref.num} ${dir}`;
            }
            hrefStr = hrefStr.trim();
        }

        // Salva contesto prospetto come proprietà leggibili dal wizard
        this._lastProspFloor = this._tempProspFloor || '';
        this._lastProspHref = hrefStr || '';

        // Naviga al wizard
        const room = encodeURIComponent(this._currentProspetto);
        App.navigate(`wizard/${this.sopId}/${room}`);
    },

    // ========== STATO PROSPETTO ==========

    _renderProspStatus(container, sop) {
        const esc = UI._escapeHtml;
        let html = UI.wizardHeader('Stato Prospetto', 'Seleziona lo stato');

        html += UI.buttonGrid([
            { value: 'accessible', label: 'Accessibile' },
            { value: 'non_accessibile', label: 'Non Accessibile' },
            { value: 'non_valutabile', label: 'Non Valutabile' }
        ], { cols: 3 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                const status = btn.dataset.value;
                await Events.dispatch('set_room_status', this.sopId, {
                    room_name: this._currentProspetto,
                    status: status
                });
                UI.toast('Stato aggiornato');
                this._view = 'entry';
                this._renderView(container);
            });
        });
    }
};
