/* ============================================================
 * photos.js — Gestione foto (cattura, resize, salvataggio)
 * ============================================================ */

'use strict';

const Photos = (() => {

    const MAX_SIZE = 1920;
    const THUMB_SIZE = 200;
    const JPEG_QUALITY = 0.85;

    // ===== CATTURA DA CAMERA =====
    function captureFromCamera() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) { reject(new Error('Nessuna foto selezionata')); return; }
                _processFile(file).then(resolve).catch(reject);
            };
            input.click();
        });
    }

    // ===== CATTURA DA GALLERIA =====
    function captureFromGallery() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) { reject(new Error('Nessuna foto selezionata')); return; }
                _processFile(file).then(resolve).catch(reject);
            };
            input.click();
        });
    }

    // ===== PROCESS FILE: Resize + Thumbnail =====
    function _processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const blob = _resize(img, MAX_SIZE, JPEG_QUALITY);
                    const thumb = _resize(img, THUMB_SIZE, 0.7);
                    resolve({ blob, thumbnail: thumb, width: img.width, height: img.height });
                };
                img.onerror = () => reject(new Error('Errore caricamento immagine'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Errore lettura file'));
            reader.readAsDataURL(file);
        });
    }

    // ===== RESIZE =====
    function _resize(img, maxSize, quality) {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // Converti in Blob sincrono via dataURL
        const dataURL = canvas.toDataURL('image/jpeg', quality);
        return _dataURLtoBlob(dataURL);
    }

    function _dataURLtoBlob(dataURL) {
        const parts = dataURL.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
        return new Blob([u8arr], { type: mime });
    }

    // ===== SALVA FOTO IN DB =====
    async function savePhoto(sopId, roomName, type, filename, blob, thumbnail) {
        const id = DB.uuid();
        await DB.addPhoto({
            id,
            sopralluogo_id: sopId,
            room_name: roomName,
            type: type, // 'panoramica' | 'dettaglio' | 'planimetria'
            filename: filename,
            blob: blob,
            thumbnail: thumbnail || null,
            synced: false,
            created_at: Date.now()
        });
        return id;
    }

    // ===== GET THUMBNAIL URL =====
    function getThumbnailURL(photo) {
        if (photo.thumbnail) return URL.createObjectURL(photo.thumbnail);
        if (photo.blob) return URL.createObjectURL(photo.blob);
        return '';
    }

    // ===== GET FULL URL =====
    function getFullURL(photo) {
        if (photo.blob) return URL.createObjectURL(photo.blob);
        return '';
    }

    return {
        captureFromCamera, captureFromGallery,
        savePhoto, getThumbnailURL, getFullURL
    };

})();
