/**
 * review.js - Fase 3: Riepilogo, chiusura, firme, export JSON, DOCX
 * Usa Formatters.js come source of truth per testo
 * Supporta: cappello, chiusura, pertinenze, allontana events, RM toggle
 *
 * RIEPILOGO VERBALE: ogni sezione e' scrollabile e modificabile:
 *  - Testo Apertura (cappello)
 *  - Riga Info Unita' (piano/scala/appartamento/sub)
 *  - Per ogni vano: testo completo osservazioni
 *  - Testo Conclusivo (chiusura)
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

        // Info card compatta
        html += UI.infoCard([
            { label: 'Codice', value: sop.building_code || '' },
            { label: 'Indirizzo', value: sop.building_address || '' },
            { label: 'Unita\'', value: sop.manual_unit_type || sop.unit_name || sop.unit_type || '' },
            { label: 'Piano', value: sop.floor || '' }
        ]);

        // Phase tabs (navigazione tra le 3 fasi)
        html += UI.phaseTabs(3);

        // Statistiche
        let totalObs = 0, totalPhotos = 0, unanalyzedRooms = [];
        for (const name of roomNames) {
            const obsCount = (rooms[name].observations || []).length;
            totalObs += obsCount;
            totalPhotos += (rooms[name].photos || []).length;
            if (obsCount === 0) unanalyzedRooms.push(name);
        }
        // Fase E: statistiche extra per secondario
        let statsExtra = '';
        if (sop.sync_role === 'secondary' && sop.total_rooms_on_disk) {
            let secDetail = `Totale su server: ${sop.total_rooms_on_disk} vani (master + tuoi)`;
            if (sop.rooms_updated > 0) secDetail += ` | ${sop.rooms_updated} aggiornati`;
            statsExtra = `<div class="cell-subtitle" style="color:#e6a800;">${secDetail}</div>`;
        }
        if (sop.sync_role === 'master' && sop.secondary_rooms && sop.secondary_rooms.length > 0) {
            statsExtra = `<div class="cell-subtitle" style="color:#4a9d8f;">+ ${sop.secondary_rooms.length} vani da altri operatori su server</div>`;
        }
        html += UI.section('STATISTICHE', `
            <div class="cell" style="cursor:default;"><div class="cell-body">
                <div class="cell-title">Vani: ${roomNames.length} | Oss: ${totalObs} | Foto: ${totalPhotos}</div>
                <div class="cell-subtitle">Pertinenze: ${(sop.pertinenze || []).length}</div>
                ${statsExtra}
            </div></div>
        `);

        // Warning: vani non analizzati (F5)
        if (unanalyzedRooms.length > 0) {
            const esc2 = UI._escapeHtml;
            html += `<div style="background: #fff3e0; border: 1px solid #ff9800; border-radius: 8px; padding: 12px; margin: 0 16px 8px;">
                <div style="font-weight: 600; font-size: 13px; color: #e65100;">⚠️ ${unanalyzedRooms.length} vano/i senza osservazioni</div>
                <div style="font-size: 12px; color: #666; margin-top: 4px;">${unanalyzedRooms.map(n => esc2(n)).join(', ')}</div>
            </div>`;
        }

        // Planimetria: carica/sostituisci (A7)
        const hasPlanimetria = sop.planimetria_photos && sop.planimetria_photos.length > 0;
        html += `<div style="padding: 0 16px 8px; display:flex; gap:8px;">
            <button class="btn btn-outline" id="btn-plan-replace" style="flex:1; font-size:13px;">
                ${hasPlanimetria ? '🗺 Sostituisci Planimetria' : '🗺 Carica Planimetria'}
            </button>
        </div>`;

        // ================================================================
        // SEZIONE 1: TESTO APERTURA (cappello)
        // ================================================================
        html += this._renderEditableSection({
            id: 'cappello',
            title: 'TESTO APERTURA',
            text: Formatters.generateCappelloText(sop),
            isCustom: !!sop.custom_cappello,
            esc
        });

        // ================================================================
        // SEZIONE 2: RIGA INFO UNITA'
        // ================================================================
        html += this._renderEditableSection({
            id: 'unitline',
            title: 'RIGA INFO UNITA\'',
            text: Formatters.generateUnitInfoLine(sop),
            isCustom: !!sop.custom_unit_line,
            esc
        });

        // ================================================================
        // SEZIONE 3: VANI (uno per ogni room)
        // ================================================================
        for (const roomName of roomNames) {
            const room = rooms[roomName];
            const observations = room.observations || [];
            const obsCount = observations.length;

            // Header vano come reports.py (es. "VANO 3: Soggiorno, C/S;")
            const roomHeader = Formatters.generateRoomHeader(roomName, room);

            // Genera testo completo del vano
            const roomText = Formatters.generateFullRoomText(roomName, room);
            const hasCustom = !!room.custom_room_text;

            // Vani con disclaimer: mostra ma segnala come skip
            const isDisclaimer = room.status && room.status !== 'accessible';

            const sectionId = `room_${roomNames.indexOf(roomName)}`;
            html += this._renderEditableSection({
                id: sectionId,
                title: esc(roomHeader),
                subtitle: isDisclaimer
                    ? `${UI.statusBadge(room.status)} (aggregato a fine verbale)`
                    : `${obsCount} oss.`,
                text: isDisclaimer ? '(Questo vano viene riportato nella sezione note a fine verbale)' : roomText,
                isCustom: hasCustom,
                esc,
                roomName: roomName
            });
        }

        // ================================================================
        // PERTINENZE (se presenti)
        // ================================================================
        if (sop.pertinenze && sop.pertinenze.length > 0) {
            let pertHtml = '';
            for (let i = 0; i < sop.pertinenze.length; i++) {
                const pert = sop.pertinenze[i];
                const pertRoomCount = Object.keys(pert.rooms || {}).length;
                // Build display name con proprietario
                const pertParts = [pert.type || 'Pertinenza'];
                if (pert.sub) pertParts.push(`Sub. ${pert.sub}`);
                if (pert.numero) pertParts.push(`N. ${pert.numero}`);
                if (pert.proprietario) pertParts.push(`Prop. ${pert.proprietario}`);
                let pertDisplayName = pertParts.join(' - ');
                if (pert.piano) pertDisplayName += ` (${pert.piano})`;
                pertHtml += UI.cell({
                    icon: pert.completed ? '\u2705' : '\u2B1C',
                    title: pertDisplayName,
                    subtitle: `${pertRoomCount} vani`,
                    dataId: `pert_${i}`,
                    chevron: true
                });
            }
            const isPertStandalone = sop.unit_type === 'Pertinenze';
            if (!isPertStandalone) {
                const orderLabel = sop.pert_order === 'pert_first' ? '\uD83D\uDCE6 Pertinenze prima' : '\uD83C\uDFE0 Appartamento prima';
                pertHtml += `<div style="padding: 8px 0; display:flex; gap:8px;">
                    <button class="btn btn-outline" id="btn-toggle-pert-order" style="flex:1; font-size:13px;">${orderLabel}</button>
                </div>`;
            }
            // Bottone "Nuova Pertinenza" per tornare al menu pertinenze
            pertHtml += `<div style="padding: 8px 0;">
                <button class="btn btn-outline" id="btn-new-pert" style="width:100%; border-color:#1976d2; color:#1976d2;">📦 Nuova Pertinenza</button>
            </div>`;
            html += UI.section('PERTINENZE', pertHtml);
        }

        // ================================================================
        // SEZIONE 4: TESTO CONCLUSIVO (chiusura)
        // ================================================================
        let chiusuraText = Formatters.generateChiusuraText(sop);
        if (!chiusuraText) chiusuraText = 'Il sopralluogo si conclude alle ore __.';

        html += this._renderEditableSection({
            id: 'chiusura',
            title: 'TESTO CONCLUSIVO',
            text: chiusuraText,
            isCustom: !!sop.custom_chiusura,
            esc
        });

        // Note globali
        html += this._renderGlobalNotes(sop);

        // Nota operatore
        html += this._renderOperatorNote(sop);

        // Firmatari
        html += this._renderSigners(sop);

        // Bottoni azione
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">`;

        // Fase E: secondario non puo' generare DOCX; pre-sync guard
        if (sop.sync_role === 'secondary') {
            html += `<div style="background: #fff8e1; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; text-align:center;">
                <div style="font-size: 13px;">\u26A0\uFE0F Solo il master puo\' generare il verbale.</div>
            </div>`;
        } else if (!sop.synced || !sop.sync_role) {
            // Mai sincronizzato o ruolo non assegnato — non mostrare DOCX, potrebbe diventare secondario
            html += `<div style="background: #e3f2fd; border: 1px solid #90caf9; border-radius: 8px; padding: 12px; text-align:center;">
                <div style="font-size: 13px;">Premi ⬆ nell\'header per sincronizzare, poi potrai generare il verbale.</div>
            </div>`;
        } else {
            html += `<button class="btn btn-primary" id="btn-generate-docx">\uD83D\uDCC4 Genera Verbale DOCX</button>`;
            html += `<button class="btn btn-primary" id="btn-generate-allegato" style="background:var(--accent-secondary,#4a9d8f);">\uD83D\uDCF7 Genera Allegato Foto DOCX</button>`;
        }

        html += `<button class="btn btn-outline" id="btn-export-json">\uD83D\uDCE5 Esporta JSON</button>`;
        html += `<button class="btn btn-secondary" id="btn-back-rooms">Torna ai Vani</button>`;
        html += sop.completed ? '<button class="btn btn-outline" id="btn-reopen" style="margin-top:8px; border-color:var(--warning,#ffc107); color:var(--warning,#e6a800);">\uD83D\uDD13 Riapri per Modifiche</button>' : '';
        html += `</div><div style="height:32px;"></div>`;

        container.innerHTML = html;
        this._bindEvents(sop, roomNames);
    },

    // ========== SEZIONE EDITABILE GENERICA ==========

    /**
     * Genera HTML per una sezione scrollabile e modificabile
     * @param {Object} opts - { id, title, subtitle, text, isCustom, esc, roomName }
     */
    _renderEditableSection(opts) {
        const { id, title, subtitle, text, isCustom, esc } = opts;
        const customBadge = isCustom
            ? '<span style="font-size:11px; color:var(--accent-secondary,#4a9d8f); margin-left:8px;">\u270F\uFE0F Personalizzato</span>'
            : '';

        let html = `<div class="section"><div class="section-header">${title}${customBadge}</div></div>`;

        if (subtitle) {
            html += `<div style="padding:0 16px 4px; font-size:12px; color:var(--hint);">${subtitle}</div>`;
        }

        // Box scrollabile con testo completo
        html += `<div class="preview-box" style="max-height:200px; overflow-y:auto; margin:0 16px;">
            <pre class="preview-text" id="text-${id}" style="white-space:pre-wrap; word-wrap:break-word; font-size:13px; line-height:1.5;">${esc(text)}</pre>
        </div>`;

        // Bottoni Modifica + Auto
        html += `<div style="padding: 4px 16px; display:flex; gap:8px;">
            <button class="btn btn-outline" data-edit-section="${id}" style="flex:1; font-size:13px;">\u270F\uFE0F Modifica</button>
            <button class="btn btn-secondary" data-reset-section="${id}" style="flex:1; font-size:13px;">\uD83D\uDD04 Auto</button>
        </div>`;

        return html;
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
                        <button class="obs-btn-delete" data-note-delete="${i}">\uD83D\uDDD1</button>
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
            <button class="btn btn-outline" id="btn-edit-op-note" style="flex:1;">\u270F\uFE0F ${note ? 'Modifica' : 'Aggiungi'}</button>
            ${note ? '<button class="btn btn-secondary" id="btn-del-op-note" style="flex:0 0 auto;">\uD83D\uDDD1</button>' : ''}
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

    _bindEvents(sop, roomNames) {
        const self = this;
        const rerender = () => self.render(document.getElementById('app-content'), [self.sopId]);

        // ---- Phase tabs ----
        document.querySelectorAll('.phase-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const phase = parseInt(tab.dataset.phase);
                if (phase === 0) {
                    App.navigate('home');
                } else if (phase === 1) {
                    App.navigate(`anagrafica/${self.sopId}`);
                } else if (phase === 2) {
                    App.navigate(`rooms/${self.sopId}`);
                }
                // phase === 3: gia' qui (review), non fare nulla
            });
        });

        // ---- Planimetria sostituisci/carica ----
        document.getElementById('btn-plan-replace')?.addEventListener('click', () => {
            self._replacePlanimetria();
        });

        // ---- Sezioni editabili generiche ----
        document.querySelectorAll('[data-edit-section]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sectionId = btn.dataset.editSection;
                const currentText = document.getElementById(`text-${sectionId}`)?.textContent || '';
                self._editSection(sop, sectionId, currentText, roomNames);
            });
        });

        document.querySelectorAll('[data-reset-section]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sectionId = btn.dataset.resetSection;
                self._resetSection(sop, sectionId, roomNames);
            });
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
            rerender();
        });

        // Nuova Pertinenza → torna al menu pertinenze
        document.getElementById('btn-new-pert')?.addEventListener('click', () => {
            App.navigate(`pertinenze/${this.sopId}`);
        });

        // Edit operator note
        document.getElementById('btn-edit-op-note')?.addEventListener('click', () => {
            UI.promptInput('Nota Operatore', 'Testo della nota...', async (text) => {
                await Events.dispatch('set_operator_note', this.sopId, { text });
                UI.toast('Nota operatore salvata');
                rerender();
            }, { multiline: true, defaultValue: sop.operator_note || '' });
        });

        // Delete operator note
        document.getElementById('btn-del-op-note')?.addEventListener('click', () => {
            UI.confirmAction('Cancellare la nota operatore?', async () => {
                await Events.dispatch('set_operator_note', this.sopId, { text: '' });
                UI.toast('Nota operatore cancellata');
                rerender();
            });
        });

        // Delete note
        document.querySelectorAll('[data-note-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.confirmAction('Eliminare nota?', async () => {
                    await Events.dispatch('delete_global_note', this.sopId, { note_index: parseInt(btn.dataset.noteDelete) });
                    UI.toast('Eliminata');
                    rerender();
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

        // Generate Verbale DOCX
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

        // Generate Allegato Foto DOCX
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

        // Riapri
        document.getElementById('btn-reopen')?.addEventListener('click', () => {
            UI.confirmAction(
                'Riaprire il sopralluogo per modifiche?\n\nPotrai modificare vani e osservazioni, poi rigenerare il verbale.',
                async () => {
                    await Events.dispatch('reopen_sopralluogo', this.sopId, {});
                    UI.toast('Sopralluogo riaperto');
                    App.navigate(`rooms/${this.sopId}`);
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

    // ========== EDIT / RESET SEZIONE ==========

    /**
     * Apri textarea per modificare una sezione
     */
    _editSection(sop, sectionId, currentText, roomNames) {
        const titleMap = {
            'cappello': 'Modifica Testo Apertura',
            'unitline': 'Modifica Riga Info Unita\'',
            'chiusura': 'Modifica Testo Conclusivo'
        };
        let title = titleMap[sectionId];
        let roomName = null;

        // Per i vani: room_0, room_1, ...
        if (sectionId.startsWith('room_')) {
            const idx = parseInt(sectionId.replace('room_', ''));
            roomName = roomNames[idx];
            title = `Modifica - ${roomName}`;
        }

        UI.promptInput(title, 'Modifica il testo...', async (text) => {
            if (sectionId === 'cappello') {
                await Events.dispatch('set_cappello', this.sopId, { text });
            } else if (sectionId === 'unitline') {
                await Events.dispatch('set_custom_unit_line', this.sopId, { text });
            } else if (sectionId === 'chiusura') {
                await Events.dispatch('set_chiusura', this.sopId, { text });
            } else if (roomName) {
                await Events.dispatch('set_custom_room_text', this.sopId, { room_name: roomName, text });
            }
            UI.toast('Salvato');
            this.render(document.getElementById('app-content'), [this.sopId]);
        }, { multiline: true, defaultValue: currentText });
    },

    /**
     * Reset una sezione al testo auto-generato
     */
    async _resetSection(sop, sectionId, roomNames) {
        if (sectionId === 'cappello') {
            await Events.dispatch('set_cappello', this.sopId, { text: null });
            UI.toast('Testo apertura auto-generato');
        } else if (sectionId === 'unitline') {
            await Events.dispatch('set_custom_unit_line', this.sopId, { text: null });
            UI.toast('Riga info unita\' auto-generata');
        } else if (sectionId === 'chiusura') {
            await Events.dispatch('set_chiusura', this.sopId, { text: null });
            UI.toast('Testo conclusivo auto-generato');
        } else if (sectionId.startsWith('room_')) {
            const idx = parseInt(sectionId.replace('room_', ''));
            const roomName = roomNames[idx];
            if (roomName) {
                await Events.dispatch('set_custom_room_text', this.sopId, { room_name: roomName, text: null });
                UI.toast('Testo vano auto-generato');
            }
        }
        this.render(document.getElementById('app-content'), [this.sopId]);
    },

    // ========== HELPERS ==========

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

    _addNoteModal() {
        const types = (CONFIG.DISCLAIMER_TYPES || []).concat([{ value: 'generic', label: 'Nota Generica' }]);

        UI.choiceModal('Tipo Nota', types.map(t => ({ value: t.value, label: t.label })), (noteType) => {
            UI.promptInput('Testo Nota', 'Scrivi la nota...', async (text) => {
                await Events.dispatch('add_global_note', this.sopId, { note_type: noteType, note_text: text });
                UI.toast('Nota aggiunta');
                this.render(document.getElementById('app-content'), [this.sopId]);
            }, { multiline: true });
        });
    },

    _replacePlanimetria() {
        const buttons = [
            { value: 'camera', label: '📷 Scatta Foto' },
            { value: 'gallery', label: '🖼 Galleria' }
        ];
        UI.choiceModal('Planimetria', buttons, async (choice) => {
            let result = null;
            if (choice === 'camera') {
                result = typeof Photos !== 'undefined' ? await Photos.takePhoto() : null;
            } else {
                result = typeof Photos !== 'undefined' ? await Photos.fromGallery() : null;
            }
            if (!result) return;

            const { id, filename } = await Photos.save(this.sopId, '__planimetria__', 'planimetria', result.blob, result.thumbnail);
            // Elimina vecchia planimetria se esiste
            const sop = await DB.getSopralluogo(this.sopId);
            if (sop && sop.planimetria_photo_id) {
                await Events.dispatch('delete_planimetria', this.sopId, { photo_id: sop.planimetria_photo_id });
            }
            await Events.dispatch('upload_planimetria', this.sopId, { photo_id: id });
            UI.toast('Planimetria aggiornata');
            this.render(document.getElementById('app-content'), [this.sopId]);
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
