/**
 * marker.js — Marker Tool: posizionamento marker numerati su foto panoramiche
 * Canvas-based, fullscreen modal, zoom/pan touch, offline-ready
 * Replica la logica di marker_app.html del bot Telegram
 */
const MarkerView = {

    // State
    _sopId: null,
    _roomName: null,
    _photos: [],        // [{id, filename, blob}]
    _defects: [],       // [{id, text, x, y, photo_id}]
    _currentPhotoIdx: 0,
    _selectedDefectIdx: -1,

    // Canvas / zoom
    _canvas: null,
    _ctx: null,
    _img: null,
    _scale: 1,
    _panX: 0,
    _panY: 0,
    _pinching: false,
    _pinchStartDist: 0,
    _pinchStartScale: 1,
    _panStartX: 0,
    _panStartY: 0,
    _lastPanX: 0,
    _lastPanY: 0,
    _pinchEndTime: 0,

    // Touch tracking
    _touchStartX: 0,
    _touchStartY: 0,
    _touchMoved: false,

    /**
     * Apri il marker tool per un vano specifico
     * @param {string} sopId
     * @param {string} roomName
     */
    async open(sopId, roomName) {
        this._sopId = sopId;
        this._roomName = roomName;
        this._currentPhotoIdx = 0;
        this._selectedDefectIdx = -1;
        this._scale = 1;
        this._panX = 0;
        this._panY = 0;

        const sop = await DB.getSopralluogo(sopId);
        if (!sop) { UI.toast('Sopralluogo non trovato'); return; }

        const rooms = Events.getActiveRooms(sop);
        const room = rooms[roomName];
        if (!room) { UI.toast('Vano non trovato'); return; }

        // 1. Carica foto panoramiche dal IndexedDB
        const allPhotos = await DB.getPhotosBySopralluogo(sopId);
        const pertIdx = Events.isInPertinenza(sop) ? sop.active_pertinenza : null;
        const panoPhotos = allPhotos
            .filter(p => p.room_name === roomName && p.type === 'panoramica' && Photos._matchPert(p, pertIdx))
            .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

        if (panoPhotos.length === 0) {
            UI.toast('Nessuna foto panoramica');
            return;
        }

        this._photos = panoPhotos.map((p, i) => ({
            id: p.id,
            filename: p.filename || `FOTO_PANORAMICA_${i + 1}.jpg`,
            blob: p.blob
        }));

        // 2. Costruisci lista difetti (solo reali: no NDR, no INGOMBRA, no NON VISIBILE)
        const observations = room.observations || [];
        let existingMarkers = room.marker_coords || {};
        this._defects = [];
        let defectId = 0;

        // 2a. Migrazione: assegna obs_id a osservazioni che non ce l'hanno
        let needsObsIdMigration = false;
        for (const obs of observations) {
            if (!obs.obs_id) {
                obs.obs_id = Events.generateObsId();
                needsObsIdMigration = true;
            }
        }
        if (needsObsIdMigration) {
            // Salva le osservazioni aggiornate con obs_id
            await DB.saveSopralluogo(sop);
        }

        // 2b. Migrazione marker_coords: da chiavi posizionali ("1","2","3") a obs_id
        const markerKeys = Object.keys(existingMarkers);
        const hasLegacyKeys = markerKeys.length > 0 && markerKeys.some(k => !k.startsWith('obs_'));

        // Prima costruisci i difetti per poter mappare posizione → obs_id
        for (let i = 0; i < observations.length; i++) {
            const obs = observations[i];
            const phenom = (obs.phenomenon || '').toUpperCase();

            if (phenom === 'NDR' || phenom === 'INGOMBRA' ||
                phenom === 'NON VISIBILE' || phenom === 'PARZIALMENTE INGOMBRA') {
                continue;
            }

            defectId++;
            const text = Formatters.formatObservationText(obs, { includeVF: false });

            this._defects.push({
                id: defectId,
                obs_id: obs.obs_id,
                obs_index: i,
                text: text,
                x: null,
                y: null,
                photo_id: null
            });
        }

        // 2c. Carica coordinate marker (con migrazione se necessario)
        if (hasLegacyKeys) {
            // Migra: vecchia chiave posizionale → obs_id
            const migratedMarkers = {};
            for (const d of this._defects) {
                const oldKey = String(d.id);
                if (existingMarkers[oldKey]) {
                    migratedMarkers[d.obs_id] = {
                        ...existingMarkers[oldKey],
                        num: d.id
                    };
                    d.x = existingMarkers[oldKey].x;
                    d.y = existingMarkers[oldKey].y;
                    d.photo_id = existingMarkers[oldKey].photo_id;
                }
            }
            // Salva marker migrati
            existingMarkers = migratedMarkers;
            await Events.dispatch('save_markers', sopId, {
                room_name: roomName,
                markers: migratedMarkers
            });
        } else {
            // Carica marker con chiavi obs_id
            for (const d of this._defects) {
                const existing = existingMarkers[d.obs_id];
                if (existing) {
                    d.x = existing.x;
                    d.y = existing.y;
                    d.photo_id = existing.photo_id;
                }
            }
        }

        if (this._defects.length === 0) {
            UI.toast('Nessun difetto reale da marcare');
            return;
        }

        // 3. Apri UI
        this._renderUI();
        this._loadPhoto(0);
    },

    /**
     * Renderizza l'interfaccia fullscreen del marker tool
     */
    _renderUI() {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <div id="marker-container" style="
                display: flex; flex-direction: column; height: 100vh; width: 100vw;
                background: #000; position: fixed; top: 0; left: 0; z-index: 10000;
                touch-action: none; user-select: none; -webkit-user-select: none;
            ">
                <!-- Header -->
                <div id="marker-header" style="
                    position: relative;
                    padding: 0 16px;
                    padding-top: calc(env(safe-area-inset-top, 0px) + 44px);
                    padding-bottom: 4px;
                    min-height: 110px;
                    background: rgba(0,0,0,0.9); color: #fff;
                    font-size: 14px; flex-shrink: 0;
                    display: flex; flex-direction: column; justify-content: flex-end;
                ">
                    <div id="marker-instruction" style="
                        text-align: center;
                        font-size: 14px; color: rgba(255,255,255,0.75);
                        white-space: nowrap; pointer-events: none;
                        margin-bottom: 6px;
                    ">
                        Seleziona un difetto, poi tocca la foto
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <button id="marker-close" style="
                            background: none; border: none; color: #fff; font-size: 24px;
                            padding: 2px 12px; cursor: pointer;
                        ">&times;</button>
                        <button id="marker-save" style="
                            background: rgb(128,0,0); border: none; color: #fff; font-size: 13px;
                            padding: 6px 14px; border-radius: 8px; cursor: pointer; font-weight: 600;
                        ">SALVA</button>
                    </div>
                </div>

                <!-- Photo workspace -->
                <div id="marker-workspace" style="
                    flex: 1; position: relative; overflow: hidden;
                    display: flex; align-items: center; justify-content: center;
                    background: #111;
                ">
                    <canvas id="marker-canvas" style="
                        max-width: 100%; max-height: 100%;
                    "></canvas>

                    <!-- Photo nav -->
                    <div id="marker-nav" style="
                        position: absolute; bottom: 8px; left: 0; right: 0;
                        display: flex; justify-content: center; align-items: center; gap: 12px;
                    ">
                        <button id="marker-prev" style="
                            background: rgba(0,0,0,0.6); border: none; color: #fff;
                            font-size: 20px; padding: 4px 12px; border-radius: 20px; cursor: pointer;
                        ">&#8249;</button>
                        <span id="marker-indicator" style="color: #fff; font-size: 13px; background: rgba(0,0,0,0.6); padding: 4px 12px; border-radius: 12px;"></span>
                        <button id="marker-next" style="
                            background: rgba(0,0,0,0.6); border: none; color: #fff;
                            font-size: 20px; padding: 4px 12px; border-radius: 20px; cursor: pointer;
                        ">&#8250;</button>
                    </div>

                    <!-- Zoom reset -->
                    <button id="marker-zoom-reset" style="
                        position: absolute; top: 8px; right: 8px;
                        background: rgba(0,0,0,0.6); border: none; color: #fff;
                        font-size: 12px; padding: 6px 10px; border-radius: 8px; cursor: pointer;
                        display: none;
                    ">1:1</button>
                </div>

                <!-- Defect list -->
                <div id="marker-defects" style="
                    height: 30vh; min-height: 140px; max-height: 250px;
                    overflow-y: auto; background: #1a1a1a; flex-shrink: 0;
                    -webkit-overflow-scrolling: touch;
                "></div>
            </div>
        `;

        overlay.classList.remove('hidden');

        // Bind events
        this._bindEvents();
        this._renderDefectList();
    },

    /**
     * Bind tutti gli eventi
     */
    _bindEvents() {
        const canvas = document.getElementById('marker-canvas');
        const workspace = document.getElementById('marker-workspace');
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');

        // Close
        document.getElementById('marker-close').addEventListener('click', () => this._close());

        // Save
        document.getElementById('marker-save').addEventListener('click', () => this._save());

        // Photo nav
        document.getElementById('marker-prev').addEventListener('click', () => {
            if (this._currentPhotoIdx > 0) this._loadPhoto(this._currentPhotoIdx - 1);
        });
        document.getElementById('marker-next').addEventListener('click', () => {
            if (this._currentPhotoIdx < this._photos.length - 1) this._loadPhoto(this._currentPhotoIdx + 1);
        });

        // Zoom reset
        document.getElementById('marker-zoom-reset').addEventListener('click', () => {
            this._scale = 1;
            this._panX = 0;
            this._panY = 0;
            this._drawCanvas();
            document.getElementById('marker-zoom-reset').style.display = 'none';
        });

        // Touch events on workspace
        workspace.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        workspace.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        workspace.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });

        // Mouse click fallback (desktop)
        canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    },

    /**
     * Carica e mostra una foto panoramica
     */
    _loadPhoto(index) {
        this._currentPhotoIdx = index;
        this._scale = 1;
        this._panX = 0;
        this._panY = 0;
        document.getElementById('marker-zoom-reset').style.display = 'none';

        const photo = this._photos[index];
        if (!photo || !photo.blob) return;

        const img = new Image();
        const url = URL.createObjectURL(photo.blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            this._img = img;
            this._fitCanvas();
            this._drawCanvas();
        };
        img.src = url;

        // Update nav
        const indicator = document.getElementById('marker-indicator');
        if (indicator) indicator.textContent = `${index + 1} / ${this._photos.length}`;

        const prevBtn = document.getElementById('marker-prev');
        const nextBtn = document.getElementById('marker-next');
        if (prevBtn) prevBtn.style.visibility = index > 0 ? 'visible' : 'hidden';
        if (nextBtn) nextBtn.style.visibility = index < this._photos.length - 1 ? 'visible' : 'hidden';

        // Nav visibility
        const nav = document.getElementById('marker-nav');
        if (nav) nav.style.display = this._photos.length > 1 ? 'flex' : 'none';
    },

    /**
     * Adatta il canvas alla dimensione del workspace
     */
    _fitCanvas() {
        if (!this._img || !this._canvas) return;
        const workspace = document.getElementById('marker-workspace');
        if (!workspace) return;

        const wW = workspace.clientWidth;
        const wH = workspace.clientHeight;
        const iW = this._img.width;
        const iH = this._img.height;

        const ratio = Math.min(wW / iW, wH / iH);
        this._canvas.width = Math.round(iW * ratio);
        this._canvas.height = Math.round(iH * ratio);
    },

    /**
     * Disegna canvas: foto + marker
     */
    _drawCanvas() {
        if (!this._ctx || !this._img || !this._canvas) return;
        const ctx = this._ctx;
        const cW = this._canvas.width;
        const cH = this._canvas.height;

        ctx.clearRect(0, 0, cW, cH);
        ctx.save();

        // Applica zoom e pan
        ctx.translate(this._panX, this._panY);
        ctx.scale(this._scale, this._scale);

        // Disegna immagine
        ctx.drawImage(this._img, 0, 0, cW, cH);

        // Disegna marker
        const currentPhoto = this._photos[this._currentPhotoIdx];
        if (!currentPhoto) { ctx.restore(); return; }

        const markerRadius = Math.max(Math.round(Math.min(cW, cH) * 0.039), 16);
        const fontSize = Math.max(Math.round(markerRadius * 0.85), 11);

        for (let i = 0; i < this._defects.length; i++) {
            const d = this._defects[i];
            if (d.x === null || d.y === null) continue;

            // Match foto: per filename o per photo_id (uuid)
            const matchesByFilename = d.photo_id === currentPhoto.filename;
            const matchesById = d.photo_id === currentPhoto.id;
            const legacyMatch = !d.photo_id && this._photos.length === 1;

            if (!matchesByFilename && !matchesById && !legacyMatch) continue;

            const px = (d.x / 100) * cW;
            const py = (d.y / 100) * cH;
            const isSelected = i === this._selectedDefectIdx;

            // Cerchio bianco con bordo rosso (come bot Pillow)
            ctx.beginPath();
            ctx.arc(px, py, markerRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#FFD700' : '#cc0000';
            ctx.lineWidth = isSelected ? 4 : 3;
            ctx.stroke();

            // Numero rosso centrato
            ctx.fillStyle = '#cc0000';
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(d.id), px, py);
        }

        ctx.restore();
    },

    /**
     * Renderizza la lista difetti
     */
    _renderDefectList() {
        const container = document.getElementById('marker-defects');
        if (!container) return;

        let html = '';
        for (let i = 0; i < this._defects.length; i++) {
            const d = this._defects[i];
            const isPlaced = d.x !== null && d.y !== null;
            const isSelected = i === this._selectedDefectIdx;

            html += `<div class="marker-defect-item" data-idx="${i}" style="
                display: flex; align-items: center; gap: 10px;
                padding: 10px 14px; cursor: pointer;
                border-bottom: 1px solid #333;
                background: ${isSelected ? 'rgba(128,0,0,0.3)' : 'transparent'};
            ">
                <div style="
                    width: 28px; height: 28px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: bold; font-size: 13px; flex-shrink: 0;
                    background: ${isPlaced ? '#cc0000' : '#555'};
                    color: #fff;
                ">${d.id}</div>
                <div style="
                    flex: 1; font-size: 13px; color: #ddd;
                    overflow: hidden; text-overflow: ellipsis;
                    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                ">${this._escapeHtml(d.text)}</div>
                ${isPlaced ? '<div style="color: #4caf50; font-size: 16px;">&#10003;</div>' : ''}
            </div>`;
        }

        container.innerHTML = html;

        // Bind click
        container.querySelectorAll('.marker-defect-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.idx);
                this._selectDefect(idx);
            });
        });
    },

    /**
     * Seleziona un difetto per piazzamento
     */
    _selectDefect(idx) {
        this._selectedDefectIdx = idx;
        this._renderDefectList();
        this._drawCanvas();

        const d = this._defects[idx];
        if (d) {
            const instruction = document.getElementById('marker-instruction');
            if (instruction) {
                instruction.textContent = `#${d.id}: tocca la foto per posizionare`;
            }
        }

        // Se il difetto ha gia un marker su un'altra foto, naviga a quella
        if (d && d.photo_id) {
            const photoIdx = this._photos.findIndex(p =>
                p.filename === d.photo_id || p.id === d.photo_id
            );
            if (photoIdx >= 0 && photoIdx !== this._currentPhotoIdx) {
                this._loadPhoto(photoIdx);
            }
        }
    },

    // ========== TOUCH HANDLING (zoom/pan + marker placement) ==========

    _onTouchStart(e) {
        if (e.touches.length === 2) {
            // Pinch start
            e.preventDefault();
            this._pinching = true;
            this._pinchStartDist = this._getTouchDist(e.touches);
            this._pinchStartScale = this._scale;
            this._lastPanX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            this._lastPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        } else if (e.touches.length === 1) {
            this._touchStartX = e.touches[0].clientX;
            this._touchStartY = e.touches[0].clientY;
            this._touchMoved = false;

            if (this._scale > 1.05) {
                // Pan start
                e.preventDefault();
                this._lastPanX = e.touches[0].clientX;
                this._lastPanY = e.touches[0].clientY;
            }
        }
    },

    _onTouchMove(e) {
        if (e.touches.length === 2 && this._pinching) {
            e.preventDefault();
            const dist = this._getTouchDist(e.touches);
            const newScale = Math.max(1, Math.min(5, this._pinchStartScale * (dist / this._pinchStartDist)));
            this._scale = newScale;

            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            this._panX += midX - this._lastPanX;
            this._panY += midY - this._lastPanY;
            this._lastPanX = midX;
            this._lastPanY = midY;

            this._clampPan();
            this._drawCanvas();

            document.getElementById('marker-zoom-reset').style.display = newScale > 1.05 ? 'block' : 'none';
        } else if (e.touches.length === 1 && !this._pinching) {
            const dx = e.touches[0].clientX - this._touchStartX;
            const dy = e.touches[0].clientY - this._touchStartY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                this._touchMoved = true;
            }

            if (this._scale > 1.05) {
                e.preventDefault();
                this._panX += e.touches[0].clientX - this._lastPanX;
                this._panY += e.touches[0].clientY - this._lastPanY;
                this._lastPanX = e.touches[0].clientX;
                this._lastPanY = e.touches[0].clientY;
                this._clampPan();
                this._drawCanvas();
            }
        }
    },

    _onTouchEnd(e) {
        if (this._pinching) {
            this._pinching = false;
            this._pinchEndTime = Date.now();
            if (this._scale < 1.05) {
                this._scale = 1;
                this._panX = 0;
                this._panY = 0;
                this._drawCanvas();
                document.getElementById('marker-zoom-reset').style.display = 'none';
            }
            return;
        }

        // Guard: no marker placement right after pinch
        if (Date.now() - this._pinchEndTime < 350) return;

        // Single tap (non-moved) = place marker
        if (!this._touchMoved && e.changedTouches && e.changedTouches.length === 1) {
            const touch = e.changedTouches[0];
            this._placeMarkerFromEvent(touch.clientX, touch.clientY);
        }
    },

    /**
     * Mouse click (desktop fallback)
     */
    _onCanvasClick(e) {
        // Avoid double-handling on touch devices
        if ('ontouchstart' in window) return;
        this._placeMarkerFromEvent(e.clientX, e.clientY);
    },

    /**
     * Piazza un marker alla posizione schermo (clientX, clientY)
     */
    _placeMarkerFromEvent(clientX, clientY) {
        if (this._selectedDefectIdx < 0) {
            // Auto-select primo non piazzato
            const firstUnplaced = this._defects.findIndex(d => d.x === null);
            if (firstUnplaced >= 0) {
                this._selectDefect(firstUnplaced);
                UI.toast('Difetto #' + this._defects[firstUnplaced].id + ' selezionato');
            } else {
                UI.toast('Tutti i marker sono posizionati');
            }
            return;
        }

        // Calcola coordinate % relative all'immagine
        const rect = this._canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;

        // Rimuovi trasformazioni zoom/pan per ottenere coordinate immagine
        const imgX = (canvasX - this._panX) / this._scale;
        const imgY = (canvasY - this._panY) / this._scale;

        // Percentuali
        const xPct = (imgX / this._canvas.width) * 100;
        const yPct = (imgY / this._canvas.height) * 100;

        // Valida che il tap sia dentro l'immagine
        if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;

        // Salva marker
        const defect = this._defects[this._selectedDefectIdx];
        const currentPhoto = this._photos[this._currentPhotoIdx];

        defect.x = Math.round(xPct * 10) / 10;
        defect.y = Math.round(yPct * 10) / 10;
        defect.photo_id = currentPhoto.filename;

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(30);

        // Redraw
        this._drawCanvas();
        this._renderDefectList();

        // Auto-advance al prossimo non piazzato
        setTimeout(() => {
            const nextUnplaced = this._defects.findIndex(d => d.x === null);
            if (nextUnplaced >= 0) {
                this._selectDefect(nextUnplaced);
            } else {
                this._selectedDefectIdx = -1;
                this._renderDefectList();
                this._drawCanvas();
                const instruction = document.getElementById('marker-instruction');
                if (instruction) instruction.textContent = 'Tutti i marker posizionati!';
            }
        }, 300);
    },

    // ========== ZOOM HELPERS ==========

    _getTouchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },

    _clampPan() {
        if (!this._canvas) return;
        const cW = this._canvas.width;
        const cH = this._canvas.height;

        // Il contenuto zoomato va da (panX, panY) a (panX + cW*scale, panY + cH*scale)
        // Limiti: il bordo sinistro dell'immagine non supera il bordo sinistro del canvas (panX <= 0)
        // e il bordo destro non rientra prima del bordo destro del canvas (panX >= cW*(1-scale))
        const minPanX = Math.min(0, cW * (1 - this._scale));
        const maxPanX = 0;
        const minPanY = Math.min(0, cH * (1 - this._scale));
        const maxPanY = 0;

        this._panX = Math.max(minPanX, Math.min(maxPanX, this._panX));
        this._panY = Math.max(minPanY, Math.min(maxPanY, this._panY));
    },

    // ========== SAVE ==========

    async _save() {
        // Costruisci marker_coords con chiave obs_id + num display
        const markers = {};
        for (const d of this._defects) {
            if (d.x !== null && d.y !== null) {
                markers[d.obs_id] = {
                    x: d.x,
                    y: d.y,
                    photo_id: d.photo_id,
                    num: d.id
                };
            }
        }

        // Salva tramite evento
        await Events.dispatch('save_markers', this._sopId, {
            room_name: this._roomName,
            markers: markers
        });

        UI.toast('Marker salvati');
        this._close();

        // Refresh room card
        const container = document.getElementById('app-content');
        const sop = await DB.getSopralluogo(this._sopId);
        if (sop && container) {
            RoomsView.renderRoomCard(container, sop, this._roomName);
        }
    },

    /**
     * Chiudi il marker tool
     */
    _close() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.add('hidden');
        document.getElementById('modal-content').innerHTML = '';

        // Cleanup
        this._canvas = null;
        this._ctx = null;
        this._img = null;
        this._photos = [];
        this._defects = [];
    },

    // ========== STATIC RENDER (per export DOCX) ==========

    /**
     * Renderizza marker su una foto panoramica e restituisce un Blob JPEG
     * Usato dal generatore DOCX per creare la versione _MARKED
     * @param {Blob} photoBlob - foto originale
     * @param {Object} markers - {"1": {x, y, photo_id}, ...}
     * @param {string} photoFilename - filename della foto corrente
     * @returns {Promise<Blob>} - foto con marker disegnati
     */
    renderMarkersOnPhoto(photoBlob, markers, photoFilename) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(photoBlob);

            img.onload = () => {
                URL.revokeObjectURL(url);

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // Disegna foto originale
                ctx.drawImage(img, 0, 0);

                // Trova marker per questa foto
                const relevantMarkers = [];
                for (const [key, coords] of Object.entries(markers)) {
                    if (coords.photo_id === photoFilename || (!coords.photo_id && Object.keys(markers).length > 0)) {
                        // Usa num (display number) se presente, altrimenti fallback alla chiave
                        const displayId = coords.num != null ? coords.num : key;
                        relevantMarkers.push({ id: displayId, ...coords });
                    }
                }

                if (relevantMarkers.length === 0) {
                    // Nessun marker su questa foto, ritorna originale
                    resolve(photoBlob);
                    return;
                }

                // Dimensioni marker (3.9% del lato minore, minimo 31px — come bot Pillow)
                const w = img.width;
                const h = img.height;
                const radius = Math.max(Math.round(Math.min(w, h) * 0.039), 31);
                const fontSize = Math.round(radius * 0.85);
                const borderWidth = 3;

                for (const m of relevantMarkers) {
                    const px = (m.x / 100) * w;
                    const py = (m.y / 100) * h;

                    // Cerchio bianco con bordo rosso
                    ctx.beginPath();
                    ctx.arc(px, py, radius, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.strokeStyle = '#cc0000';
                    ctx.lineWidth = borderWidth;
                    ctx.stroke();

                    // Numero rosso centrato
                    ctx.fillStyle = '#cc0000';
                    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(m.id, px, py);
                }

                // Esporta come JPEG quality 95% (come bot)
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas toBlob failed'));
                }, 'image/jpeg', 0.95);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(photoBlob); // fallback: ritorna originale
            };

            img.src = url;
        });
    },

    // ========== UTILITY ==========

    _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /**
     * Controlla se un vano ha i requisiti per i marker
     * (almeno 1 panoramica + almeno 1 difetto reale)
     * @param {Object} room - room object dal sopralluogo
     * @param {Array} photos - foto del sopralluogo
     * @param {string} roomName - nome del vano
     * @returns {Object} {canMark, hasPanos, hasDefects, hasMarkers, markerCount, defectCount}
     */
    checkMarkerRequirements(room, photos, roomName, pertinenzaIndex) {
        const pertIdx = pertinenzaIndex != null ? pertinenzaIndex : null;
        const panoPhotos = (photos || []).filter(p =>
            p.room_name === roomName && p.type === 'panoramica' && Photos._matchPert(p, pertIdx)
        );
        const hasPanos = panoPhotos.length > 0;

        const observations = room.observations || [];
        let defectCount = 0;
        for (const obs of observations) {
            const phenom = (obs.phenomenon || '').toUpperCase();
            if (phenom !== 'NDR' && phenom !== 'INGOMBRA' &&
                phenom !== 'NON VISIBILE' && phenom !== 'PARZIALMENTE INGOMBRA') {
                defectCount++;
            }
        }
        const hasDefects = defectCount > 0;
        const markerCoords = room.marker_coords || {};
        const markerCount = Object.keys(markerCoords).length;
        const hasMarkers = markerCount > 0;

        return {
            canMark: hasPanos && hasDefects,
            hasPanos,
            hasDefects,
            hasMarkers,
            markerCount,
            defectCount
        };
    }
};
