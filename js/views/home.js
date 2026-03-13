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
                if (e.target.closest('.sop-hide-btn') || e.target.closest('.sop-restore-btn')) return;

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

        // Bottone: nascondi (👁‍🗨→🙈) o ripristina (🔄)
        let actionBtn = '';
        if (isHidden) {
            actionBtn = `<button class="sop-restore-btn" data-sop-id="${esc(sop.id)}" title="Ripristina">🔄</button>`;
        } else {
            actionBtn = `<button class="sop-hide-btn" data-sop-id="${esc(sop.id)}" title="Nascondi">🙈</button>`;
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
