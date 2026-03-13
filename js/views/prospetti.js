/* ============================================================
 * prospetti.js — Gestione Prospetti (Parti Comuni)
 * Flusso IDENTICO al bot:
 *   Rivestimento → Selezione prospetti (A-H) → Lista →
 *   Entra prospetto → Osservazioni con piano e HREF
 *
 * ELEMENTS_PROSPETTI: solo [Pareti, Elemento/Varco]
 * VARCO_SUB_ELEMENTS_PROSPETTI: 17 sotto-elementi
 * Ogni osservazione ha prosp_floor e prosp_href aggiuntivi.
 * ============================================================ */

'use strict';

const ProspettiView = (() => {

    let _sop = null;
    let _view = 'init';
    // init | rivestimento | riv_materiale | riv_piani |
    // selection | list | entry |
    // prosp_floor | prosp_floor_between | prosp_href_case | prosp_href_type | prosp_href_num | prosp_href_dir

    let _currentProspetto = null;
    let _tempRiv = {};
    let _tempHref = {};
    let _tempProspFloor = '';

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        if (!_sop) { App.toast('Sopralluogo non trovato'); return; }

        // Determina stato iniziale
        if (_sop.prosp_selected && _sop.prosp_selected.length > 0) {
            _view = 'list';
        } else if (_sop.prosp_rivestimento !== null && _sop.prosp_rivestimento !== undefined) {
            _view = 'selection';
        } else {
            _view = 'rivestimento';
        }

        if (params && params.view) _view = params.view;
        if (params && params.prosp) _currentProspetto = params.prosp;
        _render(container);
    }

    function _render(container) {
        container.innerHTML = '';
        switch (_view) {
            case 'rivestimento': _renderRivestimento(container); break;
            case 'riv_materiale': _renderRivMateriale(container); break;
            case 'riv_piani': _renderRivPiani(container); break;
            case 'selection': _renderSelection(container); break;
            case 'list': _renderList(container); break;
            case 'entry': _renderEntry(container); break;
            case 'prosp_floor': _renderProspFloor(container); break;
            case 'prosp_floor_between': _renderProspFloorBetween(container); break;
            case 'prosp_href_case': _renderHrefCase(container); break;
            case 'prosp_href_type': _renderHrefType(container); break;
            case 'prosp_href_num': _renderHrefNum(container); break;
            case 'prosp_href_dir': _renderHrefDir(container); break;
        }
    }

    // ===== RIVESTIMENTO =====
    function _renderRivestimento(container) {
        container.appendChild(UI.sectionHeader('Rivestimento'));
        const p = document.createElement('p');
        p.className = 'text-sm text-muted';
        p.textContent = 'L\'edificio ha un rivestimento esterno?';
        container.appendChild(p);

        const grid = UI.buttonGrid([
            { label: 'Sì, totale', value: 'totale', className: 'btn-primary' },
            { label: 'Sì, parziale', value: 'parziale', className: 'btn-info' },
            { label: 'No / Salta', value: 'no', className: 'btn-secondary' }
        ], 3, (val) => {
            if (val === 'no') {
                _sop.prosp_rivestimento = { tipo: 'no' };
                DB.saveSopralluogo(_sop);
                _view = 'selection';
                _render(container);
            } else {
                _tempRiv = { tipo: val };
                _view = 'riv_materiale';
                _render(container);
            }
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('← Torna ai Vani', 'btn-secondary btn-block mt-16', () => {
            App.navigate('rooms', { id: _sop.id });
        }));
    }

    function _renderRivMateriale(container) {
        container.appendChild(UI.sectionHeader('Materiale Rivestimento'));
        const { group, input } = UI.formGroup(null, 'text', '', 'Descrivi il materiale');
        container.appendChild(group);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _tempRiv.materiale = '';
            if (_tempRiv.tipo === 'parziale') {
                _view = 'riv_piani';
            } else {
                _sop.prosp_rivestimento = _tempRiv;
                DB.saveSopralluogo(_sop);
                _view = 'selection';
            }
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _tempRiv.materiale = input.value.trim();
            if (_tempRiv.tipo === 'parziale') {
                _view = 'riv_piani';
            } else {
                _sop.prosp_rivestimento = _tempRiv;
                DB.saveSopralluogo(_sop);
                _view = 'selection';
            }
            _render(container);
        }));
        container.appendChild(row);
    }

    function _renderRivPiani(container) {
        container.appendChild(UI.sectionHeader('Piani Rivestiti'));
        const { group, input } = UI.formGroup(null, 'text', '', 'Es: Piano 1 e Piano 2');
        container.appendChild(group);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _tempRiv.piani = '';
            _sop.prosp_rivestimento = _tempRiv;
            DB.saveSopralluogo(_sop);
            _view = 'selection';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _tempRiv.piani = input.value.trim();
            _sop.prosp_rivestimento = _tempRiv;
            DB.saveSopralluogo(_sop);
            _view = 'selection';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== SELEZIONE PROSPETTI (checkbox A-H) =====
    function _renderSelection(container) {
        container.appendChild(UI.sectionHeader('Seleziona Prospetti'));
        const p = document.createElement('p');
        p.className = 'text-sm text-muted';
        p.textContent = 'Seleziona i prospetti da analizzare:';
        container.appendChild(p);

        const selected = new Set(_sop.prosp_selected_temp || []);
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-4';

        Config.PROSPETTO_DEFAULT_LABELS.forEach(label => {
            const letter = label.replace('Prospetto ', '');
            const isSelected = selected.has(label);
            const b = UI.btn(letter, isSelected ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(label)) {
                    selected.delete(label);
                    b.className = 'btn btn-secondary';
                } else {
                    selected.add(label);
                    b.className = 'btn btn-primary';
                }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        // Custom
        container.appendChild(UI.btn('Aggiungi Personalizzato', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Nome prospetto:');
            if (custom && custom.trim()) {
                selected.add(custom.trim());
                _render(container); // Force re-render
            }
        }));

        container.appendChild(UI.btn('Conferma', 'btn-primary btn-block mt-16', async () => {
            if (selected.size === 0) {
                App.toast('Seleziona almeno un prospetto');
                return;
            }
            // Ordina: default labels prima, poi custom
            const ordered = Array.from(selected).sort((a, b) => {
                const ia = Config.PROSPETTO_DEFAULT_LABELS.indexOf(a);
                const ib = Config.PROSPETTO_DEFAULT_LABELS.indexOf(b);
                const oa = ia >= 0 ? ia : 999;
                const ob = ib >= 0 ? ib : 999;
                return oa - ob;
            });

            _sop.prosp_selected = ordered;
            _sop.prosp_selected_temp = [];

            // Crea room data per ogni prospetto
            ordered.forEach(prosp => {
                if (!_sop.rooms[prosp]) {
                    _sop.rooms[prosp] = {
                        room_destination: 'PROSPETTO',
                        room_finishes: null,
                        has_cdp: null,
                        disclaimer_type: null,
                        marker_coords: null
                    };
                    _sop.room_status[prosp] = Config.ROOM_STATUSES.ACCESSIBLE;
                }
            });

            await DB.saveSopralluogo(_sop);
            _view = 'list';
            _render(container);
        }));
    }

    // ===== LISTA PROSPETTI =====
    function _renderList(container) {
        container.appendChild(UI.sectionHeader('Prospetti'));

        // Info rivestimento
        if (_sop.prosp_rivestimento && _sop.prosp_rivestimento.tipo !== 'no') {
            const rivCard = UI.card('Rivestimento');
            const rivInfo = document.createElement('p');
            rivInfo.className = 'text-sm';
            let rivText = _sop.prosp_rivestimento.tipo;
            if (_sop.prosp_rivestimento.materiale) rivText += ` — ${_sop.prosp_rivestimento.materiale}`;
            if (_sop.prosp_rivestimento.piani) rivText += ` (${_sop.prosp_rivestimento.piani})`;
            rivInfo.textContent = rivText;
            rivCard.appendChild(rivInfo);
            container.appendChild(rivCard);
        }

        const prospetti = _sop.prosp_selected || [];

        prospetti.forEach(prosp => {
            const room = _sop.rooms[prosp] || {};
            const status = _sop.room_status[prosp] || 'accessible';
            const obsCount = Object.keys(room).filter(k => k.startsWith('Foto_')).length;

            let meta = '';
            if (status !== 'accessible') {
                const statusLabels = {
                    non_accessibile: 'Non Accessibile',
                    non_valutabile: 'Non Valutabile',
                    non_autorizzato: 'Non Autorizzato'
                };
                meta = statusLabels[status] || status;
            } else if (obsCount > 0) {
                meta = `${obsCount} difetti`;
            } else {
                // Controlla se ha NDR
                const obs = DB.getRoomObservations(room);
                const hasNdr = obs.some(o => o.phenomenon === 'NDR');
                meta = hasNdr ? 'NDR' : 'Da analizzare';
            }

            container.appendChild(UI.roomCard(prosp, meta, obsCount > 0 || meta === 'NDR' ? 'completed' : '', () => {
                _currentProspetto = prosp;
                _view = 'entry';
                _render(container);
            }));
        });

        // Azioni
        const actions = document.createElement('div');
        actions.className = 'flex flex-col gap-8 mt-16';

        actions.appendChild(UI.btn('Modifica Selezione', 'btn-outline btn-block btn-sm', () => {
            _sop.prosp_selected_temp = new Set(_sop.prosp_selected || []);
            _view = 'selection';
            _render(container);
        }));

        actions.appendChild(UI.btn('← Torna ai Vani', 'btn-secondary btn-block', () => {
            App.navigate('rooms', { id: _sop.id });
        }));

        container.appendChild(actions);
    }

    // ===== SINGOLO PROSPETTO =====
    function _renderEntry(container) {
        const prosp = _currentProspetto;
        if (!prosp) { _view = 'list'; _render(container); return; }

        container.appendChild(UI.sectionHeader(prosp));

        const room = _sop.rooms[prosp] || {};
        const status = _sop.room_status[prosp] || 'accessible';

        // Osservazioni
        const observations = DB.getRoomObservations(room);
        if (observations.length > 0) {
            container.appendChild(UI.sectionHeader('Osservazioni'));
            const list = document.createElement('ul');
            list.className = 'obs-list';
            observations.forEach((obs, i) => {
                const text = Formatters.formatObservationText(obs, { includeVf: true, vfNumber: i + 1 });
                list.appendChild(UI.obsItem(i + 1, text, async () => {
                    const ok = await App.confirm(`Eliminare osservazione ${i + 1}?`);
                    if (ok) {
                        await DB.removeObservation(_sop, prosp, obs._foto_key);
                        _sop = await DB.getSopralluogo(_sop.id);
                        _render(container);
                    }
                }));
            });
            container.appendChild(list);
        } else {
            container.appendChild(UI.emptyState('', 'Nessuna osservazione'));
        }

        // Azioni
        const actions = document.createElement('div');
        actions.className = 'flex flex-col gap-8 mt-16';

        // Foto panoramica
        actions.appendChild(UI.btn('📷 Foto Panoramica', 'btn-outline btn-block', async () => {
            try {
                const result = await Photos.captureFromCamera();
                const panoCount = (await DB.getPhotosByRoom(_sop.id, prosp))
                    .filter(p => p.type === 'panoramica').length;
                const filename = `FOTO_PANORAMICA_${panoCount + 1}.jpg`;
                await Photos.savePhoto(_sop.id, prosp, 'panoramica', filename, result.blob, result.thumbnail);
                App.toast('Foto panoramica salvata!');
            } catch (e) { App.toast('Errore foto'); }
        }));

        // NDR
        if (status === 'accessible') {
            actions.appendChild(UI.btn('🟢 NDR', 'btn-ndr btn-block', async () => {
                // NDR per Pareti
                await DB.addObservation(_sop, prosp, { element: 'Pareti', phenomenon: 'NDR' });
                _sop = await DB.getSopralluogo(_sop.id);
                _render(container);
                App.toast('NDR salvato!');
            }));
        }

        // Aggiungi osservazione con piano e HREF
        actions.appendChild(UI.btn('+ Aggiungi Osservazione', 'btn-primary btn-block', () => {
            // Per prospetti: prima chiediamo il piano, poi HREF, poi wizard
            _tempProspFloor = '';
            _tempHref = {};
            _view = 'prosp_floor';
            _render(container);
        }));

        // Stato (Non accessibile, ecc.)
        actions.appendChild(UI.btn('Modifica Stato', 'btn-outline btn-block btn-sm', () => {
            _renderProspStatus(container);
        }));

        actions.appendChild(UI.btn('← Lista Prospetti', 'btn-secondary btn-block', () => {
            _view = 'list';
            _render(container);
        }));

        container.appendChild(actions);
    }

    // ===== PIANO PROSPETTO =====
    function _renderProspFloor(container) {
        container.appendChild(UI.sectionHeader('Piano'));
        const floors = _sop.building_floors || Config.PREDEFINED_FLOORS;

        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';
        floors.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            grid.appendChild(UI.btn(abbr, 'btn-secondary', () => {
                _tempProspFloor = f;
                _view = 'prosp_href_case';
                _render(container);
            }));
        });
        container.appendChild(grid);

        // Tra due piani
        container.appendChild(UI.btn('Tra due piani', 'btn-outline btn-block btn-sm mt-8', () => {
            _sop._prosp_floor_step = 1;
            _view = 'prosp_floor_between';
            _render(container);
        }));

        // Scrivi a mano
        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-4', () => {
            const custom = prompt('Piano:');
            if (custom && custom.trim()) {
                _tempProspFloor = custom.trim();
                _view = 'prosp_href_case';
                _render(container);
            }
        }));

        // Salta piano
        container.appendChild(UI.btn('Salta', 'btn-secondary btn-block mt-8', () => {
            _tempProspFloor = '';
            _view = 'prosp_href_case';
            _render(container);
        }));
    }

    // ===== TRA DUE PIANI =====
    function _renderProspFloorBetween(container) {
        const step = _sop._prosp_floor_step || 1;
        container.appendChild(UI.sectionHeader(step === 1 ? 'Primo Piano' : 'Secondo Piano'));

        const floors = _sop.building_floors || Config.PREDEFINED_FLOORS;
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';
        floors.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            grid.appendChild(UI.btn(abbr, 'btn-secondary', () => {
                if (step === 1) {
                    _sop._prosp_floor_first = abbr;
                    _sop._prosp_floor_step = 2;
                    _render(container);
                } else {
                    _tempProspFloor = `tra ${_sop._prosp_floor_first} e ${abbr}`;
                    delete _sop._prosp_floor_step;
                    delete _sop._prosp_floor_first;
                    _view = 'prosp_href_case';
                    _render(container);
                }
            }));
        });
        container.appendChild(grid);
    }

    // ===== HREF: CASO =====
    function _renderHrefCase(container) {
        container.appendChild(UI.sectionHeader('Posizione Orizzontale'));
        const options = [
            { label: '↔️ Tra ... N e N+1', value: 'tra', className: 'btn-secondary' },
            { label: '📌 Presso ... N', value: 'presso', className: 'btn-secondary' },
            { label: '◀️ Prima di ... 1', value: 'prima', className: 'btn-secondary' },
            { label: '▶️ Dopo ... N', value: 'dopo', className: 'btn-secondary' },
            { label: 'Nessun riferimento', value: 'skip', className: 'btn-outline' }
        ];
        const grid = UI.buttonGrid(options, 2, (val) => {
            if (val === 'skip') {
                _tempHref = {};
                _goToWizard();
            } else {
                _tempHref = { case: val };
                _view = 'prosp_href_type';
                _render(container);
            }
        });
        container.appendChild(grid);
    }

    // ===== HREF: TIPO =====
    function _renderHrefType(container) {
        container.appendChild(UI.sectionHeader('Tipo Riferimento'));
        const grid = UI.buttonGrid(Config.PROSP_HREF_TYPES, 3, (val) => {
            _tempHref.type = val;
            _view = 'prosp_href_num';
            _render(container);
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Tipo:');
            if (custom && custom.trim()) {
                _tempHref.type = custom.trim();
                _view = 'prosp_href_num';
                _render(container);
            }
        }));
    }

    // ===== HREF: NUMERO =====
    function _renderHrefNum(container) {
        container.appendChild(UI.sectionHeader('Numero'));
        const nums = [];
        for (let i = 1; i <= 10; i++) nums.push(String(i));

        const grid = UI.buttonGrid(nums, 5, (val) => {
            _tempHref.num = val;
            if (_tempHref.case === 'tra') {
                // Chiedi direzione primo + secondo numero
                _view = 'prosp_href_dir';
                _render(container);
            } else {
                // Chiedi direzione
                _view = 'prosp_href_dir';
                _render(container);
            }
        });
        container.appendChild(grid);
    }

    // ===== HREF: DIREZIONE =====
    function _renderHrefDir(container) {
        container.appendChild(UI.sectionHeader('Contando da'));
        const grid = UI.buttonGrid([
            { label: 'da SX', value: 'da SX', className: 'btn-secondary' },
            { label: 'da DX', value: 'da DX', className: 'btn-secondary' }
        ], 2, (val) => {
            _tempHref.dir = val;

            if (_tempHref.case === 'tra' && !_tempHref.num2) {
                // Chiedi secondo numero
                _tempHref.num2_pending = true;
                _renderHrefNum2(container);
                return;
            }

            _goToWizard();
        });
        container.appendChild(grid);
    }

    function _renderHrefNum2(container) {
        container.innerHTML = '';
        container.appendChild(UI.sectionHeader('Secondo Numero'));
        const nums = [];
        for (let i = 1; i <= 10; i++) nums.push(String(i));

        const grid = UI.buttonGrid(nums, 5, (val) => {
            _tempHref.num2 = val;
            _goToWizard();
        });
        container.appendChild(grid);
    }

    // ===== NAVIGA AL WIZARD =====
    function _goToWizard() {
        // Costruisci stringa HREF
        let hrefStr = '';
        if (_tempHref.case && _tempHref.type && _tempHref.num) {
            const dir = _tempHref.dir || '';
            if (_tempHref.case === 'tra' && _tempHref.num2) {
                hrefStr = `tra ${_tempHref.type} ${_tempHref.num} ${dir} e ${_tempHref.type} ${_tempHref.num2} ${dir}`;
            } else if (_tempHref.case === 'presso') {
                hrefStr = `presso ${_tempHref.type} ${_tempHref.num} ${dir}`;
            } else if (_tempHref.case === 'prima') {
                hrefStr = `prima di ${_tempHref.type} ${_tempHref.num} ${dir}`;
            } else if (_tempHref.case === 'dopo') {
                hrefStr = `dopo ${_tempHref.type} ${_tempHref.num} ${dir}`;
            }
            hrefStr = hrefStr.trim();
        }

        // Salva nel sopralluogo per il wizard
        _sop._prosp_floor_temp = _tempProspFloor;
        _sop._prosp_href_temp = hrefStr;
        DB.saveSopralluogo(_sop).then(() => {
            App.navigate('wizard', {
                id: _sop.id,
                room: _currentProspetto,
                prosp_floor: _tempProspFloor,
                prosp_href: hrefStr
            });
        });
    }

    // ===== STATO PROSPETTO =====
    function _renderProspStatus(container) {
        container.innerHTML = '';
        container.appendChild(UI.sectionHeader('Stato Prospetto'));
        const statuses = [
            { label: 'Accessibile', value: Config.ROOM_STATUSES.ACCESSIBLE },
            { label: 'Non Accessibile', value: Config.ROOM_STATUSES.NON_ACCESSIBILE },
            { label: 'Non Valutabile', value: Config.ROOM_STATUSES.NON_VALUTABILE }
        ];
        const grid = UI.buttonGrid(statuses, 3, async (val) => {
            _sop.room_status[_currentProspetto] = val;
            if (val !== Config.ROOM_STATUSES.ACCESSIBLE) {
                const room = _sop.rooms[_currentProspetto];
                if (room) room.disclaimer_type = val;
                const nota = prompt('Nota (opzionale):');
                if (room && nota) room.disclaimer_note = nota;
            }
            await DB.saveSopralluogo(_sop);
            _view = 'entry';
            _render(container);
        });
        container.appendChild(grid);
    }

    return { render };

})();
