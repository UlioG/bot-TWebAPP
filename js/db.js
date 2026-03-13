/* ============================================================
 * db.js — IndexedDB storage con formato dati IDENTICO al bot
 *
 * Struttura sopralluogo:
 *   - Dati sessione (come UserSession in config.py)
 *   - rooms: { "Vano 1 - Cucina": { metadata in formato bot } }
 *   - Ogni room ha chiavi flat: room_destination, room_finishes,
 *     Foto_1_..., Foto_2_..., marker_coords, disclaimer_type, ecc.
 *   - Le osservazioni usano chiavi Foto_N_xxx IDENTICHE a metadata.json
 *
 * Foto salvate separatamente nel photos store (blob).
 * ============================================================ */

'use strict';

const DB = (() => {

    const DB_NAME = 'testimoniale_db';
    const DB_VERSION = 1;
    let _db = null;

    // ===== OPEN =====
    function open() {
        return new Promise((resolve, reject) => {
            if (_db) { resolve(_db); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                // Sopralluoghi: stato materializzato
                if (!db.objectStoreNames.contains('sopralluoghi')) {
                    const s = db.createObjectStore('sopralluoghi', { keyPath: 'id' });
                    s.createIndex('building_code', 'building_code', { unique: false });
                    s.createIndex('synced', 'synced', { unique: false });
                    s.createIndex('created_at', 'created_at', { unique: false });
                }
                // Eventi: log immutabile (event sourcing)
                if (!db.objectStoreNames.contains('events')) {
                    const ev = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
                    ev.createIndex('sopralluogo_id', 'sopralluogo_id', { unique: false });
                    ev.createIndex('type', 'type', { unique: false });
                    ev.createIndex('timestamp', 'timestamp', { unique: false });
                }
                // Foto: blob separati
                if (!db.objectStoreNames.contains('photos')) {
                    const ph = db.createObjectStore('photos', { keyPath: 'id' });
                    ph.createIndex('sopralluogo_id', 'sopralluogo_id', { unique: false });
                    ph.createIndex('room_name', 'room_name', { unique: false });
                    ph.createIndex('type', 'type', { unique: false });
                    ph.createIndex('synced', 'synced', { unique: false });
                }
            };
            req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // ===== GENERIC HELPERS =====
    function _tx(store, mode) {
        return _db.transaction(store, mode).objectStore(store);
    }

    function _req(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // ===== SOPRALLUOGO: CREA NUOVO =====
    // Struttura IDENTICA a UserSession.__init__ in config.py
    function createSopralluogo(buildingCode) {
        const id = _uuid();
        const now = Date.now();
        const sop = {
            id,
            // === Dati identificativi (come bot UserSession) ===
            building_code: buildingCode,
            building_address: '',
            floor: null,
            stair: null,
            unit_type: null,
            manual_unit_type: false,
            unit_address: null,
            unit_name: null,
            subalterno: null,
            // === Anagrafica ===
            owner: null,
            attendees_metro_tech: null,
            attendees_metro_coll: null,
            attendees_rm: null,
            rm_presente: true,
            // === Firmatari ===
            signer_metro_tech: null,
            signer_rm: null,
            signer_metro_coll: null,
            signer_owner: null,
            // === Fasi ===
            phase: Config.PHASES.ANAGRAFICA,
            phase2_subphase: 1,
            // === Vani ===
            // Formato: { "Vano 1 - Cucina": { ...metadata bot format... } }
            rooms: {},
            room_status: {},
            rooms_analyzed: [],        // set nel bot, array qui
            completed_surfaces: [],    // set nel bot, array qui
            // === Multi-piano ===
            is_multi_floor: false,
            unit_floors: [],
            floors_with_planimetria: [],
            current_operating_floor: null,
            // === Proprietario assente ===
            proprietario_assente: false,
            proprietario_assente_note: null,
            // === Scale ===
            stair_names: [],
            stair_is_multi: false,
            building_floors: null,
            stair_ramp_count: null,
            // === Prospetti ===
            prosp_rivestimento: null,
            prosp_selected: [],
            // === Pertinenze ===
            pertinenze: [],
            active_pertinenza: null,
            pert_order: null,
            pert_multi_mode: false,
            // === Interruzioni ===
            allontana_events: [],
            // === Note ===
            operator_note: '',
            global_notes: [],
            // === Planimetrie ===
            planimetria_photos: [],
            // === Cappello / Chiusura ===
            custom_cappello: null,
            custom_chiusura: null,
            // === Operatore ===
            operator_telegram_id: null,
            operator_telegram_name: null,
            start_time: null,
            // === Wall count per vano (NDR split) ===
            room_wall_count: {},
            // === Stato ===
            created_at: now,
            updated_at: now,
            synced: false,
            last_synced_at: null
        };
        return _req(_tx('sopralluoghi', 'readwrite').put(sop)).then(() => sop);
    }

    // ===== SOPRALLUOGO: CRUD =====
    function getSopralluogo(id) {
        return _req(_tx('sopralluoghi', 'readonly').get(id));
    }

    function getAllSopralluoghi() {
        return _req(_tx('sopralluoghi', 'readonly').getAll())
            .then(list => list.sort((a, b) => b.created_at - a.created_at));
    }

    function saveSopralluogo(sop) {
        sop.updated_at = Date.now();
        sop.synced = false;
        return _req(_tx('sopralluoghi', 'readwrite').put(sop));
    }

    function deleteSopralluogo(id) {
        // Cascade: elimina eventi e foto associate
        return Promise.all([
            _deleteByIndex('events', 'sopralluogo_id', id),
            _deleteByIndex('photos', 'sopralluogo_id', id),
            _req(_tx('sopralluoghi', 'readwrite').delete(id))
        ]);
    }

    // ===== ROOM: CREA/AGGIORNA =====
    // Formato room IDENTICO a metadata.json del bot
    function createRoom(sop, roomFullName, destination) {
        sop.rooms[roomFullName] = {
            room_destination: destination,
            room_finishes: null,
            has_cdp: null,
            disclaimer_type: null,
            marker_coords: null
            // Le osservazioni verranno aggiunte come Foto_N_xxx
        };
        sop.room_status[roomFullName] = Config.ROOM_STATUSES.ACCESSIBLE;
        return saveSopralluogo(sop);
    }

    // ===== OSSERVAZIONE: AGGIUNGI =====
    // Salva nel formato IDENTICO a _save_observation_data_impl in bot.py
    // Chiave: "Foto_N_dettaglio.jpg" o "Foto_N_NOFOTO"
    function addObservation(sop, roomFullName, obsData, photoFilename) {
        const room = sop.rooms[roomFullName];
        if (!room) return Promise.reject(new Error('Room not found: ' + roomFullName));

        // Calcola prossimo indice (conta chiavi Foto_*)
        const existingPhotos = Object.keys(room).filter(k => k.startsWith('Foto_'));
        const nextIdx = existingPhotos.length + 1;

        // Filename: come il bot
        const filename = photoFilename || `Foto_${nextIdx}_NOFOTO`;

        // Dati osservazione: struttura IDENTICA a obs_data in bot.py
        room[filename] = {
            element: obsData.element || '',
            position: obsData.position || '',
            phenomenon: obsData.phenomenon || '',
            specifics: obsData.specifics || [],
            attributes: obsData.attributes || [],
            notes: obsData.notes || '',
            timestamp_detection: _nowTimestamp(),
            infisso_type: obsData.infisso_type || '',
            infisso_wall: obsData.infisso_wall || '',
            infisso_loc: obsData.infisso_loc || '',
            infisso_confine: obsData.infisso_confine || '',
            has_counterwall: obsData.has_counterwall || false,
            has_cdp: obsData.has_cdp || false,
            non_visibile: obsData.non_visibile || false,
            balcone_sub: obsData.balcone_sub || '',
            prosecutions: obsData.prosecutions || [],
            stair_subsection: obsData.stair_subsection || '',
            prosp_floor: obsData.prosp_floor || '',
            prosp_href: obsData.prosp_href || ''
        };

        return saveSopralluogo(sop).then(() => filename);
    }

    // ===== OSSERVAZIONE: RIMUOVI =====
    function removeObservation(sop, roomFullName, fotoKey) {
        const room = sop.rooms[roomFullName];
        if (!room || !room[fotoKey]) return Promise.resolve();
        delete room[fotoKey];
        // Rinumera le Foto_ per mantenere sequenza continua
        _renumberPhotos(room);
        return saveSopralluogo(sop);
    }

    // ===== HELPER: Rinumera foto dopo eliminazione =====
    function _renumberPhotos(room) {
        const fotoKeys = Object.keys(room)
            .filter(k => k.startsWith('Foto_'))
            .sort((a, b) => {
                const na = parseInt(a.split('_')[1]);
                const nb = parseInt(b.split('_')[1]);
                return na - nb;
            });
        const saved = fotoKeys.map(k => ({ key: k, data: room[k] }));
        fotoKeys.forEach(k => delete room[k]);
        saved.forEach((item, i) => {
            const oldNum = item.key.split('_')[1];
            const suffix = item.key.substring(item.key.indexOf('_', 5) + 1); // dopo Foto_N_
            const newKey = `Foto_${i + 1}_${suffix}`;
            room[newKey] = item.data;
        });
    }

    // ===== HELPER: Leggi osservazioni da room (formato lista per formatters) =====
    // Converte da formato flat Foto_N_xxx a lista oggetti (per compatibilita con formatters.js)
    function getRoomObservations(room) {
        const fotoKeys = Object.keys(room)
            .filter(k => k.startsWith('Foto_') && typeof room[k] === 'object')
            .sort((a, b) => {
                const na = parseInt(a.split('_')[1]);
                const nb = parseInt(b.split('_')[1]);
                return na - nb;
            });
        return fotoKeys.map((k, idx) => {
            const obs = room[k];
            return {
                ...obs,
                _foto_key: k,
                _foto_index: idx + 1
            };
        });
    }

    // ===== ROOM FINISHES: Salva (come bot) =====
    function setRoomFinishes(sop, roomFullName, finishes, hasCdp) {
        const room = sop.rooms[roomFullName];
        if (!room) return Promise.resolve();
        room.room_finishes = finishes;
        if (hasCdp !== undefined) room.has_cdp = hasCdp;
        return saveSopralluogo(sop);
    }

    // ===== ROOM DISCLAIMER: Salva (come bot save_room_disclaimer) =====
    function setRoomDisclaimer(sop, roomFullName, disclaimerType) {
        const room = sop.rooms[roomFullName];
        if (!room) return Promise.resolve();
        room.disclaimer_type = disclaimerType;
        sop.room_status[roomFullName] = disclaimerType;
        return saveSopralluogo(sop);
    }

    // ===== FOTO: CRUD =====
    function addPhoto(photoData) {
        // photoData: { id, sopralluogo_id, room_name, type, filename, blob, thumbnail, ... }
        photoData.synced = false;
        photoData.created_at = Date.now();
        return _req(_tx('photos', 'readwrite').put(photoData));
    }

    function getPhoto(id) {
        return _req(_tx('photos', 'readonly').get(id));
    }

    function getPhotosByRoom(sopId, roomName) {
        return _req(_tx('photos', 'readonly').index('sopralluogo_id').getAll(sopId))
            .then(photos => photos.filter(p => p.room_name === roomName));
    }

    function getPhotosBySopralluogo(sopId) {
        return _req(_tx('photos', 'readonly').index('sopralluogo_id').getAll(sopId));
    }

    function deletePhoto(id) {
        return _req(_tx('photos', 'readwrite').delete(id));
    }

    // ===== EVENTI: Log immutabile =====
    function addEvent(event) {
        event.timestamp = Date.now();
        return _req(_tx('events', 'readwrite').add(event));
    }

    function getEventsBySopralluogo(sopId) {
        return _req(_tx('events', 'readonly').index('sopralluogo_id').getAll(sopId));
    }

    // ===== SYNC HELPERS =====
    function getUnsyncedSopralluoghi() {
        return _req(_tx('sopralluoghi', 'readonly').index('synced').getAll(false));
    }

    function getUnsyncedPhotos() {
        return _req(_tx('photos', 'readonly').index('synced').getAll(false));
    }

    function markSynced(sopId) {
        return getSopralluogo(sopId).then(sop => {
            if (!sop) return;
            sop.synced = true;
            sop.last_synced_at = Date.now();
            return _req(_tx('sopralluoghi', 'readwrite').put(sop));
        });
    }

    function markPhotoSynced(photoId) {
        return getPhoto(photoId).then(photo => {
            if (!photo) return;
            photo.synced = true;
            return _req(_tx('photos', 'readwrite').put(photo));
        });
    }

    // ===== UTILITY =====
    function _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function _nowTimestamp() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function _deleteByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = _db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const idx = store.index(indexName);
            const req = idx.openCursor(IDBKeyRange.only(value));
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    return {
        open, uuid: _uuid,
        // Sopralluogo
        createSopralluogo, getSopralluogo, getAllSopralluoghi,
        saveSopralluogo, deleteSopralluogo,
        // Room
        createRoom, addObservation, removeObservation,
        getRoomObservations, setRoomFinishes, setRoomDisclaimer,
        // Photo
        addPhoto, getPhoto, getPhotosByRoom, getPhotosBySopralluogo, deletePhoto,
        // Events
        addEvent, getEventsBySopralluogo,
        // Sync
        getUnsyncedSopralluoghi, getUnsyncedPhotos, markSynced, markPhotoSynced,
        // Helpers
        _renumberPhotos
    };

})();
