/**
 * db.js - IndexedDB wrapper per Testimoniale WebApp
 * Database: testimoniale_db
 * Stores: events, sopralluoghi, photos
 */
const DB = {
    _db: null,
    DB_NAME: 'testimoniale_db',
    DB_VERSION: 1,

    /**
     * Apre/crea il database IndexedDB
     */
    async open() {
        if (this._db) return this._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Store: events (event sourcing)
                if (!db.objectStoreNames.contains('events')) {
                    const evStore = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
                    evStore.createIndex('sopralluogo_id', 'sopralluogo_id', { unique: false });
                    evStore.createIndex('type', 'type', { unique: false });
                    evStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Store: sopralluoghi (stato materializzato)
                if (!db.objectStoreNames.contains('sopralluoghi')) {
                    const sopStore = db.createObjectStore('sopralluoghi', { keyPath: 'id' });
                    sopStore.createIndex('building_code', 'building_code', { unique: false });
                    sopStore.createIndex('synced', 'synced', { unique: false });
                    sopStore.createIndex('created_at', 'created_at', { unique: false });
                }

                // Store: photos (blob storage)
                if (!db.objectStoreNames.contains('photos')) {
                    const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
                    photoStore.createIndex('sopralluogo_id', 'sopralluogo_id', { unique: false });
                    photoStore.createIndex('room_name', 'room_name', { unique: false });
                    photoStore.createIndex('type', 'type', { unique: false });
                    photoStore.createIndex('synced', 'synced', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };

            request.onerror = (e) => {
                console.error('IndexedDB open error:', e.target.error);
                reject(e.target.error);
            };
        });
    },

    /**
     * Ottieni una transazione per uno store
     */
    _tx(storeName, mode = 'readonly') {
        return this._db.transaction(storeName, mode).objectStore(storeName);
    },

    // ========== GENERIC CRUD ==========

    async add(storeName, data) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async put(storeName, data) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const store = this._tx(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAll(storeName) {
        await this.open();
        return new Promise((resolve, reject) => {
            const store = this._tx(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName, key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // ========== QUERY BY INDEX ==========

    async getByIndex(storeName, indexName, value) {
        await this.open();
        return new Promise((resolve, reject) => {
            const store = this._tx(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // ========== SOPRALLUOGHI ==========

    async getSopralluogo(id) {
        return this.get('sopralluoghi', id);
    },

    async getAllSopralluoghi() {
        const all = await this.getAll('sopralluoghi');
        // Ordina per data creazione decrescente
        return all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    },

    async saveSopralluogo(data) {
        data.updated_at = Date.now();
        try {
            return await this.put('sopralluoghi', data);
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota')))) {
                console.error('[DB] Spazio esaurito! Impossibile salvare sopralluogo.', e);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('⚠️ Memoria dispositivo esaurita. Libera spazio o esporta i dati.', 5000);
                }
            }
            throw e;
        }
    },

    async deleteSopralluogo(id) {
        // Elimina anche eventi e foto collegati
        const events = await this.getByIndex('events', 'sopralluogo_id', id);
        const photos = await this.getByIndex('photos', 'sopralluogo_id', id);

        const tx = this._db.transaction(['sopralluoghi', 'events', 'photos'], 'readwrite');

        tx.objectStore('sopralluoghi').delete(id);
        for (const ev of events) {
            tx.objectStore('events').delete(ev.id);
        }
        for (const ph of photos) {
            tx.objectStore('photos').delete(ph.id);
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    },

    // ========== EVENTS ==========

    async addEvent(event) {
        return this.add('events', event);
    },

    async getEventsBySopralluogo(sopralluogoId) {
        const events = await this.getByIndex('events', 'sopralluogo_id', sopralluogoId);
        return events.sort((a, b) => a.timestamp - b.timestamp);
    },

    async getUnsyncedEvents() {
        const all = await this.getAll('events');
        return all.filter((e) => !e.synced);
    },

    // ========== PHOTOS ==========

    async addPhoto(photoData) {
        try {
            return await this.put('photos', photoData);
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota')))) {
                console.error('[DB] Spazio esaurito! Impossibile salvare foto.', e);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('⚠️ Memoria dispositivo esaurita. Impossibile salvare la foto.', 5000);
                }
            }
            throw e;
        }
    },

    async getPhoto(id) {
        return this.get('photos', id);
    },

    async getPhotosBySopralluogo(sopralluogoId) {
        return this.getByIndex('photos', 'sopralluogo_id', sopralluogoId);
    },

    async getPhotosByRoom(roomName) {
        return this.getByIndex('photos', 'room_name', roomName);
    },

    async getUnsyncedPhotos() {
        return this.getByIndex('photos', 'synced', false);
    },

    /**
     * Elimina TUTTE le foto di un sopralluogo da IndexedDB.
     * Panoramiche, dettaglio, planimetrie — tutto.
     * Note, osservazioni, dati vano restano intatti (sono nel sopralluogo).
     * Da usare SOLO dopo conferma esplicita dell'operatore.
     * @returns {Object} { count, totalBytes } - foto eliminate e spazio liberato
     */
    async purgeAllPhotos(sopralluogoId) {
        const photos = await this.getByIndex('photos', 'sopralluogo_id', sopralluogoId);
        if (photos.length === 0) return { count: 0, totalBytes: 0 };

        let totalBytes = 0;
        for (const p of photos) {
            if (p.blob) totalBytes += (p.blob.size || p.blob.byteLength || 0);
            if (p.thumbnail) totalBytes += (p.thumbnail.size || p.thumbnail.byteLength || 0);
        }

        const tx = this._db.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        for (const p of photos) {
            store.delete(p.id);
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve({ count: photos.length, totalBytes });
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * Conta foto e calcola spazio occupato per un sopralluogo.
     * @returns {Object} { count, totalBytes, panoramiche, dettaglio, planimetrie }
     */
    async getPhotoStats(sopralluogoId) {
        const photos = await this.getByIndex('photos', 'sopralluogo_id', sopralluogoId);
        let totalBytes = 0;
        let panoramiche = 0, dettaglio = 0, planimetrie = 0;

        for (const p of photos) {
            if (p.blob) totalBytes += (p.blob.size || p.blob.byteLength || 0);
            if (p.thumbnail) totalBytes += (p.thumbnail.size || p.thumbnail.byteLength || 0);
            if (p.type === 'panoramica') panoramiche++;
            else if (p.type === 'dettaglio') dettaglio++;
            else if (p.type === 'planimetria') planimetrie++;
        }

        return { count: photos.length, totalBytes, panoramiche, dettaglio, planimetrie };
    }
};
