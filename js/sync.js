/**
 * sync.js - Sincronizzazione dati con bot Telegram + export/import JSON
 *
 * D1: Sync via API HTTP diretta (Cloudflare Tunnel).
 *     webapp -> fetch() -> tunnel -> bot PC -> archivio disco
 *
 * B1 FIX: sendData() chiude la webapp dopo la prima chiamata.
 * Soluzione: per payload > 4096 byte, usa fetch() verso relay bot API
 * invece di Telegram.WebApp.sendData().
 *
 * Header indicatore: Online / Offline (stato connessione server)
 * Pulsante sync: sempre visibile nell'header, abilitato quando c'e' un sopralluogo attivo
 */
const Sync = {
    isOnline() {
        return navigator.onLine;
    },

    /**
     * Aggiorna indicatore connessione nell'header — 2 stati: online / offline
     * @param {string} state - 'online' | 'offline'
     */
    updateIndicator(state) {
        const container = document.getElementById('sync-indicator');
        if (!container) return;

        const dot = container.querySelector('.sync-dot');
        const label = container.querySelector('.sync-label');
        if (!dot || !label) return;

        const status = state || (this.isOnline() ? 'online' : 'offline');

        dot.classList.remove('online', 'offline');
        dot.classList.add(status);

        const labels = { online: 'Online', offline: 'Offline' };
        label.textContent = labels[status] || status;
        container.title = labels[status] || status;
    },

    /**
     * Aggiorna stato visivo del pulsante sync nell'header.
     * @param {string} state - 'idle' | 'syncing' | 'done' | 'error'
     */
    _updateSyncButton(state) {
        const btn = document.getElementById('btn-sync');
        if (!btn) return;

        btn.classList.remove('syncing');

        switch (state) {
            case 'syncing':
                btn.textContent = '⏳';
                btn.classList.add('syncing');
                break;
            case 'done':
                btn.textContent = '✓';
                setTimeout(() => { btn.textContent = '⬆'; }, 2000);
                break;
            case 'error':
                btn.textContent = '✕';
                setTimeout(() => { btn.textContent = '⬆'; }, 2000);
                break;
            default:
                btn.textContent = '⬆';
        }
    },

    /**
     * Abilita/disabilita il pulsante sync in base al contesto.
     * Chiamato dal router quando cambia vista.
     */
    updateSyncButtonEnabled() {
        const btn = document.getElementById('btn-sync');
        if (!btn) return;

        const sopId = (typeof App !== 'undefined') ? App.getSopralluogoId() : null;
        btn.disabled = !sopId;
    },

    /**
     * Sincronizza il sopralluogo attualmente aperto (dall'URL).
     * Collegato al pulsante sync nell'header.
     */
    async syncCurrentSopralluogo() {
        const sopId = (typeof App !== 'undefined') ? App.getSopralluogoId() : null;
        if (!sopId) {
            UI.toast('Apri un sopralluogo per sincronizzare');
            return false;
        }

        if (!this._isAPIAvailable()) {
            UI.toast('Server non raggiungibile');
            return false;
        }

        return await this.syncViaAPI(sopId);
    },

    _refreshTimer: null,

    async init() {
        window.addEventListener('online', () => {
            this.updateIndicator();
            this.resolveTunnelUrl(true);
        });
        window.addEventListener('offline', () => this.updateIndicator('offline'));

        // Risolvi URL tunnel dal Worker (o cache localStorage)
        await this.resolveTunnelUrl();

        // Refresh URL tunnel ogni 5 minuti per intercettare riavvii PC
        this._refreshTimer = setInterval(() => {
            this.resolveTunnelUrl(true);
        }, 5 * 60 * 1000);

        this.updateIndicator();
    },

    // ========== TUNNEL URL RESOLUTION ==========

    /**
     * Risolve URL tunnel corrente dal Cloudflare Worker.
     * Usa localStorage come cache per partenza istantanea.
     * @param {boolean} silent - se true, non mostra toast su errore
     */
    async resolveTunnelUrl(silent = false) {
        // 1. Cache localStorage per disponibilità immediata
        const cached = localStorage.getItem('testimoniale_tunnel_url');
        if (cached && !CONFIG.API_URL) {
            CONFIG.API_URL = cached;
            console.log('[Tunnel] URL da cache:', cached);
        }

        // 2. Fetch URL aggiornato dal Worker
        if (!CONFIG.WORKER_URL) return;

        try {
            const resp = await fetch(
                CONFIG.WORKER_URL.replace(/\/+$/, '') + '/current',
                { signal: AbortSignal.timeout(5000) }
            );

            if (!resp.ok) {
                if (resp.status === 404) {
                    console.warn('[Tunnel] Nessun tunnel registrato nel Worker');
                    if (!silent) this.updateIndicator('offline');
                    return;
                }
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            const newUrl = data.tunnel_url;

            if (newUrl && newUrl !== CONFIG.API_URL) {
                const oldUrl = CONFIG.API_URL;
                CONFIG.API_URL = newUrl;
                localStorage.setItem('testimoniale_tunnel_url', newUrl);
                console.log('[Tunnel] URL aggiornato:', newUrl,
                    oldUrl ? `(era: ${oldUrl})` : '(primo caricamento)');
            }

            if (newUrl) {
                await this._healthCheck(silent);
            }
        } catch (e) {
            console.warn('[Tunnel] Errore risoluzione URL:', e.message);
        }
    },

    /**
     * Health check rapido per verificare che il tunnel sia raggiungibile.
     */
    async _healthCheck(silent = false) {
        if (!CONFIG.API_URL) return false;

        try {
            const resp = await fetch(
                CONFIG.API_URL.replace(/\/+$/, '') + '/api/health',
                { signal: AbortSignal.timeout(5000) }
            );

            if (resp.ok) {
                const data = await resp.json();
                if (data.status === 'ok') {
                    this.updateIndicator('online');
                    return true;
                }
            }
            this.updateIndicator('offline');
            return false;
        } catch (e) {
            console.warn('[Tunnel] Health check fallito:', e.message);
            if (!silent) this.updateIndicator('offline');
            return false;
        }
    },

    /**
     * Wrapper fetch con auto-recovery: se la richiesta fallisce per errore
     * di rete, risolve il nuovo URL dal Worker e ritenta automaticamente.
     * @param {string} path - percorso API (es. '/api/sync')
     * @param {RequestInit} options - opzioni fetch
     * @returns {Promise<Response>}
     */
    async _apiFetch(path, options = {}) {
        const makeUrl = () => (CONFIG.API_URL || '').replace(/\/+$/, '') + path;

        try {
            const resp = await fetch(makeUrl(), options);
            return resp;
        } catch (firstError) {
            // Errore di rete: il tunnel potrebbe essere cambiato
            console.warn('[Tunnel] Richiesta fallita, risolvo nuovo URL...', firstError.message);

            const oldUrl = CONFIG.API_URL;
            await this.resolveTunnelUrl(true);

            // Se URL cambiato, riprova
            if (CONFIG.API_URL && CONFIG.API_URL !== oldUrl) {
                console.log('[Tunnel] Nuovo URL trovato, retry...');
                return fetch(makeUrl(), options);
            }

            // URL invariato o ancora vuoto: rilancia errore originale
            throw firstError;
        }
    },

    // ========== AUTENTICAZIONE TELEGRAM ==========

    /**
     * Recupera initData da Telegram WebApp (presente automaticamente
     * quando la webapp è aperta da Telegram). Contiene firma crittografica
     * che il server verifica con il bot token.
     */
    _getTelegramInitData() {
        if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) {
            return Telegram.WebApp.initData;
        }
        return null;
    },

    /**
     * Costruisce gli header di autenticazione per le chiamate API.
     * Priorità: Telegram initData (produzione) > Bearer token (test).
     */
    _getAuthHeaders() {
        const initData = this._getTelegramInitData();
        if (initData) {
            return { 'X-Telegram-Init-Data': initData };
        }
        // Fallback per test fuori da Telegram
        if (CONFIG.API_TOKEN) {
            return { 'Authorization': `Bearer ${CONFIG.API_TOKEN}` };
        }
        return {};
    },

    /**
     * Verifica se l'API è disponibile (URL configurato + credenziali presenti).
     */
    _isAPIAvailable() {
        return !!(CONFIG.API_URL && (this._getTelegramInitData() || CONFIG.API_TOKEN));
    },

    // ========== INVIO DATI ==========

    /**
     * Invia dati sopralluogo al bot.
     * Strategia (in ordine di priorita):
     * 1. API HTTP diretta via Cloudflare Tunnel (D1)
     * 2. Relay bot via Telegram API fetch (B1 fix)
     * 3. sendData() se payload <= 4096 e siamo in Telegram
     */
    async sendToBot(sopralluogoId) {
        const sop = await DB.getSopralluogo(sopralluogoId);
        if (!sop) {
            UI.toast('Sopralluogo non trovato');
            return false;
        }

        // D1: Prova sync via API HTTP (tunnel) per primo
        if (this._isAPIAvailable()) {
            const apiResult = await this.syncViaAPI(sopralluogoId);
            if (apiResult) return true;
            // Se fallisce, prova metodi alternativi
            console.warn('Sync API fallita, provo metodi alternativi...');
        }

        // Fallback: sendData / relay
        const payload = {
            action: 'sync_sopralluogo',
            sopralluogo: this._buildPayload(sop)
        };

        const json = JSON.stringify(payload);

        // Se entra nel limite sendData e siamo in Telegram, usa sendData
        if (json.length <= 4096 && window.Telegram && Telegram.WebApp) {
            try {
                this._updateSyncButton('syncing');
                Telegram.WebApp.sendData(json);
                sop.synced = true;
                await DB.saveSopralluogo(sop);
                this._updateSyncButton('done');
                UI.toast('Dati inviati al bot');
                return true;
            } catch (e) {
                console.error('Errore sendData:', e);
                this._updateSyncButton('error');
                UI.toast('Errore invio dati');
                return false;
            }
        }

        // Payload > 4096 oppure non siamo in Telegram: usa relay bot
        return this._sendViaRelay(sop, payload);
    },

    // ========== D1: SYNC VIA API HTTP (TUNNEL) ==========

    /**
     * Sync sopralluogo tramite API HTTP diretta (Cloudflare Tunnel).
     * Fase 1: invia metadata JSON → POST /api/sync
     * Fase 2: carica foto una per una → POST /api/sync/photo
     */
    async syncViaAPI(sopralluogoId) {
        const sop = await DB.getSopralluogo(sopralluogoId);
        if (!sop) {
            UI.toast('Sopralluogo non trovato');
            return false;
        }

        if (!this._isAPIAvailable()) {
            console.warn('API non configurata.');
            return false;
        }

        this._updateSyncButton('syncing');

        try {
            // Fase 1: invia metadata (sopralluogo + rooms + obs)
            const payload = await this._buildPayloadWithPhotos(sop);

            const resp = await this._apiFetch('/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this._getAuthHeaders()
                },
                body: JSON.stringify({ sopralluogo: payload })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Errore sconosciuto' }));
                // Fase E: gestione HTTP 409 (unita' gia' di altro operatore, non-PC)
                if (resp.status === 409) {
                    const masterOp = err.master_operator || 'altro operatore';
                    UI.toast(`Unita\' gia\' assegnata a ${masterOp}. Multi-operatore solo per Parti Comuni.`, 5000);
                    this._updateSyncButton('error');
                    return false;
                }
                throw new Error(err.error || `HTTP ${resp.status}`);
            }

            const result = await resp.json();
            console.log('Sync metadata OK:', result);

            // Fase E: salva info ruolo multi-operatore sul sopralluogo.
            // SEMPRE sovrascrivere per evitare dati stale da sync precedenti.
            sop.sync_role = result.role || null;
            sop.master_operator_name = result.master_operator_name || '';
            sop.master_rooms = result.master_rooms || [];
            sop.secondary_rooms = result.secondary_rooms || [];
            sop.rooms_added = result.rooms_added || 0;
            sop.rooms_updated = result.rooms_updated || 0;
            sop.rooms_skipped = result.rooms_skipped || 0;
            sop.skipped_room_names = result.skipped_room_names || [];
            sop.total_rooms_on_disk = result.total_rooms_on_disk || 0;

            // Fase 2: upload foto una per una
            const photos = await DB.getPhotosBySopralluogo(sopralluogoId);
            let uploaded = 0;
            let failed = 0;
            let skippedNoBlob = 0;
            let skippedRoom = 0;
            let lastError = '';

            // Diagnostica: conteggio blob con dati vs vuoti
            let blobOk = 0, blobEmpty = 0, blobType = '';
            for (const p of photos) {
                if (!p.blob) continue;
                const sz = p.blob.size || p.blob.byteLength || 0;
                if (sz > 0) blobOk++;
                else blobEmpty++;
                if (!blobType && p.blob) blobType = typeof p.blob + '/' + (p.blob.constructor ? p.blob.constructor.name : '?');
            }
            console.log(`[PHOTO SYNC] Totale: ${photos.length}, blobOk=${blobOk}, blobEmpty=${blobEmpty}, blobType=${blobType}, role=${result.role}`);

            for (const photo of photos) {
                if (!photo.blob) { skippedNoBlob++; continue; }

                // Check blob size — iOS WebView puo' evitare i blob da IndexedDB
                const blobSize = photo.blob.size || photo.blob.byteLength || 0;
                if (blobSize === 0) {
                    // Blob vuoto: prova a usare thumbnail come fallback
                    if (photo.thumbnail && (photo.thumbnail.size || photo.thumbnail.byteLength || 0) > 0) {
                        console.warn(`[PHOTO SYNC] Blob vuoto per ${photo.filename}, uso thumbnail come fallback`);
                        photo.blob = photo.thumbnail;
                    } else {
                        console.error(`[PHOTO SYNC] Blob vuoto per ${photo.filename}, nessun fallback`);
                        failed++;
                        lastError = `Blob vuoto (0 bytes) - ${photo.filename}`;
                        continue;
                    }
                }

                // Fase E: skip foto per vani scartati (secondario, master vince)
                if (result.role === 'secondary' && result.skipped_room_names &&
                    result.skipped_room_names.includes(photo.room_name)) {
                    skippedRoom++;
                    continue;
                }

                try {
                    const ok = await this._uploadPhotoToAPI(sop, photo);
                    if (ok) {
                        uploaded++;
                        photo.synced = true;
                        await DB.put('photos', photo);
                    } else {
                        failed++;
                        lastError = 'upload returned false';
                    }
                } catch (e) {
                    console.error(`Errore upload foto ${photo.filename} (room=${photo.room_name}):`, e);
                    failed++;
                    lastError = e.message || String(e);
                }
            }

            console.log(`[PHOTO SYNC] Risultato: ${uploaded} ok, ${failed} fallite, ${skippedNoBlob} senza blob, ${skippedRoom} skip room. Last error: ${lastError}`);

            // Fase 2b: genera e carica foto panoramiche con marker (_MARKED)
            // Raccoglie tutte le rooms (main + pertinenze)
            const allRoomsForMarkers = { ...(sop.rooms || {}) };
            if (Array.isArray(sop.pertinenze)) {
                for (const pert of sop.pertinenze) {
                    if (pert && pert.rooms) {
                        Object.assign(allRoomsForMarkers, pert.rooms);
                    }
                }
            }

            for (const [roomName, room] of Object.entries(allRoomsForMarkers)) {
                const markerCoords = room.marker_coords;
                if (!markerCoords || Object.keys(markerCoords).length === 0) continue;

                // Fase E: skip vani scartati per secondario
                if (result.role === 'secondary' && result.skipped_room_names &&
                    result.skipped_room_names.includes(roomName)) {
                    continue;
                }

                // Trova foto panoramiche di questo vano
                const roomPanos = photos.filter(p =>
                    p.room_name === roomName && p.type === 'panoramica' && p.blob
                );

                for (const pano of roomPanos) {
                    try {
                        const markedBlob = await MarkerView.renderMarkersOnPhoto(
                            pano.blob, markerCoords, pano.filename
                        );
                        // Il filename _MARKED
                        const baseName = (pano.filename || 'FOTO_PANORAMICA_1.jpg');
                        const dotIdx = baseName.lastIndexOf('.');
                        const markedFilename = dotIdx > 0
                            ? baseName.substring(0, dotIdx) + '_MARKED' + baseName.substring(dotIdx)
                            : baseName + '_MARKED.jpg';

                        // Upload come foto "virtuale"
                        const markedPhoto = {
                            room_name: roomName,
                            filename: markedFilename,
                            blob: markedBlob
                        };
                        const ok = await this._uploadPhotoToAPI(sop, markedPhoto);
                        if (ok) {
                            uploaded++;
                            console.log(`Marker foto caricata: ${markedFilename}`);
                        }
                    } catch (e) {
                        console.error(`Errore generazione marker per ${pano.filename}:`, e);
                    }
                }
            }

            // Marca sopralluogo come sincronizzato
            sop.synced = true;
            await DB.saveSopralluogo(sop);

            // Auto-purge foto dettaglio se storage > 80%
            let purgedCount = 0;
            try {
                if (navigator.storage && navigator.storage.estimate) {
                    const est = await navigator.storage.estimate();
                    const usageRatio = est.usage / est.quota;
                    if (usageRatio > 0.80) {
                        purgedCount = await DB.purgeSyncedDetailPhotos(sop.id);
                        if (purgedCount > 0) {
                            console.log(`[Sync] Auto-purge: ${purgedCount} foto dettaglio eliminate (usage: ${Math.round(usageRatio * 100)}%)`);
                        }
                    }
                }
            } catch (purgeErr) {
                console.warn('[Sync] Errore auto-purge:', purgeErr);
            }

            this._updateSyncButton('done');

            // Suffisso purge per toast
            const purgeSuffix = purgedCount > 0 ? ` Liberate ${purgedCount} foto dal dispositivo.` : '';

            // Fase E: toast differenziato per ruolo
            if (result.role === 'secondary') {
                let msg = `${result.rooms_added || 0} vani nuovi`;
                if (result.rooms_updated > 0) {
                    msg += `, ${result.rooms_updated} aggiornati`;
                }
                if (result.rooms_skipped > 0) {
                    msg += `, ${result.rooms_skipped} scartati (gia\' del master)`;
                }
                msg += `. Master (${result.master_operator_name || '?'}) ha ${result.total_rooms_on_disk || '?'} vani totali.`;
                if (uploaded > 0) msg += ` ${uploaded} foto caricate.`;
                if (failed > 0) msg += ` (${failed} foto fallite: ${lastError})`;
                msg += purgeSuffix;
                UI.toast(msg, 8000);
            } else if (result.role === 'master' && result.secondary_rooms && result.secondary_rooms.length > 0) {
                const secNames = result.secondary_rooms.map(r => r.name).join(', ');
                let msg = `Sincronizzato: ${result.rooms_saved || 0} vani, ${uploaded} foto.`;
                msg += ` Vani da altri operatori: ${secNames}`;
                if (failed > 0) msg += ` (${failed} foto fallite: ${lastError})`;
                msg += purgeSuffix;
                UI.toast(msg, 8000);
            } else {
                let msg = `Sincronizzato: ${result.rooms_saved || 0} vani, ${uploaded} foto`;
                if (failed > 0) msg += ` (${failed} foto fallite)`;
                msg += purgeSuffix;
                UI.toast(msg);
            }

            return true;
        } catch (e) {
            console.error('Errore sync API:', e);
            this._updateSyncButton('error');
            UI.toast('Errore sincronizzazione: ' + e.message);
            return false;
        }
    },

    /**
     * Trova la cartella pertinenza per un vano (se appartiene a una pertinenza).
     * Ritorna il nome folder (identico a bot.py get_pertinenza_path) oppure ''.
     */
    _findPertFolderForRoom(sop, roomName) {
        if (!Array.isArray(sop.pertinenze)) return '';
        for (const pert of sop.pertinenze) {
            if (pert && pert.rooms && pert.rooms[roomName]) {
                // Costruisci nome cartella — identico a _build_pert_folder_name in api_server.py
                const parts = [pert.type || 'Pertinenza'];
                if (pert.sub) parts.push(`Sub. ${pert.sub}`);
                if (pert.numero) parts.push(`N. ${pert.numero}`);
                if (pert.proprietario) parts.push(`Prop. ${pert.proprietario}`);
                if (pert.indirizzo) parts.push(pert.indirizzo);
                let folder = parts.join(' - ');
                if (pert.piano) folder += ` (${pert.piano})`;
                return folder;
            }
        }
        return '';
    },

    /**
     * Upload singola foto via API HTTP
     */
    async _uploadPhotoToAPI(sop, photo) {
        const formData = new FormData();
        formData.append('building_code', sop.building_code || '');
        formData.append('floor', sop.floor || '');
        formData.append('unit_name', sop.unit_name || '');
        formData.append('room_name', photo.room_name || '');
        formData.append('filename', photo.filename || 'photo.jpg');
        formData.append('is_multi_floor', String(sop.is_multi_floor || false));

        // Pertinenze: aggiungi pert_folder se il vano appartiene a una pertinenza
        const pertFolder = photo.pert_folder || this._findPertFolderForRoom(sop, photo.room_name);
        if (pertFolder) {
            formData.append('pert_folder', pertFolder);
        }

        // Per multi-floor: il piano del vano potrebbe essere diverso
        if (sop.is_multi_floor && sop.rooms && sop.rooms[photo.room_name]) {
            const roomFloor = sop.rooms[photo.room_name].floor;
            if (roomFloor) {
                formData.append('room_floor', roomFloor);
            }
        }

        // Aggiungi il blob della foto (ArrayBuffer → Blob per FormData)
        let uploadBlob = photo.blob;
        if (uploadBlob instanceof ArrayBuffer || (uploadBlob && uploadBlob.byteLength !== undefined && !(uploadBlob instanceof Blob))) {
            uploadBlob = new Blob([uploadBlob], { type: 'image/jpeg' });
        }
        formData.append('photo', uploadBlob, photo.filename || 'photo.jpg');

        const resp = await this._apiFetch('/api/sync/photo', {
            method: 'POST',
            headers: this._getAuthHeaders(),
            body: formData
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Errore upload' }));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const result = await resp.json();
        console.log(`Foto ${photo.filename} caricata (${result.size} bytes)`);
        return true;
    },

    /**
     * Costruisce payload arricchito con info foto per ogni vano.
     * Aggiunge a ogni obs il campo photo_filename (linkato da IndexedDB photos).
     * Aggiunge a ogni room i campi panoramic_photos e planimetria_photos.
     */
    async _buildPayloadWithPhotos(sop) {
        const payload = this._buildPayload(sop);

        // Carica tutte le foto del sopralluogo da IndexedDB
        const photos = await DB.getPhotosBySopralluogo(sop.id);

        for (const [roomName, room] of Object.entries(payload.rooms || {})) {
            const roomPhotos = photos.filter(p => p.room_name === roomName);

            // Foto panoramiche
            room.panoramic_photos = roomPhotos
                .filter(p => p.type === 'panoramica')
                .map(p => p.filename)
                .filter(Boolean);

            // Lega obs alle foto dettaglio tramite photo_id / observation_key / obs_id
            const obsList = room.observations || room.obs || [];
            if (Array.isArray(obsList)) {
                obsList.forEach((obs, i) => {
                    const photo = roomPhotos.find(p => {
                        if (p.type !== 'dettaglio') return false;
                        // 1. Match per photo_id dell'obs (il modo principale: obs.photo_id == photo.id)
                        if (obs.photo_id && p.id === obs.photo_id) return true;
                        // 2. Match per observation_key == obs_id
                        const key = p.observation_key;
                        if (key && (key === obs.obs_id ||
                                    key === `obs_${i}` ||
                                    key === String(i) ||
                                    key === i)) return true;
                        return false;
                    });
                    obs.photo_filename = photo ? photo.filename : null;
                });
            }

            // Planimetrie
            room.planimetria_photos = roomPhotos
                .filter(p => p.type === 'planimetria')
                .map(p => p.filename)
                .filter(Boolean);
        }

        // Arricchisci anche le foto delle pertinenze
        if (Array.isArray(payload.pertinenze)) {
            for (const pert of payload.pertinenze) {
                if (!pert || !pert.rooms) continue;
                for (const [roomName, room] of Object.entries(pert.rooms)) {
                    const roomPhotos = photos.filter(p => p.room_name === roomName);
                    room.panoramic_photos = roomPhotos
                        .filter(p => p.type === 'panoramica')
                        .map(p => p.filename)
                        .filter(Boolean);
                    const obsList = room.observations || room.obs || [];
                    if (Array.isArray(obsList)) {
                        obsList.forEach((obs, i) => {
                            const photo = roomPhotos.find(p => {
                                if (p.type !== 'dettaglio') return false;
                                if (obs.photo_id && p.id === obs.photo_id) return true;
                                const key = p.observation_key;
                                if (key && (key === obs.obs_id || key === `obs_${i}`
                                    || key === String(i) || key === i)) return true;
                                return false;
                            });
                            obs.photo_filename = photo ? photo.filename : null;
                        });
                    }
                    room.planimetria_photos = roomPhotos
                        .filter(p => p.type === 'planimetria')
                        .map(p => p.filename)
                        .filter(Boolean);
                }
            }
        }

        return payload;
    },

    // ========== RELAY BOT (B1 FIX, fallback) ==========

    /**
     * B1 FIX: Invio tramite relay bot API (fetch).
     * Non chiude la webapp. Supporta payload di qualsiasi dimensione.
     * Telegram sendMessage ha limite 4096 char, quindi per payload grandi
     * usiamo sendDocument con file JSON.
     */
    async _sendViaRelay(sop, payload) {
        const token = CONFIG.SYNC_RELAY_TOKEN;
        const chatId = CONFIG.SYNC_GROUP_ID;

        if (!token || !chatId) {
            console.warn('Relay bot non configurato. Fallback su export JSON.');
            UI.toast('Sync non configurata. Usa Export JSON.');
            return false;
        }

        this._updateSyncButton('syncing');

        try {
            const json = JSON.stringify(payload);

            if (json.length <= 4096) {
                // Cabe in un messaggio di testo
                const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: json
                    })
                });

                if (!resp.ok) {
                    const err = await resp.text();
                    throw new Error('sendMessage failed: ' + err);
                }
            } else {
                // Payload grande: invia come documento JSON
                const blob = new Blob([json], { type: 'application/json' });
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('document', blob, `sync_${sop.id || 'data'}.json`);
                formData.append('caption', JSON.stringify({
                    action: payload.action,
                    sopralluogo_id: sop.id,
                    building_code: sop.building_code
                }));

                const resp = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
                    method: 'POST',
                    body: formData
                });

                if (!resp.ok) {
                    const err = await resp.text();
                    throw new Error('sendDocument failed: ' + err);
                }
            }

            sop.synced = true;
            await DB.saveSopralluogo(sop);
            this._updateSyncButton('done');
            UI.toast('Dati sincronizzati');
            return true;
        } catch (e) {
            console.error('Errore relay sync:', e);
            this._updateSyncButton('error');
            UI.toast('Errore sincronizzazione');
            return false;
        }
    },

    // ========== PAYLOAD BUILDER ==========

    /**
     * Costruisce payload sopralluogo per sync.
     * TRASFORMA i dati dal formato interno webapp al formato atteso da
     * reports.py (unit_info.json / metadata.json / global_notes.json).
     */
    _buildPayload(sop) {
        // --- Owner: oggetto {type, name, company_name, ...} → stringa ---
        const ownerStr = this._ownerToString(sop.owner);

        // --- Attendees: metro_coll array → stringa ---
        const att = sop.attendees || {};
        const metroCollStr = Array.isArray(att.metro_coll)
            ? att.metro_coll.filter(Boolean).join(', ')
            : (att.metro_coll || '');

        // --- Signers: oggetto separato → campi flat ---
        const sig = sop.signers || {};
        const sigEnabled = sop.signer_enabled || {};

        // --- Start time: ISO → DD/MM/YYYY HH:MM ---
        let startTimeStr = '';
        if (sop.start_time) {
            try {
                const dt = new Date(sop.start_time);
                if (!isNaN(dt.getTime())) {
                    const dd = String(dt.getDate()).padStart(2, '0');
                    const mm = String(dt.getMonth() + 1).padStart(2, '0');
                    const yyyy = dt.getFullYear();
                    const hh = String(dt.getHours()).padStart(2, '0');
                    const mi = String(dt.getMinutes()).padStart(2, '0');
                    startTimeStr = `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
                }
            } catch (e) { /* fallback stringa vuota */ }
        }

        // --- Rooms: trasforma ogni vano ---
        const transformedRooms = {};
        for (const [name, room] of Object.entries(sop.rooms || {})) {
            transformedRooms[name] = this._transformRoom(room);
        }

        // --- Proprietario assente ---
        const propAssente = sop.proprietario_assente || false;

        const payload = {
            id: sop.id,
            building_code: sop.building_code,
            building_address: sop.building_address,
            floor: sop.floor,
            building_floors: sop.building_floors,
            is_multi_floor: sop.is_multi_floor,
            stair: sop.stair,
            unit_type: sop.unit_type,
            manual_unit_type: sop.manual_unit_type,
            subalterno: sop.subalterno,
            unit_internal: sop.unit_internal,
            unit_name: sop.unit_name,
            // Dati anagrafici PRE-FORMATTATI (stringhe)
            owner: ownerStr,
            attendees_metro_tech: att.metro_tech || '',
            attendees_metro_coll: metroCollStr,
            attendees_rm: att.rm || '',
            signer_metro_tech: sig.metro_tech || att.metro_tech || '',
            signer_rm: sig.rm || att.rm || '',
            signer_metro_coll: sig.metro_coll || metroCollStr,
            signer_owner: sig.proprietario || ownerStr,
            signer_enabled: sigEnabled,
            // Vani trasformati
            rooms: transformedRooms,
            pert_order: sop.pert_order,
            operator_note: sop.operator_note,
            global_notes: sop.global_notes,
            pertinenze: sop.pertinenze,
            allontana_events: sop.allontana_events,
            rm_presente: sop.rm_presente,
            custom_cappello: sop.custom_cappello,
            custom_chiusura: sop.custom_chiusura,
            custom_unit_line: sop.custom_unit_line,
            start_time: startTimeStr,
            completed: sop.completed,
            operator_telegram_id: sop.operator_telegram_id,
            operator_telegram_name: sop.operator_telegram_name,
            rivestimento: sop.rivestimento,
            proprietario_assente: propAssente,
            proprietario_assente_note: sop.proprietario_assente_note || ''
        };

        // Debug log: mostra cosa stiamo per inviare
        const pertRooms = (payload.pertinenze || []).map(p => ({
            type: p.type, sub: p.sub,
            rooms: Object.keys(p.rooms || {})
        }));
        console.log('[Sync] Payload:', {
            building_code: payload.building_code,
            unit_name: payload.unit_name,
            rooms_count: Object.keys(payload.rooms || {}).length,
            room_names: Object.keys(payload.rooms || {}),
            pertinenze_count: (payload.pertinenze || []).length,
            pertinenze_rooms: pertRooms,
            operator_id: payload.operator_telegram_id
        });

        return payload;
    },

    /**
     * Converte oggetto owner in stringa per reports.py.
     * persona: "Mario Rossi" | societa: "ACME (Amm.re Mario Rossi)"
     * Aggiunge altri presenti se ci sono.
     */
    _ownerToString(owner) {
        if (!owner) return '';
        if (typeof owner === 'string') return owner;

        let str = '';
        if (owner.type === 'societa') {
            str = owner.company_name || '';
            if (owner.company_admin) {
                str += ` (Amm.re ${owner.company_admin})`;
            }
        } else {
            str = owner.name || '';
        }

        // Altri presenti per la proprieta
        if (owner.others_present && Array.isArray(owner.others_present)) {
            const others = owner.others_present.filter(Boolean).join(', ');
            if (others) str += `, ${others}`;
        }

        return str;
    },

    /**
     * Trasforma dati di un vano dal formato webapp al formato reports.py.
     * - status → disclaimer_type
     * - wall_count → room_wall_count
     * - observations: element+wall merge, infisso_location→infisso_loc, parz_ingombra→notes
     */
    _transformRoom(room) {
        const t = {};

        // Copia campi base
        t.room_number = room.room_number;
        t.room_name = room.room_name;
        t.destination = room.destination;
        t.finishes = room.finishes;
        t.has_cdp = room.has_cdp || false;
        t.floor = room.floor;
        t.manual_text = room.manual_text;
        t.custom_room_text = room.custom_room_text;
        t.stair_subsection = room.stair_subsection;
        t.marker_coords = room.marker_coords;
        t.completed_surfaces = room.completed_surfaces;
        t.photos = room.photos;
        if (room.created_at) t.created_at = room.created_at;

        // status → disclaimer_type (NON_VALUTABILE, NON_ACCESSIBILE, NON_AUTORIZZATO)
        const statusMap = {
            'non_valutabile': 'NON_VALUTABILE',
            'non_accessibile': 'NON_ACCESSIBILE',
            'non_autorizzato': 'NON_AUTORIZZATO'
        };
        if (room.status && statusMap[room.status]) {
            t.disclaimer_type = statusMap[room.status];
        }
        t.status = room.status; // conserva per UI

        // wall_count → room_wall_count
        if (room.wall_count != null) {
            t.room_wall_count = room.wall_count;
        }

        // Trasforma osservazioni
        if (Array.isArray(room.observations)) {
            t.observations = room.observations.map(obs => this._transformObs(obs));
        } else {
            t.observations = [];
        }

        return t;
    },

    /**
     * Trasforma singola osservazione dal formato webapp al formato reports.py.
     * - element "Pareti" + wall "Parete A" → element "Parete A"
     * - infisso_location → infisso_loc
     * - parz_ingombra bool → aggiunge "parzialmente ingombra" nelle notes
     */
    _transformObs(obs) {
        const t = { ...obs };

        // Element + wall merge: "Pareti" + "Parete A" → "Parete A"
        if (t.element === 'Pareti' && t.wall) {
            t.element = t.wall;
        }

        // infisso_which → infisso_loc (reports.py legge infisso_loc come identificativo varco)
        // Nel bot: infisso_loc = "1 da SX", "Centrale", etc. (identificativo)
        // Nella webapp: infisso_which ha lo stesso ruolo
        // NON mappare infisso_location → infisso_loc (sono entrambi il nome parete, causa duplicazione)
        if (t.infisso_which && !t.infisso_loc) {
            t.infisso_loc = t.infisso_which;
        }

        // parz_ingombra → inserisce nelle notes
        if (t.parz_ingombra) {
            const piText = 'parzialmente ingombra';
            if (!t.notes || !t.notes.toLowerCase().includes(piText)) {
                t.notes = t.notes ? `${t.notes}, ${piText}` : piText;
            }
        }

        return t;
    },

    /**
     * Costruisce label unita
     */
    _buildUnitLabel(sop) {
        if (sop.manual_unit_type) return sop.manual_unit_type;
        const parts = [sop.unit_type];
        if (sop.subalterno) parts.push('Sub. ' + sop.subalterno);
        if (sop.unit_internal) parts.push(sop.unit_internal);
        return parts.filter(Boolean).join(' - ');
    },

    /**
     * Richiedi generazione report al bot (D2).
     * Usa POST /api/report/generate per generare verbale e/o allegato DOCX,
     * poi scarica automaticamente i file generati via downloadFile().
     */
    async requestReport(sopralluogoId, reportType = 'both') {
        const sop = await DB.getSopralluogo(sopralluogoId);
        if (!sop) {
            UI.toast('Sopralluogo non trovato');
            return false;
        }

        // D2: Genera via API HTTP (tunnel) + invio via Telegram
        if (this._isAPIAvailable()) {
            try {
                UI.toast('Generazione report in corso...');

                // Ottieni chat_id dall'utente Telegram per invio diretto
                let chatId = '';
                try {
                    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
                    if (user?.id) chatId = String(user.id);
                } catch (e) { /* no telegram user */ }

                const resp = await this._apiFetch('/api/report/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...this._getAuthHeaders()
                    },
                    body: JSON.stringify({
                        building_code: sop.building_code,
                        floor: sop.floor,
                        unit_name: sop.unit_name || this._buildUnitLabel(sop),
                        report_type: reportType,
                        is_multi_floor: sop.is_multi_floor || false,
                        telegram_chat_id: chatId
                    })
                });

                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({ error: 'Errore sconosciuto' }));
                    throw new Error(err.error || `HTTP ${resp.status}`);
                }

                const result = await resp.json();
                console.log('Report generato:', result);

                if (result.files && result.files.length > 0) {
                    if (result.telegram_sent > 0) {
                        // File inviati via Telegram — nessun download nel browser
                        UI.toast(`📄 ${result.telegram_sent} report inviati in chat Telegram`);
                    } else {
                        // Fallback: download nel browser (no Telegram)
                        UI.toast(`Report generati: ${result.files.length} file`);
                        for (const file of result.files) {
                            await this.downloadFile(file.path, file.filename);
                        }
                    }
                    return true;
                } else {
                    UI.toast('Nessun report generato');
                    return false;
                }
            } catch (e) {
                console.error('Errore generazione report via API:', e);
                UI.toast('Errore generazione: ' + e.message);
                return false;
            }
        }

        // Fallback: relay bot (legacy)
        const payload = {
            action: 'generate_report',
            sopralluogo_id: sopralluogoId,
            building_code: sop.building_code,
            floor: sop.floor,
            unit_name: sop.unit_name || this._buildUnitLabel(sop)
        };

        const token = CONFIG.SYNC_RELAY_TOKEN;
        const chatId = CONFIG.SYNC_GROUP_ID;

        if (token && chatId) {
            try {
                const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: JSON.stringify(payload)
                    })
                });
                if (resp.ok) {
                    UI.toast('Richiesta report inviata al bot');
                    return true;
                }
            } catch (e) {
                console.error('Errore richiesta report via relay:', e);
            }
        }

        // Fallback sendData (chiude la webapp — ultimo resort)
        try {
            if (window.Telegram && Telegram.WebApp) {
                Telegram.WebApp.sendData(JSON.stringify(payload));
                UI.toast('Richiesta report inviata');
                return true;
            } else {
                console.log('REPORT REQUEST:', payload);
                UI.toast('Richiesta report (modalita test)');
                return true;
            }
        } catch (e) {
            console.error('Errore richiesta report:', e);
            UI.toast('Errore richiesta report');
            return false;
        }
    },

    /**
     * Download di un file dall'archivio del PC via API (D2).
     * Usa GET /api/archive/download?path=... e trigger download nel browser.
     * @param {string} filePath - percorso relativo dentro archivi/ (es. "0010A/PT/Ab.../Report_Generati/Verbale_xxx.docx")
     * @param {string} [filename] - nome file per il download (opzionale, estratto da filePath se omesso)
     */
    async downloadFile(filePath, filename) {
        if (!this._isAPIAvailable()) {
            UI.toast('API non configurata per il download');
            return false;
        }

        try {
            const resp = await this._apiFetch(
                `/api/archive/download?path=${encodeURIComponent(filePath)}`,
                {
                    headers: this._getAuthHeaders()
                }
            );

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Errore download' }));
                throw new Error(err.error || `HTTP ${resp.status}`);
            }

            const blob = await resp.blob();

            // Estrai nome file dal path se non fornito
            const downloadName = filename || filePath.split('/').pop() || 'download';

            // Trigger download nel browser
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Rilascia l'oggetto URL dopo un breve delay
            setTimeout(() => URL.revokeObjectURL(url), 5000);

            console.log(`File scaricato: ${downloadName} (${blob.size} bytes)`);
            return true;
        } catch (e) {
            console.error('Errore download file:', e);
            UI.toast('Errore download: ' + e.message);
            return false;
        }
    },

    // ========== EXPORT / IMPORT JSON ==========

    async exportJSON(sopralluogoId) {
        const sop = await DB.getSopralluogo(sopralluogoId);
        if (!sop) {
            UI.toast('Sopralluogo non trovato');
            return;
        }

        const photos = await DB.getPhotosBySopralluogo(sopralluogoId);
        const photoData = [];
        for (const photo of photos) {
            const entry = {
                id: photo.id,
                room_name: photo.room_name,
                type: photo.type,
                filename: photo.filename,
                observation_key: photo.observation_key,
                pertinenza_index: photo.pertinenza_index,
                created_at: photo.created_at
            };
            if (photo.blob) {
                try {
                    entry.blob_b64 = await this._blobToBase64(photo.blob);
                } catch (e) {
                    console.warn('Errore conversione foto ' + photo.id + ':', e);
                }
            }
            if (photo.thumbnail) {
                try {
                    entry.thumb_b64 = await this._blobToBase64(photo.thumbnail);
                } catch (e) { /* skip */ }
            }
            photoData.push(entry);
        }

        const exportData = {
            version: '2.1',
            exported_at: new Date().toISOString(),
            sopralluogo: sop,
            photos: photoData
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = (sop.building_code || 'testimoniale') + '_' + (sop.id || '').slice(0, 8) + '.json';
        a.click();

        URL.revokeObjectURL(url);
        UI.toast('JSON esportato');
    },

    async importJSON(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if ((data.version === '2.0' || data.version === '2.1') && data.sopralluogo) {
                await DB.saveSopralluogo(data.sopralluogo);

                if (data.photos && data.photos.length > 0) {
                    for (const photo of data.photos) {
                        const photoEntry = {
                            id: photo.id || Events.uuid(),
                            sopralluogo_id: data.sopralluogo.id,
                            room_name: photo.room_name,
                            type: photo.type,
                            filename: photo.filename,
                            observation_key: photo.observation_key,
                            pertinenza_index: photo.pertinenza_index !== undefined ? photo.pertinenza_index : null,
                            created_at: photo.created_at || Date.now(),
                            synced: false
                        };
                        if (photo.blob_b64) {
                            try {
                                photoEntry.blob = await this._base64ToBlob(photo.blob_b64);
                            } catch (e) { /* skip */ }
                        }
                        if (photo.thumb_b64) {
                            try {
                                photoEntry.thumbnail = await this._base64ToBlob(photo.thumb_b64);
                            } catch (e) { /* skip */ }
                        }
                        await DB.addPhoto(photoEntry);
                    }
                }

                return { success: true, count: 1, message: 'Sopralluogo importato con ' + (data.photos || []).length + ' foto' };
            } else if (data.id && data.building_code) {
                await DB.saveSopralluogo(data);
                return { success: true, count: 1, message: 'Sopralluogo importato' };
            } else if (Array.isArray(data)) {
                let count = 0;
                for (const sop of data) {
                    if (sop.id) {
                        await DB.saveSopralluogo(sop);
                        count++;
                    }
                }
                return { success: true, count: count, message: count + ' sopralluoghi importati' };
            } else {
                return { success: false, message: 'Formato non riconosciuto' };
            }
        } catch (err) {
            console.error('Import error:', err);
            return { success: false, message: 'Errore durante l\'importazione' };
        }
    },

    // ========== HELPERS ==========

    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    _base64ToBlob(dataUrl) {
        return new Promise((resolve, reject) => {
            try {
                const parts = dataUrl.split(',');
                const mime = parts[0].match(/:(.*?);/)[1];
                const bstr = atob(parts[1]);
                const arr = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) {
                    arr[i] = bstr.charCodeAt(i);
                }
                resolve(new Blob([arr], { type: mime }));
            } catch (e) {
                reject(e);
            }
        });
    }
};
