/**
 * anagrafica.js - Fase 1b: Schermata unica Anagrafica
 * Sezioni: Proprietario (+ altri presenti), Tecnico Metro C (+ collaboratori),
 *          Roma Metropolitane, poi Cappello Preview
 */
const AnagraficaView = {
    sopId: null,
    _subStep: 'main', // main | cappello | cappello_edit

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.setTitle('Anagrafica');
        UI.showBack(true, () => App.navigate(`setup/${this.sopId}`));

        this._subStep = 'main';
        this._renderMain(container, sop);
    },

    // ========== SCHERMATA UNICA ANAGRAFICA ==========

    _renderMain(container, sop) {
        UI.setTitle('Anagrafica');
        const isPC = CONFIG.isPartiComuni(sop);
        const esc = UI._escapeHtml;

        let html = '';

        // Riepilogo fabbricato
        html += UI.infoCard([
            { label: 'Codice', value: sop.building_code || '' },
            { label: 'Indirizzo', value: sop.building_address || '' },
            { label: 'Unita\'', value: sop.manual_unit_type || sop.unit_name || sop.unit_type || '' },
            { label: 'Piano', value: sop.floor || '' }
        ]);

        // Phase tabs (navigazione tra le 3 fasi)
        html += UI.phaseTabs(1);

        // ── SEZIONE 1: PROPRIETARIO ──
        const ownerType = sop.owner?.type || '';
        const othersPresent = Array.isArray(sop.owner?.others_present) ? sop.owner.others_present : [];

        let ownerFieldsHtml = '';
        if (ownerType === 'persona') {
            ownerFieldsHtml = UI.formInput({ label: 'Nome e Cognome', placeholder: 'Es. Mario Rossi', id: 'field-owner-name', value: sop.owner?.name || '' });
        } else if (ownerType === 'societa') {
            ownerFieldsHtml = UI.formInput({ label: 'Ragione Sociale', placeholder: 'Es. Immobiliare SRL', id: 'field-company-name', value: sop.owner?.company_name || '' });
            const adminLabel = isPC ? 'Amministratore/Delegato' : 'Amministratore della societa\'';
            ownerFieldsHtml += UI.formInput({ label: adminLabel, placeholder: 'Nome', id: 'field-company-admin', value: sop.owner?.company_admin || '' });
        }

        // Lista altri presenti per la proprieta'
        let othersHtml = '';
        for (let i = 0; i < othersPresent.length; i++) {
            othersHtml += `<div style="display:flex; gap:8px; align-items:center; padding: 4px 0;">
                <input class="form-input other-present-input" type="text" data-other-index="${i}" value="${esc(othersPresent[i])}" placeholder="Altro presente ${i + 1}">
                <button class="btn-choice other-remove" data-other-index="${i}" style="color:var(--destructive); min-width:40px;">x</button>
            </div>`;
        }

        html += UI.section('PROPRIETARIO', `
            <div style="padding: 0 16px; margin-bottom: 8px;">
                <div class="btn-grid">
                    <button class="btn-choice${ownerType === 'persona' ? ' selected' : ''}" data-owner-type="persona">Persona</button>
                    <button class="btn-choice${ownerType === 'societa' ? ' selected' : ''}" data-owner-type="societa">Societa'</button>
                </div>
            </div>
            <div id="owner-fields" style="padding: 0 16px;">${ownerFieldsHtml}</div>
            <div id="others-present-list" style="padding: 0 16px;">${othersHtml}</div>
            <div style="padding: 8px 16px;">
                <button class="btn btn-outline" id="btn-add-other" style="width:100%;">+ Aggiungi Altro Presente</button>
            </div>
        `);

        // ── SEZIONE 2: TECNICO METRO C ──
        const colls = Array.isArray(sop.attendees?.metro_coll) ? sop.attendees.metro_coll : [];
        let collHtml = '';
        for (let i = 0; i < colls.length; i++) {
            collHtml += `<div style="display:flex; gap:8px; align-items:center; padding: 4px 0;">
                <input class="form-input collaborator-input" type="text" data-coll-index="${i}" value="${esc(colls[i])}" placeholder="Collaboratore ${i + 1}">
                <button class="btn-choice coll-remove" data-coll-index="${i}" style="color:var(--destructive); min-width:40px;">x</button>
            </div>`;
        }

        html += UI.section('TECNICO METRO C', `
            <div style="padding: 0 16px;">
                ${UI.formInput({ label: 'Tecnico Metro C (Societa\')', placeholder: 'Es. Mario Rossi (ABC Srl)', id: 'field-metro-tech', value: sop.attendees?.metro_tech || '' }).trim()}
            </div>
            <div style="padding: 0 16px; margin-top: 4px; font-size: 13px; color: var(--hint); font-weight: 500;">Collaboratori</div>
            <div id="coll-list" style="padding: 0 16px;">${collHtml}</div>
            <div style="padding: 8px 16px;">
                <button class="btn btn-outline" id="btn-add-coll" style="width:100%;">+ Aggiungi Collaboratore</button>
            </div>
        `);

        // ── SEZIONE 3: ROMA METROPOLITANE ──
        const rmPresente = sop.rm_presente === true;
        html += UI.section('ROMA METROPOLITANE', `
            <div style="padding: 0 16px; margin-bottom: 8px;">
                <div class="btn-grid">
                    <button class="btn-choice${rmPresente ? ' selected' : ''}" data-rm="yes">Presente</button>
                    <button class="btn-choice${!rmPresente ? ' selected' : ''}" data-rm="no">Non Presente</button>
                </div>
            </div>
            <div id="rm-name-field" style="padding: 0 16px;">
                ${rmPresente ? UI.formInput({ label: 'Rappresentante RM', placeholder: 'Nome rappresentante', id: 'field-rm', value: sop.attendees?.rm || '' }).trim() : ''}
            </div>
        `);

        // ── SEZIONE 4: NOTA OPERATORE ──
        const opNote = sop.operator_note || '';
        html += UI.section('NOTA OPERATORE', `
            <div style="padding: 0 16px;">
                <textarea class="form-input form-textarea" id="field-operator-note" rows="3"
                    placeholder="Es. Appartamento ristrutturato nel 2018, pavimenti in parquet..."
                    style="font-size: 13px;">${esc(opNote)}</textarea>
                <div style="font-size: 11px; color: var(--hint); margin-top: 4px;">
                    Questa nota verra' aggiunta nel verbale nella sezione note, dopo le eventuali note automatiche dei vani.
                </div>
            </div>
        `);

        // ── BOTTONE AVANTI ──
        html += `<div style="padding: 16px;">
            <button class="btn btn-primary" id="btn-next-anag">Avanti</button>
        </div>`;
        html += '<div style="height:32px;"></div>';

        container.innerHTML = html;

        // ═══ BIND EVENTI ═══

        // Phase tabs — navigazione tra le 3 fasi
        const self = this;
        container.querySelectorAll('.phase-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                const phase = parseInt(tab.dataset.phase);
                if (phase === 0) {
                    await self._saveAllFields(sop);
                    App.navigate('home');
                } else if (phase === 2) {
                    await self._saveAllFields(sop);
                    App.navigate(`rooms/${self.sopId}`);
                } else if (phase === 3) {
                    await self._saveAllFields(sop);
                    App.navigate(`review/${self.sopId}`);
                }
                // phase === 1: gia' qui (anagrafica), non fare nulla
            });
        });

        // Tipo proprietario
        container.querySelectorAll('[data-owner-type]').forEach(btn => {
            btn.addEventListener('click', async () => {
                container.querySelectorAll('[data-owner-type]').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                const type = btn.dataset.ownerType;
                const currentOthers = this._getOthersPresent();
                await Events.dispatch('set_anagrafica', this.sopId, {
                    owner: { type, name: '', company_name: '', company_admin: '', others_present: currentOthers }
                });
                const updated = await DB.getSopralluogo(this.sopId);
                this._renderMain(container, updated);
            });
        });

        // Aggiungi altro presente
        document.getElementById('btn-add-other')?.addEventListener('click', async () => {
            await this._saveAllFields(sop);
            const current = await DB.getSopralluogo(this.sopId);
            const others = Array.isArray(current.owner?.others_present) ? [...current.owner.others_present] : [];
            others.push('');
            await Events.dispatch('set_anagrafica', this.sopId, {
                owner: { ...current.owner, others_present: others }
            });
            const updated = await DB.getSopralluogo(this.sopId);
            this._renderMain(container, updated);
        });

        // Rimuovi altro presente
        container.querySelectorAll('.other-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._saveAllFields(sop);
                const idx = parseInt(btn.dataset.otherIndex);
                const current = await DB.getSopralluogo(this.sopId);
                const others = Array.isArray(current.owner?.others_present) ? [...current.owner.others_present] : [];
                others.splice(idx, 1);
                await Events.dispatch('set_anagrafica', this.sopId, {
                    owner: { ...current.owner, others_present: others }
                });
                const updated = await DB.getSopralluogo(this.sopId);
                this._renderMain(container, updated);
            });
        });

        // Aggiungi collaboratore
        document.getElementById('btn-add-coll')?.addEventListener('click', async () => {
            await this._saveAllFields(sop);
            const current = await DB.getSopralluogo(this.sopId);
            const currentColls = Array.isArray(current.attendees?.metro_coll) ? [...current.attendees.metro_coll] : [];
            currentColls.push('');
            await Events.dispatch('set_anagrafica', this.sopId, {
                attendees: { ...current.attendees, metro_coll: currentColls }
            });
            const updated = await DB.getSopralluogo(this.sopId);
            this._renderMain(container, updated);
        });

        // Rimuovi collaboratore
        container.querySelectorAll('.coll-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._saveAllFields(sop);
                const idx = parseInt(btn.dataset.collIndex);
                const current = await DB.getSopralluogo(this.sopId);
                const currentColls = Array.isArray(current.attendees?.metro_coll) ? [...current.attendees.metro_coll] : [];
                currentColls.splice(idx, 1);
                await Events.dispatch('set_anagrafica', this.sopId, {
                    attendees: { ...current.attendees, metro_coll: currentColls }
                });
                const updated = await DB.getSopralluogo(this.sopId);
                this._renderMain(container, updated);
            });
        });

        // Toggle RM presente
        container.querySelectorAll('[data-rm]').forEach(btn => {
            btn.addEventListener('click', async () => {
                container.querySelectorAll('[data-rm]').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                const presente = btn.dataset.rm === 'yes';
                await Events.dispatch('set_rm_presente', this.sopId, { presente });
                const rmField = document.getElementById('rm-name-field');
                if (rmField) {
                    if (presente) {
                        rmField.innerHTML = UI.formInput({ label: 'Rappresentante RM', placeholder: 'Nome rappresentante', id: 'field-rm', value: '' }).trim();
                    } else {
                        rmField.innerHTML = '';
                    }
                }
            });
        });

        // Avanti -> cappello
        document.getElementById('btn-next-anag')?.addEventListener('click', async () => {
            await this._saveAllFields(sop);
            const updated = await DB.getSopralluogo(this.sopId);
            this._subStep = 'cappello';
            this._renderCappello(container, updated);
        });
    },

    // ========== SALVA TUTTI I CAMPI ==========

    async _saveAllFields(sop) {
        // Owner
        const owner = { type: sop.owner?.type || 'persona' };
        const nameEl = document.getElementById('field-owner-name');
        const companyEl = document.getElementById('field-company-name');
        const adminEl = document.getElementById('field-company-admin');

        if (nameEl) owner.name = nameEl.value.trim();
        else owner.name = sop.owner?.name || '';
        if (companyEl) owner.company_name = companyEl.value.trim();
        else owner.company_name = sop.owner?.company_name || '';
        if (adminEl) owner.company_admin = adminEl.value.trim();
        else owner.company_admin = sop.owner?.company_admin || '';

        owner.others_present = this._getOthersPresent();

        // Attendees
        const attendees = {
            metro_tech: document.getElementById('field-metro-tech')?.value.trim() || '',
            metro_coll: this._getCollaborators(),
            rm: document.getElementById('field-rm')?.value.trim() || ''
        };

        await Events.dispatch('set_anagrafica', this.sopId, { owner, attendees });

        // Operator note
        const noteEl = document.getElementById('field-operator-note');
        if (noteEl) {
            await Events.dispatch('set_operator_note', this.sopId, { text: noteEl.value.trim() });
        }
    },

    // ========== CAPPELLO PREVIEW ==========

    _renderCappello(container, sop) {
        UI.setTitle('Testo Introduttivo');

        // Genera cappello (auto o custom)
        let cappelloText = sop.custom_cappello;
        if (!cappelloText && typeof Formatters !== 'undefined') {
            cappelloText = Formatters.generateCappelloText(sop);
        }
        if (!cappelloText) cappelloText = this._fallbackCappello(sop);

        let html = '';
        html += `<div style="padding: 8px 16px; color: var(--hint); font-size: 13px;">
            Anteprima del testo introduttivo del verbale. Puoi modificarlo o accettare quello generato automaticamente.
        </div>`;

        html += `<div style="padding: 0 16px;">
            <div class="preview-box" style="max-height: 300px; overflow-y: auto;">
                <pre class="preview-text" id="cappello-preview">${UI._escapeHtml(cappelloText)}</pre>
            </div>
        </div>`;

        html += `<div style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">
            <button class="btn btn-primary" id="btn-cappello-ok">Conferma e Procedi</button>
            <button class="btn btn-outline" id="btn-cappello-edit">Modifica Testo</button>
            <button class="btn btn-secondary" id="btn-cappello-skip">Salta (usa auto-generato)</button>
        </div>`;

        container.innerHTML = html;

        // Conferma
        document.getElementById('btn-cappello-ok').addEventListener('click', async () => {
            if (sop.custom_cappello !== cappelloText) {
                await Events.dispatch('set_cappello', this.sopId, { text: cappelloText });
            } else {
                await Events.dispatch('set_cappello', this.sopId, { text: sop.custom_cappello });
            }
            await this._finalize(sop);
        });

        // Modifica
        document.getElementById('btn-cappello-edit').addEventListener('click', () => {
            this._renderCappelloEdit(container, sop, cappelloText);
        });

        // Salta
        document.getElementById('btn-cappello-skip').addEventListener('click', async () => {
            await Events.dispatch('set_cappello', this.sopId, { text: null });
            await this._finalize(sop);
        });
    },

    _renderCappelloEdit(container, sop, currentText) {
        UI.setTitle('Modifica Testo');
        let html = '';

        html += `<div style="padding: 8px 16px; color: var(--hint); font-size: 13px;">
            Le modifiche riguardano solo il testo introduttivo. Le firme restano invariate.
        </div>`;

        html += `<div style="padding: 0 16px;">
            <textarea class="form-input form-textarea" id="cappello-edit" rows="10" style="font-family: monospace; font-size: 13px;">${UI._escapeHtml(currentText)}</textarea>
        </div>`;

        html += `<div style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">
            <button class="btn btn-primary" id="btn-save-cappello">Salva e Procedi</button>
            <button class="btn btn-secondary" id="btn-cancel-cappello">Annulla</button>
        </div>`;

        container.innerHTML = html;

        document.getElementById('btn-save-cappello').addEventListener('click', async () => {
            const text = document.getElementById('cappello-edit').value.trim();
            await Events.dispatch('set_cappello', this.sopId, { text: text || null });
            await this._finalize(sop);
        });

        document.getElementById('btn-cancel-cappello').addEventListener('click', () => {
            DB.getSopralluogo(this.sopId).then(s => {
                this._renderCappello(container, s);
            });
        });
    },

    // ========== FINALIZZA ==========

    async _finalize(sop) {
        if (typeof SetupView !== 'undefined' && SetupView._buildUnitName) {
            await SetupView._buildUnitName(await DB.getSopralluogo(this.sopId));
        }

        await Events.dispatch('complete_phase', this.sopId, { phase: 2 });
        UI.toast('Anagrafica completata');
        App.navigate(`rooms/${this.sopId}`);
    },

    // ========== HELPERS ==========

    _getCollaborators() {
        const inputs = document.querySelectorAll('.collaborator-input');
        const colls = [];
        inputs.forEach(input => {
            const val = input.value.trim();
            if (val) colls.push(val);
        });
        return colls;
    },

    _getOthersPresent() {
        const inputs = document.querySelectorAll('.other-present-input');
        const others = [];
        inputs.forEach(input => {
            const val = input.value.trim();
            if (val) others.push(val);
        });
        return others;
    },

    _fallbackCappello(sop) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        let text = `In data ${dateStr} alle ore ${timeStr} si accede presso il fabbricato sito in ${sop.building_address || '___'} `;
        text += `per effettuare il testimoniale di ${sop.manual_unit_type || sop.unit_name || sop.unit_type || '___'}.\n\n`;

        // Proprietario
        const ownerStr = this._buildOwnerString(sop);
        if (ownerStr) {
            const isPC = CONFIG.isPartiComuni(sop);
            const label = isPC ? "l'Amministratore/Delegato" : "la Proprieta'/Comproprietario/Affittuario/Delegato";
            text += `Sono presenti per ${label}: ${ownerStr}\n\n`;
        }

        text += `Sono presenti:\n`;
        if (sop.attendees?.metro_tech) text += `- Tecnico Metro C: ${sop.attendees.metro_tech}\n`;
        if (sop.attendees?.metro_coll?.length > 0) {
            text += `- Collaboratori: ${sop.attendees.metro_coll.join(', ')}\n`;
        }
        if (sop.rm_presente && sop.attendees?.rm) text += `- Roma Metropolitane: ${sop.attendees.rm}\n`;

        return text;
    },

    _buildOwnerString(sop) {
        const parts = [];
        if (sop.owner?.type === 'persona' && sop.owner?.name) {
            parts.push(sop.owner.name);
        } else if (sop.owner?.type === 'societa') {
            if (sop.owner?.company_name) {
                let s = sop.owner.company_name;
                if (sop.owner.company_admin) s += ` (${sop.owner.company_admin})`;
                parts.push(s);
            }
        }
        if (Array.isArray(sop.owner?.others_present)) {
            for (const other of sop.owner.others_present) {
                if (other.trim()) parts.push(other.trim());
            }
        }
        return parts.join(', ');
    }
};
