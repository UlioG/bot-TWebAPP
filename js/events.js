/**
 * events.js - Event sourcing per Testimoniale WebApp
 * Ogni azione dell'operatore genera un evento salvato in IndexedDB
 * Allineato completo a bot.py: tutte le funzionalita' supportate
 */
const Events = {
    /**
     * Genera un UUID v4
     */
    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Genera un ID stabile per osservazione (usato come chiave marker_coords)
     */
    generateObsId() {
        return 'obs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    },

    /**
     * Ottieni user_id da Telegram WebApp (o fallback)
     */
    getUserId() {
        try {
            if (window.Telegram && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) {
                return Telegram.WebApp.initDataUnsafe.user.id;
            }
        } catch (e) { /* ignore */ }
        return 0;
    },

    /**
     * Ottieni user name da Telegram WebApp (o fallback)
     */
    getUserName() {
        try {
            if (window.Telegram && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) {
                const u = Telegram.WebApp.initDataUnsafe.user;
                return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
            }
        } catch (e) { /* ignore */ }
        return 'Operatore';
    },

    /**
     * Dispatch: crea evento, salvalo in IndexedDB, applica allo stato
     */
    async dispatch(type, sopralluogoId, payload) {
        const event = {
            sopralluogo_id: sopralluogoId,
            type: type,
            timestamp: Date.now(),
            user_id: this.getUserId(),
            payload: payload || {},
            synced: false
        };

        await DB.addEvent(event);
        await this.applyEvent(event);
        return event;
    },

    /**
     * Applica un singolo evento allo stato materializzato (sopralluogo)
     */
    async applyEvent(event) {
        let sop = await DB.getSopralluogo(event.sopralluogo_id);
        if (!sop && event.type !== 'create_sopralluogo') {
            console.warn('Sopralluogo non trovato per evento:', event.type);
            return;
        }

        const p = event.payload;

        switch (event.type) {

            // ========== CREAZIONE ==========

            case 'create_sopralluogo':
                sop = {
                    id: event.sopralluogo_id,
                    building_code: p.building_code || '',
                    building_address: p.building_address || '',
                    floor: p.floor || '',
                    building_floors: p.building_floors || [],
                    is_multi_floor: p.is_multi_floor != null ? p.is_multi_floor : null,
                    stair: p.stair || '',
                    unit_type: p.unit_type || '',
                    manual_unit_type: p.manual_unit_type || null,
                    subalterno: p.subalterno || '',
                    unit_internal: p.unit_internal || '',
                    unit_name: '',
                    owner: null,
                    attendees: { metro_tech: '', metro_coll: [], rm: '' },
                    signers: { metro_tech: '', rm: '', metro_coll: '' },
                    rm_presente: true,
                    phase: 1,
                    rooms: {},
                    global_notes: [],
                    planimetria_photos: [],
                    pertinenze: [],
                    active_pertinenza: null,
                    allontana_events: [],
                    custom_cappello: null,
                    custom_chiusura: null,
                    custom_unit_line: null,
                    start_time: null,
                    operator_telegram_id: this.getUserId(),
                    operator_telegram_name: this.getUserName(),
                    created_at: event.timestamp,
                    updated_at: event.timestamp,
                    synced: false
                };
                break;

            // ========== SETUP ==========

            case 'update_setup':
                Object.assign(sop, p);
                break;

            // ========== ANAGRAFICA ==========

            case 'set_anagrafica':
                if (p.owner !== undefined) sop.owner = p.owner;
                if (p.attendees !== undefined) sop.attendees = { ...sop.attendees, ...p.attendees };
                if (p.signers !== undefined) sop.signers = { ...sop.signers, ...p.signers };
                if (p.rm_presente !== undefined) sop.rm_presente = p.rm_presente;
                break;

            // ========== CAPPELLO / CHIUSURA ==========

            case 'set_cappello':
                sop.custom_cappello = p.text; // null = auto, string = custom
                if (!sop.start_time) sop.start_time = new Date(event.timestamp).toISOString();
                break;

            case 'set_chiusura':
                sop.custom_chiusura = p.text; // null = auto, string = custom
                break;

            // ========== PLANIMETRIA ==========

            case 'upload_planimetria':
                if (!sop.planimetria_photos) sop.planimetria_photos = [];
                sop.planimetria_photos.push(p.photo_id);
                sop.planimetria_photo_id = p.photo_id;
                break;

            case 'delete_planimetria':
                if (sop.planimetria_photos) {
                    sop.planimetria_photos = sop.planimetria_photos.filter(id => id !== p.photo_id);
                    sop.planimetria_photo_id = sop.planimetria_photos[sop.planimetria_photos.length - 1] || null;
                }
                break;

            case 'upload_floor_planimetria':
                if (!sop.floors_with_planimetria) sop.floors_with_planimetria = [];
                if (!sop.floors_with_planimetria.includes(p.floor)) {
                    sop.floors_with_planimetria.push(p.floor);
                }
                if (!sop.planimetria_photos) sop.planimetria_photos = [];
                sop.planimetria_photos.push(p.photo_id);
                break;

            // ========== FASE ==========

            case 'complete_phase':
                sop.phase = p.phase;
                break;

            // ========== VANI ==========

            case 'add_vano': {
                const fullName = p.full_name;
                if (!sop.rooms[fullName]) {
                    sop.rooms[fullName] = {
                        room_number: p.room_number,
                        room_name: p.room_name,
                        destination: p.destination || null,
                        status: 'accessible',
                        finishes: null,
                        has_cdp: null,
                        wall_count: null,
                        observations: [],
                        photos: [],
                        completed_surfaces: [],
                        manual_text: null,
                        stair_subsection: p.stair_subsection || null
                    };
                }
                break;
            }

            case 'rename_vano': {
                if (sop.rooms[p.old_name]) {
                    const roomData = sop.rooms[p.old_name];
                    roomData.room_number = p.new_room_number || roomData.room_number;
                    roomData.room_name = p.new_room_name || roomData.room_name;
                    delete sop.rooms[p.old_name];
                    sop.rooms[p.new_full_name] = roomData;
                }
                break;
            }

            case 'delete_vano':
                delete sop.rooms[p.room_name];
                break;

            case 'set_room_status':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].status = p.status;
                }
                break;

            case 'set_room_finishes':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].finishes = p.ceiling_type;
                }
                break;

            case 'set_room_cdp':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].has_cdp = p.has_cdp;
                }
                break;

            case 'set_room_wall_count':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].wall_count = p.wall_count;
                }
                break;

            case 'set_custom_walls':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].custom_walls = p.custom_walls || [];
                }
                break;

            case 'save_markers':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].marker_coords = p.markers || {};
                }
                break;

            // ========== OSSERVAZIONI ==========

            case 'add_observation': {
                if (sop.rooms[p.room_name]) {
                    // Se c'era testo custom del riepilogo, lo invalidiamo
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                    const obs = {
                        obs_id: p.obs_id || this.generateObsId(),
                        element: p.element,
                        wall: p.wall || null,
                        position: p.position || null,
                        positions_selected: p.positions_selected || [],
                        phenomenon: p.phenomenon,
                        specifics: p.specifics || [],
                        attributes: p.attributes || [],
                        notes: p.notes || '',
                        photo_id: p.photo_id || null,
                        has_counterwall: p.has_counterwall || false,
                        non_visibile: p.non_visibile || false,
                        parz_ingombra: p.parz_ingombra || false,
                        prosecutions: p.prosecutions || [],
                        // Elemento/Varco
                        infisso_type: p.infisso_type || null,
                        infisso_location: p.infisso_location || null,
                        infisso_wall: p.infisso_wall || null,
                        infisso_which: p.infisso_which || null,
                        infisso_confine: p.infisso_confine || null,
                        infisso_sub_pos: p.infisso_sub_pos || null,
                        // Balcone
                        balcone_sub: p.balcone_sub || null,
                        // Scala
                        stair_subsection: p.stair_subsection || null,
                        // Prospetti
                        prosp_floor: p.prosp_floor || null,
                        prosp_href: p.prosp_href || null,
                        // CDP
                        has_cdp: p.has_cdp || false,
                        // Timestamp
                        timestamp: event.timestamp
                    };
                    sop.rooms[p.room_name].observations.push(obs);
                    this._updateCompletedSurfaces(sop, p);
                }
                break;
            }

            case 'edit_observation':
                if (sop.rooms[p.room_name] && sop.rooms[p.room_name].observations[p.observation_index]) {
                    Object.assign(sop.rooms[p.room_name].observations[p.observation_index], p.changes);
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                }
                break;

            case 'delete_observation':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].observations.splice(p.observation_index, 1);
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                }
                break;

            // ========== STATUS SPECIALI (NDR, INGOMBRA, etc.) ==========

            case 'set_room_ndr':
                if (sop.rooms[p.room_name]) {
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                    sop.rooms[p.room_name].observations.push({
                        obs_id: this.generateObsId(),
                        element: p.element,
                        wall: p.wall || null,
                        balcone_sub: p.balcone_sub || null,
                        stair_subsection: p.stair_subsection || null,
                        position: null,
                        positions_selected: [],
                        phenomenon: 'NDR',
                        specifics: [],
                        attributes: [],
                        notes: '',
                        photo_id: null,
                        has_counterwall: p.has_counterwall || false,
                        has_cdp: p.has_cdp || false,
                        prosecutions: [],
                        timestamp: event.timestamp
                    });
                    this._updateCompletedSurfaces(sop, p);
                }
                break;

            case 'set_room_ingombra':
                if (sop.rooms[p.room_name]) {
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                    sop.rooms[p.room_name].observations.push({
                        obs_id: this.generateObsId(),
                        element: p.element,
                        wall: p.wall || null,
                        balcone_sub: p.balcone_sub || null,
                        stair_subsection: p.stair_subsection || null,
                        position: null,
                        positions_selected: [],
                        phenomenon: 'INGOMBRA',
                        specifics: [],
                        attributes: [],
                        notes: '',
                        photo_id: null,
                        has_counterwall: p.has_counterwall || false,
                        prosecutions: [],
                        timestamp: event.timestamp
                    });
                    this._updateCompletedSurfaces(sop, p);
                }
                break;

            case 'set_room_non_visibile':
                if (sop.rooms[p.room_name]) {
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                    sop.rooms[p.room_name].observations.push({
                        obs_id: this.generateObsId(),
                        element: p.element,
                        wall: p.wall || null,
                        balcone_sub: p.balcone_sub || null,
                        stair_subsection: p.stair_subsection || null,
                        position: null,
                        positions_selected: [],
                        phenomenon: 'NON VISIBILE',
                        specifics: [],
                        attributes: [],
                        notes: 'Non Visibile',
                        photo_id: null,
                        has_counterwall: p.has_counterwall || false,
                        non_visibile: true,
                        prosecutions: [],
                        timestamp: event.timestamp
                    });
                    this._updateCompletedSurfaces(sop, p);
                }
                break;

            case 'set_room_parz_ingombra':
                if (sop.rooms[p.room_name]) {
                    if (sop.rooms[p.room_name].custom_room_text) {
                        sop.rooms[p.room_name].custom_room_text = null;
                    }
                    sop.rooms[p.room_name].observations.push({
                        obs_id: this.generateObsId(),
                        element: p.element,
                        wall: p.wall || null,
                        balcone_sub: p.balcone_sub || null,
                        stair_subsection: p.stair_subsection || null,
                        position: null,
                        positions_selected: [],
                        phenomenon: 'PARZIALMENTE INGOMBRA',
                        specifics: [],
                        attributes: [],
                        notes: 'Parzialmente Ingombra',
                        photo_id: null,
                        has_counterwall: p.has_counterwall || false,
                        parz_ingombra: true,
                        prosecutions: [],
                        timestamp: event.timestamp
                    });
                    this._updateCompletedSurfaces(sop, p);
                }
                break;

            // ========== NDR REPLACEMENT (split/remove) ==========

            case 'remove_ndr': {
                // Rimuove NDR specifico di un elemento (quando difetto trovato)
                if (sop.rooms[p.room_name]) {
                    const room = sop.rooms[p.room_name];
                    room.observations = room.observations.filter(obs => {
                        if (obs.phenomenon !== 'NDR') return true;
                        if (p.wall && obs.wall === p.wall) return false;
                        if (p.element && !p.wall && obs.element === p.element && !obs.wall) return false;
                        return true;
                    });
                }
                break;
            }

            case 'split_pareti_ndr': {
                // Splitta "Pareti NDR" generico in NDR individuali per parete
                if (sop.rooms[p.room_name]) {
                    const room = sop.rooms[p.room_name];
                    // Rimuovi NDR generico Pareti
                    room.observations = room.observations.filter(obs =>
                        !(obs.phenomenon === 'NDR' && obs.element === 'Pareti' && !obs.wall)
                    );
                    // Aggiungi NDR individuali per ogni parete
                    const labels = CONFIG.generateWallLabels(p.wall_count);
                    for (const label of labels) {
                        room.observations.push({
                            obs_id: this.generateObsId(),
                            element: 'Pareti',
                            wall: label,
                            position: null,
                            positions_selected: [],
                            phenomenon: 'NDR',
                            specifics: [],
                            attributes: [],
                            notes: '',
                            photo_id: null,
                            has_counterwall: false,
                            has_cdp: false,
                            prosecutions: [],
                            timestamp: event.timestamp
                        });
                    }
                }
                break;
            }

            // ========== FOTO ==========

            case 'add_photo':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].photos.push({
                        photo_id: p.photo_id,
                        type: p.type,
                        filename: p.filename || null
                    });
                }
                break;

            case 'delete_photo':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].photos = sop.rooms[p.room_name].photos
                        .filter(ph => ph.photo_id !== p.photo_id);
                }
                break;

            case 'link_photo_to_observation':
                if (sop.rooms[p.room_name] && sop.rooms[p.room_name].observations[p.observation_index]) {
                    sop.rooms[p.room_name].observations[p.observation_index].photo_id = p.photo_id;
                }
                break;

            // ========== TESTO MANUALE ==========

            case 'set_manual_text':
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].manual_text = p.text;
                } else {
                    // Cerca nelle pertinenze
                    for (const pert of (sop.pertinenze || [])) {
                        if (pert.rooms && pert.rooms[p.room_name]) {
                            pert.rooms[p.room_name].manual_text = p.text;
                            break;
                        }
                    }
                }
                break;

            // ========== TESTO CUSTOM PER RIEPILOGO ==========

            case 'set_custom_room_text':
                // Testo custom per singolo vano (override del testo auto-generato nel verbale)
                if (sop.rooms[p.room_name]) {
                    sop.rooms[p.room_name].custom_room_text = p.text; // null = auto, string = custom
                } else {
                    // Cerca nelle pertinenze
                    for (const pert of (sop.pertinenze || [])) {
                        if (pert.rooms && pert.rooms[p.room_name]) {
                            pert.rooms[p.room_name].custom_room_text = p.text;
                            break;
                        }
                    }
                }
                break;

            case 'set_custom_unit_line':
                // Riga info unita' custom (Piano, Scala, Appartamento, Sub.)
                sop.custom_unit_line = p.text; // null = auto, string = custom
                break;

            // ========== NOTE GLOBALI ==========

            case 'add_global_note':
                if (!Array.isArray(sop.global_notes)) {
                    sop.global_notes = sop.global_notes ? [{ type: 'generic', text: sop.global_notes }] : [];
                }
                sop.global_notes.push({
                    type: p.note_type || 'generic',
                    room_name: p.room_name || null,
                    text: p.note_text
                });
                break;

            case 'delete_global_note':
                if (Array.isArray(sop.global_notes)) {
                    sop.global_notes.splice(p.note_index, 1);
                }
                break;

            // ========== FIRME ==========

            case 'set_signers':
                sop.signers = { ...sop.signers, ...p };
                break;

            case 'set_signer_enabled':
                sop.signer_enabled = { ...(sop.signer_enabled || {}), ...p };
                break;

            case 'set_operator_note':
                sop.operator_note = p.text || '';
                break;

            case 'set_pert_order':
                sop.pert_order = p.order;
                break;

            // ========== ALLONTANAMENTO ==========

            case 'allontana': {
                if (!sop.allontana_events) sop.allontana_events = [];
                sop.allontana_events.push({
                    type: 'allontana',
                    text: p.text || 'Si allontana',
                    room_name: p.room_name || null,
                    time: new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: event.timestamp
                });
                break;
            }

            case 'rientra': {
                if (!sop.allontana_events) sop.allontana_events = [];
                sop.allontana_events.push({
                    type: 'rientra',
                    text: p.text || 'Rientra',
                    room_name: p.room_name || null,
                    time: new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: event.timestamp
                });
                break;
            }

            // ========== INTERRUZIONE SOPRALLUOGO (solo PC) ==========

            case 'interruzione': {
                if (!sop.allontana_events) sop.allontana_events = [];
                sop.allontana_events.push({
                    type: 'interruzione',
                    text: p.text || 'Interruzione sopralluogo',
                    time: new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    date: new Date(event.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    timestamp: event.timestamp
                });
                sop.interrupted = true;
                break;
            }

            case 'ripresa': {
                if (!sop.allontana_events) sop.allontana_events = [];
                sop.allontana_events.push({
                    type: 'ripresa',
                    text: p.text || 'Ripresa sopralluogo',
                    time: new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    date: new Date(event.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    timestamp: event.timestamp
                });
                sop.interrupted = false;
                break;
            }

            // ========== PERTINENZE ==========

            case 'add_pertinenza': {
                if (!sop.pertinenze) sop.pertinenze = [];
                sop.pertinenze.push({
                    type: p.type,
                    sub: p.sub || '',
                    numero: p.numero || '',
                    indirizzo: p.indirizzo || '',
                    piano: p.piano || '',
                    floor: p.floor || sop.floor,
                    rooms: {},
                    planimetria_photos: [],
                    completed: false,
                    stash: null
                });
                break;
            }

            case 'update_pertinenza': {
                if (sop.pertinenze && sop.pertinenze[p.index]) {
                    Object.assign(sop.pertinenze[p.index], p.changes);
                }
                break;
            }

            case 'delete_pertinenza': {
                if (sop.pertinenze) {
                    sop.pertinenze.splice(p.index, 1);
                }
                break;
            }

            case 'enter_pertinenza': {
                // Stash current rooms state, switch to pertinenza
                sop.active_pertinenza = p.index;
                break;
            }

            case 'exit_pertinenza': {
                sop.active_pertinenza = null;
                break;
            }

            case 'add_vano_pertinenza': {
                if (sop.pertinenze && sop.pertinenze[p.pert_index]) {
                    const pert = sop.pertinenze[p.pert_index];
                    if (!pert.rooms) pert.rooms = {};
                    const fullName = p.full_name;
                    if (!pert.rooms[fullName]) {
                        pert.rooms[fullName] = {
                            room_number: p.room_number,
                            room_name: p.room_name,
                            destination: p.destination || null,
                            status: 'accessible',
                            finishes: null,
                            has_cdp: null,
                            wall_count: null,
                            observations: [],
                            photos: [],
                            completed_surfaces: [],
                            manual_text: null
                        };
                    }
                }
                break;
            }

            // Pertinenza room operations reuse same patterns
            case 'set_pert_room_status':
                if (sop.pertinenze && sop.pertinenze[p.pert_index]) {
                    const rooms = sop.pertinenze[p.pert_index].rooms;
                    if (rooms && rooms[p.room_name]) {
                        rooms[p.room_name].status = p.status;
                    }
                }
                break;

            case 'add_pert_observation':
                if (sop.pertinenze && sop.pertinenze[p.pert_index]) {
                    const rooms = sop.pertinenze[p.pert_index].rooms;
                    if (rooms && rooms[p.room_name]) {
                        const obs = { ...p.observation, obs_id: p.observation.obs_id || this.generateObsId(), timestamp: event.timestamp };
                        rooms[p.room_name].observations.push(obs);
                    }
                }
                break;

            // ========== RM PRESENTE ==========

            case 'set_rm_presente':
                sop.rm_presente = p.presente;
                break;

            // ========== REPORT ==========

            case 'request_report':
                sop.report_requested = true;
                break;

            case 'complete_sopralluogo':
                sop.completed = true;
                sop.completed_at = event.timestamp;
                break;

            case 'reopen_sopralluogo':
                sop.completed = false;
                sop.phase = 2;
                break;
        }

        sop.updated_at = event.timestamp;
        sop.synced = false;
        await DB.saveSopralluogo(sop);
    },

    /**
     * Helper: aggiorna superfici completate per un vano
     */
    _updateCompletedSurfaces(sop, p) {
        if (!sop.rooms[p.room_name]) return;
        const surfaces = sop.rooms[p.room_name].completed_surfaces || [];
        let surface = null;

        if (p.element === 'Pareti' && p.wall) {
            surface = p.wall;
        } else if (['Soffitto', 'Pavimento', 'Sotto balcone superiore'].includes(p.element)) {
            surface = p.element;
        }

        if (surface && !surfaces.includes(surface)) {
            surfaces.push(surface);
            sop.rooms[p.room_name].completed_surfaces = surfaces;
        }
    },

    /**
     * Ricostruisci stato da eventi (replay)
     */
    async replayEvents(sopralluogoId) {
        const events = await DB.getEventsBySopralluogo(sopralluogoId);
        await DB.delete('sopralluoghi', sopralluogoId);
        for (const event of events) {
            await this.applyEvent(event);
        }
        return DB.getSopralluogo(sopralluogoId);
    },

    // ========== HELPER: crea un nuovo sopralluogo ==========

    async createSopralluogo(data) {
        const id = this.uuid();
        await this.dispatch('create_sopralluogo', id, data);
        return id;
    },

    // ========== HELPER: ottieni rooms attive (appartamento o pertinenza) ==========

    getActiveRooms(sop) {
        if (sop.active_pertinenza != null && sop.pertinenze && sop.pertinenze[sop.active_pertinenza]) {
            return sop.pertinenze[sop.active_pertinenza].rooms || {};
        }
        return sop.rooms || {};
    },

    /**
     * Controlla se siamo in modalita' pertinenza
     */
    isInPertinenza(sop) {
        return sop.active_pertinenza != null;
    }
};
