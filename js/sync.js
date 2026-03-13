/* ============================================================
 * sync.js — Sincronizzazione con PC via HTTP (Cloudflare Tunnel)
 *
 * Il formato inviato e' IDENTICO a quello del bot.
 * Rooms inviate come metadata.json del bot (chiavi flat Foto_N_xxx).
 * Nessuna trasformazione.
 * ============================================================ */

'use strict';

const Sync = (() => {

    let _tunnelUrl = null;
    let _token = null;
    let _online = navigator.onLine;

    // ===== INIT =====
    function init() {
        // Leggi config dal Telegram WebApp o localStorage
        _tunnelUrl = localStorage.getItem('sync_tunnel_url') || null;
        _token = localStorage.getItem('sync_token') || null;

        window.addEventListener('online', () => { _online = true; _updateIndicator(); _autoSync(); });
        window.addEventListener('offline', () => { _online = false; _updateIndicator(); });
        _updateIndicator();
    }

    // ===== CONFIGURA TUNNEL =====
    function configure(tunnelUrl, token) {
        _tunnelUrl = tunnelUrl;
        _token = token;
        if (tunnelUrl) localStorage.setItem('sync_tunnel_url', tunnelUrl);
        if (token) localStorage.setItem('sync_token', token);
    }

    function isConfigured() {
        return !!_tunnelUrl;
    }

    // ===== SYNC SINGOLO SOPRALLUOGO =====
    async function syncSopralluogo(sop) {
        if (!_tunnelUrl) throw new Error('Tunnel non configurato');
        if (!_online) throw new Error('Nessuna connessione');

        _setIndicator('syncing');

        try {
            // 1. Invia dati sopralluogo (formato identico al bot)
            const payload = _buildPayload(sop);
            const resp = await fetch(`${_tunnelUrl}/api/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Auth-Token': _token || ''
                },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error(`Sync failed: ${resp.status}`);

            // 2. Invia foto non sincronizzate
            const photos = await DB.getPhotosBySopralluogo(sop.id);
            const unsynced = photos.filter(p => !p.synced);

            for (const photo of unsynced) {
                await _uploadPhoto(sop, photo);
                await DB.markPhotoSynced(photo.id);
            }

            // 3. Marca come sincronizzato
            await DB.markSynced(sop.id);
            _setIndicator('synced');
            return true;

        } catch (err) {
            console.error('Sync error:', err);
            _setIndicator('error');
            throw err;
        }
    }

    // ===== BUILD PAYLOAD =====
    // Il payload contiene i dati nel formato IDENTICO al bot.
    // rooms = { "Vano 1 - Cucina": { room_destination, room_finishes, Foto_1_..., ... } }
    // Nessuna trasformazione necessaria perche' IndexedDB salva gia' nel formato bot.
    function _buildPayload(sop) {
        return {
            id: sop.id,
            building_code: sop.building_code,
            building_address: sop.building_address,
            floor: sop.floor,
            stair: sop.stair,
            unit_type: sop.unit_type,
            manual_unit_type: sop.manual_unit_type,
            unit_address: sop.unit_address,
            unit_name: sop.unit_name,
            subalterno: sop.subalterno,
            owner: sop.owner,
            attendees_metro_tech: sop.attendees_metro_tech,
            attendees_metro_coll: sop.attendees_metro_coll,
            attendees_rm: sop.attendees_rm,
            rm_presente: sop.rm_presente,
            signer_metro_tech: sop.signer_metro_tech,
            signer_rm: sop.signer_rm,
            signer_metro_coll: sop.signer_metro_coll,
            signer_owner: sop.signer_owner,
            is_multi_floor: sop.is_multi_floor,
            unit_floors: sop.unit_floors,
            allontana_events: sop.allontana_events,
            pertinenze: sop.pertinenze,
            proprietario_assente: sop.proprietario_assente,
            proprietario_assente_note: sop.proprietario_assente_note,
            custom_cappello: sop.custom_cappello,
            custom_chiusura: sop.custom_chiusura,
            pert_order: sop.pert_order,
            pert_multi_mode: sop.pert_multi_mode,
            operator_note: sop.operator_note,
            global_notes: sop.global_notes,
            start_time: sop.start_time,
            operator_telegram_id: sop.operator_telegram_id,
            operator_telegram_name: sop.operator_telegram_name,
            room_status: sop.room_status,
            room_wall_count: sop.room_wall_count,
            prosp_rivestimento: sop.prosp_rivestimento,
            prosp_selected: sop.prosp_selected,
            building_floors: sop.building_floors,
            // ROOMS: formato IDENTICO a metadata.json del bot
            rooms: sop.rooms
        };
    }

    // ===== UPLOAD FOTO =====
    async function _uploadPhoto(sop, photo) {
        const formData = new FormData();
        formData.append('sopralluogo_id', sop.id);
        formData.append('building_code', sop.building_code);
        formData.append('room_name', photo.room_name);
        formData.append('type', photo.type);
        formData.append('filename', photo.filename);
        formData.append('photo', photo.blob, photo.filename);

        await fetch(`${_tunnelUrl}/api/sync/photo`, {
            method: 'POST',
            headers: { 'X-Auth-Token': _token || '' },
            body: formData
        });
    }

    // ===== AUTO SYNC (quando torna online) =====
    async function _autoSync() {
        if (!_tunnelUrl || !_online) return;
        try {
            const unsynced = await DB.getUnsyncedSopralluoghi();
            for (const sop of unsynced) {
                await syncSopralluogo(sop);
            }
        } catch (e) {
            console.warn('Auto-sync failed:', e);
        }
    }

    // ===== EXPORT JSON (fallback manuale) =====
    async function exportJSON(sop) {
        const photos = await DB.getPhotosBySopralluogo(sop.id);
        const payload = _buildPayload(sop);

        // Aggiungi foto come base64
        payload._photos = [];
        for (const p of photos) {
            const reader = new FileReader();
            const b64 = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(p.blob);
            });
            payload._photos.push({
                room_name: p.room_name,
                type: p.type,
                filename: p.filename,
                data: b64
            });
        }

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        if (typeof saveAs !== 'undefined') {
            saveAs(blob, `${sop.building_code}_export.json`);
        }
    }

    // ===== INDICATOR =====
    function _updateIndicator() {
        _setIndicator(_online ? 'synced' : 'offline');
    }

    function _setIndicator(state) {
        const dot = document.getElementById('sync-indicator');
        if (!dot) return;
        dot.className = 'sync-dot';
        if (state === 'offline') dot.classList.add('offline');
        else if (state === 'syncing') dot.classList.add('syncing');
        else if (state === 'error') dot.classList.add('error');
    }

    return {
        init, configure, isConfigured,
        syncSopralluogo, exportJSON
    };

})();
