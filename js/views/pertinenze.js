/* ============================================================
 * pertinenze.js — Gestione pertinenze (Cantina, Soffitta, Box, Posto auto)
 * Flusso IDENTICO al bot:
 *   Tipo → Subalterno → Numero → [Indirizzo] → Piano → Entra
 *
 * Ogni pertinenza ha propri vani con rooms indipendenti.
 * Stash/restore della main unit avviene via active_pertinenza.
 * ============================================================ */

'use strict';

const PertinenzeView = (() => {

    let _sop = null;
    let _view = 'list'; // list | add_type | add_sub | add_num | add_addr | add_floor | pert_rooms | pert_room_card | pert_add_room | pert_choose_dest | pert_finishes
    let _tempPert = {};
    let _activePertIdx = null;
    let _currentPertRoom = null;
    let _tempVanoName = '';

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        if (!_sop) { App.toast('Sopralluogo non trovato'); return; }
        _view = (params && params.view) || 'list';
        if (params && params.pert_idx !== undefined) {
            _activePertIdx = parseInt(params.pert_idx);
        }
        _render(container);
    }

    function _render(container) {
        container.innerHTML = '';
        switch (_view) {
            case 'list': _renderList(container); break;
            case 'add_type': _renderAddType(container); break;
            case 'add_sub': _renderAddSub(container); break;
            case 'add_num': _renderAddNum(container); break;
            case 'add_addr': _renderAddAddr(container); break;
            case 'add_floor': _renderAddFloor(container); break;
            case 'pert_rooms': _renderPertRooms(container); break;
            case 'pert_room_card': _renderPertRoomCard(container); break;
            case 'pert_add_room': _renderPertAddRoom(container); break;
            case 'pert_choose_dest': _renderPertChooseDest(container); break;
            case 'pert_finishes': _renderPertFinishes(container); break;
        }
    }

    // ===== LISTA PERTINENZE =====
    function _renderList(container) {
        container.appendChild(UI.sectionHeader('Pertinenze'));

        const perts = _sop.pertinenze || [];

        if (perts.length === 0) {
            container.appendChild(UI.emptyState('', 'Nessuna pertinenza. Aggiungine una!'));
        } else {
            perts.forEach((pert, idx) => {
                const label = _pertLabel(pert);
                const roomCount = Object.keys(pert.rooms || pert._room_data || {}).length;
                const statusIcon = pert.analyzed ? '✅' : '⬜';
                const meta = `${statusIcon} ${roomCount} vani`;

                container.appendChild(UI.roomCard(label, meta, pert.analyzed ? 'completed' : '', () => {
                    _activePertIdx = idx;
                    _view = 'pert_rooms';
                    _render(container);
                }));
            });
        }

        // Bottone aggiungi
        container.appendChild(UI.btn('+ Nuova Pertinenza', 'btn-primary btn-block mt-16', () => {
            _tempPert = {};
            _view = 'add_type';
            _render(container);
        }));

        // Torna alla lista vani
        container.appendChild(UI.btn('← Torna ai Vani', 'btn-secondary btn-block mt-8', () => {
            App.navigate('rooms', { id: _sop.id });
        }));
    }

    // ===== STEP 1: TIPO PERTINENZA =====
    function _renderAddType(container) {
        container.appendChild(UI.sectionHeader('Tipo Pertinenza'));
        const grid = UI.buttonGrid(Config.PERTINENZA_TYPES, 2, (val) => {
            _tempPert.type = val;
            _view = 'add_sub';
            _render(container);
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('← Annulla', 'btn-secondary btn-block mt-16', () => {
            _view = 'list';
            _render(container);
        }));
    }

    // ===== STEP 2: SUBALTERNO =====
    function _renderAddSub(container) {
        container.appendChild(UI.sectionHeader('Subalterno'));
        const { group, input } = UI.formGroup(null, 'text', '', 'N° Subalterno');
        container.appendChild(group);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _tempPert.sub = '';
            _view = 'add_num';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _tempPert.sub = input.value.trim();
            _view = 'add_num';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== STEP 3: NUMERO =====
    function _renderAddNum(container) {
        container.appendChild(UI.sectionHeader('Numero'));
        const { group, input } = UI.formGroup(null, 'text', '', 'N° unità');
        container.appendChild(group);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _tempPert.numero = '';
            if (_tempPert.type === 'Box' || _tempPert.type === 'Posto auto') {
                _view = 'add_addr';
            } else {
                _view = 'add_floor';
            }
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _tempPert.numero = input.value.trim();
            if (_tempPert.type === 'Box' || _tempPert.type === 'Posto auto') {
                _view = 'add_addr';
            } else {
                _view = 'add_floor';
            }
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== STEP 4: INDIRIZZO (solo Box/Posto auto) =====
    function _renderAddAddr(container) {
        container.appendChild(UI.sectionHeader('Indirizzo'));
        const { group, input } = UI.formGroup(null, 'text', '', 'Indirizzo (opzionale)');
        container.appendChild(group);

        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', () => {
            _tempPert.indirizzo = '';
            _view = 'add_floor';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', () => {
            _tempPert.indirizzo = input.value.trim();
            _view = 'add_floor';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== STEP 5: PIANO =====
    function _renderAddFloor(container) {
        container.appendChild(UI.sectionHeader('Piano'));

        // Griglia piani predefiniti (3 per riga con abbreviazioni)
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';
        Config.PREDEFINED_FLOORS.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            grid.appendChild(UI.btn(abbr, 'btn-secondary', () => {
                _finalizePert(f);
            }));
        });
        container.appendChild(grid);

        // Scrivi a mano
        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Piano:');
            if (custom && custom.trim()) {
                _finalizePert(custom.trim());
            }
        }));
    }

    function _finalizePert(piano) {
        const pert = {
            type: _tempPert.type,
            sub: _tempPert.sub || '',
            numero: _tempPert.numero || '',
            piano: piano,
            analyzed: false,
            rooms: {},
            _room_status: {},
            _rooms_analyzed: [],
            _completed_surfaces: [],
            _room_wall_count: {}
        };
        if (_tempPert.indirizzo) pert.indirizzo = _tempPert.indirizzo;

        if (!_sop.pertinenze) _sop.pertinenze = [];
        _sop.pertinenze.push(pert);
        _activePertIdx = _sop.pertinenze.length - 1;

        DB.saveSopralluogo(_sop).then(() => {
            _view = 'pert_rooms';
            _render(document.getElementById('app-content'));
            App.toast('Pertinenza aggiunta!');
        });
    }

    // ===== LABEL PERTINENZA =====
    function _pertLabel(pert) {
        let label = pert.type || '';
        if (pert.sub) label += ` - Sub. ${pert.sub}`;
        if (pert.numero) label += ` - N. ${pert.numero}`;
        if (pert.piano) label += ` (${pert.piano})`;
        return label;
    }

    // ===== VANI PERTINENZA =====
    function _renderPertRooms(container) {
        const pert = _sop.pertinenze[_activePertIdx];
        if (!pert) { _view = 'list'; _render(container); return; }

        container.appendChild(UI.sectionHeader(_pertLabel(pert)));

        const rooms = pert.rooms || pert._room_data || {};
        const roomNames = Object.keys(rooms);

        if (roomNames.length === 0) {
            container.appendChild(UI.emptyState('', 'Nessun vano nella pertinenza.'));
        } else {
            roomNames.forEach(name => {
                const room = rooms[name];
                const obsCount = Object.keys(room).filter(k => k.startsWith('Foto_')).length;
                const status = (pert._room_status || {})[name] || 'accessible';
                const dest = room.room_destination || '';
                let meta = `${dest} | ${obsCount} oss.`;

                if (status !== 'accessible') {
                    const statusLabels = {
                        non_accessibile: 'Non Accessibile',
                        non_valutabile: 'Non Valutabile',
                        non_autorizzato: 'Non Autorizzato'
                    };
                    meta += ` | ${statusLabels[status] || status}`;
                }

                container.appendChild(UI.roomCard(name, meta, '', () => {
                    _currentPertRoom = name;
                    _view = 'pert_room_card';
                    _render(container);
                }));
            });
        }

        // Azioni
        const actions = document.createElement('div');
        actions.className = 'flex flex-col gap-8 mt-16';

        actions.appendChild(UI.btn('+ Aggiungi Vano', 'btn-primary btn-block', () => {
            _view = 'pert_add_room';
            _render(container);
        }));

        // Marca come analizzata
        if (!pert.analyzed) {
            actions.appendChild(UI.btn('Marca come Completata', 'btn-success btn-block', async () => {
                pert.analyzed = true;
                await DB.saveSopralluogo(_sop);
                _view = 'list';
                _render(container);
                App.toast('Pertinenza completata!');
            }));
        }

        actions.appendChild(UI.btn('← Lista Pertinenze', 'btn-secondary btn-block', () => {
            _view = 'list';
            _render(container);
        }));

        container.appendChild(actions);
    }

    // ===== SCHEDA VANO PERTINENZA =====
    function _renderPertRoomCard(container) {
        const pert = _sop.pertinenze[_activePertIdx];
        if (!pert) { _view = 'list'; _render(container); return; }
        const rooms = pert.rooms || pert._room_data || {};
        const room = rooms[_currentPertRoom];
        if (!room) { _view = 'pert_rooms'; _render(container); return; }

        container.appendChild(UI.sectionHeader(_currentPertRoom));

        const infoCard = UI.card(null);
        infoCard.innerHTML = `
            <p><strong>Destinazione:</strong> ${UI.esc(room.room_destination || '-')}</p>
            <p><strong>Finiture:</strong> ${UI.esc(room.room_finishes || 'Non impostate')}</p>
        `;
        container.appendChild(infoCard);

        // Osservazioni
        container.appendChild(UI.sectionHeader('Osservazioni'));
        const observations = DB.getRoomObservations(room);

        if (observations.length === 0) {
            container.appendChild(UI.emptyState('', 'Nessuna osservazione'));
        } else {
            const list = document.createElement('ul');
            list.className = 'obs-list';
            observations.forEach((obs, i) => {
                const text = Formatters.formatObservationText(obs, { includeVf: true, vfNumber: i + 1 });
                list.appendChild(UI.obsItem(i + 1, text, async () => {
                    const ok = await App.confirm(`Eliminare osservazione ${i + 1}?`);
                    if (ok) {
                        _removePertObservation(_currentPertRoom, obs._foto_key);
                    }
                }));
            });
            container.appendChild(list);
        }

        // Azioni
        const actions = document.createElement('div');
        actions.className = 'flex flex-col gap-8 mt-16';

        // NDR intero vano
        actions.appendChild(UI.btn('🟢 NDR (Intero Vano)', 'btn-ndr btn-block', async () => {
            // 3 NDR: Soffitto, Pavimento, Pareti
            _addPertObservation(_currentPertRoom, { element: 'Soffitto', phenomenon: 'NDR' });
            _addPertObservation(_currentPertRoom, { element: 'Pavimento', phenomenon: 'NDR' });
            _addPertObservation(_currentPertRoom, { element: 'Pareti', phenomenon: 'NDR' });
            await DB.saveSopralluogo(_sop);
            _render(container);
            App.toast('NDR salvato!');
        }));

        // Aggiungi osservazione — naviga al wizard con contesto pertinenza
        actions.appendChild(UI.btn('+ Aggiungi Osservazione', 'btn-primary btn-block', () => {
            // Stash: salva pertinenza rooms nel sopralluogo rooms temporaneamente
            _enterPertinenzaMode();
            App.navigate('wizard', { id: _sop.id, room: _currentPertRoom });
        }));

        // Finiture
        if (!room.room_finishes) {
            actions.appendChild(UI.btn('Imposta Finiture', 'btn-outline btn-block btn-sm', () => {
                _view = 'pert_finishes';
                _render(container);
            }));
        }

        actions.appendChild(UI.btn('← Lista Vani', 'btn-secondary btn-block', () => {
            _view = 'pert_rooms';
            _render(container);
        }));

        container.appendChild(actions);
    }

    // ===== PERTINENZA: AGGIUNGI VANO =====
    function _renderPertAddRoom(container) {
        const pert = _sop.pertinenze[_activePertIdx];
        const roomCount = Object.keys(pert.rooms || pert._room_data || {}).length;

        container.appendChild(UI.sectionHeader('Numero Vano'));
        const { group, input } = UI.formGroup(null, 'text', `Vano ${roomCount + 1}`, '');
        container.appendChild(group);
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', () => {
            const vanoName = input.value.trim();
            if (!vanoName) { App.toast('Inserisci un nome'); return; }
            _tempVanoName = vanoName;
            _view = 'pert_choose_dest';
            _render(container);
        }));
    }

    function _renderPertChooseDest(container) {
        container.appendChild(UI.sectionHeader('Destinazione'));
        // Pertinenze usano le destinazioni standard
        const types = Config.ROOM_TYPES;
        const grid = UI.buttonGrid(types, 2, async (dest) => {
            const fullName = `${_tempVanoName} - ${dest}`;
            const pert = _sop.pertinenze[_activePertIdx];

            if (!pert.rooms) pert.rooms = {};
            pert.rooms[fullName] = {
                room_destination: dest,
                room_finishes: null,
                has_cdp: null,
                disclaimer_type: null,
                marker_coords: null
            };
            if (!pert._room_status) pert._room_status = {};
            pert._room_status[fullName] = Config.ROOM_STATUSES.ACCESSIBLE;

            await DB.saveSopralluogo(_sop);
            _currentPertRoom = fullName;
            _view = 'pert_finishes';
            _render(container);
        });
        container.appendChild(grid);
    }

    function _renderPertFinishes(container) {
        container.appendChild(UI.sectionHeader('Controsoffitto'));
        const grid = UI.buttonGrid(Config.CEIL_TYPES, 2, async (val) => {
            const pert = _sop.pertinenze[_activePertIdx];
            const rooms = pert.rooms || pert._room_data || {};
            const room = rooms[_currentPertRoom];
            if (room) room.room_finishes = val;
            await DB.saveSopralluogo(_sop);
            // CDP
            _renderPertCdp(container);
        });
        container.appendChild(grid);
    }

    function _renderPertCdp(container) {
        container.innerHTML = '';
        container.appendChild(UI.sectionHeader('Carta da Parati'));
        const grid = UI.buttonGrid([
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], 2, async (val) => {
            const pert = _sop.pertinenze[_activePertIdx];
            const rooms = pert.rooms || pert._room_data || {};
            const room = rooms[_currentPertRoom];
            if (room) room.has_cdp = val;
            await DB.saveSopralluogo(_sop);
            _view = 'pert_room_card';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== PERTINENZA MODE: Stash/Restore =====
    // Per usare il wizard osservazioni, copiamo temporaneamente i rooms della pertinenza
    // nel sopralluogo principale e li ripristiniamo dopo.
    function _enterPertinenzaMode() {
        const pert = _sop.pertinenze[_activePertIdx];
        if (!pert) return;

        // Salva stato principale
        _sop._main_rooms = JSON.parse(JSON.stringify(_sop.rooms));
        _sop._main_room_status = JSON.parse(JSON.stringify(_sop.room_status));
        _sop._main_room_wall_count = JSON.parse(JSON.stringify(_sop.room_wall_count || {}));

        // Carica rooms della pertinenza
        _sop.rooms = pert.rooms || pert._room_data || {};
        _sop.room_status = pert._room_status || {};
        _sop.room_wall_count = pert._room_wall_count || {};
        _sop.active_pertinenza = _activePertIdx;

        DB.saveSopralluogo(_sop);
    }

    // Chiamato quando si torna dal wizard
    function restoreFromPertinenzaMode(sop) {
        if (sop.active_pertinenza === null || sop.active_pertinenza === undefined) return sop;
        if (!sop._main_rooms) return sop;

        const pertIdx = sop.active_pertinenza;
        const pert = sop.pertinenze[pertIdx];
        if (pert) {
            // Salva rooms aggiornati nella pertinenza
            pert.rooms = JSON.parse(JSON.stringify(sop.rooms));
            pert._room_status = JSON.parse(JSON.stringify(sop.room_status));
            pert._room_wall_count = JSON.parse(JSON.stringify(sop.room_wall_count || {}));
        }

        // Ripristina main
        sop.rooms = sop._main_rooms;
        sop.room_status = sop._main_room_status;
        sop.room_wall_count = sop._main_room_wall_count || {};
        sop.active_pertinenza = null;
        delete sop._main_rooms;
        delete sop._main_room_status;
        delete sop._main_room_wall_count;

        return sop;
    }

    // ===== HELPERS: Observation per pertinenza (senza wizard) =====
    function _addPertObservation(roomName, obsData) {
        const pert = _sop.pertinenze[_activePertIdx];
        if (!pert) return;
        const rooms = pert.rooms || pert._room_data || {};
        const room = rooms[roomName];
        if (!room) return;

        const existingPhotos = Object.keys(room).filter(k => k.startsWith('Foto_'));
        const nextIdx = existingPhotos.length + 1;
        const filename = `Foto_${nextIdx}_NOFOTO`;

        room[filename] = {
            element: obsData.element || '',
            position: obsData.position || '',
            phenomenon: obsData.phenomenon || '',
            specifics: obsData.specifics || [],
            attributes: obsData.attributes || [],
            notes: obsData.notes || '',
            timestamp_detection: new Date().toLocaleString('it-IT'),
            infisso_type: '', infisso_wall: '', infisso_loc: '', infisso_confine: '',
            has_counterwall: false, has_cdp: false, non_visibile: false,
            balcone_sub: '', prosecutions: [], stair_subsection: '',
            prosp_floor: '', prosp_href: ''
        };
    }

    function _removePertObservation(roomName, fotoKey) {
        const pert = _sop.pertinenze[_activePertIdx];
        if (!pert) return;
        const rooms = pert.rooms || pert._room_data || {};
        const room = rooms[roomName];
        if (!room || !room[fotoKey]) return;

        delete room[fotoKey];
        DB._renumberPhotos(room);
        DB.saveSopralluogo(_sop).then(() => {
            _render(document.getElementById('app-content'));
        });
    }

    return { render, restoreFromPertinenzaMode };

})();
