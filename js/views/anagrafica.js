/**
 * anagrafica.js - Fase 1b: Proprietario, figure presenti, RM toggle, Cappello
 * Flusso: Proprietario -> RM Presente -> Figure Presenti -> Cappello Preview -> Procedi
 * PC: "Amministratore/Delegato" al posto di "Amministratore"
 */
const AnagraficaView = {
    sopId: null,
    _subStep: 'owner', // owner | rm_toggle | figures | cappello

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.setTitle('Anagrafica');
        UI.showBack(true, () => App.navigate(`setup/${this.sopId}`));

        this._subStep = 'owner';
        this._renderOwnerStep(container, sop);
    },

    // ========== STEP 1: PROPRIETARIO ==========

    _renderOwnerStep(container, sop) {
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

        // Tipo proprietario
        const ownerType = sop.owner?.type || '';
        html += UI.section('PROPRIETARIO', `
            <div style="padding: 0 16px; margin-bottom: 8px;">
                <div class="btn-grid">
                    <button class="btn-choice${ownerType === 'persona' ? ' selected' : ''}" data-owner-type="persona">Persona</button>
                    <button class="btn-choice${ownerType === 'societa' ? ' selected' : ''}" data-owner-type="societa">Societa'</button>
                </div>
            </div>
            <div id="owner-fields"></div>
        `);

        // Bottone avanti
        html += `<div style="padding: 16px;">
            <button class="btn btn-primary" id="btn-next-anag">Avanti</button>
        </div>`;
        html += '<div style="height:32px;"></div>';

        container.innerHTML = html;

        // Render owner fields
        this._renderOwnerFields(sop);

        // Bind tipo proprietario
        container.querySelectorAll('[data-owner-type]').forEach(btn => {
            btn.addEventListener('click', async () => {
                container.querySelectorAll('[data-owner-type]').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                const type = btn.dataset.ownerType;
                await Events.dispatch('set_anagrafica', this.sopId, {
                    owner: { type, name: '', company_name: '', company_admin: '' }
                });
                const updated = await DB.getSopralluogo(this.sopId);
                this._renderOwnerFields(updated);
            });
        });

        // Avanti -> RM toggle
        document.getElementById('btn-next-anag').addEventListener('click', async () => {
            await this._saveOwnerFields(sop);
            const updated = await DB.getSopralluogo(this.sopId);
            this._subStep = 'rm_toggle';
            this._renderRMToggle(container, updated);
        });
    },

    _renderOwnerFields(sop) {
        const el = document.getElementById('owner-fields');
        if (!el) return;
        const type = sop.owner?.type || '';
        const isPC = CONFIG.isPartiComuni(sop);

        let html = '<div style="padding: 0 16px;">';
        if (type === 'persona') {
            html += UI.formInput({ label: 'Nome e Cognome', placeholder: 'Es. Mario Rossi', id: 'field-owner-name', value: sop.owner?.name || '' });
        } else if (type === 'societa') {
            html += UI.formInput({ label: 'Ragione Sociale', placeholder: 'Es. Immobiliare SRL', id: 'field-company-name', value: sop.owner?.company_name || '' });
            const adminLabel = isPC ? 'Amministratore/Delegato' : 'Amministratore della societa\'';
            html += UI.formInput({ label: adminLabel, placeholder: 'Nome', id: 'field-company-admin', value: sop.owner?.company_admin || '' });
        }
        html += '</div>';
        el.innerHTML = type ? html : '';
    },

    async _saveOwnerFields(sop) {
        const owner = { type: sop.owner?.type || 'persona' };
        const nameEl = document.getElementById('field-owner-name');
        const companyEl = document.getElementById('field-company-name');
        const adminEl = document.getElementById('field-company-admin');

        if (nameEl) owner.name = nameEl.value.trim();
        if (companyEl) owner.company_name = companyEl.value.trim();
        if (adminEl) owner.company_admin = adminEl.value.trim();

        await Events.dispatch('set_anagrafica', this.sopId, { owner });
    },

    // ========== STEP 2: RM PRESENTE ==========

    _renderRMToggle(container, sop) {
        UI.setTitle('Roma Metropolitane');
        let html = '';

        html += `
            <div class="empty-state">
                <div class="empty-state-icon">🏛</div>
                <div class="empty-state-title">Roma Metropolitane e' presente?</div>
                <div class="empty-state-text">Indica se un rappresentante di Roma Metropolitane e' presente al sopralluogo</div>
            </div>
            <div style="padding: 0 16px; display: flex; gap: 8px;">
                <button class="btn btn-primary" id="btn-rm-yes" style="flex:1;">Si'</button>
                <button class="btn btn-secondary" id="btn-rm-no" style="flex:1;">No</button>
            </div>
        `;

        container.innerHTML = html;

        document.getElementById('btn-rm-yes').addEventListener('click', async () => {
            await Events.dispatch('set_rm_presente', this.sopId, { presente: true });
            const updated = await DB.getSopralluogo(this.sopId);
            this._subStep = 'figures';
            this._renderFigures(container, updated);
        });

        document.getElementById('btn-rm-no').addEventListener('click', async () => {
            await Events.dispatch('set_rm_presente', this.sopId, { presente: false });
            const updated = await DB.getSopralluogo(this.sopId);
            this._subStep = 'figures';
            this._renderFigures(container, updated);
        });
    },

    // ========== STEP 3: FIGURE PRESENTI ==========

    _renderFigures(container, sop) {
        UI.setTitle('Figure Presenti');
        const isPC = CONFIG.isPartiComuni(sop);

        let html = '';
        html += UI.section('TECNICO METRO C', `
            <div style="padding: 0 16px;">
                ${UI.formInput({ label: 'Tecnico Metro C (Societa\')', placeholder: 'Es. Mario Rossi (ABC Srl)', id: 'field-metro-tech', value: sop.attendees?.metro_tech || '' }).trim()}
            </div>
        `);

        // Collaboratori
        const colls = Array.isArray(sop.attendees?.metro_coll) ? sop.attendees.metro_coll : [];
        let collHtml = '';
        for (let i = 0; i < colls.length; i++) {
            collHtml += `<div style="display:flex; gap:8px; align-items:center; padding: 4px 16px;">
                <input class="form-input collaborator-input" type="text" data-coll-index="${i}" value="${UI._escapeHtml(colls[i])}" placeholder="Collaboratore ${i + 1}">
                <button class="btn-choice coll-remove" data-coll-index="${i}" style="color:var(--destructive); min-width:40px;">x</button>
            </div>`;
        }
        html += UI.section('COLLABORATORI METRO C', `
            <div id="coll-list">${collHtml}</div>
            <div style="padding: 8px 16px;">
                <button class="btn btn-outline" id="btn-add-coll" style="width:100%;">+ Aggiungi Collaboratore</button>
            </div>
        `);

        // RM (solo se presente)
        if (sop.rm_presente) {
            html += UI.section('ROMA METROPOLITANE', `
                <div style="padding: 0 16px;">
                    ${UI.formInput({ label: 'Rappresentante RM', placeholder: 'Nome rappresentante', id: 'field-rm', value: sop.attendees?.rm || '' }).trim()}
                </div>
            `);
        }

        // Proprietario/Amministratore presente
        const adminLabel = isPC ? 'Amministratore/Delegato' : 'Proprietario/Occupante';
        html += UI.section(adminLabel.toUpperCase(), `
            <div style="padding: 0 16px;">
                ${UI.formInput({ label: adminLabel, placeholder: 'Nome (se presente)', id: 'field-admin-present', value: sop.attendees?.admin_present || '' }).trim()}
            </div>
        `);

        html += `<div style="padding: 16px;">
            <button class="btn btn-primary" id="btn-next-figures">Avanti</button>
        </div>`;
        html += '<div style="height:32px;"></div>';

        container.innerHTML = html;

        // Add collaborator
        document.getElementById('btn-add-coll').addEventListener('click', async () => {
            const currentColls = this._getCollaborators();
            currentColls.push('');
            await Events.dispatch('set_anagrafica', this.sopId, { attendees: { metro_coll: currentColls } });
            const updated = await DB.getSopralluogo(this.sopId);
            this._renderFigures(container, updated);
        });

        // Remove collaborator
        container.querySelectorAll('.coll-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.collIndex);
                const currentColls = this._getCollaborators();
                currentColls.splice(idx, 1);
                await Events.dispatch('set_anagrafica', this.sopId, { attendees: { metro_coll: currentColls } });
                const updated = await DB.getSopralluogo(this.sopId);
                this._renderFigures(container, updated);
            });
        });

        // Next -> cappello
        document.getElementById('btn-next-figures').addEventListener('click', async () => {
            const attendees = {
                metro_tech: document.getElementById('field-metro-tech')?.value.trim() || '',
                metro_coll: this._getCollaborators(),
                rm: document.getElementById('field-rm')?.value.trim() || '',
                admin_present: document.getElementById('field-admin-present')?.value.trim() || ''
            };
            await Events.dispatch('set_anagrafica', this.sopId, { attendees });

            const updated = await DB.getSopralluogo(this.sopId);
            this._subStep = 'cappello';
            this._renderCappello(container, updated);
        });
    },

    // ========== STEP 4: CAPPELLO PREVIEW ==========

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
                // Imposta start_time se non gia' set
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
            await Events.dispatch('set_cappello', this.sopId, { text: null }); // null = auto
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
            const updated = DB.getSopralluogo(this.sopId).then(s => {
                this._renderCappello(container, s);
            });
        });
    },

    // ========== FINALIZZA ==========

    async _finalize(sop) {
        // Genera unit_name se necessario
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

    _fallbackCappello(sop) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        let text = `In data ${dateStr} alle ore ${timeStr} si accede presso il fabbricato sito in ${sop.building_address || '___'} `;
        text += `per effettuare il testimoniale di ${sop.manual_unit_type || sop.unit_name || sop.unit_type || '___'}.\n\n`;
        text += `Sono presenti:\n`;

        if (sop.attendees?.metro_tech) text += `- Tecnico Metro C: ${sop.attendees.metro_tech}\n`;
        if (sop.attendees?.metro_coll?.length > 0) {
            text += `- Collaboratori: ${sop.attendees.metro_coll.join(', ')}\n`;
        }
        if (sop.rm_presente && sop.attendees?.rm) text += `- Roma Metropolitane: ${sop.attendees.rm}\n`;
        if (sop.attendees?.admin_present) {
            const isPC = CONFIG.isPartiComuni(sop);
            const label = isPC ? 'Amministratore/Delegato' : 'Proprietario';
            text += `- ${label}: ${sop.attendees.admin_present}\n`;
        }

        if (sop.owner?.type === 'persona' && sop.owner?.name) {
            text += `\nProprietario: ${sop.owner.name}`;
        } else if (sop.owner?.type === 'societa' && sop.owner?.company_name) {
            text += `\nSocieta': ${sop.owner.company_name}`;
            if (sop.owner.company_admin) text += ` (${sop.owner.company_admin})`;
        }

        return text;
    }
};
