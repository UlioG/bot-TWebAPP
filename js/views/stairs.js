/* ============================================================
 * stairs.js — Scala Gruppo B (Parti Comuni) — wizard multi-piano
 * Flusso IDENTICO al bot:
 *   [Piani Edificio] → [Singola/Multipla] → [Nome] →
 *   Piano → Direzione (una volta) → N° Rampe (una volta) →
 *   Crea/Entra room scala → Sotto-sezioni → Elementi → Wizard
 *   "Continua a Salire/Scendere" → auto-avanza piano
 *   "Concludi Scala" → torna a room list
 *
 * Gruppo A (scala dentro unità) è gestito dal wizard.js normale.
 * Questo file gestisce SOLO Gruppo B (PC, navigazione multi-piano).
 * ============================================================ */

'use strict';

const StairsView = (() => {

    let _sop = null;
    let _view = 'init';
    // init | building_floors | single_or_multi | stair_name |
    // ask_floor | ask_direction | ask_ramp_count |
    // subsections | stair_elements | stair_list

    let _currentStairName = null;  // es. "A", null se singola
    let _currentFloor = null;
    let _direction = null;         // "salendo" | "scendendo"
    let _rampCount = null;

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        if (!_sop) { App.toast('Sopralluogo non trovato'); return; }

        // Determina stato iniziale
        if (_sop.building_floors && _sop.building_floors.length > 0) {
            // Piani edificio gia' selezionati
            if (_sop.stair_b_active) {
                // Wizard scala gia' attivo
                _currentStairName = _sop.stair_current_name;
                _currentFloor = _sop.stair_b_current_floor;
                _direction = _sop.stair_b_direction;
                _rampCount = _sop.stair_ramp_count;
                _view = 'subsections';
            } else {
                _view = 'single_or_multi';
            }
        } else {
            _view = 'building_floors';
        }

        if (params && params.view) _view = params.view;
        _render(container);
    }

    function _render(container) {
        container.innerHTML = '';
        switch (_view) {
            case 'building_floors': _renderBuildingFloors(container); break;
            case 'single_or_multi': _renderSingleOrMulti(container); break;
            case 'stair_name': _renderStairName(container); break;
            case 'ask_floor': _renderAskFloor(container); break;
            case 'ask_direction': _renderAskDirection(container); break;
            case 'ask_ramp_count': _renderAskRampCount(container); break;
            case 'subsections': _renderSubsections(container); break;
            case 'stair_elements': _renderStairElements(container); break;
            case 'stair_list': _renderStairList(container); break;
        }
    }

    // ===== PIANI EDIFICIO (checkbox) =====
    function _renderBuildingFloors(container) {
        container.appendChild(UI.sectionHeader('Piani Edificio'));
        const p = document.createElement('p');
        p.className = 'text-sm text-muted';
        p.textContent = 'Seleziona i piani presenti nell\'edificio:';
        container.appendChild(p);

        const selected = new Set(_sop.building_floors_temp || []);
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';

        Config.PREDEFINED_FLOORS.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            const isSelected = selected.has(f);
            const b = UI.btn(abbr, isSelected ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(f)) {
                    selected.delete(f);
                    b.className = 'btn btn-secondary';
                } else {
                    selected.add(f);
                    b.className = 'btn btn-primary';
                }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('Conferma', 'btn-primary btn-block mt-16', async () => {
            if (selected.size === 0) {
                App.toast('Seleziona almeno un piano');
                return;
            }
            // Ordina per FLOOR_ORDER
            const ordered = Array.from(selected).sort((a, b) => {
                const oa = Config.FLOOR_ORDER[a] !== undefined ? Config.FLOOR_ORDER[a] : 999;
                const ob = Config.FLOOR_ORDER[b] !== undefined ? Config.FLOOR_ORDER[b] : 999;
                return oa - ob;
            });
            _sop.building_floors = ordered;
            _sop.building_floors_temp = [];
            await DB.saveSopralluogo(_sop);
            _view = 'single_or_multi';
            _render(container);
        }));

        container.appendChild(UI.btn('← Torna ai Vani', 'btn-secondary btn-block mt-8', () => {
            App.navigate('rooms', { id: _sop.id });
        }));
    }

    // ===== SINGOLA O MULTIPLA =====
    function _renderSingleOrMulti(container) {
        container.appendChild(UI.sectionHeader('Scale'));

        // Se ci sono scale gia' fatte, mostra lista
        const stairRooms = _getStairRooms();
        if (stairRooms.length > 0) {
            container.appendChild(UI.sectionHeader('Scale Analizzate'));
            const stairNames = _getStairNames();
            stairNames.forEach(name => {
                const floors = stairRooms.filter(r => _stairNameFromRoom(r) === name);
                container.appendChild(UI.roomCard(
                    name ? `Scala ${name}` : 'Scala',
                    `${floors.length} piani analizzati`,
                    'completed',
                    () => { /* Readonly */ }
                ));
            });
        }

        const grid = UI.buttonGrid([
            { label: 'Scala Singola', value: 'single', className: 'btn-primary' },
            { label: 'Più Scale', value: 'multi', className: 'btn-info' }
        ], 2, (val) => {
            if (val === 'single') {
                _sop.stair_is_multi = false;
                _currentStairName = null;
                _sop.stair_current_name = null;
                DB.saveSopralluogo(_sop);
                _view = 'ask_floor';
                _render(container);
            } else {
                _sop.stair_is_multi = true;
                DB.saveSopralluogo(_sop);
                _view = 'stair_name';
                _render(container);
            }
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('← Torna ai Vani', 'btn-secondary btn-block mt-16', () => {
            App.navigate('rooms', { id: _sop.id });
        }));
    }

    // ===== NOME SCALA =====
    function _renderStairName(container) {
        container.appendChild(UI.sectionHeader('Nome Scala'));
        const usedNames = new Set(_sop.stair_names || []);
        const options = ['A', 'B', 'C', '1', '2', '3'].filter(n => !usedNames.has(n));

        const grid = UI.buttonGrid(options, 3, (val) => {
            _selectStairName(val);
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Nome scala:');
            if (custom && custom.trim()) {
                _selectStairName(custom.trim());
            }
        }));
    }

    function _selectStairName(name) {
        _currentStairName = name;
        _sop.stair_current_name = name;
        if (!_sop.stair_names) _sop.stair_names = [];
        if (!_sop.stair_names.includes(name)) _sop.stair_names.push(name);
        DB.saveSopralluogo(_sop);
        _view = 'ask_floor';
        _render(document.getElementById('app-content'));
    }

    // ===== PIANO INIZIALE =====
    function _renderAskFloor(container) {
        container.appendChild(UI.sectionHeader('Piano'));
        const floors = _sop.building_floors || Config.PREDEFINED_FLOORS;

        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';
        floors.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            grid.appendChild(UI.btn(abbr, 'btn-secondary', () => {
                _currentFloor = f;
                _sop.stair_b_current_floor = f;
                DB.saveSopralluogo(_sop);
                // Direzione: chiedi solo la prima volta
                if (!_direction) {
                    _view = 'ask_direction';
                } else if (!_rampCount) {
                    _view = 'ask_ramp_count';
                } else {
                    _createAndEnterStairRoom();
                }
                _render(container);
            }));
        });
        container.appendChild(grid);

        // Scrivi a mano
        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Piano:');
            if (custom && custom.trim()) {
                _currentFloor = custom.trim();
                _sop.stair_b_current_floor = _currentFloor;
                DB.saveSopralluogo(_sop);
                if (!_direction) {
                    _view = 'ask_direction';
                } else if (!_rampCount) {
                    _view = 'ask_ramp_count';
                } else {
                    _createAndEnterStairRoom();
                }
                _render(container);
            }
        }));
    }

    // ===== DIREZIONE =====
    function _renderAskDirection(container) {
        container.appendChild(UI.sectionHeader('Direzione'));
        const grid = UI.buttonGrid([
            { label: 'Salendo', value: 'salendo', className: 'btn-primary' },
            { label: 'Scendendo', value: 'scendendo', className: 'btn-info' }
        ], 2, (val) => {
            _direction = val;
            _sop.stair_b_direction = val;
            DB.saveSopralluogo(_sop);
            if (!_rampCount) {
                _view = 'ask_ramp_count';
            } else {
                _createAndEnterStairRoom();
            }
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== N° RAMPE =====
    function _renderAskRampCount(container) {
        container.appendChild(UI.sectionHeader('Numero Rampe tra piani'));
        const grid = UI.buttonGrid([
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 }
        ], 3, (val) => {
            _rampCount = val;
            _sop.stair_ramp_count = val;
            DB.saveSopralluogo(_sop);
            _createAndEnterStairRoom();
        });
        container.appendChild(grid);

        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt('Numero rampe:');
            const n = parseInt(custom);
            if (n && n > 0) {
                _rampCount = n;
                _sop.stair_ramp_count = n;
                DB.saveSopralluogo(_sop);
                _createAndEnterStairRoom();
            }
        }));
    }

    // ===== CREA/ENTRA ROOM SCALA =====
    async function _createAndEnterStairRoom() {
        const roomName = _buildStairRoomName(_currentStairName, _currentFloor);

        // Crea room se non esiste
        if (!_sop.rooms[roomName]) {
            _sop.rooms[roomName] = {
                room_destination: 'SCALA',
                room_finishes: null,
                has_cdp: null,
                disclaimer_type: null,
                marker_coords: null
            };
            _sop.room_status[roomName] = Config.ROOM_STATUSES.ACCESSIBLE;
        }

        _sop.stair_b_active = true;
        _sop.stair_b_current_floor = _currentFloor;
        await DB.saveSopralluogo(_sop);

        _view = 'subsections';
        _render(document.getElementById('app-content'));
    }

    // ===== SOTTO-SEZIONI =====
    function _renderSubsections(container) {
        const roomName = _buildStairRoomName(_currentStairName, _currentFloor);
        container.appendChild(UI.sectionHeader(roomName));

        const rampCount = _rampCount || _sop.stair_ramp_count || 2;
        const subs = Config.generateStairSubsections(rampCount);
        const room = _sop.rooms[roomName] || {};

        // Mostra sotto-sezioni con stato
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-2';

        subs.forEach(sub => {
            // Controlla se ci sono osservazioni per questa sotto-sezione
            const hasObs = _hasObsForSubsection(room, sub);
            const label = (hasObs ? '✅ ' : '') + sub;
            const b = UI.btn(label, 'btn-secondary', () => {
                _sop._stair_current_subsection = sub;
                DB.saveSopralluogo(_sop);
                _view = 'stair_elements';
                _render(container);
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        // Rampe config
        container.appendChild(UI.btn('⚙️ N° Rampe', 'btn-outline btn-block btn-sm mt-8', () => {
            const custom = prompt(`Numero rampe (attuale: ${rampCount}):`);
            const n = parseInt(custom);
            if (n && n > 0) {
                _rampCount = n;
                _sop.stair_ramp_count = n;
                DB.saveSopralluogo(_sop);
                _render(container);
            }
        }));

        // NDR intero piano scala
        container.appendChild(UI.btn('🟢 NDR (Intero Piano)', 'btn-ndr btn-block btn-sm mt-8', async () => {
            // Aggiungi NDR "Intera Sotto-sezione" per ogni sotto-sezione
            subs.forEach(sub => {
                if (!_hasObsForSubsection(room, sub)) {
                    _addStairNdr(roomName, sub);
                }
            });
            await DB.saveSopralluogo(_sop);
            _render(container);
            App.toast('NDR piano salvato!');
        }));

        // Azioni fondo
        const actions = document.createElement('div');
        actions.className = 'flex flex-col gap-8 mt-16';

        // Continua a Salire/Scendere
        const nextFloor = _getNextFloor(_currentFloor, _direction);
        if (nextFloor) {
            const dirLabel = _direction === 'salendo' ? 'Salire' : 'Scendere';
            actions.appendChild(UI.btn(`Continua a ${dirLabel} → ${Config.getFloorAbbrev(nextFloor)}`, 'btn-primary btn-block', async () => {
                _currentFloor = nextFloor;
                _sop.stair_b_current_floor = nextFloor;
                await DB.saveSopralluogo(_sop);
                _createAndEnterStairRoom();
            }));
        }

        // Aggiungi Piano (manuale)
        actions.appendChild(UI.btn('Aggiungi Piano', 'btn-outline btn-block', () => {
            _view = 'ask_floor';
            _render(container);
        }));

        // Concludi Scala
        actions.appendChild(UI.btn('Concludi Scala', 'btn-success btn-block', async () => {
            _sop.stair_b_active = false;
            _sop.stair_b_current_floor = null;
            _sop._stair_current_subsection = null;
            // NON resettare direction e ramp_count (proprietà edificio)
            await DB.saveSopralluogo(_sop);

            // Chiedi se altra scala
            if (_sop.stair_is_multi) {
                const more = await App.confirm('Vuoi analizzare un\'altra scala?');
                if (more) {
                    _direction = null; // Reset direzione per nuova scala
                    _view = 'stair_name';
                    _render(container);
                    return;
                }
            }

            App.navigate('rooms', { id: _sop.id });
        }));

        container.appendChild(actions);
    }

    // ===== ELEMENTI SCALA =====
    function _renderStairElements(container) {
        const sub = _sop._stair_current_subsection || '';
        container.appendChild(UI.sectionHeader(sub));

        let elements;
        if (sub.startsWith('Rampa')) {
            elements = Config.STAIR_ELEMENTS_RAMPA;
        } else if (sub === 'Sottoscala') {
            elements = Config.STAIR_ELEMENTS_SOTTOSCALA;
        } else {
            elements = Config.STAIR_ELEMENTS_PIANEROTTOLO;
        }

        const roomName = _buildStairRoomName(_currentStairName, _currentFloor);
        const room = _sop.rooms[roomName] || {};

        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-2';
        elements.forEach(el => {
            const hasObs = _hasObsForElement(room, sub, el);
            const label = (hasObs ? '✅ ' : '') + el;
            const b = UI.btn(label, 'btn-secondary', () => {
                // Naviga al wizard con stair_subsection pre-impostato
                // Salviamo la sotto-sezione nel sopralluogo per il wizard
                _sop._stair_current_subsection = sub;
                DB.saveSopralluogo(_sop).then(() => {
                    App.navigate('wizard', {
                        id: _sop.id,
                        room: roomName,
                        stair_sub: sub
                    });
                });
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        // NDR Intera Sotto-sezione
        container.appendChild(UI.btn('🟢 NDR (Intera Sotto-sezione)', 'btn-ndr btn-block mt-16', async () => {
            _addStairNdr(roomName, sub);
            await DB.saveSopralluogo(_sop);
            _view = 'subsections';
            _render(container);
            App.toast('NDR sotto-sezione salvato!');
        }));

        container.appendChild(UI.btn('← Sotto-sezioni', 'btn-secondary btn-block mt-8', () => {
            _view = 'subsections';
            _render(container);
        }));
    }

    // ===== LISTA SCALE ESISTENTI =====
    function _renderStairList(container) {
        container.appendChild(UI.sectionHeader('Scale'));
        const stairRooms = _getStairRooms();
        if (stairRooms.length === 0) {
            container.appendChild(UI.emptyState('', 'Nessuna scala analizzata.'));
        } else {
            stairRooms.forEach(name => {
                const room = _sop.rooms[name] || {};
                const obsCount = Object.keys(room).filter(k => k.startsWith('Foto_')).length;
                container.appendChild(UI.roomCard(name, `${obsCount} oss.`, '', () => {
                    // Entra nel vano scala per vedere osservazioni
                    App.navigate('rooms', { id: _sop.id, view: 'room_card', room: name });
                }));
            });
        }

        container.appendChild(UI.btn('← Torna ai Vani', 'btn-secondary btn-block mt-16', () => {
            App.navigate('rooms', { id: _sop.id });
        }));
    }

    // ===== HELPERS =====

    function _buildStairRoomName(stairName, floor) {
        if (stairName) {
            return `Scala ${stairName} - ${floor}`;
        }
        return `Scala - ${floor}`;
    }

    function _getNextFloor(currentFloor, direction) {
        const floors = _sop.building_floors || [];
        if (!floors.length) return null;

        const currentIdx = floors.indexOf(currentFloor);
        if (currentIdx === -1) return null;

        if (direction === 'salendo') {
            return currentIdx < floors.length - 1 ? floors[currentIdx + 1] : null;
        } else {
            return currentIdx > 0 ? floors[currentIdx - 1] : null;
        }
    }

    function _getStairRooms() {
        return Object.keys(_sop.rooms).filter(name =>
            name.startsWith('Scala ') || name.startsWith('Scala -')
        );
    }

    function _getStairNames() {
        const names = new Set();
        _getStairRooms().forEach(r => {
            const n = _stairNameFromRoom(r);
            names.add(n || '');
        });
        return Array.from(names);
    }

    function _stairNameFromRoom(roomName) {
        // "Scala A - Piano Terra" → "A"
        // "Scala - Piano Terra" → null
        const m = roomName.match(/^Scala\s+([^-]+)\s*-/);
        if (m) return m[1].trim();
        return null;
    }

    function _hasObsForSubsection(room, sub) {
        const obs = DB.getRoomObservations(room);
        return obs.some(o => o.stair_subsection === sub);
    }

    function _hasObsForElement(room, sub, element) {
        const obs = DB.getRoomObservations(room);
        return obs.some(o => o.stair_subsection === sub && (
            o.element === element ||
            o.element.startsWith('Parete ') && element === 'Pareti' ||
            o.infisso_type && element === 'Elemento/Varco'
        ));
    }

    function _addStairNdr(roomName, sub) {
        const room = _sop.rooms[roomName];
        if (!room) return;

        const existingPhotos = Object.keys(room).filter(k => k.startsWith('Foto_'));
        const nextIdx = existingPhotos.length + 1;
        const filename = `Foto_${nextIdx}_NOFOTO`;

        room[filename] = {
            element: 'Intera Sotto-sezione',
            position: '',
            phenomenon: 'NDR',
            specifics: [],
            attributes: [],
            notes: '',
            timestamp_detection: new Date().toLocaleString('it-IT'),
            infisso_type: '', infisso_wall: '', infisso_loc: '', infisso_confine: '',
            has_counterwall: false, has_cdp: false, non_visibile: false,
            balcone_sub: '', prosecutions: [],
            stair_subsection: sub,
            prosp_floor: '', prosp_href: ''
        };
    }

    return { render };

})();
