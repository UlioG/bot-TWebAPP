/**
 * rooms.js - Fase 2: Gestione vani (lista, aggiunta, scheda vano)
 * Supporta: PC categorie (Vani/Scale/Prospetti), pertinenze, allontana/rientra,
 * context header, CDP, wall count, stair rooms
 */
const RoomsView = {
    sopId: null,

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const roomParam = params[1] ? decodeURIComponent(params[1]) : null;
        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        if (roomParam) {
            // Check if room is in active context (apartment or pertinenza)
            const rooms = Events.getActiveRooms(sop);
            if (rooms[roomParam]) {
                this.renderRoomCard(container, sop, roomParam);
            } else {
                this.renderRoomList(container, sop);
            }
        } else {
            this.renderRoomList(container, sop);
        }
    },

    // ========== LISTA VANI ==========

    async renderRoomList(container, sop) {
        const esc = UI._escapeHtml;
        const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);
        const inPert = Events.isInPertinenza(sop);
        const rooms = Events.getActiveRooms(sop);
        const roomNames = Object.keys(rooms);

        UI.setTitle(sop.building_code + ' - Vani');
        UI.showBack(true, () => {
            if (inPert) {
                // Exit pertinenza mode
                Events.dispatch('exit_pertinenza', this.sopId, {}).then(() => {
                    App.navigate(`rooms/${this.sopId}`);
                });
            } else {
                App.navigate('home');
            }
        });

        let html = '';

        // Context header
        if (inPert && sop.pertinenze && sop.pertinenze[sop.active_pertinenza]) {
            const pert = sop.pertinenze[sop.active_pertinenza];
            // Build full display name
            const nameParts = [pert.type || 'Pertinenza'];
            if (pert.sub) nameParts.push(`Sub. ${pert.sub}`);
            if (pert.numero) nameParts.push(`N. ${pert.numero}`);
            let pertLabel = nameParts.join(' - ');
            if (pert.piano) pertLabel += ` (${pert.piano})`;
            html += UI.contextHeader(`📦 ${pertLabel}`, '📦');
        } else if (isPC) {
            html += UI.contextHeader('Parti Comuni', '🏢');
        }

        // Info card
        html += UI.infoCard([
            { label: 'Unita\'', value: sop.manual_unit_type || sop.unit_name || sop.unit_type || '' },
            { label: 'Piano', value: sop.floor || '' }
        ]);

        // Proprietario assente: skip survey, vai a Step 3
        if (sop.proprietario_assente && !inPert && !isPC) {
            html += `<div style="padding: 16px; text-align: center;">
                <div style="background: var(--destructive-light, #fff3f3); border: 1px solid var(--destructive, #e53e3e); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">🚫</div>
                    <div style="font-weight: 600; margin-bottom: 4px;">Proprietario Assente</div>
                    <div style="color: var(--text-secondary); font-size: 13px;">${UI._escapeHtml(sop.proprietario_assente_note || 'Proprietario assente.')}</div>
                </div>
                <button class="btn btn-primary" id="btn-skip-to-review">Procedi al Riepilogo</button>
            </div>`;
            container.innerHTML = html;
            document.getElementById('btn-skip-to-review')?.addEventListener('click', () => {
                App.navigate(`review/${this.sopId}`);
            });
            return;
        }

        // Multi-floor: tab per piano + planimetria per piano
        if (sop.is_multi_floor && sop.building_floors && sop.building_floors.length > 1 && !inPert) {
            const currentFloor = sop.current_floor_tab || sop.floor;
            const floorsWithPlan = sop.floors_with_planimetria || [];
            html += `<div class="section"><div class="section-header">PIANO</div><div class="section-body">
                <div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 0 16px;">`;
            for (const f of sop.building_floors) {
                const abbr = CONFIG.getFloorAbbr(f);
                const isActive = f === currentFloor;
                const hasPlan = floorsWithPlan.includes(f);
                html += `<button class="btn-choice floor-tab${isActive ? ' selected' : ''}" data-floor-tab="${UI._escapeHtml(f)}" style="font-size:12px; min-width:48px;">
                    ${UI._escapeHtml(abbr)}${hasPlan ? ' 📐' : ''}
                </button>`;
            }
            html += `</div></div></div>`;

            // Se piano non ha planimetria, proponi caricamento
            if (!floorsWithPlan.includes(currentFloor)) {
                html += `<div style="padding: 8px 16px; background: var(--bg-secondary); border-radius: 8px; margin: 0 16px 8px;">
                    <div style="font-size: 13px; color: var(--hint); margin-bottom: 8px;">📐 Planimetria per <strong>${UI._escapeHtml(currentFloor)}</strong> non caricata</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-outline" id="btn-floor-plan-camera" style="flex:1; font-size:12px;">📷 Scatta</button>
                        <button class="btn btn-outline" id="btn-floor-plan-gallery" style="flex:1; font-size:12px;">🖼 Galleria</button>
                        <button class="btn btn-secondary" id="btn-floor-plan-skip" style="flex:1; font-size:12px;">Salta</button>
                    </div>
                </div>`;
            }
        }

        // Phase tabs
        html += UI.phaseTabs(sop.phase);

        // PC Categories (solo per Parti Comuni, non in pertinenza)
        if (isPC && !inPert) {
            html += `<div class="section"><div class="section-header">CATEGORIE</div><div class="section-body">`;
            html += UI.pcCategoryGrid();
            html += `</div></div>`;
        }

        // Allontana/Rientra banner
        if (sop.allontana_events && sop.allontana_events.length > 0) {
            const last = sop.allontana_events[sop.allontana_events.length - 1];
            if (last.type === 'allontana') {
                html += UI.allontanaBanner(`Allontanato alle ${last.time} — ${last.text || ''}`);
            }
        }

        // Lista vani
        if (roomNames.length > 0) {
            let cells = '';
            for (const name of roomNames) {
                const room = rooms[name];
                const obsCount = (room.observations || []).length;
                const photoCount = (room.photos || []).length;
                const isStair = CONFIG.isStairRoom(name);
                const isProsp = CONFIG.isProspettoRoom(name);

                let statusIcon = '🟢';
                if (room.status === 'non_accessibile') statusIcon = '🟠';
                else if (room.status === 'non_valutabile') statusIcon = '🔴';
                else if (room.status === 'non_autorizzato') statusIcon = '🟣';

                let subtitle = `Oss: ${obsCount} | Foto: ${photoCount}`;
                if (!isStair && !isProsp) {
                    const completedCount = (room.completed_surfaces || []).length;
                    subtitle += ` | Sup: ${completedCount}/3`;
                }
                if (room.finishes) subtitle += ` | ${room.finishes}`;

                cells += UI.cell({
                    icon: statusIcon,
                    title: name,
                    subtitle: subtitle,
                    dataId: name
                });
            }
            html += UI.section('VANI', cells);
        } else {
            html += UI.emptyState('🏠', 'Nessun vano', 'Aggiungi il primo vano per iniziare');
        }

        // Bottoni azioni
        html += `<div style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">`;
        if (!isPC || inPert) {
            html += `<button class="btn btn-primary" id="btn-add-room">Aggiungi Vano</button>`;
        }

        // Allontana / Rientra
        const lastAllontana = (sop.allontana_events || []).slice(-1)[0];
        const isAllontanato = lastAllontana && lastAllontana.type === 'allontana';
        if (isAllontanato) {
            html += `<button class="btn btn-outline" id="btn-rientra">🚪 Rientra</button>`;
        } else {
            html += `<button class="btn btn-outline" id="btn-allontana">🚪 Si Allontana</button>`;
        }

        // Pertinenze (solo per unita' non-PC, non in pertinenza)
        if (!isPC && !inPert && CONFIG.PERTINENZA_PARENT_TYPES.includes(sop.unit_type)) {
            html += `<button class="btn btn-outline" id="btn-goto-pert">📦 Pertinenze</button>`;
        }
        // Torna all'appartamento (se in pertinenza)
        if (inPert) {
            html += `<button class="btn btn-outline" id="btn-back-apt">🏠 Torna all'Appartamento</button>`;
        }

        if (roomNames.length > 0) {
            html += `<button class="btn btn-secondary" id="btn-review">Riepilogo / Report</button>`;
        }
        html += `</div><div style="height:32px;"></div>`;

        container.innerHTML = html;
        this._bindRoomListEvents(container, sop);
    },

    _bindRoomListEvents(container, sop) {
        const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);
        const inPert = Events.isInPertinenza(sop);

        // Click room
        container.querySelectorAll('.cell[data-id]').forEach(cell => {
            cell.addEventListener('click', () => {
                App.navigate(`rooms/${this.sopId}/${encodeURIComponent(cell.dataset.id)}`);
            });
        });

        // Phase tabs — navigazione tra le 3 fasi
        container.querySelectorAll('.phase-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const phase = parseInt(tab.dataset.phase);
                if (phase === 1) {
                    App.navigate(`setup/${this.sopId}`);
                } else if (phase === 3) {
                    App.navigate(`review/${this.sopId}`);
                }
                // phase === 2: già qui (rooms), non fare nulla
            });
        });

        // PC Categories
        container.querySelectorAll('.pc-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                if (cat === 'vani') {
                    this._showAddRoomPC(sop);
                } else if (cat === 'scale') {
                    App.navigate(`stairs/${this.sopId}`);
                } else if (cat === 'prospetti') {
                    this._addProspettiRoom(sop);
                }
            });
        });

        // Add room
        document.getElementById('btn-add-room')?.addEventListener('click', () => {
            this._showAddRoomModal(sop);
        });

        // Allontana
        document.getElementById('btn-allontana')?.addEventListener('click', () => {
            UI.promptInput('Chi si allontana?', 'Nome / ruolo della persona', async (text) => {
                await Events.dispatch('allontana', this.sopId, { text: text || 'Si allontana' });
                UI.toast('Allontanamento registrato');
                const updated = await DB.getSopralluogo(this.sopId);
                this.renderRoomList(container, updated);
            });
        });

        // Rientra
        document.getElementById('btn-rientra')?.addEventListener('click', () => {
            UI.promptInput('Chi rientra?', 'Nome / ruolo della persona', async (text) => {
                await Events.dispatch('rientra', this.sopId, { text: text || 'Rientra' });
                UI.toast('Rientro registrato');
                const updated = await DB.getSopralluogo(this.sopId);
                this.renderRoomList(container, updated);
            });
        });

        // Pertinenze
        document.getElementById('btn-goto-pert')?.addEventListener('click', () => {
            App.navigate(`pertinenze/${this.sopId}`);
        });

        // Back to apartment from pertinenza
        document.getElementById('btn-back-apt')?.addEventListener('click', async () => {
            await Events.dispatch('exit_pertinenza', this.sopId, {});
            const updated = await DB.getSopralluogo(this.sopId);
            this.renderRoomList(container, updated);
        });

        // Floor tabs (multi-floor)
        container.querySelectorAll('.floor-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                const floor = btn.dataset.floorTab;
                await Events.dispatch('update_setup', this.sopId, { current_floor_tab: floor });
                const updated = await DB.getSopralluogo(this.sopId);
                this.renderRoomList(container, updated);
            });
        });

        // Floor planimetria upload (multi-floor)
        const saveFloorPlan = async (result) => {
            if (!result) return;
            const currentFloor = sop.current_floor_tab || sop.floor;
            const { id } = await Photos.save(this.sopId, `__planimetria_${currentFloor}__`, 'planimetria', result.blob, result.thumbnail);
            await Events.dispatch('upload_floor_planimetria', this.sopId, { floor: currentFloor, photo_id: id });
            UI.toast(`Planimetria ${currentFloor} caricata`);
            const updated = await DB.getSopralluogo(this.sopId);
            this.renderRoomList(container, updated);
        };
        document.getElementById('btn-floor-plan-camera')?.addEventListener('click', async () => saveFloorPlan(await Photos.takePhoto()));
        document.getElementById('btn-floor-plan-gallery')?.addEventListener('click', async () => saveFloorPlan(await Photos.fromGallery()));
        document.getElementById('btn-floor-plan-skip')?.addEventListener('click', async () => {
            const currentFloor = sop.current_floor_tab || sop.floor;
            const floorsWithPlan = sop.floors_with_planimetria || [];
            if (!floorsWithPlan.includes(currentFloor)) {
                floorsWithPlan.push(currentFloor);
                await Events.dispatch('update_setup', this.sopId, { floors_with_planimetria: floorsWithPlan });
            }
            const updated = await DB.getSopralluogo(this.sopId);
            this.renderRoomList(container, updated);
        });

        // Review
        document.getElementById('btn-review')?.addEventListener('click', () => {
            App.navigate(`review/${this.sopId}`);
        });
    },

    // ========== ADD ROOM MODAL (standard) ==========

    _showAddRoomModal(sop) {
        const rooms = Events.getActiveRooms(sop);
        const nextNum = Object.keys(rooms).length + 1;
        const roomTypes = CONFIG.getRoomTypes(CONFIG.isPartiComuni(sop.unit_name || sop.unit_type));

        let html = `
            <div class="modal-title">Aggiungi Vano</div>
            <div style="padding: 0 16px;">
                ${UI.formInput({ label: 'Numero Vano', id: 'modal-room-num', value: `Vano ${nextNum}`, placeholder: 'Es. Vano 1' }).trim()}
                ${UI.formInput({ label: 'Destinazione', id: 'modal-room-name', placeholder: 'Es. Cucina, Bagno' }).trim()}
            </div>
            <div style="padding: 8px 16px;">
                <div class="section-header">TIPO</div>
        `;
        html += UI.buttonGrid(roomTypes, { cols: 3 });
        html += `</div>
            <div style="padding: 16px;">
                <button class="btn btn-primary" id="modal-confirm-room">Conferma</button>
            </div>
        `;

        UI.showModal(html);

        // Click room type -> set name
        document.querySelectorAll('#modal-content .btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#modal-content .btn-choice').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                document.getElementById('modal-room-name').value = btn.dataset.value;
            });
        });

        document.getElementById('modal-confirm-room').addEventListener('click', async () => {
            const roomNum = document.getElementById('modal-room-num').value.trim();
            const roomName = document.getElementById('modal-room-name').value.trim();
            if (!roomNum || !roomName) { UI.toast('Compila i campi'); return; }

            const fullName = `${roomNum} - ${roomName}`;
            if (rooms[fullName]) { UI.toast('Vano gia\' esistente'); return; }

            const inPert = Events.isInPertinenza(sop);
            if (inPert) {
                await Events.dispatch('add_vano_pertinenza', this.sopId, {
                    pert_index: sop.active_pertinenza,
                    room_number: roomNum,
                    room_name: roomName,
                    full_name: fullName
                });
            } else {
                await Events.dispatch('add_vano', this.sopId, {
                    room_number: roomNum,
                    room_name: roomName,
                    full_name: fullName,
                    destination: roomName
                });
            }

            UI.hideModal();
            App.navigate(`rooms/${this.sopId}/${encodeURIComponent(fullName)}`);
        });
    },

    // ========== ADD ROOM PC (con destinazioni PC) ==========

    // PC Vano: Step 1 = Piano, Step 2 = Scala, Step 3 = Num + Dest
    _pcVanoFloor: null,
    _pcVanoStair: null,

    _showAddRoomPC(sop) {
        this._pcVanoFloor = null;
        this._pcVanoStair = null;
        this._pcVanoStep1_Floor(sop);
    },

    _pcVanoStep1_Floor(sop) {
        const floors = CONFIG.PREDEFINED_FLOORS;
        let html = `<div class="modal-title">Vano PC - Piano</div>`;
        html += `<div style="padding: 8px 16px; color: var(--hint); font-size: 13px;">Seleziona il piano del vano</div>`;
        const buttons = floors.map(f => {
            const abbr = CONFIG.getFloorAbbr(f);
            return `<button class="btn-choice btn-floor" data-value="${UI._escapeHtml(f)}" title="${UI._escapeHtml(f)}">${UI._escapeHtml(abbr)}</button>`;
        }).join('');
        html += `<div class="btn-grid btn-grid-3" style="padding: 0 16px;">${buttons}</div>`;
        html += `<div style="padding: 8px 16px;">
            <input class="form-input" type="text" id="pc-custom-floor" placeholder="Piano personalizzato...">
            <button class="btn btn-outline" id="pc-btn-custom-floor" style="margin-top:8px; width:100%;">Usa piano personalizzato</button>
        </div>`;

        UI.showModal(html);

        document.querySelectorAll('#modal-content .btn-floor').forEach(btn => {
            btn.addEventListener('click', () => {
                this._pcVanoFloor = btn.dataset.value;
                UI.hideModal();
                this._pcVanoStep2_Stair(sop);
            });
        });
        document.getElementById('pc-btn-custom-floor')?.addEventListener('click', () => {
            const val = document.getElementById('pc-custom-floor').value.trim();
            if (!val) { UI.toast('Inserisci un piano'); return; }
            this._pcVanoFloor = val;
            UI.hideModal();
            this._pcVanoStep2_Stair(sop);
        });
    },

    _pcVanoStep2_Stair(sop) {
        const stairOptions = ['A', 'B', 'C', 'D'];
        let html = `<div class="modal-title">Vano PC - Scala</div>`;
        html += `<div style="padding: 8px 16px; color: var(--hint); font-size: 13px;">Piano: <strong>${UI._escapeHtml(this._pcVanoFloor)}</strong></div>`;
        html += `<div style="padding: 0 16px; display: flex; flex-direction: column; gap: 8px;">`;
        for (const s of stairOptions) {
            html += `<button class="btn btn-outline pc-stair-btn" data-value="Scala ${s}">Scala ${s}</button>`;
        }
        html += `<button class="btn btn-secondary pc-stair-btn" data-value="">Nessuna</button>`;
        html += `</div>`;
        html += `<div style="padding: 8px 16px;">
            <input class="form-input" type="text" id="pc-custom-stair" placeholder="Scala personalizzata...">
            <button class="btn btn-outline" id="pc-btn-custom-stair" style="margin-top:8px; width:100%;">Usa valore inserito</button>
        </div>`;

        UI.showModal(html);

        document.querySelectorAll('#modal-content .pc-stair-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._pcVanoStair = btn.dataset.value || null;
                UI.hideModal();
                this._pcVanoStep3_NumDest(sop);
            });
        });
        document.getElementById('pc-btn-custom-stair')?.addEventListener('click', () => {
            const val = document.getElementById('pc-custom-stair').value.trim();
            this._pcVanoStair = val ? `Scala ${val}` : null;
            UI.hideModal();
            this._pcVanoStep3_NumDest(sop);
        });
    },

    _pcVanoStep3_NumDest(sop) {
        const rooms = Events.getActiveRooms(sop);
        const nextNum = Object.keys(rooms).length + 1;

        let headerInfo = `Piano: ${this._pcVanoFloor || '-'}`;
        if (this._pcVanoStair) headerInfo += ` | ${this._pcVanoStair}`;

        let html = `
            <div class="modal-title">Vano PC - Destinazione</div>
            <div style="padding: 8px 16px; color: var(--hint); font-size: 13px;">${UI._escapeHtml(headerInfo)}</div>
            <div style="padding: 0 16px;">
                ${UI.formInput({ label: 'Numero Vano', id: 'modal-room-num', value: `Vano ${nextNum}` }).trim()}
            </div>
            <div style="padding: 8px 16px;">
                <div class="section-header">DESTINAZIONE</div>
        `;
        html += UI.buttonGrid(CONFIG.ROOM_TYPES_PC, { cols: 3 });
        html += `</div>
            <div style="padding: 16px;">
                <button class="btn btn-primary" id="modal-confirm-room">Conferma</button>
            </div>
        `;

        UI.showModal(html);

        let selectedDest = '';
        document.querySelectorAll('#modal-content .btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#modal-content .btn-choice').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedDest = btn.dataset.value;
            });
        });

        document.getElementById('modal-confirm-room').addEventListener('click', async () => {
            const roomNum = document.getElementById('modal-room-num').value.trim();
            if (!roomNum || !selectedDest) { UI.toast('Seleziona numero e destinazione'); return; }

            // Nome come nel bot: "Vano N - Dest (Piano)"
            const floorSuffix = this._pcVanoFloor ? ` (${this._pcVanoFloor})` : '';
            const fullName = `${roomNum} - ${selectedDest}${floorSuffix}`;
            if (rooms[fullName]) { UI.toast('Vano gia\' esistente'); return; }

            await Events.dispatch('add_vano', this.sopId, {
                room_number: roomNum,
                room_name: selectedDest,
                full_name: fullName,
                destination: selectedDest,
                pc_floor: this._pcVanoFloor || null,
                pc_stair: this._pcVanoStair || null
            });

            UI.hideModal();
            App.navigate(`rooms/${this.sopId}/${encodeURIComponent(fullName)}`);
        });
    },

    // ========== PROSPETTI ==========

    _addProspettiRoom(sop) {
        // Navigate to the dedicated ProspettiView
        App.navigate(`prospetti/${this.sopId}`);
    },

    // ========== SCHEDA VANO ==========

    async renderRoomCard(container, sop, roomName) {
        const rooms = Events.getActiveRooms(sop);
        const room = rooms[roomName];
        if (!room) { this.renderRoomList(container, sop); return; }

        const esc = UI._escapeHtml;
        const isStair = CONFIG.isStairRoom(roomName);
        const isProsp = CONFIG.isProspettoRoom(roomName);

        UI.setTitle(roomName);
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        let html = '';

        // Status e soffitto
        html += `<div class="section"><div class="section-body">
            <div class="cell" style="cursor:default"><div class="cell-body">
                <div class="cell-title">Stato: ${UI.statusBadge(room.status)}</div>
                <div class="cell-subtitle">Soffitto: ${esc(room.finishes || 'Non selezionato')}</div>
            </div></div>
        </div></div>`;

        // Superfici mancanti (non per scale/prospetti)
        html += UI.missingSurfaces(room.completed_surfaces, isStair, isProsp);

        // Bottoni stato, soffitto, CDP, wall count
        html += `<div style="padding: 0 16px;">
            <div class="btn-grid">
                <button class="btn-choice" id="btn-set-status">Stato Vano</button>
                ${!isStair && !isProsp ? '<button class="btn-choice" id="btn-set-ceiling">Soffitto</button>' : ''}
            </div>
            <div class="btn-grid" style="margin-top:8px;">
                <button class="btn-choice" id="btn-rename-room">Rinomina</button>
                <button class="btn-choice" id="btn-delete-room" style="color:var(--destructive)">Elimina</button>
            </div>
        </div>`;

        // Foto panoramiche + marker
        html += `<div class="section">
            <div class="section-header">FOTO PANORAMICHE</div>
            <div class="section-body" id="room-photos-panoramic">
                <div style="padding: 8px 16px; display:flex; gap:8px;">
                    <button class="btn btn-secondary" id="btn-pano-camera" style="flex:1;">📷 Scatta</button>
                    <button class="btn btn-secondary" id="btn-pano-gallery" style="flex:1;">🖼 Galleria</button>
                </div>
            </div>
        </div>`;

        // Marker status + button
        const markerCoords = room.marker_coords || {};
        const markerCount = Object.keys(markerCoords).length;
        if (markerCount > 0) {
            html += `<div style="padding: 4px 16px;">
                <div style="display:flex; align-items:center; gap:8px; font-size:13px; color: var(--text-secondary);">
                    <span>📍</span>
                    <span>Marker: <strong style="color: #4caf50;">✅ ${markerCount} posizionati</strong></span>
                </div>
            </div>`;
        }

        // Osservazioni
        const observations = room.observations || [];
        html += `<div class="section"><div class="section-header">OSSERVAZIONI (${observations.length})</div></div>`;
        if (observations.length > 0) {
            for (let i = 0; i < observations.length; i++) {
                html += UI.observationCard(observations[i], i, { showActions: true });
            }
        } else {
            html += `<div style="text-align:center; color:var(--hint); padding:16px;">Nessuna osservazione</div>`;
        }

        // Testo manuale
        if (room.manual_text) {
            html += `<div class="section"><div class="section-header">TESTO MANUALE</div>
                <div class="section-body"><div class="preview-box"><pre class="preview-text">${esc(room.manual_text)}</pre></div></div>
            </div>`;
        }

        // Bottoni azioni
        const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);
        html += `<div style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">
            <button class="btn btn-primary" id="btn-add-obs">Aggiungi Osservazione</button>
            <button class="btn btn-outline" id="btn-open-markers" style="display:none;">📍 Posiziona Marker</button>
            <button class="btn btn-outline" id="btn-manual-text">✏️ Testo Manuale</button>`;

        // Stair Gruppo B: Continua / Concludi buttons
        if (isStair && isPC && typeof StairsView !== 'undefined' && StairsView._direction) {
            const dirLabel = StairsView._direction === 'salendo' ? 'Salire' : 'Scendere';
            const dirIcon = StairsView._direction === 'salendo' ? '⬆️' : '⬇️';
            html += `<button class="btn btn-outline" id="btn-stair-continue">${dirIcon} Continua a ${dirLabel}</button>`;
            html += `<button class="btn btn-outline" id="btn-stair-conclude">🏁 Concludi Scala</button>`;
        }

        html += `<button class="btn btn-secondary" id="btn-back-rooms">Torna ai Vani</button>
        </div><div style="height:32px;"></div>`;

        container.innerHTML = html;

        this._loadPanoramicPhotos(sop, roomName);
        this._bindRoomCardEvents(container, sop, roomName, room);
    },

    async _loadPanoramicPhotos(sop, roomName) {
        const allPhotos = await DB.getPhotosBySopralluogo(sop.id);
        const pertIdx = Events.isInPertinenza(sop) ? sop.active_pertinenza : null;
        const photos = allPhotos ? allPhotos.filter(p =>
            p.room_name === roomName && p.type === 'panoramica' && Photos._matchPert(p, pertIdx)
        ) : [];

        if (photos.length > 0) {
            const grid = document.getElementById('room-photos-panoramic');
            let gridHtml = '<div class="photo-grid" style="padding: 0 16px;">';
            for (const photo of photos) {
                if (photo.thumbnail) {
                    const url = typeof photo.thumbnail === 'string' ? photo.thumbnail : URL.createObjectURL(photo.thumbnail);
                    gridHtml += `<div class="photo-thumb" data-photo-id="${photo.id}">
                        <img src="${url}" alt="Panoramica">
                        <button class="photo-delete-btn" data-photo-id="${photo.id}">x</button>
                        <button class="photo-replace-btn" data-photo-id="${photo.id}" title="Sostituisci">🔄</button>
                    </div>`;
                }
            }
            gridHtml += '</div>';
            grid.insertAdjacentHTML('afterbegin', gridHtml);

            document.querySelectorAll('.photo-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    UI.confirmAction('Eliminare questa foto?', async () => {
                        await Events.dispatch('delete_photo', this.sopId, { room_name: roomName, photo_id: btn.dataset.photoId });
                        await DB.delete('photos', btn.dataset.photoId);
                        UI.toast('Foto eliminata');
                        const updated = await DB.getSopralluogo(this.sopId);
                        this.renderRoomCard(document.getElementById('app-content'), updated, roomName);
                    });
                });
            });

            // Replace photo
            document.querySelectorAll('.photo-replace-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const photoId = btn.dataset.photoId;
                    UI.choiceModal('Sostituisci foto', [
                        { value: 'camera', label: '📷 Fotocamera' },
                        { value: 'gallery', label: '🖼 Galleria' }
                    ], async (source) => {
                        const result = source === 'camera' ? await Photos.takePhoto() : await Photos.fromGallery();
                        if (!result) return;
                        const existing = await DB.getPhoto(photoId);
                        if (!existing) return;
                        existing.blob = result.blob;
                        existing.thumbnail = result.thumbnail;
                        await DB.put('photos', existing);
                        UI.toast('Foto sostituita');
                        const updated = await DB.getSopralluogo(this.sopId);
                        this.renderRoomCard(document.getElementById('app-content'), updated, roomName);
                    });
                });
            });
        }

        // L10: Prompt automatico foto panoramica per vano scala
        if (photos.length === 0 && CONFIG.isStairRoom(roomName)) {
            const grid = document.getElementById('room-photos-panoramic');
            if (grid) {
                grid.insertAdjacentHTML('afterbegin', `
                    <div style="background: #fff3cd; border: 1px solid #ffc107;
                        border-radius: 8px; margin: 8px 16px; padding: 12px; text-align: center;">
                        <div style="font-size: 24px;">📸</div>
                        <div style="font-weight: 600; margin-top: 4px;">Foto panoramica scala</div>
                        <div style="font-size: 12px; color: #856404; margin-top: 2px;">Scatta una foto panoramica della scala prima di procedere</div>
                    </div>
                `);
            }
        }

        // Show/hide marker button based on requirements
        const rooms = Events.getActiveRooms(sop);
        const room = rooms[roomName];
        if (room && typeof MarkerView !== 'undefined') {
            const check = MarkerView.checkMarkerRequirements(room, allPhotos, roomName, pertIdx);
            const btn = document.getElementById('btn-open-markers');
            if (btn && check.canMark) {
                btn.style.display = 'block';
                if (check.hasMarkers) {
                    btn.textContent = `📍 Modifica Marker (${check.markerCount}/${check.defectCount})`;
                }
            }
        }
    },

    _bindRoomCardEvents(container, sop, roomName, room) {
        // Status
        document.getElementById('btn-set-status')?.addEventListener('click', () => {
            const statuses = [
                { value: 'accessible', label: 'Accessibile' },
                { value: 'non_accessibile', label: 'Non Accessibile' },
                { value: 'non_valutabile', label: 'Non Valutabile' },
                { value: 'non_autorizzato', label: 'Non Autorizzato' }
            ];
            UI.choiceModal('Stato Vano', statuses, async (val) => {
                await Events.dispatch('set_room_status', this.sopId, { room_name: roomName, status: val });
                UI.toast('Stato aggiornato');
                const updated = await DB.getSopralluogo(this.sopId);
                this.renderRoomCard(container, updated, roomName);
            });
        });

        // Ceiling
        document.getElementById('btn-set-ceiling')?.addEventListener('click', () => {
            UI.choiceModal('Tipo Soffitto', CONFIG.CEIL_TYPES, async (val) => {
                await Events.dispatch('set_room_finishes', this.sopId, { room_name: roomName, ceiling_type: val });
                UI.toast('Soffitto impostato');
                const updated = await DB.getSopralluogo(this.sopId);
                this.renderRoomCard(container, updated, roomName);
            });
        });

        // Rename
        document.getElementById('btn-rename-room')?.addEventListener('click', () => {
            UI.promptInput('Nuovo nome vano', 'Es. Vano 1 - Cucina', async (val) => {
                if (val === roomName) return;
                const rooms = Events.getActiveRooms(sop);
                if (rooms[val]) { UI.toast('Nome gia\' in uso'); return; }
                const parts = val.split(' - ');
                await Events.dispatch('rename_vano', this.sopId, {
                    old_name: roomName,
                    new_room_number: parts[0] || val,
                    new_room_name: parts.slice(1).join(' - ') || val,
                    new_full_name: val
                });
                UI.toast('Rinominato');
                App.navigate(`rooms/${this.sopId}/${encodeURIComponent(val)}`);
            }, { defaultValue: roomName });
        });

        // Delete room
        document.getElementById('btn-delete-room')?.addEventListener('click', () => {
            UI.confirmAction(`Eliminare "${roomName}"?`, async () => {
                await Events.dispatch('delete_vano', this.sopId, { room_name: roomName });
                UI.toast('Vano eliminato');
                App.navigate(`rooms/${this.sopId}`);
            });
        });

        // Panoramic photo
        const savePano = async (result) => {
            if (!result) return;
            const pertIdx = Events.isInPertinenza(sop) ? sop.active_pertinenza : null;
            const { id, filename } = await Photos.save(this.sopId, roomName, 'panoramica', result.blob, result.thumbnail, null, pertIdx);
            await Events.dispatch('add_photo', this.sopId, { room_name: roomName, photo_id: id, type: 'panoramica', filename });
            UI.toast('Foto aggiunta');
            const updated = await DB.getSopralluogo(this.sopId);
            this.renderRoomCard(container, updated, roomName);
        };
        document.getElementById('btn-pano-camera')?.addEventListener('click', async () => savePano(await Photos.takePhoto()));
        document.getElementById('btn-pano-gallery')?.addEventListener('click', async () => savePano(await Photos.fromGallery()));

        // Add observation
        document.getElementById('btn-add-obs')?.addEventListener('click', () => {
            App.navigate(`wizard/${this.sopId}/${encodeURIComponent(roomName)}`);
        });

        // Open marker tool
        document.getElementById('btn-open-markers')?.addEventListener('click', () => {
            if (typeof MarkerView !== 'undefined') {
                MarkerView.open(this.sopId, roomName);
            }
        });

        // Manual text
        document.getElementById('btn-manual-text')?.addEventListener('click', () => {
            UI.promptInput('Testo Manuale', 'Scrivi il testo manuale per questo vano...', async (text) => {
                await Events.dispatch('set_manual_text', this.sopId, { room_name: roomName, text });
                UI.toast('Testo salvato');
                const updated = await DB.getSopralluogo(this.sopId);
                this.renderRoomCard(container, updated, roomName);
            }, { multiline: true, defaultValue: room.manual_text || '' });
        });

        // Stair Gruppo B: Continua / Concludi
        document.getElementById('btn-stair-continue')?.addEventListener('click', () => {
            StairsView.continueToNextFloor();
        });
        document.getElementById('btn-stair-conclude')?.addEventListener('click', () => {
            StairsView.concludeStair();
        });

        // Back
        document.getElementById('btn-back-rooms')?.addEventListener('click', async () => {
            // L5: Check marker obbligatori before leaving room
            if (typeof MarkerView !== 'undefined') {
                const freshSop = await DB.getSopralluogo(this.sopId);
                const freshRooms = Events.getActiveRooms(freshSop);
                const freshRoom = freshRooms[roomName];
                if (freshRoom) {
                    const allPhotos = await DB.getPhotosBySopralluogo(this.sopId);
                    const pertIdx = Events.isInPertinenza(freshSop) ? freshSop.active_pertinenza : null;
                    const check = MarkerView.checkMarkerRequirements(freshRoom, allPhotos, roomName, pertIdx);
                    if (check.canMark && !check.hasMarkers) {
                        const msg = `Marker non posizionati!\n\nIl vano ha ${check.defectCount} difetti e foto panoramiche ma nessun marker.`;
                        const html = `
                            <div class="modal-title">${UI._escapeHtml(msg)}</div>
                            <div style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px;">
                                <button class="btn btn-primary" id="modal-markers">Posiziona Marker</button>
                                <button class="btn btn-secondary" id="modal-exit">Esci comunque</button>
                            </div>`;
                        UI.showModal(html);
                        document.getElementById('modal-markers').addEventListener('click', () => {
                            UI.hideModal();
                            MarkerView.open(this.sopId, roomName);
                        });
                        document.getElementById('modal-exit').addEventListener('click', () => {
                            UI.hideModal();
                            App.navigate(`rooms/${this.sopId}`);
                        });
                        return;
                    }
                }
            }
            App.navigate(`rooms/${this.sopId}`);
        });

        // Delete observation
        container.querySelectorAll('.obs-btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.obsIndex);
                UI.confirmAction('Eliminare osservazione?', async () => {
                    await Events.dispatch('delete_observation', this.sopId, { room_name: roomName, observation_index: idx });
                    UI.toast('Eliminata');
                    const updated = await DB.getSopralluogo(this.sopId);
                    this.renderRoomCard(container, updated, roomName);
                });
            });
        });

        // Edit observation
        container.querySelectorAll('.obs-btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.obsIndex);
                // For now, edit = delete + re-add via wizard
                UI.confirmAction('Modificare questa osservazione? (verra\' eliminata e potrai ricrearla)', async () => {
                    await Events.dispatch('delete_observation', this.sopId, { room_name: roomName, observation_index: idx });
                    App.navigate(`wizard/${this.sopId}/${encodeURIComponent(roomName)}`);
                });
            });
        });
    }
};
