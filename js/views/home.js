/**
 * home.js - Vista Home: lista sopralluoghi + nuovo + import/export + nascondi/ripristina
 * NOTA: Nessun dato viene MAI cancellato. Il flag "hidden" nasconde dalla lista senza toccare i dati.
 */
const HomeView = {
    /** Flag per mostrare/nascondere i sopralluoghi nascosti */
    _showHidden: false,

    async render(container) {
        UI.setTitle('Testimoniale');
        UI.showBack(false);

        const sopralluoghi = await DB.getAllSopralluoghi();

        // Separa visibili e nascosti
        const visibili = sopralluoghi.filter(s => !s.hidden);
        const nascosti = sopralluoghi.filter(s => s.hidden);
        const inCorso = visibili.filter(s => !s.completed);
        const completati = visibili.filter(s => s.completed);

        let html = '';

        // Bottone nuovo + import
        html += `
            <div style="padding: 16px 16px 8px; display: flex; gap: 8px;">
                <button class="btn btn-primary" id="btn-new-sop" style="flex:1;">Nuovo Testimoniale</button>
                <button class="btn btn-outline" id="btn-import" style="flex:0; min-width:48px;" title="Importa JSON">📥</button>
            </div>
            <div style="padding: 0 16px 16px; display: flex; gap: 8px;">
                <button class="btn btn-outline" id="btn-archive" style="flex:1;">📁 Archivio PC</button>
            </div>
        `;

        // Barra memoria (placeholder, riempita async dopo render)
        html += `<div id="storage-bar-container" style="padding: 0 16px 12px; display:none;"></div>`;

        // In corso
        if (inCorso.length > 0) {
            let cells = '';
            for (const sop of inCorso) {
                const icon = sop.interrupted ? '⏸️' : '🏗️';
                cells += this._buildSopCell(sop, icon, true, false);
            }
            html += UI.section('IN CORSO', cells);
        }

        // Completati
        if (completati.length > 0) {
            let cells = '';
            for (const sop of completati) {
                cells += this._buildSopCell(sop, '✅', false, false);
            }
            html += UI.section('COMPLETATI', cells);
        }

        // Empty state (solo se non ci sono visibili E non ci sono nascosti)
        if (visibili.length === 0 && nascosti.length === 0) {
            html += UI.emptyState(
                '📋',
                'Nessun testimoniale',
                'Tocca "Nuovo Testimoniale" per iniziare un sopralluogo'
            );
        } else if (visibili.length === 0 && nascosti.length > 0) {
            html += UI.emptyState(
                '📋',
                'Nessun testimoniale visibile',
                `Hai ${nascosti.length} testimonial${nascosti.length === 1 ? 'e' : 'i'} nascost${nascosti.length === 1 ? 'o' : 'i'}`
            );
        }

        // Sezione nascosti (toggle)
        if (nascosti.length > 0) {
            const chevron = this._showHidden ? '▼' : '▶';
            html += `
                <div style="padding: 12px 16px;">
                    <button class="btn btn-outline" id="btn-toggle-hidden" style="width:100%; font-size:13px;">
                        ${chevron} Nascosti (${nascosti.length})
                    </button>
                </div>
            `;

            if (this._showHidden) {
                let hiddenCells = '';
                for (const sop of nascosti) {
                    const icon = sop.completed ? '✅' : '🏗️';
                    hiddenCells += this._buildSopCell(sop, icon, !sop.completed, true);
                }
                html += UI.section('NASCOSTI', hiddenCells);
            }
        }

        // Footer versione
        html += `<div style="text-align:center; padding:24px; color:var(--text-hint); font-size:12px;">Testimoniale WebApp v2.0</div>`;

        container.innerHTML = html;

        // Barra memoria (async)
        this._renderStorageBar();

        // Event: nuovo sopralluogo
        document.getElementById('btn-new-sop').addEventListener('click', async () => {
            const id = await Events.createSopralluogo({});
            App.navigate(`setup/${id}`);
        });

        // Event: import JSON
        document.getElementById('btn-import').addEventListener('click', () => {
            this._importJSON();
        });

        // Event: archivio PC
        document.getElementById('btn-archive').addEventListener('click', () => {
            App.navigate('archive');
        });

        // Event: toggle nascosti
        const btnToggle = document.getElementById('btn-toggle-hidden');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                this._showHidden = !this._showHidden;
                this.render(document.getElementById('app-content'));
            });
        }

        // Event: click su sopralluogo (navigazione)
        container.querySelectorAll('.cell[data-id]').forEach(cell => {
            cell.addEventListener('click', (e) => {
                // Se il click è su un bottone azione, non navigare
                if (e.target.closest('.sop-hide-btn') || e.target.closest('.sop-restore-btn') || e.target.closest('.sop-delete-btn')) return;

                const id = cell.dataset.id;
                DB.getSopralluogo(id).then(sop => {
                    if (!sop) return;
                    if (sop.completed) {
                        App.navigate(`review/${id}`);
                    } else if (sop.phase === 1) {
                        App.navigate(`setup/${id}`);
                    } else if (sop.phase === 2) {
                        App.navigate(`rooms/${id}`);
                    } else {
                        App.navigate(`review/${id}`);
                    }
                });
            });
        });

        // Event: nascondi sopralluogo (solo flag hidden=true, NESSUN dato cancellato)
        container.querySelectorAll('.sop-hide-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sopId = btn.dataset.sopId;
                this._toggleHidden(sopId, true);
            });
        });

        // Event: ripristina sopralluogo (hidden=false)
        container.querySelectorAll('.sop-restore-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sopId = btn.dataset.sopId;
                this._toggleHidden(sopId, false);
            });
        });

        // Event: libera spazio foto
        container.querySelectorAll('.sop-purge-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sopId = btn.dataset.sopId;
                await this._showPurgeDialog(sopId);
            });
        });

        // Event: elimina sopralluogo dal dispositivo (solo se già sincronizzato)
        container.querySelectorAll('.sop-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sopId = btn.dataset.sopId;
                UI.confirmAction(
                    'Vuoi eliminare questo sopralluogo dal dispositivo?\n\nI dati sono già salvati sul server.',
                    () => this._deleteSopralluogo(sopId)
                );
            });
        });
    },

    /**
     * Imposta il flag hidden su un sopralluogo. NON cancella nessun dato.
     */
    async _toggleHidden(sopId, hide) {
        try {
            const sop = await DB.getSopralluogo(sopId);
            if (!sop) return;
            sop.hidden = hide;
            await DB.saveSopralluogo(sop);
            UI.toast(hide ? 'Nascosto dall\'elenco' : 'Ripristinato nell\'elenco');
            this.render(document.getElementById('app-content'));
        } catch (err) {
            console.error('Toggle hidden error:', err);
            UI.toast('Errore');
        }
    },

    /**
     * Mostra la barra di utilizzo memoria (IndexedDB) nella home.
     * Usa navigator.storage.estimate() per leggere uso/quota reali.
     */
    async _renderStorageBar() {
        const container = document.getElementById('storage-bar-container');
        if (!container) return;

        try {
            if (!navigator.storage || !navigator.storage.estimate) {
                // Browser non supporta Storage API — nascondi
                return;
            }

            const est = await navigator.storage.estimate();
            const usage = est.usage || 0;
            const quota = est.quota || 1;
            const pct = Math.min(Math.round((usage / quota) * 100), 100);

            // Formatta dimensioni leggibili
            const formatSize = (bytes) => {
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
                if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
                return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
            };

            // Colore: verde (0-60%), giallo (60-80%), rosso (80%+)
            let barColor = '#4caf50';
            let textColor = '#555';
            if (pct >= 80) {
                barColor = '#f44336';
                textColor = '#d32f2f';
            } else if (pct >= 60) {
                barColor = '#ff9800';
                textColor = '#e65100';
            }

            let html = `
                <div style="background: #f5f5f5; border-radius: 8px; padding: 10px 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 12px; font-weight: 600; color: ${textColor};">Memoria</span>
                        <span style="font-size: 11px; color: ${textColor};">${formatSize(usage)} / ${formatSize(quota)} (${pct}%)</span>
                    </div>
                    <div style="background: #e0e0e0; border-radius: 4px; height: 8px; overflow: hidden;">
                        <div style="background: ${barColor}; height: 100%; width: ${pct}%; border-radius: 4px; transition: width 0.3s;"></div>
                    </div>`;

            // Avviso quando spazio critico (80%+)
            if (pct >= 80) {
                html += `
                    <div style="margin-top: 8px; font-size: 11px; color: #d32f2f; font-weight: 500;">
                        ⚠️ Spazio quasi pieno. Libera spazio foto (📸) sui sopralluoghi sincronizzati.
                    </div>`;
            }

            html += `</div>`;

            container.innerHTML = html;
            container.style.display = 'block';
        } catch (err) {
            console.warn('Storage estimate non disponibile:', err);
        }
    },

    /**
     * Elimina un sopralluogo da IndexedDB (sopralluogo + eventi + foto).
     * Solo per sopralluoghi già sincronizzati — i dati sono al sicuro sul server.
     */
    async _deleteSopralluogo(sopId) {
        try {
            await DB.deleteSopralluogo(sopId);
            UI.toast('Sopralluogo eliminato dal dispositivo');
            this.render(document.getElementById('app-content'));
        } catch (err) {
            console.error('Delete sopralluogo error:', err);
            UI.toast('Errore durante l\'eliminazione');
        }
    },

    /**
     * Mostra dialog di conferma per purge foto con statistiche reali.
     */
    async _showPurgeDialog(sopId) {
        try {
            const stats = await DB.getPhotoStats(sopId);
            if (stats.count === 0) {
                UI.toast('Nessuna foto presente sul dispositivo');
                return;
            }

            const formatSize = (bytes) => {
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
                if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
                return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
            };

            const sizeStr = formatSize(stats.totalBytes);
            let detailLines = [];
            if (stats.panoramiche > 0) detailLines.push(`${stats.panoramiche} panoramiche`);
            if (stats.dettaglio > 0) detailLines.push(`${stats.dettaglio} dettaglio`);
            if (stats.planimetrie > 0) detailLines.push(`${stats.planimetrie} planimetrie`);

            const msg = `Verranno eliminate ${stats.count} foto (${sizeStr}) dal dispositivo.\n\n` +
                `${detailLines.join(', ')}.\n\n` +
                `Le note e i dati del sopralluogo restano.\n` +
                `Le foto restano sul server.\n\n` +
                `⚠️ ATTENZIONE: Dopo la liberazione delle foto, questo sopralluogo NON potrà essere ri-sincronizzato.\n` +
                `Se dovrai tornare sullo stesso edificio, apri un nuovo sopralluogo.\n\n` +
                `Verifica sul server che le foto siano presenti prima di procedere!`;

            UI.confirmAction(msg, () => this._purgePhotos(sopId));
        } catch (err) {
            console.error('Errore dialog purge:', err);
            UI.toast('Errore nel calcolo spazio');
        }
    },

    /** Guard anti double-click per purge */
    _purging: false,

    /**
     * Esegue il purge di tutte le foto di un sopralluogo.
     * Imposta flag photosPurged sul sopralluogo.
     */
    async _purgePhotos(sopId) {
        if (this._purging) return;
        this._purging = true;
        try {
            const result = await DB.purgeAllPhotos(sopId);
            if (result.count === 0) {
                UI.toast('Nessuna foto da eliminare');
                return;
            }

            // Imposta flag sul sopralluogo
            const sop = await DB.getSopralluogo(sopId);
            if (sop) {
                sop.photosPurged = true;
                await DB.saveSopralluogo(sop);
            }

            const formatSize = (bytes) => {
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
                if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
                return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
            };

            UI.toast(`${result.count} foto eliminate (${formatSize(result.totalBytes)} liberati)`, 4000);
            // Re-render immediato + refresh barra dopo 1s (IndexedDB rilascia spazio con ritardo)
            this.render(document.getElementById('app-content'));
            setTimeout(() => this._renderStorageBar(), 1000);
        } catch (err) {
            console.error('Errore purge foto:', err);
            UI.toast('Errore durante l\'eliminazione delle foto');
        } finally {
            this._purging = false;
        }
    },

    /**
     * Costruisce HTML cella sopralluogo con bottone nascondi o ripristina
     */
    _buildSopCell(sop, icon, showDetails, isHidden) {
        const esc = UI._escapeHtml;
        const roomCount = Object.keys(sop.rooms || {}).length;
        const unitLabel = sop.manual_unit_type || sop.unit_type || '';
        const floorLabel = sop.floor || '';
        const title = `${sop.building_code || '???'} - ${unitLabel}`;

        let subtitle = '';
        if (showDetails) {
            const pertCount = (sop.pertinenze || []).length;
            const phaseLabel = sop.phase === 1 ? 'Anagrafica' : sop.phase === 2 ? 'Sopralluogo' : 'Revisione';
            subtitle = `${floorLabel} | ${sop.unit_internal || sop.subalterno || ''} | ${roomCount} vani`;
            if (pertCount > 0) subtitle += ` | ${pertCount} pert.`;
            subtitle += ` | ${phaseLabel}`;
        } else {
            subtitle = `${floorLabel} | ${roomCount} vani`;
        }
        if (sop.photosPurged) {
            subtitle += ' | 📸 Foto liberate';
        }

        // Bottoni azione: nascondi/ripristina + elimina (solo se sincronizzato)
        let actionBtn = '';
        if (isHidden) {
            actionBtn = `<button class="sop-restore-btn" data-sop-id="${esc(sop.id)}" title="Ripristina">🔄</button>`;
        } else {
            actionBtn = `<button class="sop-hide-btn" data-sop-id="${esc(sop.id)}" title="Nascondi">🙈</button>`;
        }
        // Libera spazio foto: solo per sopralluoghi sincronizzati e con foto
        if (sop.synced && !sop.photosPurged) {
            actionBtn += `<button class="sop-purge-btn" data-sop-id="${esc(sop.id)}" title="Libera spazio foto">📸</button>`;
        }
        // Cestino: solo per sopralluoghi già sincronizzati
        if (sop.synced) {
            actionBtn += `<button class="sop-delete-btn" data-sop-id="${esc(sop.id)}" title="Elimina dal dispositivo">🗑️</button>`;
        }

        return `
            <div class="cell${isHidden ? ' cell-hidden' : ''}" data-id="${esc(sop.id)}">
                <div class="cell-icon">${icon}</div>
                <div class="cell-body">
                    <div class="cell-title">${esc(title)}</div>
                    <div class="cell-subtitle">${esc(subtitle)}</div>
                </div>
                ${actionBtn}
                <span class="cell-chevron">&#8250;</span>
            </div>
        `;
    },

    /**
     * Import JSON backup
     */
    _importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.id && data.building_code) {
                    // Single sopralluogo
                    await DB.saveSopralluogo(data);
                    UI.toast('Sopralluogo importato');
                    this.render(document.getElementById('app-content'));
                } else if (Array.isArray(data)) {
                    for (const sop of data) {
                        if (sop.id) await DB.saveSopralluogo(sop);
                    }
                    UI.toast(`${data.length} sopralluoghi importati`);
                    this.render(document.getElementById('app-content'));
                } else {
                    UI.toast('Formato non riconosciuto');
                }
            } catch (err) {
                console.error('Import error:', err);
                UI.toast('Errore durante l\'importazione');
            }
        };
        input.click();
    }
};
