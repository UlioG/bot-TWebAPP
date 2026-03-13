/* ============================================================
 * wizard.js — Wizard osservazione difetto
 * Flusso IDENTICO al bot:
 *   Elemento → [Parete] → [Controparete] → [CDP] →
 *   Pre-check (NDR/Ingombra/Parz/Non Visibile/Procedi) →
 *   [Posizione] → Fenomeno → [Specifiche] → [Attributi] →
 *   [Prosecuzione] → Note → Foto → Salva
 *
 * Ogni osservazione viene salvata come Foto_N_xxx nel metadata
 * del vano, formato IDENTICO a _save_observation_data_impl in bot.py.
 * ============================================================ */

'use strict';

const WizardView = (() => {

    let _sop = null;
    let _roomName = null;
    let _obs = {};
    let _step = 'element';

    // Steps nel wizard
    const STEPS = [
        'element', 'wall_select', 'counterwall', 'cdp',
        'infisso_type', 'infisso_wall', 'infisso_which', 'infisso_sub_pos',
        'balcone_sub',
        'pre_check', 'parz_ingombra_ndr',
        'position', 'phenomenon', 'specifics', 'attributes',
        'prosecution', 'notes', 'photo', 'save'
    ];

    function _emptyObs() {
        return {
            element: '',
            wall_idx: null,
            positions_selected: [],
            position: '',
            phenomenon: '',
            specifics: [],
            details: [],          // attributes nel bot (chiamato details in temp_observation)
            notes: '',
            infisso_type: '',
            infisso_wall: '',
            infisso_loc: '',
            infisso_confine: '',
            infisso_which: '',
            infisso_sub_pos: '',
            has_counterwall: false,
            has_cdp: false,
            non_visibile: false,
            parz_ingombra: false,
            balcone_sub: '',
            prosecutions: [],
            stair_subsection: '',
            prosp_floor: '',
            prosp_href: '',
            specific_element: '',
            _photo_id: null
        };
    }

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        _roomName = params.room;
        _obs = _emptyObs();
        _step = 'element';

        // Prospetti: carica piano e HREF da params
        if (params.prosp_floor) _obs.prosp_floor = params.prosp_floor;
        if (params.prosp_href) _obs.prosp_href = params.prosp_href;

        // Scala: sotto-sezione da params o da sopralluogo
        if (params.stair_sub) {
            _obs.stair_subsection = params.stair_sub;
            _step = 'element'; // Vai direttamente all'elemento
        } else {
            const room = _sop.rooms[_roomName];
            if (room && room.room_destination === 'SCALA') {
                _step = 'stair_subsection';
            }
        }

        _render(container);
    }

    function _render(container) {
        container.innerHTML = '';

        // Step indicator
        const stepIdx = STEPS.indexOf(_step);
        const indicator = document.createElement('div');
        indicator.className = 'wizard-steps';
        for (let i = 0; i < 8; i++) {
            const s = document.createElement('div');
            s.className = 'wizard-step' + (i < stepIdx ? ' done' : '') + (i === stepIdx ? ' active' : '');
            indicator.appendChild(s);
        }
        container.appendChild(indicator);

        switch (_step) {
            case 'stair_subsection': _renderStairSubsection(container); break;
            case 'element': _renderElement(container); break;
            case 'wall_select': _renderWallSelect(container); break;
            case 'counterwall': _renderCounterwall(container); break;
            case 'cdp': _renderCdp(container); break;
            case 'infisso_type': _renderInfissoType(container); break;
            case 'infisso_wall': _renderInfissoWall(container); break;
            case 'infisso_which': _renderInfissoWhich(container); break;
            case 'infisso_sub_pos': _renderInfissoSubPos(container); break;
            case 'balcone_sub': _renderBalconeSub(container); break;
            case 'pre_check': _renderPreCheck(container); break;
            case 'parz_ingombra_ndr': _renderParzIngombraNdr(container); break;
            case 'position': _renderPosition(container); break;
            case 'phenomenon': _renderPhenomenon(container); break;
            case 'specifics': _renderSpecifics(container); break;
            case 'attributes': _renderAttributes(container); break;
            case 'prosecution': _renderProsecution(container); break;
            case 'notes': _renderNotes(container); break;
            case 'photo': _renderPhoto(container); break;
        }
    }

    // ===== SCALA: SOTTO-SEZIONE =====
    function _renderStairSubsection(container) {
        container.appendChild(UI.sectionHeader('Sotto-sezione Scala'));
        const rampCount = _sop.stair_ramp_count || 2;
        const subs = Config.generateStairSubsections(rampCount);
        const grid = UI.buttonGrid(subs, 2, (val) => {
            _obs.stair_subsection = val;
            _step = 'element';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== ELEMENTO =====
    function _renderElement(container) {
        container.appendChild(UI.sectionHeader('Elemento'));
        let elements;
        if (_isProspetto()) {
            elements = Config.ELEMENTS_PROSPETTI;
        } else if (_isBalcone()) {
            elements = Config.ELEMENTS_BALCONE;
        } else if (_isTerrazzo()) {
            elements = Config.ELEMENTS_TERRAZZO;
        } else if (_obs.stair_subsection) {
            elements = _getStairElements();
        } else {
            elements = Config.ELEMENTS;
        }

        const grid = UI.buttonGrid(elements, 2, (val) => {
            _obs.element = val;
            if (val === 'Pareti' || val === 'Parete') {
                _step = 'wall_select';
            } else if (val === 'Elemento/Varco') {
                _step = 'infisso_type';
            } else if (val === 'Sotto balcone superiore') {
                _obs.balcone_sub = val;
                _step = 'pre_check';
            } else {
                _step = 'pre_check';
            }
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== PARETE =====
    function _renderWallSelect(container) {
        container.appendChild(UI.sectionHeader('Parete'));
        const wallCount = (_sop.room_wall_count || {})[_roomName] || 4;
        const labels = _generateWallLabels(wallCount);

        const grid = UI.buttonGrid(labels, 2, (val) => {
            _obs.wall_idx = val;
            _step = 'counterwall';
            _render(container);
        });
        container.appendChild(grid);

        // Scrivi a mano
        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Nome parete:');
            if (custom) {
                _obs.wall_idx = custom.trim();
                _step = 'counterwall';
                _render(container);
            }
        }));
    }

    function _generateWallLabels(count) {
        const labels = [];
        for (let i = 0; i < count; i++) {
            labels.push(`Parete ${String.fromCharCode(65 + i)}`);
        }
        return labels;
    }

    // ===== CONTROPARETE =====
    function _renderCounterwall(container) {
        container.appendChild(UI.sectionHeader('Controparete'));
        const grid = UI.buttonGrid([
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], 2, (val) => {
            _obs.has_counterwall = val;
            // CDP solo per pareti
            const room = _sop.rooms[_roomName];
            if (room && room.has_cdp) {
                _step = 'cdp';
            } else {
                _step = 'pre_check';
            }
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== CDP (Carta da Parati) =====
    function _renderCdp(container) {
        container.appendChild(UI.sectionHeader('Carta da Parati presente?'));
        const grid = UI.buttonGrid([
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], 2, (val) => {
            _obs.has_cdp = val;
            _step = 'pre_check';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== INFISSO/VARCO =====
    function _renderInfissoType(container) {
        container.appendChild(UI.sectionHeader('Tipo Elemento/Varco'));
        const types = _isProspetto() ? Config.VARCO_SUB_ELEMENTS_PROSPETTI : Config.VARCO_SUB_ELEMENTS;
        const grid = UI.buttonGrid(types, 2, (val) => {
            _obs.infisso_type = val;
            _step = 'infisso_wall';
            _render(container);
        });
        container.appendChild(grid);
    }

    function _renderInfissoWall(container) {
        container.appendChild(UI.sectionHeader('Su quale parete?'));
        const grid = UI.buttonGrid(Config.VARCO_LOCATIONS, 2, (val) => {
            _obs.infisso_wall = val;
            _obs.infisso_loc = val;
            _step = 'infisso_which';
            _render(container);
        });
        container.appendChild(grid);
    }

    function _renderInfissoWhich(container) {
        container.appendChild(UI.sectionHeader('Quale?'));
        const opts = ['1°', '2°', '3°', '4°', '5°', 'unico'];
        const grid = UI.buttonGrid(opts, 3, (val) => {
            _obs.infisso_which = val;
            _step = 'infisso_sub_pos';
            _render(container);
        });
        container.appendChild(grid);
    }

    function _renderInfissoSubPos(container) {
        container.appendChild(UI.sectionHeader('Posizione sul varco'));
        const grid = UI.buttonGrid(Config.VARCO_DEFECT_POSITIONS, 3, (val) => {
            _obs.infisso_sub_pos = val;
            _step = 'pre_check';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== BALCONE SUB =====
    function _renderBalconeSub(container) {
        container.appendChild(UI.sectionHeader('Sotto-elemento Balcone'));
        const grid = UI.buttonGrid(Config.BALCONE_SUB_ELEMENTS, 2, (val) => {
            _obs.balcone_sub = val;
            _step = 'pre_check';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== PRE-CHECK (NDR / Ingombra / Parz / Non Visibile / Procedi) =====
    function _renderPreCheck(container) {
        container.appendChild(UI.sectionHeader('Stato Elemento'));
        const options = [
            { label: 'NDR', value: 'NDR', className: 'btn-success' },
            { label: 'Non Visibile', value: 'NON VISIBILE', className: 'btn-warning' },
            { label: 'Ingombra', value: 'INGOMBRA', className: 'btn-warning' },
            { label: 'Parzialmente Ingombra', value: 'PARZIALMENTE INGOMBRA', className: 'btn-warning' },
            { label: 'Procedi con Difetto →', value: 'PROCEDI', className: 'btn-primary' }
        ];
        const grid = UI.buttonGrid(options, 2, async (val) => {
            if (val === 'PROCEDI') {
                // NDR sostituzione check (sub-fase 2)
                await _checkNdrSubstitution();
                _step = 'position';
                _render(container);
            } else if (val === 'NDR') {
                _obs.phenomenon = 'NDR';
                await _saveAndReturn();
            } else if (val === 'NON VISIBILE') {
                _obs.phenomenon = 'NON VISIBILE';
                _obs.non_visibile = true;
                await _saveAndReturn();
            } else if (val === 'INGOMBRA') {
                _obs.phenomenon = 'INGOMBRA';
                await _saveAndReturn();
            } else if (val === 'PARZIALMENTE INGOMBRA') {
                _obs.phenomenon = 'PARZIALMENTE INGOMBRA';
                _obs.parz_ingombra = true;
                _step = 'parz_ingombra_ndr';
                _render(container);
            }
        });
        container.appendChild(grid);
    }

    // ===== PARZIALMENTE INGOMBRA → NDR o difetto =====
    function _renderParzIngombraNdr(container) {
        container.appendChild(UI.sectionHeader('La parte visibile:'));
        const options = [
            { label: 'NDR (parte visibile)', value: 'NDR', className: 'btn-success' },
            { label: 'Ha un difetto →', value: 'DIFETTO', className: 'btn-primary' }
        ];
        const grid = UI.buttonGrid(options, 2, async (val) => {
            if (val === 'NDR') {
                // Salva PARZIALMENTE INGOMBRA + NDR
                await _saveAndReturn();
            } else {
                // Continua con posizione/fenomeno per la parte visibile
                _obs.phenomenon = ''; // Reset, verra' scelto
                _step = 'position';
                _render(container);
            }
        });
        container.appendChild(grid);
    }

    // ===== POSIZIONE =====
    function _renderPosition(container) {
        container.appendChild(UI.sectionHeader('Posizione'));
        const elem = _obs.element;
        const matrix = Config.OBSERVATION_MATRIX[elem] || Config.OBSERVATION_MATRIX['Pareti'];
        let positions = matrix.positions;

        if (_isProspetto() && (elem === 'Pareti' || elem === 'Parete')) {
            positions = Config.POS_WALL_PROSPETTI;
        }

        const selected = new Set(_obs.positions_selected || []);
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';

        positions.forEach(pos => {
            const b = UI.btn(pos, selected.has(pos) ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(pos)) { selected.delete(pos); b.className = 'btn btn-secondary'; }
                else { selected.add(pos); b.className = 'btn btn-primary'; }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        // Presso elemento (testo libero)
        if (positions.includes('presso elemento')) {
            container.appendChild(UI.btn('Presso Elemento (testo)', 'btn-outline btn-block btn-sm mt-8', () => {
                const text = prompt('Presso quale elemento?');
                if (text) selected.add(`presso ${text.trim()}`);
            }));
        }

        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', () => {
            _obs.positions_selected = Array.from(selected);
            _obs.position = _obs.positions_selected.join(', ');
            _step = 'phenomenon';
            _render(container);
        }));
    }

    // ===== FENOMENO =====
    function _renderPhenomenon(container) {
        container.appendChild(UI.sectionHeader('Difetto'));
        const elem = _obs.element;
        const matrix = Config.OBSERVATION_MATRIX[elem] || Config.OBSERVATION_MATRIX['Pareti'];
        const grid = UI.buttonGrid(matrix.phenomena, 2, (val) => {
            _obs.phenomenon = val;
            _step = 'specifics';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== SPECIFICHE =====
    function _renderSpecifics(container) {
        container.appendChild(UI.sectionHeader('Specifiche'));
        const selected = new Set(_obs.specifics || []);
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-2';
        Config.DEFECT_SPECIFICS.forEach(spec => {
            const b = UI.btn(spec, selected.has(spec) ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(spec)) { selected.delete(spec); b.className = 'btn btn-secondary'; }
                else { selected.add(spec); b.className = 'btn btn-primary'; }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _obs.specifics = [];
            _step = 'attributes';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _obs.specifics = Array.from(selected);
            _step = 'attributes';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== ATTRIBUTI =====
    function _renderAttributes(container) {
        container.appendChild(UI.sectionHeader('Attributi'));
        const selected = new Set(_obs.details || []);
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-2';
        Config.ATTRIBUTES.forEach(attr => {
            const b = UI.btn(attr, selected.has(attr) ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(attr)) { selected.delete(attr); b.className = 'btn btn-secondary'; }
                else { selected.add(attr); b.className = 'btn btn-primary'; }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _obs.details = [];
            _step = 'prosecution';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _obs.details = Array.from(selected);
            _step = 'prosecution';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== PROSECUZIONE =====
    function _renderProsecution(container) {
        container.appendChild(UI.sectionHeader('Prosecuzione su altri elementi?'));
        const selected = new Set(_obs.prosecutions || []);
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-2';
        Config.PROSECUTION_TARGETS.forEach(target => {
            // Escludi l'elemento corrente
            if (target === _obs.wall_idx || target === _obs.element) return;
            const b = UI.btn(target, selected.has(target) ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(target)) { selected.delete(target); b.className = 'btn btn-secondary'; }
                else { selected.add(target); b.className = 'btn btn-primary'; }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('No', 'btn-secondary', () => {
            _obs.prosecutions = [];
            _step = 'notes';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _obs.prosecutions = Array.from(selected);
            _step = 'notes';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== NOTE =====
    function _renderNotes(container) {
        container.appendChild(UI.sectionHeader('Note (opzionale)'));
        const { group, input } = UI.formGroup(null, 'textarea', '', 'Note aggiuntive...');
        container.appendChild(group);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _obs.notes = '';
            _step = 'photo';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _obs.notes = input.value.trim();
            _step = 'photo';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== FOTO DETTAGLIO =====
    function _renderPhoto(container) {
        container.appendChild(UI.sectionHeader('Foto Dettaglio'));

        container.appendChild(UI.btn('📷 Scatta Foto', 'btn-primary btn-block', async () => {
            try {
                const result = await Photos.captureFromCamera();
                // Salva foto
                const room = _sop.rooms[_roomName];
                const nextIdx = Object.keys(room).filter(k => k.startsWith('Foto_')).length + 1;
                const filename = `Foto_${nextIdx}_dettaglio.jpg`;
                const photoId = await Photos.savePhoto(_sop.id, _roomName, 'dettaglio', filename, result.blob, result.thumbnail);
                _obs._photo_id = photoId;
                _obs._photo_filename = filename;
                await _saveObs();
            } catch (e) { App.toast('Errore foto: ' + e.message); }
        }));

        container.appendChild(UI.btn('Senza Foto', 'btn-secondary btn-block mt-8', async () => {
            _obs._photo_filename = null;
            await _saveObs();
        }));
    }

    // ===== SALVATAGGIO =====
    async function _saveObs() {
        // Costruisci element finale (come bot.py _save_observation_data_impl)
        let finalEl = _obs.element;
        if (_obs.element === 'Pareti' && _obs.wall_idx) {
            finalEl = _obs.wall_idx;
        } else if (_obs.element === 'Elemento/Varco' && _obs.infisso_type) {
            finalEl = _obs.infisso_type;
        } else if (_obs.balcone_sub) {
            finalEl = `Balcone ${_obs.balcone_sub}`;
        } else if (_obs.specific_element) {
            finalEl = _obs.specific_element;
        }

        const obsData = {
            element: finalEl,
            position: _obs.positions_selected.length > 0 ?
                _obs.positions_selected.join(', ') : (_obs.position || ''),
            phenomenon: _obs.phenomenon || '',
            specifics: _obs.specifics || [],
            attributes: _obs.details || [],
            notes: _obs.notes || '',
            infisso_type: _obs.infisso_type || '',
            infisso_wall: _obs.infisso_wall || '',
            infisso_loc: _obs.infisso_loc || '',
            infisso_confine: _obs.infisso_confine || '',
            has_counterwall: _obs.has_counterwall || false,
            has_cdp: _obs.has_cdp || false,
            non_visibile: _obs.non_visibile || false,
            balcone_sub: _obs.balcone_sub || '',
            prosecutions: _obs.prosecutions || [],
            stair_subsection: _obs.stair_subsection || '',
            prosp_floor: _obs.prosp_floor || '',
            prosp_href: _obs.prosp_href || ''
        };

        await DB.addObservation(_sop, _roomName, obsData, _obs._photo_filename);

        // Log evento
        await DB.addEvent({
            sopralluogo_id: _sop.id,
            type: 'add_observation',
            payload: { room_name: _roomName, element: finalEl, phenomenon: _obs.phenomenon }
        });

        // Aggiorna superfici completate
        if (finalEl) {
            if (!_sop.completed_surfaces) _sop.completed_surfaces = [];
            if (['Soffitto', 'Pavimento'].includes(finalEl)) {
                if (!_sop.completed_surfaces.includes(finalEl)) _sop.completed_surfaces.push(finalEl);
            } else if (_obs.wall_idx) {
                if (!_sop.completed_surfaces.includes(_obs.wall_idx)) _sop.completed_surfaces.push(_obs.wall_idx);
            }
            await DB.saveSopralluogo(_sop);
        }

        App.toast('Osservazione salvata!');
        App.navigate('rooms', { id: _sop.id, view: 'room_card', room: _roomName });
    }

    async function _saveAndReturn() {
        await _saveObs();
    }

    // ===== NDR SOSTITUZIONE (sub-fase 2) =====
    async function _checkNdrSubstitution() {
        const room = _sop.rooms[_roomName];
        if (!room) return;
        const obs = DB.getRoomObservations(room);

        // Soffitto/Pavimento: rimuovi NDR se presente
        const elem = _obs.element;
        if (elem === 'Soffitto' || elem === 'Pavimento') {
            const ndrKey = obs.find(o => o.element === elem && o.phenomenon === 'NDR');
            if (ndrKey) {
                await DB.removeObservation(_sop, _roomName, ndrKey._foto_key);
                _sop = await DB.getSopralluogo(_sop.id);
            }
        }

        // Pareti: split generic NDR
        if (elem === 'Pareti' && _obs.wall_idx) {
            const genericNdr = obs.find(o => o.element === 'Pareti' && o.phenomenon === 'NDR');
            if (genericNdr) {
                // Chiedi quante pareti
                let wallCount = (_sop.room_wall_count || {})[_roomName];
                if (!wallCount) {
                    const answer = prompt('Quante pareti nel vano? (default: 4)');
                    wallCount = parseInt(answer) || 4;
                    if (!_sop.room_wall_count) _sop.room_wall_count = {};
                    _sop.room_wall_count[_roomName] = wallCount;
                }

                // Rimuovi NDR generico
                await DB.removeObservation(_sop, _roomName, genericNdr._foto_key);
                _sop = await DB.getSopralluogo(_sop.id);

                // Aggiungi NDR individuali per ogni parete TRANNE quella col difetto
                for (let i = 0; i < wallCount; i++) {
                    const label = `Parete ${String.fromCharCode(65 + i)}`;
                    if (label !== _obs.wall_idx) {
                        await DB.addObservation(_sop, _roomName, {
                            element: label,
                            phenomenon: 'NDR'
                        });
                    }
                }
                _sop = await DB.getSopralluogo(_sop.id);
            }
        }
    }

    // ===== HELPERS =====
    function _isProspetto() {
        if (!_roomName) return false;
        return _roomName.includes('Prospett');
    }

    function _isBalcone() {
        if (!_roomName) return false;
        const dest = (_sop.rooms[_roomName] || {}).room_destination || '';
        return dest === 'BALCONE';
    }

    function _isTerrazzo() {
        if (!_roomName) return false;
        const dest = (_sop.rooms[_roomName] || {}).room_destination || '';
        return dest === 'TERRAZZO';
    }

    function _getStairElements() {
        const sub = _obs.stair_subsection || '';
        if (sub.startsWith('Rampa')) return Config.STAIR_ELEMENTS_RAMPA;
        if (sub === 'Sottoscala') return Config.STAIR_ELEMENTS_SOTTOSCALA;
        return Config.STAIR_ELEMENTS_PIANEROTTOLO;
    }

    return { render };

})();
