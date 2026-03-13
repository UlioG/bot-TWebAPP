/**
 * review.js - Fase 3: Riepilogo, chiusura, firme, export JSON, DOCX
 * Usa Formatters.js come source of truth per testo
 * Supporta: cappello, chiusura, pertinenze, allontana events, RM toggle
 */
const ReviewView = {
    sopId: null,

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.setTitle('Riepilogo');
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        const esc = UI._escapeHtml;
        const rooms = sop.rooms || {};
        const roomNames = Object.keys(rooms);

        let html = '';

        // Info card
        html += UI.infoCard([
            { label: 'Codice', value: sop.building_code || '' },
            { label: 'Indirizzo', value: sop.building_address || '' },
            { label: 'Unita\'', value: sop.manual_unit_type || sop.unit_name || sop.unit_type || '' },
            { label: 'Piano', value: sop.floor || '' }
        ]);

        // Statistiche
        let totalObs = 0, totalPhotos = 0;
        for (const name of roomNames) {
            totalObs += (rooms[name].observations || []).length;
            totalPhotos += (rooms[name].photos || []).length;
        }
        html += UI.section('STATISTICHE', `
            <div class="cell" style="cursor:default;"><div class="cell-body">
                <div class="cell-title">Vani: ${roomNames.length} | Oss: ${totalObs} | Foto: ${totalPhotos}</div>
                <div class="cell-subtitle">Pertinenze: ${(sop.pertinenze || []).length}</div>
            </div></div>
        `);

        // Preview per ogni vano
        for (const roomName of roomNames) {
            const room = rooms[roomName];
            const observations = room.observations || [];

            let roomHtml = `<div class="cell" style="cursor:default;"><div class="cell-body">
                <div class="cell-title">${esc(roomName)} ${UI.statusBadge(room.status)}</div>
                <div class="cell-subtitle">Soffitto: ${esc(room.finishes || '-')} | Oss: ${observations.length}</div>
            </div></div>`;
            html += UI.section(esc(roomName).toUpperCase(), roomHtml);

            if (room.manual_text) {
                html += `<div class="preview-box"><pre class="preview-text">${esc(room.manual_text)}</pre></div>`;
            } else if (observations.length > 0) {
                let text = '';
                if (typeof Formatters !== 'undefined') {
                    text = Formatters.generateRoomText(observations);
                } else {
                    text = observations.map(o => o.phenomenon || '').join('; ');
                }
                html += `<div class="preview-box"><pre class="preview-text">${esc(text)}</pre></div>`;
            }

            html += `<div style="padding: 4px 16px;">
                <button class="btn btn-secondary" data-room-edit="${esc(roomName)}" style="font-size:13px;">Modifica Testo</button>
            </div>`;
        }

        // Pertinenze preview
        if (sop.pertinenze && sop.pertinenze.length > 0) {
            let pertHtml = '';
            for (let i = 0; i < sop.pertinenze.length; i++) {
                const pert = sop.pertinenze[i];
                const pertRoomCount = Object.keys(pert.rooms || {}).length;
                pertHtml += UI.cell({
                    icon: pert.completed ? '✅' : '⬜',
                    title: pert.type,
                    subtitle: `${pertRoomCount} vani`,
                    dataId: `pert_${i}`,
                    chevron: true
                });
            }
            const orderLabel = sop.pert_order === 'pert_first' ? '📦 Pertinenze prima' : '🏠 Appartamento prima';
            pertHtml += `<div style="padding: 8px 0; display:flex; gap:8px;">
                <button class="btn btn-outline" id="btn-toggle-pert-order" style="flex:1; font-size:13px;">${orderLabel}</button>
            </div>`;
            html += UI.section('PERTINENZE', pertHtml);
        }

        // Chiusura preview
        html += UI.section('TESTO CONCLUSIVO', '');
        let chiusuraText = sop.custom_chiusura;
        if (!chiusuraText && typeof Formatters !== 'undefined') {
            chiusuraText = Formatters.generateChiusuraText(sop);
        }
        if (!chiusuraText) chiusuraText = 'Il sopralluogo si conclude alle ore __.';
        html += `<div class="preview-box"><pre class="preview-text" id="chiusura-text">${esc(chiusuraText)}</pre></div>`;
        html += `<div style="padding: 4px 16px; display:flex; gap:8px;">
            <button class="btn btn-outline" id="btn-edit-chiusura" style="flex:1; font-size:13px;">Modifica</button>
            <button class="btn btn-secondary" id="btn-reset-chiusura" style="flex:1; font-size:13px;">Auto</button>
        </div>`;

        // Note globali
        html += this._renderGlobalNotes(sop);

        // Nota operatore
        html += this._renderOperatorNote(sop);

        // Firmatari
        html += this._renderSigners(sop);

        // Verbale preview completo
        html += UI.section('ANTEPRIMA VERBALE COMPLETO', '');
        let verbaleText = '';
        if (typeof Formatters !== 'undefined') {
            verbaleText = Formatters.generateVerbalePreview(sop);
        } else {
            verbaleText = 'Formatters non disponibile';
        }
        html += `<div class="preview-box" style="max-height:400px; overflow-y:auto;">
            <pre class="preview-text">${esc(verbaleText)}</pre>
        </div>`;

        // Bottoni azione
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-generate-docx">📄 Genera Verbale DOCX</button>
            <button class="btn btn-primary" id="btn-generate-allegato" style="background:var(--accent-secondary,#4a9d8f);">📷 Genera Allegato Foto DOCX</button>
            <button class="btn btn-outline" id="btn-export-json">📥 Esporta JSON</button>
            <button class="btn btn-secondary" id="btn-back-rooms">Torna ai Vani</button>
            ${sop.completed ? '<button class="btn btn-outline" id="btn-reopen" style="margin-top:8px; border-color:var(--warning,#ffc107); color:var(--warning,#e6a800);">🔓 Riapri per Modifiche</button>' : ''}
        </div><div style="height:32px;"></div>`;

        container.innerHTML = html;
        this._bindEvents(sop);
    },

    // ========== NOTE GLOBALI ==========

    _renderGlobalNotes(sop) {
        const notes = Array.isArray(sop.global_notes) ? sop.global_notes : [];
        let html = `<div class="section"><div class="section-header">NOTE GLOBALI</div></div>`;

        if (notes.length > 0) {
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                const esc = UI._escapeHtml;
                html += `<div class="obs-card" data-note-index="${i}">
                    <div class="obs-card-element">${esc(note.type || 'Nota')}${note.room_name ? ' - ' + esc(note.room_name) : ''}</div>
                    <div class="obs-card-text">${esc(note.text)}</div>
                    <div class="obs-card-footer">
                        <button class="obs-btn-delete" data-note-delete="${i}">🗑</button>
                    </div>
                </div>`;
            }
        } else {
            html += `<div style="text-align:center; color:var(--hint); padding:12px;">Nessuna nota</div>`;
        }

        html += `<div style="padding: 8px 16px;"><button class="btn btn-outline" id="btn-add-note" style="width:100%;">+ Nota Globale</button></div>`;
        return html;
    },

    // ========== NOTA OPERATORE ==========

    _renderOperatorNote(sop) {
        const esc = UI._escapeHtml;
        const note = sop.operator_note || '';
        let html = `<div class="section"><div class="section-header">NOTA OPERATORE</div></div>`;
        if (note) {
            html += `<div style="padding:4px 16px; font-size:13px; color:var(--text);">${esc(note)}</div>`;
        } else {
            html += `<div style="text-align:center; color:var(--hint); padding:12px;">Nessuna nota operatore</div>`;
        }
        html += `<div style="padding: 8px 16px; display:flex; gap:8px;">
            <button class="btn btn-outline" id="btn-edit-op-note" style="flex:1;">✏️ ${note ? 'Modifica' : 'Aggiungi'}</button>
            ${note ? '<button class="btn btn-secondary" id="btn-del-op-note" style="flex:0 0 auto;">🗑</button>' : ''}
        </div>`;
        return html;
    },

    // ========== FIRMATARI ==========

    _renderSigners(sop) {
        const signers = sop.signers || {};
        const signerEnabled = sop.signer_enabled || { metro_tech: true, rm: true, metro_coll: true, proprietario: true };
        const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);

        let html = `<div class="section"><div class="section-header">FIRMATARI</div>
            <div style="padding: 4px 16px; color: var(--hint); font-size: 12px;">Usa le checkbox per includere/escludere i firmatari dal verbale</div>
            <div class="section-body" style="padding: 0 16px;">`;

        html += this._signerRow('metro_tech', 'Metro C Tecnico', signers.metro_tech || '', signerEnabled.metro_tech !== false);

        if (sop.rm_presente) {
            html += this._signerRow('rm', 'Roma Metropolitane', signers.rm || '', signerEnabled.rm !== false);
        }

        html += this._signerRow('metro_coll', 'Collaboratore Metro C', signers.metro_coll || '', signerEnabled.metro_coll !== false);

        const propLabel = isPC ? 'Amministratore/Delegato' : 'Proprietario/Delegato';
        const showProp = !sop.proprietario_assente;
        if (showProp) {
            html += this._signerRow('proprietario', propLabel, signers.proprietario || '', signerEnabled.proprietario !== false);
        }

        html += `</div></div>`;
        return html;
    },

    _signerRow(key, label, value, enabled) {
        const checked = enabled ? 'checked' : '';
        const disabled = enabled ? '' : 'disabled style="opacity:0.5;"';
        return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <input type="checkbox" id="signer-chk-${key}" data-signer-key="${key}" ${checked} style="width:20px; height:20px; flex-shrink:0;">
            <div style="flex:1;" ${disabled}>
                ${UI.formInput({ label, id: `signer-${key === 'proprietario' ? 'prop' : key === 'metro_coll' ? 'coll' : key}`, value, placeholder: 'Firma' }).trim()}
            </div>
        </div>`;
    },

    // ========== EVENTS ==========

    _bindEvents(sop) {
        // Edit room manual text
        document.querySelectorAll('[data-room-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._editRoomText(sop, btn.dataset.roomEdit);
            });
        });

        // Edit chiusura
        document.getElementById('btn-edit-chiusura')?.addEventListener('click', () => {
            const current = document.getElementById('chiusura-text')?.textContent || '';
            UI.promptInput('Modifica Chiusura', 'Testo conclusivo...', async (text) => {
                await Events.dispatch('set_chiusura', this.sopId, { text });
                UI.toast('Chiusura salvata');
                const updated = await DB.getSopralluogo(this.sopId);
                this.render(document.getElementById('app-content'), [this.sopId]);
            }, { multiline: true, defaultValue: current });
        });

        // Reset chiusura
        document.getElementById('btn-reset-chiusura')?.addEventListener('click', async () => {
            await Events.dispatch('set_chiusura', this.sopId, { text: null });
            UI.toast('Chiusura auto-generata');
            const updated = await DB.getSopralluogo(this.sopId);
            this.render(document.getElementById('app-content'), [this.sopId]);
        });

        // Add global note
        document.getElementById('btn-add-note')?.addEventListener('click', () => {
            this._addNoteModal();
        });

        // Toggle pert order
        document.getElementById('btn-toggle-pert-order')?.addEventListener('click', async () => {
            const newOrder = sop.pert_order === 'pert_first' ? 'main_first' : 'pert_first';
            await Events.dispatch('set_pert_order', this.sopId, { order: newOrder });
            UI.toast(newOrder === 'pert_first' ? 'Pertinenze prima nel verbale' : 'Appartamento prima nel verbale');
            this.render(document.getElementById('app-content'), [this.sopId]);
        });

        // Edit operator note
        document.getElementById('btn-edit-op-note')?.addEventListener('click', () => {
            UI.promptInput('Nota Operatore', 'Testo della nota...', async (text) => {
                await Events.dispatch('set_operator_note', this.sopId, { text });
                UI.toast('Nota operatore salvata');
                this.render(document.getElementById('app-content'), [this.sopId]);
            }, { multiline: true, defaultValue: sop.operator_note || '' });
        });

        // Delete operator note
        document.getElementById('btn-del-op-note')?.addEventListener('click', () => {
            UI.confirmAction('Cancellare la nota operatore?', async () => {
                await Events.dispatch('set_operator_note', this.sopId, { text: '' });
                UI.toast('Nota operatore cancellata');
                this.render(document.getElementById('app-content'), [this.sopId]);
            });
        });

        // Delete note
        document.querySelectorAll('[data-note-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.confirmAction('Eliminare nota?', async () => {
                    await Events.dispatch('delete_global_note', this.sopId, { note_index: parseInt(btn.dataset.noteDelete) });
                    UI.toast('Eliminata');
                    const updated = await DB.getSopralluogo(this.sopId);
                    this.render(document.getElementById('app-content'), [this.sopId]);
                });
            });
        });

        // Pertinenze click
        document.querySelectorAll('[data-id^="pert_"]').forEach(cell => {
            cell.addEventListener('click', async () => {
                const idx = parseInt(cell.dataset.id.replace('pert_', ''));
                await Events.dispatch('enter_pertinenza', this.sopId, { index: idx });
                App.navigate(`rooms/${this.sopId}`);
            });
        });

        // Generate Verbale DOCX — solo via server (template reale)
        document.getElementById('btn-generate-docx')?.addEventListener('click', async () => {
            await this._saveSigners();
            if (typeof Sync === 'undefined' || !Sync._isAPIAvailable()) {
                UI.toast('Connessione al server necessaria per generare il verbale. Verifica la connessione internet.', 4000);
                return;
            }
            const synced = await Sync.syncViaAPI(this.sopId);
            if (synced) {
                await Sync.requestReport(this.sopId, 'verbale');
            } else {
                UI.toast('Sincronizzazione fallita. Riprova quando hai connessione.', 4000);
            }
        });

        // Generate Allegato Foto DOCX — solo via server (template reale)
        document.getElementById('btn-generate-allegato')?.addEventListener('click', async () => {
            await this._saveSigners();
            if (typeof Sync === 'undefined' || !Sync._isAPIAvailable()) {
                UI.toast('Connessione al server necessaria per generare l\'allegato foto. Verifica la connessione internet.', 4000);
                return;
            }
            const synced = await Sync.syncViaAPI(this.sopId);
            if (synced) {
                await Sync.requestReport(this.sopId, 'allegato');
            } else {
                UI.toast('Sincronizzazione fallita. Riprova quando hai connessione.', 4000);
            }
        });

        // Export JSON
        document.getElementById('btn-export-json')?.addEventListener('click', async () => {
            await this._saveSigners();
            const updated = await DB.getSopralluogo(this.sopId);
            this._exportJSON(updated);
        });

        // Back
        document.getElementById('btn-back-rooms')?.addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });

        // L12: Riapri sopralluogo completato per modifiche
        document.getElementById('btn-reopen')?.addEventListener('click', () => {
            UI.confirmAction(
                'Riaprire il sopralluogo per modifiche?\n\nPotrai modificare vani e osservazioni, poi rigenerare il verbale.',
                async () => {
                    const fresh = await DB.getSopralluogo(this.sopId);
                    if (fresh) {
                        fresh.completed = false;
                        fresh.phase = 2;
                        await DB.saveSopralluogo(fresh);
                        UI.toast('Sopralluogo riaperto');
                        App.navigate(`rooms/${this.sopId}`);
                    }
                }
            );
        });

        // Signer toggle checkboxes
        document.querySelectorAll('[data-signer-key]').forEach(chk => {
            chk.addEventListener('change', async () => {
                const key = chk.dataset.signerKey;
                const inputId = key === 'proprietario' ? 'signer-prop' : key === 'metro_coll' ? 'signer-coll' : `signer-${key}`;
                const inputEl = document.getElementById(inputId);
                if (inputEl) {
                    const wrapper = inputEl.closest('div[style*="flex:1"]');
                    if (wrapper) {
                        wrapper.style.opacity = chk.checked ? '1' : '0.5';
                        inputEl.disabled = !chk.checked;
                    }
                }
                await this._saveSignerEnabled();
            });
        });

        // Auto-save signers on blur
        document.querySelectorAll('input[id^="signer-"]').forEach(input => {
            if (input.type !== 'checkbox') {
                input.addEventListener('blur', () => this._saveSigners());
            }
        });
    },

    async _saveSigners() {
        const signers = {
            metro_tech: document.getElementById('signer-metro-tech')?.value.trim() || '',
            rm: document.getElementById('signer-rm')?.value.trim() || '',
            metro_coll: document.getElementById('signer-coll')?.value.trim() || '',
            proprietario: document.getElementById('signer-prop')?.value.trim() || ''
        };
        await Events.dispatch('set_signers', this.sopId, signers);
    },

    async _saveSignerEnabled() {
        const enabled = {};
        document.querySelectorAll('[data-signer-key]').forEach(chk => {
            enabled[chk.dataset.signerKey] = chk.checked;
        });
        await Events.dispatch('set_signer_enabled', this.sopId, enabled);
    },

    _editRoomText(sop, roomName) {
        const room = sop.rooms[roomName];
        let currentText = room.manual_text || '';
        if (!currentText && room.observations && room.observations.length > 0) {
            if (typeof Formatters !== 'undefined') {
                currentText = Formatters.generateRoomText(room.observations);
            }
        }

        UI.promptInput(`Testo - ${roomName}`, 'Modifica il testo...', async (text) => {
            await Events.dispatch('set_manual_text', this.sopId, { room_name: roomName, text });
            UI.toast('Salvato');
            const updated = await DB.getSopralluogo(this.sopId);
            this.render(document.getElementById('app-content'), [this.sopId]);
        }, { multiline: true, defaultValue: currentText });
    },

    _addNoteModal() {
        const types = (CONFIG.DISCLAIMER_TYPES || []).concat([{ value: 'generic', label: 'Nota Generica' }]);

        UI.choiceModal('Tipo Nota', types.map(t => ({ value: t.value, label: t.label })), (noteType) => {
            UI.promptInput('Testo Nota', 'Scrivi la nota...', async (text) => {
                await Events.dispatch('add_global_note', this.sopId, { note_type: noteType, note_text: text });
                UI.toast('Nota aggiunta');
                const updated = await DB.getSopralluogo(this.sopId);
                this.render(document.getElementById('app-content'), [this.sopId]);
            }, { multiline: true });
        });
    },

    _exportJSON(sop) {
        const exportData = {
            sopralluogo: sop,
            exported_at: new Date().toISOString(),
            version: '2.0'
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `testimoniale_${sop.building_code || 'export'}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        UI.toast('JSON esportato');
    }
};
