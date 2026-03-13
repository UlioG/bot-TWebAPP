/**
 * archive.js - Archivio sopralluoghi: locale (IndexedDB) + server (API PC)
 *
 * Tab "Locale": sopralluoghi salvati sul telefono (come prima)
 * Tab "Archivio PC": navigazione gerarchica archivio sul PC via API tunnel
 * Ricerca fuzzy: usa endpoint D3 /api/archive/search
 *
 * A3: Upload file nell'archivio
 * A5: Cerca planimetrie per codice/piano/unita
 * A6+A8: Ricostruzione sessione e resume cross-device
 */
const ArchiveView = {
    _activeTab: 'local', // 'local' | 'server'
    _serverPath: '',     // percorso corrente nella navigazione server
    _serverEntries: [],  // entries correnti dal server
    _container: null,

    async render(container) {
        this._container = container;
        UI.setTitle('Archivio');
        UI.showBack(true, () => {
            if (this._activeTab === 'server' && this._serverPath) {
                // Back nella navigazione server: torna su di un livello
                const parts = this._serverPath.split('/').filter(Boolean);
                parts.pop();
                this._serverPath = parts.join('/');
                this._renderServerTab();
            } else {
                App.navigate('home');
            }
        });

        const hasAPI = typeof Sync !== 'undefined' && Sync._isAPIAvailable();

        let html = '';

        // Tab switcher (solo se API disponibile)
        if (hasAPI) {
            html += `<div style="display:flex; padding:8px 16px; gap:4px;">
                <button class="btn ${this._activeTab === 'local' ? 'btn-primary' : 'btn-outline'}"
                    id="tab-local" style="flex:1; font-size:13px;">
                    Locale
                </button>
                <button class="btn ${this._activeTab === 'server' ? 'btn-primary' : 'btn-outline'}"
                    id="tab-server" style="flex:1; font-size:13px;">
                    Archivio PC
                </button>
            </div>`;
        }

        // Barra ricerca
        html += `<div style="padding: 4px 16px;">
            <input class="form-input" type="text" id="archive-search"
                placeholder="${this._activeTab === 'server' ? 'Cerca in archivio PC (codice, piano, unita)...' : 'Cerca per codice, indirizzo, tipo...'}">
        </div>`;

        // Container per il contenuto del tab
        html += '<div id="archive-content"></div>';

        container.innerHTML = html;

        // Tab events
        document.getElementById('tab-local')?.addEventListener('click', () => {
            this._activeTab = 'local';
            this.render(container);
        });
        document.getElementById('tab-server')?.addEventListener('click', () => {
            this._activeTab = 'server';
            this._serverPath = '';
            this.render(container);
        });

        // Render tab attivo
        if (this._activeTab === 'server' && hasAPI) {
            await this._renderServerTab();
            this._bindServerSearch();
        } else {
            this._activeTab = 'local';
            await this._renderLocalTab();
        }
    },

    // ========== TAB LOCALE (IndexedDB) ==========

    async _renderLocalTab() {
        const sopralluoghi = await DB.getAllSopralluoghi();
        const content = document.getElementById('archive-content');
        if (!content) return;

        if (sopralluoghi.length === 0) {
            content.innerHTML = this._emptyState('Archivio locale vuoto', 'I sopralluoghi appariranno qui dopo il primo testimoniale');
        } else {
            content.innerHTML = `<div id="archive-list">${this._renderLocalList(sopralluoghi)}</div>
                <div style="text-align:center; padding:16px; color:var(--hint); font-size:12px;">
                    Totale locale: ${sopralluoghi.length} sopralluoghi
                </div>`;
        }

        // Search filter locale
        document.getElementById('archive-search')?.addEventListener('input', (e) => {
            const q = e.target.value.trim().toUpperCase();
            const filtered = q
                ? sopralluoghi.filter(s =>
                    (s.building_code || '').toUpperCase().includes(q) ||
                    (s.unit_name || '').toUpperCase().includes(q) ||
                    (s.building_address || '').toUpperCase().includes(q) ||
                    (s.unit_type || '').toUpperCase().includes(q)
                )
                : sopralluoghi;

            const list = document.getElementById('archive-list');
            if (list) {
                list.innerHTML = this._renderLocalList(filtered);
                this._bindLocalList();
            }
        });

        this._bindLocalList();
    },

    _renderLocalList(items) {
        if (items.length === 0) return '<div style="text-align:center; color:var(--hint); padding:16px;">Nessun risultato</div>';

        let cells = '';
        for (const sop of items) {
            const roomCount = Object.keys(sop.rooms || {}).length;
            const date = sop.created_at ? new Date(sop.created_at).toLocaleDateString('it-IT') : '-';
            const icon = sop.completed ? '\u2705' : '\uD83C\uDFD7\uFE0F';
            const unitLabel = sop.manual_unit_type || sop.unit_name || sop.unit_type || '';

            cells += UI.cell({
                icon: icon,
                title: `${sop.building_code || '?'} - ${unitLabel}`,
                subtitle: `${sop.floor || ''} | ${roomCount} vani | ${date}`,
                dataId: sop.id
            });
        }
        return `<div class="section"><div class="section-body">${cells}</div></div>`;
    },

    _bindLocalList() {
        document.querySelectorAll('#archive-list .cell[data-id]').forEach(cell => {
            cell.addEventListener('click', () => {
                App.navigate(`review/${cell.dataset.id}`);
            });
        });
    },

    // ========== TAB SERVER (API archivio PC) ==========

    async _renderServerTab() {
        const content = document.getElementById('archive-content');
        if (!content) return;

        content.innerHTML = '<div style="text-align:center; padding:32px; color:var(--hint);">Caricamento...</div>';

        try {
            const resp = await Sync._apiFetch(
                `/api/archive/list?path=${encodeURIComponent(this._serverPath)}`,
                { headers: Sync._getAuthHeaders() }
            );

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${resp.status}`);
            }

            const data = await resp.json();
            this._serverEntries = data.entries || [];

            let listHtml = '';

            if (this._serverEntries.length === 0) {
                listHtml = this._emptyState(
                    this._serverPath ? 'Cartella vuota' : 'Archivio PC vuoto',
                    this._serverPath ? 'Nessun file in questa directory' : 'Nessun sopralluogo salvato sul PC'
                );
            } else {
                listHtml = this._renderServerList(this._serverEntries);
            }

            // A6+A8: Bottone "Riprendi Sopralluogo" se siamo in una dir unita (ha unit_info.json)
            const isUnitDir = this._isUnitDir(this._serverEntries);
            let actionBtns = '';

            if (isUnitDir && this._serverPath) {
                actionBtns += `<div style="padding: 8px 16px; display:flex; flex-direction:column; gap:6px;">
                    <button class="btn btn-primary" id="btn-reconstruct">
                        🔄 Riprendi Sopralluogo
                    </button>
                    <div style="font-size:11px; color:var(--hint); text-align:center;">
                        Ricostruisce il sopralluogo dall'archivio PC e lo importa sul telefono
                    </div>
                </div>`;
            }

            // A3: Bottone upload se siamo in una sottocartella
            if (this._serverPath) {
                actionBtns += `<div style="padding: 4px 16px;">
                    <button class="btn btn-outline" id="btn-upload-file" style="width:100%; font-size:13px;">
                        📤 Carica file in questa cartella
                    </button>
                </div>`;
            }

            // A5: Bottone planimetrie (sempre visibile nel server tab)
            actionBtns += `<div style="padding: 4px 16px;">
                <button class="btn btn-outline" id="btn-search-planimetrie" style="width:100%; font-size:13px;">
                    🗺️ Cerca Planimetrie
                </button>
            </div>`;

            // Stats
            const stats = `<div style="text-align:center; padding:8px; color:var(--hint); font-size:12px;">
                ${this._serverPath ? '\uD83D\uDCC2 ' + this._serverPath : '\uD83D\uDDA5\uFE0F Archivio PC'} | ${this._serverEntries.length} elementi
            </div>`;

            content.innerHTML = listHtml + actionBtns + stats;

            this._bindServerList();
            this._bindServerActions();
        } catch (e) {
            console.error('Errore caricamento archivio server:', e);
            content.innerHTML = `<div style="text-align:center; padding:32px;">
                <div style="font-size:24px;">\u26A0\uFE0F</div>
                <div style="color:var(--hint); margin-top:8px;">Errore connessione al PC</div>
                <div style="color:var(--hint); font-size:12px; margin-top:4px;">${this._escapeHtml(e.message)}</div>
                <button class="btn btn-outline" id="btn-retry-server" style="margin-top:16px;">Riprova</button>
            </div>`;
            document.getElementById('btn-retry-server')?.addEventListener('click', () => this._renderServerTab());
        }
    },

    _renderServerList(entries) {
        let cells = '';

        // Pulsante "Su" se siamo in una sottocartella
        if (this._serverPath) {
            cells += `<div class="cell" data-action="go-up" style="cursor:pointer;">
                <div class="cell-icon">\u2B06\uFE0F</div>
                <div class="cell-body">
                    <div class="cell-title" style="color:var(--accent);">.. Torna su</div>
                </div>
            </div>`;
        }

        for (const entry of entries) {
            const isDir = entry.type === 'dir';
            const icon = this._getEntryIcon(entry);
            const modified = entry.modified ? new Date(entry.modified).toLocaleDateString('it-IT') : '';

            let subtitle = modified;
            if (!isDir && entry.size) {
                subtitle += ` | ${this._formatSize(entry.size)}`;
            }
            if (entry.owner) {
                subtitle += ` | ${entry.owner}`;
            }
            if (entry.address) {
                subtitle = entry.address + (subtitle ? ' | ' + subtitle : '');
            }

            const dataPath = this._serverPath ? `${this._serverPath}/${entry.name}` : entry.name;

            cells += `<div class="cell" data-server-path="${this._escapeAttr(dataPath)}"
                data-entry-type="${entry.type}" data-entry-name="${this._escapeAttr(entry.name)}"
                style="cursor:pointer;">
                <div class="cell-icon">${icon}</div>
                <div class="cell-body">
                    <div class="cell-title">${this._escapeHtml(entry.name)}</div>
                    <div class="cell-subtitle">${this._escapeHtml(subtitle)}</div>
                </div>
                ${isDir ? '<div class="cell-chevron">\u203A</div>' : ''}
            </div>`;
        }

        return `<div class="section"><div class="section-body" id="archive-list">${cells}</div></div>`;
    },

    _bindServerList() {
        // Go up
        document.querySelector('[data-action="go-up"]')?.addEventListener('click', () => {
            const parts = this._serverPath.split('/').filter(Boolean);
            parts.pop();
            this._serverPath = parts.join('/');
            this._renderServerTab();
        });

        // Navigate/download entries
        document.querySelectorAll('[data-server-path]').forEach(cell => {
            cell.addEventListener('click', () => {
                const path = cell.dataset.serverPath;
                const type = cell.dataset.entryType;
                const name = cell.dataset.entryName;

                if (type === 'dir') {
                    this._serverPath = path;
                    this._renderServerTab();
                } else {
                    // Download file
                    this._downloadServerFile(path, name);
                }
            });
        });
    },

    /**
     * Bind bottoni azione: upload, planimetrie, reconstruct
     */
    _bindServerActions() {
        // A3: Upload file
        document.getElementById('btn-upload-file')?.addEventListener('click', () => {
            this._uploadFileToServer();
        });

        // A5: Cerca planimetrie
        document.getElementById('btn-search-planimetrie')?.addEventListener('click', () => {
            this._showPlanimetrieSearch();
        });

        // A6+A8: Ricostruzione sessione
        document.getElementById('btn-reconstruct')?.addEventListener('click', () => {
            this._reconstructSession();
        });
    },

    _bindServerSearch() {
        const searchInput = document.getElementById('archive-search');
        if (!searchInput) return;

        let debounceTimer = null;

        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim();

            // Debounce 500ms
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                if (q.length >= 2) {
                    await this._searchServer(q);
                } else if (q.length === 0) {
                    // Resetta a navigazione normale
                    this._serverPath = '';
                    await this._renderServerTab();
                }
            }, 500);
        });
    },

    async _searchServer(query) {
        const content = document.getElementById('archive-content');
        if (!content) return;

        content.innerHTML = '<div style="text-align:center; padding:32px; color:var(--hint);">Ricerca...</div>';

        try {
            const resp = await Sync._apiFetch(
                `/api/archive/search?q=${encodeURIComponent(query)}`,
                { headers: Sync._getAuthHeaders() }
            );

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            const results = data.results || [];

            if (results.length === 0) {
                content.innerHTML = this._emptyState(
                    'Nessun risultato',
                    `Nessun sopralluogo trovato per "${query}"`
                );
                return;
            }

            let cells = '';
            for (const r of results) {
                const icon = r.has_reports ? '\u2705' : '\uD83D\uDCC1';
                cells += `<div class="cell" data-search-path="${this._escapeAttr(r.path)}" style="cursor:pointer;">
                    <div class="cell-icon">${icon}</div>
                    <div class="cell-body">
                        <div class="cell-title">${this._escapeHtml(r.building_code)} - ${this._escapeHtml(r.unit_name)}</div>
                        <div class="cell-subtitle">${this._escapeHtml(r.floor)}${r.owner ? ' | ' + this._escapeHtml(r.owner) : ''}${r.address ? ' | ' + this._escapeHtml(r.address) : ''} | ${r.room_count} vani</div>
                    </div>
                    <div class="cell-chevron">\u203A</div>
                </div>`;
            }

            content.innerHTML = `<div class="section">
                <div class="section-header">RISULTATI (${results.length})</div>
                <div class="section-body">${cells}</div>
            </div>`;

            // Bind click: naviga nella directory dell'unita
            document.querySelectorAll('[data-search-path]').forEach(cell => {
                cell.addEventListener('click', () => {
                    this._serverPath = cell.dataset.searchPath;
                    this._renderServerTab();
                    // Pulisci la barra di ricerca
                    const input = document.getElementById('archive-search');
                    if (input) input.value = '';
                });
            });
        } catch (e) {
            console.error('Errore ricerca archivio:', e);
            content.innerHTML = `<div style="text-align:center; padding:32px; color:var(--hint);">
                Errore ricerca: ${this._escapeHtml(e.message)}
            </div>`;
        }
    },

    async _downloadServerFile(path, filename) {
        if (typeof Sync !== 'undefined') {
            UI.toast('Download in corso...');
            const ok = await Sync.downloadFile(path, filename);
            if (ok) {
                UI.toast(`Scaricato: ${filename}`);
            }
        } else {
            UI.toast('Sync non disponibile');
        }
    },

    // ========== A3: UPLOAD FILE ==========

    _uploadFileToServer() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            UI.toast('Caricamento in corso...');

            try {
                const formData = new FormData();
                formData.append('file', file, file.name);
                formData.append('path', this._serverPath);

                const resp = await Sync._apiFetch('/api/archive/upload', {
                    method: 'POST',
                    headers: Sync._getAuthHeaders(),
                    body: formData
                });

                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${resp.status}`);
                }

                const result = await resp.json();
                UI.toast(`File caricato: ${result.filename} (${this._formatSize(result.size)})`);

                // Ricarica la lista
                await this._renderServerTab();
            } catch (err) {
                console.error('Errore upload:', err);
                UI.toast('Errore caricamento: ' + err.message);
            }
        };
        input.click();
    },

    // ========== A5: CERCA PLANIMETRIE ==========

    _showPlanimetrieSearch() {
        // Estrai codice dal path corrente se disponibile
        const pathParts = this._serverPath.split('/').filter(Boolean);
        const defaultCode = pathParts[0] || '';

        let html = `
            <div class="modal-title">Cerca Planimetrie</div>
            <div style="padding: 0 16px;">
                ${UI.formInput({ label: 'Codice Fabbricato *', id: 'plan-code', value: defaultCode, placeholder: 'Es. 0010A' }).trim()}
                ${UI.formInput({ label: 'Piano (opzionale)', id: 'plan-floor', placeholder: 'Es. PT, Piano 1' }).trim()}
                ${UI.formInput({ label: 'Unita (opzionale)', id: 'plan-unit', placeholder: 'Es. Sub. 3, Parti Comuni' }).trim()}
            </div>
            <div style="padding: 16px; display:flex; gap:8px;">
                <button class="btn btn-primary" id="plan-search-btn" style="flex:1;">Cerca</button>
                <button class="btn btn-secondary" id="plan-cancel-btn" style="flex:0;">Annulla</button>
            </div>
            <div id="plan-results"></div>
        `;

        UI.showModal(html);

        document.getElementById('plan-cancel-btn')?.addEventListener('click', () => UI.hideModal());
        document.getElementById('plan-search-btn')?.addEventListener('click', () => this._executePlanimetrieSearch());
    },

    async _executePlanimetrieSearch() {
        const code = document.getElementById('plan-code')?.value.trim();
        const floor = document.getElementById('plan-floor')?.value.trim() || '';
        const unit = document.getElementById('plan-unit')?.value.trim() || '';

        if (!code) {
            UI.toast('Inserisci il codice fabbricato');
            return;
        }

        const resultsDiv = document.getElementById('plan-results');
        if (resultsDiv) resultsDiv.innerHTML = '<div style="text-align:center; padding:16px; color:var(--hint);">Ricerca...</div>';

        try {
            let url = `/api/archive/planimetrie?code=${encodeURIComponent(code)}`;
            if (floor) url += `&floor=${encodeURIComponent(floor)}`;
            if (unit) url += `&unit=${encodeURIComponent(unit)}`;

            const resp = await Sync._apiFetch(url, { headers: Sync._getAuthHeaders() });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            const results = data.results || [];

            if (results.length === 0) {
                if (resultsDiv) resultsDiv.innerHTML = '<div style="text-align:center; padding:16px; color:var(--hint);">Nessuna planimetria trovata</div>';
                return;
            }

            let listHtml = `<div style="padding: 8px 16px;"><div class="section-header">PLANIMETRIE (${results.length})</div></div>`;
            for (const r of results) {
                const label = r.is_planimetria ? '🗺️' : '🖼️';
                const loc = `${r.building_code}/${r.floor}/${r.unit_name}${r.room_name ? '/' + r.room_name : ''}`;
                listHtml += `<div class="cell" data-plan-path="${this._escapeAttr(r.path)}"
                    data-plan-name="${this._escapeAttr(r.filename)}" style="cursor:pointer; margin:0 16px;">
                    <div class="cell-icon">${label}</div>
                    <div class="cell-body">
                        <div class="cell-title">${this._escapeHtml(r.filename)}</div>
                        <div class="cell-subtitle">${this._escapeHtml(loc)} | ${this._formatSize(r.size)}</div>
                    </div>
                </div>`;
            }

            if (resultsDiv) {
                resultsDiv.innerHTML = listHtml;
                resultsDiv.querySelectorAll('[data-plan-path]').forEach(cell => {
                    cell.addEventListener('click', () => {
                        UI.hideModal();
                        this._downloadServerFile(cell.dataset.planPath, cell.dataset.planName);
                    });
                });
            }
        } catch (err) {
            console.error('Errore ricerca planimetrie:', err);
            if (resultsDiv) resultsDiv.innerHTML = `<div style="text-align:center; padding:16px; color:var(--hint);">Errore: ${this._escapeHtml(err.message)}</div>`;
        }
    },

    // ========== A6+A8: RICOSTRUZIONE SESSIONE ==========

    async _reconstructSession() {
        if (!this._serverPath) return;

        UI.confirmAction(
            'Ricostruire il sopralluogo dall\'archivio PC?\n\n' +
            'I dati verranno importati sul telefono e potrai continuare il sopralluogo o rigenerare i documenti.',
            async () => {
                UI.toast('Ricostruzione in corso...');

                try {
                    const resp = await Sync._apiFetch('/api/archive/reconstruct', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...Sync._getAuthHeaders()
                        },
                        body: JSON.stringify({ path: this._serverPath })
                    });

                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        throw new Error(err.error || `HTTP ${resp.status}`);
                    }

                    const data = await resp.json();
                    const sop = data.sopralluogo;
                    const photosList = data.photos || [];

                    if (!sop || !sop.id) {
                        throw new Error('Dati sopralluogo non validi');
                    }

                    // Salva sopralluogo in IndexedDB
                    sop.created_at = Date.now();
                    sop.synced = false;
                    await DB.saveSopralluogo(sop);

                    // Scarica le foto dall'archivio e salvale in IndexedDB
                    let photosDownloaded = 0;
                    for (const photoInfo of photosList) {
                        try {
                            const photoResp = await Sync._apiFetch(
                                `/api/archive/download?path=${encodeURIComponent(photoInfo.path)}`,
                                { headers: Sync._getAuthHeaders() }
                            );

                            if (photoResp.ok) {
                                const blob = await photoResp.blob();
                                // Genera thumbnail
                                let thumbnail = null;
                                try {
                                    thumbnail = await this._generateThumbnail(blob);
                                } catch (e) { /* skip thumbnail */ }

                                const photoEntry = {
                                    id: (typeof Events !== 'undefined' ? Events.uuid() : crypto.randomUUID()),
                                    sopralluogo_id: sop.id,
                                    room_name: photoInfo.room_name,
                                    type: photoInfo.type || 'dettaglio',
                                    filename: photoInfo.filename,
                                    observation_key: photoInfo.observation_index != null ? `obs_${photoInfo.observation_index}` : null,
                                    pertinenza_index: null,
                                    blob: blob,
                                    thumbnail: thumbnail,
                                    created_at: Date.now(),
                                    synced: true
                                };

                                await DB.addPhoto(photoEntry);
                                photosDownloaded++;
                            }
                        } catch (photoErr) {
                            console.warn('Errore download foto:', photoInfo.filename, photoErr);
                        }
                    }

                    UI.toast(`Sopralluogo importato: ${Object.keys(sop.rooms || {}).length} vani, ${photosDownloaded} foto`);

                    // Naviga al sopralluogo
                    App.navigate(`rooms/${sop.id}`);

                } catch (err) {
                    console.error('Errore ricostruzione:', err);
                    UI.toast('Errore ricostruzione: ' + err.message);
                }
            }
        );
    },

    /**
     * Genera thumbnail da un blob immagine
     */
    _generateThumbnail(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const MAX = 200;
                    let w = img.width, h = img.height;
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else { w = Math.round(w * MAX / h); h = MAX; }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    canvas.toBlob(thumbBlob => {
                        URL.revokeObjectURL(img.src);
                        resolve(thumbBlob);
                    }, 'image/jpeg', 0.6);
                } catch (e) {
                    URL.revokeObjectURL(img.src);
                    reject(e);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('Thumbnail generation failed'));
            };
            img.src = URL.createObjectURL(blob);
        });
    },

    // ========== HELPERS ==========

    /**
     * Rileva se la directory corrente e' una directory unita (ha unit_info.json o entries con owner)
     */
    _isUnitDir(entries) {
        // Se almeno un entry ha owner (arricchito da unit_info.json nella parent) O
        // se c'e' un file unit_info.json
        if (entries.some(e => e.name === 'unit_info.json')) return true;
        // Se il path ha 3 livelli (code/floor/unit), e' probabilmente una unita
        const depth = this._serverPath.split('/').filter(Boolean).length;
        return depth >= 3;
    },

    _getEntryIcon(entry) {
        if (entry.type === 'dir') {
            if (entry.owner !== undefined) return '\uD83C\uDFE0'; // unita con unit_info
            return '\uD83D\uDCC1'; // cartella generica
        }
        const name = (entry.name || '').toLowerCase();
        if (name.endsWith('.docx') || name.endsWith('.doc')) return '\uD83D\uDCC4';
        if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) return '\uD83D\uDDBC\uFE0F';
        if (name.endsWith('.json')) return '\uD83D\uDCCB';
        if (name.endsWith('.pdf')) return '\uD83D\uDCD5';
        return '\uD83D\uDCC3';
    },

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    _emptyState(title, subtitle) {
        return `<div style="text-align:center; padding:48px 16px;">
            <div style="font-size:48px;">\uD83D\uDCE6</div>
            <div style="font-size:16px; font-weight:600; margin-top:12px; color:var(--text);">${this._escapeHtml(title)}</div>
            <div style="font-size:13px; color:var(--hint); margin-top:4px;">${this._escapeHtml(subtitle)}</div>
        </div>`;
    },

    _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _escapeAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};
