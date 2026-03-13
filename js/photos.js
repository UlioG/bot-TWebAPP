/**
 * photos.js - Gestione foto: cattura, resize, store in IndexedDB
 */
const Photos = {
    MAX_WIDTH: 1920,
    MAX_HEIGHT: 1920,
    THUMB_SIZE: 200,
    QUALITY: 0.85,

    /**
     * Scatta foto con fotocamera
     * Ritorna Promise con { blob, thumbnail } o null se annullato
     */
    takePhoto() {
        return this._pickFile(true);
    },

    /**
     * Seleziona foto dalla galleria
     * Ritorna Promise con { blob, thumbnail } o null se annullato
     */
    fromGallery() {
        return this._pickFile(false);
    },

    /**
     * Compatibilità: vecchio metodo capture() → apre galleria
     */
    capture() {
        return this._pickFile(false);
    },

    /**
     * Helper interno: crea input file, opzionalmente con capture=camera
     */
    _pickFile(useCamera = false) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            if (useCamera) {
                input.capture = 'environment'; // fotocamera posteriore
            }

            input.onchange = async () => {
                if (!input.files || !input.files[0]) {
                    resolve(null);
                    return;
                }

                const file = input.files[0];
                try {
                    const resized = await this.resizeImage(file, this.MAX_WIDTH, this.MAX_HEIGHT, this.QUALITY);
                    const thumbnail = await this.resizeImage(file, this.THUMB_SIZE, this.THUMB_SIZE, 0.6);
                    resolve({ blob: resized, thumbnail: thumbnail });
                } catch (e) {
                    console.error('Errore resize foto:', e);
                    resolve({ blob: file, thumbnail: file });
                }
            };

            input.addEventListener('cancel', () => resolve(null));
            input.click();
        });
    },

    /**
     * Ridimensiona un'immagine mantenendo le proporzioni
     */
    resizeImage(file, maxW, maxH, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let w = img.width;
                let h = img.height;

                if (w > maxW || h > maxH) {
                    const ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas toBlob failed'));
                }, 'image/jpeg', quality);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Image load failed'));
            };

            img.src = url;
        });
    },

    /**
     * Salva foto in IndexedDB
     */
    async save(sopralluogoId, roomName, type, blob, thumbnail, observationKey = null) {
        const id = Events.uuid();
        const photoCount = (await DB.getPhotosByRoom(roomName)).filter((p) => p.type === type).length;
        const num = photoCount + 1;

        let filename;
        if (type === 'planimetria') {
            filename = `planimetria_${Date.now()}.jpg`;
        } else if (type === 'panoramica') {
            filename = `FOTO_PANORAMICA_${num}.jpg`;
        } else {
            filename = `Foto_${num}_dettaglio.jpg`;
        }

        const photoData = {
            id: id,
            sopralluogo_id: sopralluogoId,
            room_name: roomName,
            type: type,
            filename: filename,
            blob: blob,
            thumbnail: thumbnail,
            observation_key: observationKey,
            created_at: Date.now(),
            synced: false
        };

        await DB.addPhoto(photoData);
        return { id, filename };
    },

    /**
     * Ottieni URL temporaneo per visualizzazione thumbnail
     */
    async getThumbnailUrl(photoId) {
        const photo = await DB.getPhoto(photoId);
        if (!photo || !photo.thumbnail) return null;
        return URL.createObjectURL(photo.thumbnail);
    },

    /**
     * Ottieni URL temporaneo per visualizzazione full
     */
    async getFullUrl(photoId) {
        const photo = await DB.getPhoto(photoId);
        if (!photo || !photo.blob) return null;
        return URL.createObjectURL(photo.blob);
    },

    /**
     * Renderizza griglia foto per un vano
     */
    async renderPhotoGrid(sopralluogoId, roomName, type, onAdd) {
        const photos = (await DB.getPhotosBySopralluogo(sopralluogoId))
            .filter((p) => p.room_name === roomName && p.type === type);

        let html = '<div class="photo-grid">';

        for (const photo of photos) {
            const thumbUrl = photo.thumbnail ? URL.createObjectURL(photo.thumbnail) : '';
            html += `
                <div class="photo-thumb" data-photo-id="${photo.id}">
                    <img src="${thumbUrl}" alt="${photo.filename}">
                </div>
            `;
        }

        // Bottone aggiungi
        html += `<div class="photo-add" id="photo-add-${type}">+</div>`;
        html += '</div>';

        return html;
    }
};
