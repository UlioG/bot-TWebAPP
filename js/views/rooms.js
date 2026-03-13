/* ============================================================
 * rooms.js — Gestione vani (Step 2)
 * Sub-fase 1: Ricognizione (crea vani, foto panoramica, NDR intero vano)
 * Sub-fase 2: Analisi difetti (entra nel vano, wizard osservazioni)
 * ============================================================ */

'use strict';

const RoomsView = (() => {

    let _sop = null;
    let _view = 'room_list'; // room_list | room_card | add_room | choose_dest | finishes | ndr_full | room_status

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        if (!_sop) { App.toast('Sopralluogo non trovato'); return; }

        // Restore dalla modalita' pertinenza se attiva
        if (_sop.active_pertinenza !== null && _sop.active_pertinenza !== undefined
            && _sop._main_rooms) {
            _sop = PertinenzeView.restoreFromPertinenzaMode(_sop);
            await DB.saveSopralluogo(_sop);
        }

        _view = (params && params.view) || 'room_list';
        _currentRoom = (params && params.room) || null;
        _render(container);
    }

    let _currentRoom = null;

    function _render(container) {
        container.innerHTML = '';
        switch (_view) {
            case 'room_list': _renderRoomList(container); break;
            case 'room_card': _renderRoomCard(container); break;
            case 'add_room': _renderAddRoom(container); break;
            case 'choose_dest': _renderChooseDest(container); break;
            case 'finishes': _renderFinishes(container); break;
            case 'ndr_full': _renderNdrFull(container); break;
            case 'room_status': _renderRoomStatus(container); break;
        }
    }

    // ===== LISTA VANI =====
    function _renderRoomList(container) {
        const isPC = _sop.unit_type === 'Parti Comuni';

        // Header info
        const info = UI.card(
            `${_sop.building_code} — ${_sop.unit_type || ''}`,
            `Piano: ${_sop.floor || '-'} | Sub: ${_sop.subalterno || '-'}`
        );
        container.appendChild(info);

        // Sub-fase toggle
        const subphase = _sop.phase2_subphase || 1;
        container.appendChild(UI.toggle('Fase', [
            { label: 'Ricognizione', value: 1 },
            { label: 'Analisi', value: 2 }
        ], subphase, async (val) => {
            _sop.phase2_subphase = val;
            await DB.saveSopralluogo(_sop);
            _render(container);
        }));

        // Lista vani
        container.appendChild(UI.sectionHeader(`Vani (${Object.keys(_sop.rooms).length})`));
        const roomNames = Object.keys(_sop.rooms);

        if (roomNames.length === 0) {
            container.appendChild(UI.emptyState('🏠', 'Nessun vano. Aggiungine uno!'));
        } else {
            roomNames.forEach(name => {
                const room = _sop.rooms[name];
                const status = _sop.room_status[name] || 'accessible';
                const obsCount = Object.keys(room).filter(k => k.startsWith('Foto_')).length;
                const dest = room.room_destination || '';
                const analyzed = (_sop.rooms_analyzed || []).includes(name);

                let statusClass = '';
                let meta = `${dest} | ${obsCount} oss.`;

                if (status !== 'accessible') {
                    statusClass = 'status-non-accessible';
                    const statusLabels = {
                        non_accessibile: 'Non Accessibile',
                        non_valutabile: 'Non Valutabile',
                        non_autorizzato: 'Non Autorizzato'
                    };
                    meta += ` | ${statusLabels[status] || status}`;
                } else if (analyzed) {
                    statusClass = 'completed';
                    meta += ' | Completato';
                }

                container.appendChild(UI.roomCard(name, meta, statusClass, () => {
                    _currentRoom = name;
                    _view = 'room_card';
                    _render(container);
                }));
            });
        }

        // Bottoni azione
        if (isPC) {
            // Parti Comuni: 3 categorie
            const catGrid = document.createElement('div');
            catGrid.className = 'btn-grid cols-3 mt-16';
            catGrid.appendChild(UI.btn('🏠 Vani', 'btn-primary', () => { _view = 'add_room'; _render(container); }));
            catGrid.appendChild(UI.btn('🪜 Scale', 'btn-info', () => {
                App.navigate('stairs', { id: _sop.id });
            }));
            catGrid.appendChild(UI.btn('🏛 Prospetti', 'btn-warning', () => {
                App.navigate('prospetti', { id: _sop.id });
            }));
            container.appendChild(catGrid);
        } else {
            container.appendChild(UI.btn('+ Aggiungi Vano', 'btn-primary btn-block mt-16', () => {
                _view = 'add_room';
                _render(container);
            }));
        }

        // Azioni extra
        const extraRow = document.createElement('div');
        extraRow.className = 'flex flex-col gap-8 mt-8';

        // Pertinenze (se tipo lo consente)
        if (Config.PERTINENZA_PARENT_TYPES.includes(_sop.unit_type)) {
            extraRow.appendChild(UI.btn('Pertinenze', 'btn-outline btn-block', () => {
                App.navigate('pertinenze', { id: _sop.id });
            }));
        }

        // Interruzioni (Si Allontana / Rientra)
        extraRow.appendChild(UI.btn('Si Allontana / Rientra', 'btn-outline btn-block btn-sm', () => _handleAllontana()));

        // Vai al riepilogo
        extraRow.appendChild(UI.btn('Vai al Riepilogo →', 'btn-success btn-block', async () => {
            _sop.phase = Config.PHASES.RIEPILOGO;
            await DB.saveSopralluogo(_sop);
            App.navigate('review', { id: _sop.id });
        }));

        container.appendChild(extraRow);
    }

    // ===== SCHEDA VANO =====
    function _renderRoomCard(container) {
        if (!_currentRoom || !_sop.rooms[_currentRoom]) {
            _view = 'room_list'; _render(container); return;
        }
        const room = _sop.rooms[_currentRoom];
        const status = _sop.room_status[_currentRoom] || 'accessible';

        container.appendChild(UI.sectionHeader(_currentRoom));

        // Info vano
        const infoCard = UI.card(null);
        infoCard.innerHTML = `
            <p><strong>Destinazione:</strong> ${UI.esc(room.room_destination || '-')}</p>
            <p><strong>Finiture:</strong> ${UI.esc(room.room_finishes || 'Non impostate')}</p>
            <p><strong>Stato:</strong> ${UI.esc(status)}</p>
        `;
        container.appendChild(infoCard);

        // Foto panoramiche
        container.appendChild(UI.btn('📷 Foto Panoramica', 'btn-outline btn-block', async () => {
            try {
                const result = await Photos.captureFromCamera();
                const panoCount = (await DB.getPhotosByRoom(_sop.id, _currentRoom))
                    .filter(p => p.type === 'panoramica').length;
                const filename = `FOTO_PANORAMICA_${panoCount + 1}.jpg`;
                await Photos.savePhoto(_sop.id, _currentRoom, 'panoramica', filename, result.blob, result.thumbnail);
                App.toast('Foto panoramica salvata!');
            } catch (e) { App.toast('Errore foto'); }
        }));

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
                        await DB.removeObservation(_sop, _currentRoom, obs._foto_key);
                        _sop = await DB.getSopralluogo(_sop.id);
                        _render(container);
                    }
                }));
            });
            container.appendChild(list);
        }

        // Bottoni azione
        const actions = document.createElement('div');
        actions.className = 'flex flex-col gap-8 mt-16';

        // NDR intero vano (solo sub-fase 1)
        if (status === 'accessible') {
            actions.appendChild(UI.btn('🟢 NDR (Intero Vano)', 'btn-ndr btn-block', () => {
                _view = 'ndr_full';
                _render(container);
            }));
        }

        // Aggiungi osservazione (wizard)
        actions.appendChild(UI.btn('+ Aggiungi Osservazione', 'btn-primary btn-block', () => {
            App.navigate('wizard', { id: _sop.id, room: _currentRoom });
        }));

        // Stato vano
        actions.appendChild(UI.btn('Modifica Stato Vano', 'btn-outline btn-block btn-sm', () => {
            _view = 'room_status';
            _render(container);
        }));

        // Finiture
        if (!room.room_finishes) {
            actions.appendChild(UI.btn('Imposta Finiture', 'btn-outline btn-block btn-sm', () => {
                _view = 'finishes';
                _render(container);
            }));
        }

        // Torna alla lista
        actions.appendChild(UI.btn('← Lista Vani', 'btn-secondary btn-block', () => {
            _view = 'room_list';
            _render(container);
        }));

        container.appendChild(actions);
    }

    // ===== AGGIUNGI VANO =====
    function _renderAddRoom(container) {
        container.appendChild(UI.sectionHeader('Numero Vano'));
        const nextNum = Object.keys(_sop.rooms).length + 1;
        const { group, input } = UI.formGroup(null, 'text', `Vano ${nextNum}`, '');
        container.appendChild(group);
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', () => {
            const vanoName = input.value.trim();
            if (!vanoName) { App.toast('Inserisci un nome'); return; }
            _tempVanoName = vanoName;
            _view = 'choose_dest';
            _render(container);
        }));
    }

    let _tempVanoName = '';

    function _renderChooseDest(container) {
        container.appendChild(UI.sectionHeader('Destinazione'));
        const isPC = _sop.unit_type === 'Parti Comuni';
        const types = isPC ? Config.ROOM_TYPES_PC : Config.ROOM_TYPES;

        const grid = UI.buttonGrid(types, 2, async (dest) => {
            const fullName = `${_tempVanoName} - ${dest}`;

            // Floor suffix per multi-piano
            const operating = _sop.current_operating_floor || _sop.floor;
            const finalName = (_sop.is_multi_floor && operating) ?
                `${fullName} (${operating})` : fullName;

            await DB.createRoom(_sop, finalName, dest);
            _sop = await DB.getSopralluogo(_sop.id);
            _currentRoom = finalName;
            _view = 'finishes';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== FINITURE =====
    function _renderFinishes(container) {
        container.appendChild(UI.sectionHeader('Controsoffitto'));
        const grid = UI.buttonGrid(Config.CEIL_TYPES, 2, async (val) => {
            await DB.setRoomFinishes(_sop, _currentRoom, val);
            _sop = await DB.getSopralluogo(_sop.id);
            // Chiedi CDP
            _renderCdp(container);
        });
        container.appendChild(grid);
    }

    function _renderCdp(container) {
        container.innerHTML = '';
        container.appendChild(UI.sectionHeader('Carta da Parati'));
        const grid = UI.buttonGrid([
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], 2, async (val) => {
            const room = _sop.rooms[_currentRoom];
            room.has_cdp = val;
            await DB.saveSopralluogo(_sop);
            _view = 'room_card';
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== NDR INTERO VANO =====
    function _renderNdrFull(container) {
        container.appendChild(UI.sectionHeader('NDR Intero Vano'));
        container.appendChild(document.createTextNode('Controsoffitto presente?'));

        const grid = UI.buttonGrid(Config.CEIL_TYPES, 2, async (finishes) => {
            // Salva finiture
            await DB.setRoomFinishes(_sop, _currentRoom, finishes);
            _sop = await DB.getSopralluogo(_sop.id);

            // Chiedi CDP
            _renderNdrCdp(container, finishes);
        });
        container.appendChild(grid);
    }

    function _renderNdrCdp(container, finishes) {
        container.innerHTML = '';
        container.appendChild(UI.sectionHeader('Carta da Parati'));
        const grid = UI.buttonGrid([
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], 2, async (cdp) => {
            const room = _sop.rooms[_currentRoom];
            room.has_cdp = cdp;

            const isStair = _isStairRoom();

            if (isStair) {
                // Scala: unica NDR "Intera Sotto-sezione"
                await DB.addObservation(_sop, _currentRoom, {
                    element: 'Intera Sotto-sezione',
                    phenomenon: 'NDR'
                });
            } else {
                // 3 NDR: Soffitto, Pavimento, Pareti
                await DB.addObservation(_sop, _currentRoom, { element: 'Soffitto', phenomenon: 'NDR' });
                await DB.addObservation(_sop, _currentRoom, { element: 'Pavimento', phenomenon: 'NDR' });
                await DB.addObservation(_sop, _currentRoom, { element: 'Pareti', phenomenon: 'NDR' });
            }

            _sop = await DB.getSopralluogo(_sop.id);

            // Marca come analizzato
            if (!_sop.rooms_analyzed) _sop.rooms_analyzed = [];
            if (!_sop.rooms_analyzed.includes(_currentRoom)) _sop.rooms_analyzed.push(_currentRoom);
            await DB.saveSopralluogo(_sop);

            _view = 'room_list';
            _render(container);
            App.toast('NDR salvato!');
        });
        container.appendChild(grid);
    }

    // ===== STATO VANO =====
    function _renderRoomStatus(container) {
        container.appendChild(UI.sectionHeader('Stato Vano'));
        const statuses = [
            { label: 'Accessibile', value: Config.ROOM_STATUSES.ACCESSIBLE },
            { label: 'Non Accessibile', value: Config.ROOM_STATUSES.NON_ACCESSIBILE },
            { label: 'Non Valutabile', value: Config.ROOM_STATUSES.NON_VALUTABILE },
            { label: 'Non Autorizzato', value: Config.ROOM_STATUSES.NON_AUTORIZZATO }
        ];
        const grid = UI.buttonGrid(statuses, 2, async (val) => {
            await DB.setRoomDisclaimer(_sop, _currentRoom, val === Config.ROOM_STATUSES.ACCESSIBLE ? null : val);
            _sop.room_status[_currentRoom] = val;

            if (val !== Config.ROOM_STATUSES.ACCESSIBLE) {
                // Chiedi nota/spiegazione
                _renderStatusNote(container, val);
            } else {
                await DB.saveSopralluogo(_sop);
                _view = 'room_card';
                _render(container);
            }
        });
        container.appendChild(grid);
    }

    function _renderStatusNote(container, statusType) {
        container.innerHTML = '';
        const labels = {
            non_accessibile: 'Non Accessibile',
            non_valutabile: 'Non Valutabile',
            non_autorizzato: 'Non Autorizzato'
        };
        container.appendChild(UI.sectionHeader(`Nota: ${labels[statusType] || statusType}`));
        const { group, input } = UI.formGroup(null, 'textarea', '', 'Motivo (opzionale)');
        container.appendChild(group);
        container.appendChild(UI.btn('Salva', 'btn-primary btn-block mt-16', async () => {
            const room = _sop.rooms[_currentRoom];
            room.disclaimer_note = input.value.trim();

            // Marca come analizzato (completato)
            if (!_sop.rooms_analyzed) _sop.rooms_analyzed = [];
            if (!_sop.rooms_analyzed.includes(_currentRoom)) _sop.rooms_analyzed.push(_currentRoom);

            await DB.saveSopralluogo(_sop);
            _view = 'room_list';
            _render(container);
            App.toast('Stato salvato');
        }));
    }

    // ===== SI ALLONTANA / RIENTRA =====
    function _handleAllontana() {
        App.showModal(`
            <p>Seleziona evento:</p>
            <div class="modal-actions flex-col">
                <button class="btn btn-warning btn-block" id="allontana-btn">Si Allontana</button>
                <button class="btn btn-success btn-block" id="rientra-btn">Rientra</button>
            </div>
        `);
        document.getElementById('allontana-btn').onclick = () => {
            App.hideModal();
            const nota = prompt('Nota (opzionale):');
            const now = new Date();
            _sop.allontana_events.push({
                type: 'allontana',
                time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                text: nota || '',
                after_room: _currentRoom || ''
            });
            DB.saveSopralluogo(_sop);
            App.toast('Allontanamento registrato');
        };
        document.getElementById('rientra-btn').onclick = () => {
            App.hideModal();
            const nota = prompt('Nota (opzionale):');
            const now = new Date();
            _sop.allontana_events.push({
                type: 'rientra',
                time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                text: nota || '',
                after_room: _currentRoom || ''
            });
            DB.saveSopralluogo(_sop);
            App.toast('Rientro registrato');
        };
    }

    // ===== HELPERS =====
    function _isStairRoom() {
        if (!_currentRoom) return false;
        const dest = (_sop.rooms[_currentRoom] || {}).room_destination || '';
        return dest === 'SCALA';
    }

    return { render };

})();
