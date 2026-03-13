/**
 * setup.js - Fase 1: Setup fabbricato e unita'
 * Flusso NUOVO (allineato a bot 2026-03-05):
 * Codice -> Indirizzo -> Tipo Unita' -> [dettagli tipo] -> Multi-piano -> Piano -> Scala -> Planimetria
 *
 * Tipo Unita':
 *   Abitazione/Ufficio: sub -> interno
 *   Negozio/Garage/Autorimessa/Box/Posto auto: sub -> indirizzo/civico
 *   Cantina/Soffitta: identificativo
 *   Parti Comuni: identificativo
 *   Scrivi a Mano: descrizione libera -> (no sub/interno, diretta a piano)
 *   Edificio Complesso: descrizione -> prefisso auto "Edificio Complesso: {desc}"
 */
const SetupView = {
    sopId: null,

    // Step corrente nella navigazione
    _step: 'building_code',

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.showBack(true, () => App.navigate('home'));

        // Determina step da dati gia' compilati
        this._step = this._detectStep(sop);

        // Se tutto completato -> anagrafica
        if (this._step === 'done') {
            App.navigate(`anagrafica/${this.sopId}`, true);
            return;
        }

        this._renderStep(container, sop);
    },

    /**
     * Rileva lo step corrente in base ai dati presenti
     */
    _detectStep(sop) {
        if (!sop.building_code) return 'building_code';
        if (!sop.building_address) return 'building_address';
        if (!sop.unit_type) return 'unit_type';

        // Dettagli per tipo
        const ut = sop.unit_type;
        if (ut === 'Scrivi a Mano' || ut === 'Edificio Complesso') {
            if (!sop.manual_unit_type) return 'manual_desc';
        } else if (['Abitazione', 'Ufficio'].includes(ut)) {
            if (!sop.subalterno) return 'subalterno';
            if (!sop.unit_internal) return 'interno';
        } else if (['Negozio', 'Garage', 'Autorimessa', 'Box', 'Posto auto'].includes(ut)) {
            if (!sop.subalterno) return 'subalterno';
            if (!sop.unit_internal) return 'indirizzo_civico';
        } else if (['Cantina', 'Soffitta'].includes(ut)) {
            if (!sop.unit_internal) return 'identificativo';
        } else if (ut === 'Parti Comuni') {
            if (!sop.unit_internal) return 'identificativo_pc';
        }

        // Multi-floor
        if (sop.is_multi_floor === undefined || sop.is_multi_floor === null) return 'multi_floor';
        if (sop.is_multi_floor && (!sop.building_floors || sop.building_floors.length === 0)) return 'select_floors';
        if (!sop.floor) return 'floor';
        if (sop.stair === undefined || sop.stair === null || sop.stair === '') return 'stair';

        // Planimetria (opzionale ma mostrata)
        if (!sop._planimetria_done) return 'planimetria';

        return 'done';
    },

    /**
     * Render step corrente
     */
    _renderStep(container, sop) {
        const step = this._step;

        // Back button logic
        UI.showBack(true, () => {
            const prevStep = this._getPrevStep(sop);
            if (prevStep) {
                this._undoStep(prevStep, sop);
            } else {
                App.navigate('home');
            }
        });

        switch (step) {
            case 'building_code': return this._renderTextStep(container, sop, {
                key: 'building_code', label: 'Codice Fabbricato', placeholder: 'Es. 100C, 3B',
                transform: v => v.toUpperCase().trim()
            });
            case 'building_address': return this._renderTextStep(container, sop, {
                key: 'building_address', label: 'Indirizzo Fabbricato', placeholder: 'Es. Via Roma, 10',
                transform: v => v.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            });
            case 'unit_type': return this._renderUnitType(container, sop);
            case 'manual_desc': return this._renderManualDesc(container, sop);
            case 'subalterno': return this._renderTextStep(container, sop, {
                key: 'subalterno', label: 'Subalterno', placeholder: 'Es. 500'
            });
            case 'interno': return this._renderTextStep(container, sop, {
                key: 'unit_internal', label: 'Interno', placeholder: 'Es. 3, Int A',
                transform: v => {
                    if (!/^int/i.test(v) && !/^[A-Z]\d/i.test(v)) return `Interno ${v}`;
                    return v;
                }
            });
            case 'indirizzo_civico': return this._renderTextStep(container, sop, {
                key: 'unit_internal', label: 'Indirizzo / Civico', placeholder: 'Es. Via Roma 10'
            });
            case 'identificativo': return this._renderTextStep(container, sop, {
                key: 'unit_internal', label: 'Identificativo', placeholder: 'Es. C1, S2'
            });
            case 'identificativo_pc': return this._renderTextStep(container, sop, {
                key: 'unit_internal', label: 'Identificativo PC', placeholder: 'Es. Scala A, Corpo B'
            });
            case 'multi_floor': return this._renderMultiFloor(container, sop);
            case 'select_floors': return this._renderSelectFloors(container, sop);
            case 'floor': return this._renderFloor(container, sop);
            case 'stair': return this._renderStair(container, sop);
            case 'planimetria': return this._renderPlanimetria(container, sop);
        }
    },

    // ========== STEP: TEXT INPUT ==========

    _renderTextStep(container, sop, opts) {
        UI.setTitle(opts.label);
        let html = this._summaryBar(sop);
        html += UI.formInput({
            label: opts.label,
            placeholder: opts.placeholder,
            id: 'setup-input',
            value: sop[opts.key] || ''
        });
        html += `<div style="padding: 0 16px; margin-top: 8px;">
            <button class="btn btn-primary" id="setup-next">Avanti</button>
        </div>`;

        container.innerHTML = html;

        const input = document.getElementById('setup-input');
        const btn = document.getElementById('setup-next');
        setTimeout(() => input.focus(), 100);

        input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
        btn.addEventListener('click', async () => {
            let value = input.value.trim();
            if (!value) { UI.toast('Inserisci un valore'); return; }
            if (opts.transform) value = opts.transform(value);
            await Events.dispatch('update_setup', this.sopId, { [opts.key]: value });
            this._advance(container);
        });
    },

    // ========== STEP: TIPO UNITA' ==========

    _renderUnitType(container, sop) {
        UI.setTitle('Tipo Unita\'');
        let html = this._summaryBar(sop);
        html += `<div class="wizard-header"><div class="wizard-step">Seleziona il tipo di unita'</div></div>`;

        // Tipi standard
        const types = CONFIG.UNIT_TYPES;
        html += UI.buttonGrid(types.map(t => ({ value: t, label: t })));

        // Opzioni speciali
        html += UI.divider();
        html += `<div style="padding: 0 16px;">
            <button class="btn btn-outline" id="btn-scrivi-mano" style="margin-bottom:8px; width:100%;">✏️ Scrivi a Mano</button>
            <button class="btn btn-outline" id="btn-edificio-complesso" style="width:100%;">🏢 Edificio Complesso</button>
        </div>`;

        container.innerHTML = html;

        // Standard types
        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                await Events.dispatch('update_setup', this.sopId, { unit_type: btn.dataset.value });
                this._advance(container);
            });
        });

        // Scrivi a Mano
        document.getElementById('btn-scrivi-mano').addEventListener('click', async () => {
            await Events.dispatch('update_setup', this.sopId, { unit_type: 'Scrivi a Mano' });
            this._advance(container);
        });

        // Edificio Complesso
        document.getElementById('btn-edificio-complesso').addEventListener('click', async () => {
            await Events.dispatch('update_setup', this.sopId, { unit_type: 'Edificio Complesso' });
            this._advance(container);
        });
    },

    // ========== STEP: DESCRIZIONE MANUALE (Scrivi a Mano / Edificio Complesso) ==========

    _renderManualDesc(container, sop) {
        const isEdificio = sop.unit_type === 'Edificio Complesso';
        const label = isEdificio ? 'Descrizione Edificio' : 'Descrizione Unita\'';
        const placeholder = isEdificio ? 'Es. Palazzina A con 3 scale' : 'Descrizione completa dell\'unita\'';

        UI.setTitle(label);
        let html = this._summaryBar(sop);
        html += UI.formInput({ label, placeholder, id: 'setup-input', value: '' });
        html += `<div style="padding: 0 16px; margin-top: 8px;">
            <button class="btn btn-primary" id="setup-next">Avanti</button>
        </div>`;

        container.innerHTML = html;

        const input = document.getElementById('setup-input');
        setTimeout(() => input.focus(), 100);

        document.getElementById('setup-next').addEventListener('click', async () => {
            const desc = input.value.trim();
            if (!desc) { UI.toast('Inserisci una descrizione'); return; }

            const manualType = isEdificio ? `Edificio Complesso: ${desc}` : desc;
            await Events.dispatch('update_setup', this.sopId, { manual_unit_type: manualType });
            this._advance(container);
        });
    },

    // ========== STEP: MULTI-PIANO ==========

    _renderMultiFloor(container, sop) {
        UI.setTitle('Piani Multipli');
        let html = this._summaryBar(sop);
        html += `
            <div class="empty-state">
                <div class="empty-state-icon">🏢</div>
                <div class="empty-state-title">L'unita' e' su piu' piani?</div>
                <div class="empty-state-text">Se l'unita' si sviluppa su piu' di un piano, seleziona "Si'"</div>
            </div>
            <div style="padding: 0 16px; display: flex; gap: 8px;">
                <button class="btn btn-primary" id="btn-multi-yes" style="flex:1;">Si'</button>
                <button class="btn btn-secondary" id="btn-multi-no" style="flex:1;">No</button>
            </div>
        `;
        container.innerHTML = html;

        document.getElementById('btn-multi-yes').addEventListener('click', async () => {
            await Events.dispatch('update_setup', this.sopId, { is_multi_floor: true });
            this._advance(container);
        });
        document.getElementById('btn-multi-no').addEventListener('click', async () => {
            await Events.dispatch('update_setup', this.sopId, { is_multi_floor: false });
            this._advance(container);
        });
    },

    // ========== STEP: SELEZIONE PIANI (multi-floor) ==========

    _renderSelectFloors(container, sop) {
        UI.setTitle('Seleziona Piani');
        let html = this._summaryBar(sop);
        html += `<div class="wizard-header"><div class="wizard-step">Seleziona tutti i piani dell'unita'</div></div>`;

        const selectedFloors = sop.building_floors || [];

        // Grid piani 3 colonne
        const floors = CONFIG.PREDEFINED_FLOORS;
        const buttons = floors.map(f => {
            const abbr = CONFIG.getFloorAbbr(f);
            const sel = selectedFloors.includes(f) ? ' selected' : '';
            return `<button class="btn-choice btn-floor${sel}" data-value="${UI._escapeHtml(f)}" title="${UI._escapeHtml(f)}">${UI._escapeHtml(abbr)}</button>`;
        }).join('');
        html += `<div class="btn-grid btn-grid-3">${buttons}</div>`;

        // Scrivi a mano
        html += `<div style="padding: 8px 16px;">
            <input class="form-input" type="text" id="custom-floor" placeholder="Piano personalizzato...">
            <button class="btn btn-outline" id="btn-add-custom-floor" style="margin-top:8px; width:100%;">Aggiungi piano personalizzato</button>
        </div>`;

        // Selezione corrente
        html += `<div style="padding: 8px 16px;" id="selected-floors-display">
            ${selectedFloors.length > 0 ? `<div class="text-hint">Piani selezionati: <strong>${selectedFloors.join(', ')}</strong></div>` : ''}
        </div>`;

        html += `<div style="padding: 0 16px; margin-top: 8px;">
            <button class="btn btn-primary" id="btn-confirm-floors"${selectedFloors.length < 2 ? ' disabled' : ''}>Conferma (${selectedFloors.length} piani)</button>
        </div>`;

        container.innerHTML = html;

        // Toggle selezione piano
        container.querySelectorAll('.btn-floor').forEach(btn => {
            btn.addEventListener('click', async () => {
                const floor = btn.dataset.value;
                let floors = [...(sop.building_floors || [])];
                if (floors.includes(floor)) {
                    floors = floors.filter(f => f !== floor);
                } else {
                    floors.push(floor);
                }
                await Events.dispatch('update_setup', this.sopId, { building_floors: floors });
                const updated = await DB.getSopralluogo(this.sopId);
                this._step = 'select_floors';
                this._renderStep(container, updated);
            });
        });

        // Piano custom
        document.getElementById('btn-add-custom-floor').addEventListener('click', async () => {
            const val = document.getElementById('custom-floor').value.trim();
            if (!val) return;
            const floors = [...(sop.building_floors || []), val];
            await Events.dispatch('update_setup', this.sopId, { building_floors: floors });
            const updated = await DB.getSopralluogo(this.sopId);
            this._step = 'select_floors';
            this._renderStep(container, updated);
        });

        // Conferma
        document.getElementById('btn-confirm-floors').addEventListener('click', async () => {
            if ((sop.building_floors || []).length < 2) {
                UI.toast('Seleziona almeno 2 piani');
                return;
            }
            this._advance(container);
        });
    },

    // ========== STEP: PIANO (singolo) ==========

    _renderFloor(container, sop) {
        UI.setTitle('Piano');
        let html = this._summaryBar(sop);

        if (sop.is_multi_floor && sop.building_floors && sop.building_floors.length > 0) {
            // Multi-floor: seleziona piano di partenza
            html += `<div class="wizard-header"><div class="wizard-step">Seleziona il piano di partenza</div></div>`;
            html += UI.buttonGrid(sop.building_floors.map(f => ({
                value: f,
                label: CONFIG.getFloorAbbr(f) || f
            })), { cols: 3 });
        } else {
            // Singolo piano: tutti i piani predefiniti
            html += `<div class="wizard-header"><div class="wizard-step">Seleziona il piano</div></div>`;

            const floors = CONFIG.PREDEFINED_FLOORS;
            const buttons = floors.map(f => {
                const abbr = CONFIG.getFloorAbbr(f);
                return `<button class="btn-choice btn-floor" data-value="${UI._escapeHtml(f)}" title="${UI._escapeHtml(f)}">${UI._escapeHtml(abbr)}</button>`;
            }).join('');
            html += `<div class="btn-grid btn-grid-3">${buttons}</div>`;

            // Scrivi a mano
            html += `<div style="padding: 8px 16px;">
                <input class="form-input" type="text" id="custom-floor" placeholder="Piano personalizzato...">
                <button class="btn btn-outline" id="btn-custom-floor" style="margin-top:8px; width:100%;">Usa piano personalizzato</button>
            </div>`;
        }

        container.innerHTML = html;

        // Click piano
        container.querySelectorAll('.btn-choice, .btn-floor').forEach(btn => {
            btn.addEventListener('click', async () => {
                await Events.dispatch('update_setup', this.sopId, { floor: btn.dataset.value });
                this._advance(container);
            });
        });

        // Piano custom
        document.getElementById('btn-custom-floor')?.addEventListener('click', async () => {
            const val = document.getElementById('custom-floor').value.trim();
            if (!val) { UI.toast('Inserisci un piano'); return; }
            await Events.dispatch('update_setup', this.sopId, { floor: val });
            this._advance(container);
        });
    },

    // ========== STEP: SCALA ==========

    _renderStair(container, sop) {
        UI.setTitle('Scala');
        let html = this._summaryBar(sop);
        html += `<div class="wizard-header"><div class="wizard-step">Seleziona o inserisci la scala</div></div>`;

        // Opzioni standard
        html += UI.buttonGrid(CONFIG.STAIRS.map(s => ({ value: s, label: s })));

        // Manuale
        html += `<div style="padding: 8px 16px;">
            <input class="form-input" type="text" id="custom-stair" placeholder="Scala personalizzata...">
            <button class="btn btn-outline" id="btn-custom-stair" style="margin-top:8px; width:100%;">Usa valore inserito</button>
        </div>`;

        // Skip
        html += `<div style="padding: 0 16px;">
            <button class="btn btn-secondary" id="btn-no-stair">Nessuna scala</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                await Events.dispatch('update_setup', this.sopId, { stair: btn.dataset.value });
                this._advance(container);
            });
        });

        document.getElementById('btn-custom-stair').addEventListener('click', async () => {
            const val = document.getElementById('custom-stair').value.trim();
            if (!val) return;
            await Events.dispatch('update_setup', this.sopId, { stair: val });
            this._advance(container);
        });

        document.getElementById('btn-no-stair').addEventListener('click', async () => {
            await Events.dispatch('update_setup', this.sopId, { stair: '-' });
            this._advance(container);
        });
    },

    // ========== STEP: PLANIMETRIA ==========

    _renderPlanimetria(container, sop) {
        UI.setTitle('Planimetria');
        const planPhotos = sop.planimetria_photos || [];

        let html = this._summaryBar(sop);

        // Planimetrie caricate
        if (planPhotos.length > 0) {
            html += `<div style="padding: 8px 16px;">
                <div class="text-hint">${planPhotos.length} planimetria/e caricata/e</div>
            </div>`;
            // Thumbnails
            html += `<div class="photo-grid" id="plan-photos-grid" style="padding: 0 16px;"></div>`;
        }

        html += `
            <div class="empty-state">
                <div class="empty-state-icon">📐</div>
                <div class="empty-state-title">Planimetria</div>
                <div class="empty-state-text">Carica la planimetria dell'unita' (opzionale)</div>
            </div>
            <div style="padding: 0 16px; display: flex; flex-direction: column; gap: 8px;">
                <button class="btn btn-primary" id="setup-photo-camera">📷 Scatta Foto</button>
                <button class="btn btn-outline" id="setup-photo-gallery">🖼 Carica da Galleria</button>
                <button class="btn btn-secondary" id="setup-skip-photo">${planPhotos.length > 0 ? 'Procedi' : 'Salta'}</button>
            </div>
        `;

        container.innerHTML = html;

        // Render thumbnails
        this._renderPlanThumbnails(planPhotos);

        // Photo handlers
        const handlePhoto = async (result) => {
            if (!result) return;
            const { id } = await Photos.save(this.sopId, '__planimetria__', 'planimetria', result.blob, result.thumbnail);
            await Events.dispatch('upload_planimetria', this.sopId, { photo_id: id });
            UI.toast('Planimetria caricata');
            const updated = await DB.getSopralluogo(this.sopId);
            this._step = 'planimetria';
            this._renderStep(container, updated);
        };

        document.getElementById('setup-photo-camera').addEventListener('click', async () => {
            handlePhoto(await Photos.takePhoto());
        });
        document.getElementById('setup-photo-gallery').addEventListener('click', async () => {
            handlePhoto(await Photos.fromGallery());
        });

        document.getElementById('setup-skip-photo').addEventListener('click', async () => {
            await Events.dispatch('update_setup', this.sopId, { _planimetria_done: true });
            App.navigate(`anagrafica/${this.sopId}`);
        });
    },

    async _renderPlanThumbnails(photoIds) {
        const grid = document.getElementById('plan-photos-grid');
        if (!grid || photoIds.length === 0) return;
        let html = '';
        for (const pid of photoIds) {
            const photo = await DB.getPhoto(pid);
            if (photo && photo.thumbnail) {
                html += `<div class="photo-thumb" data-photo-id="${pid}">
                    <img src="${photo.thumbnail}" alt="Planimetria">
                </div>`;
            }
        }
        grid.innerHTML = html;
    },

    // ========== HELPERS ==========

    /**
     * Barra riepilogativa dati inseriti
     */
    _summaryBar(sop) {
        const parts = [];
        if (sop.building_code) parts.push(sop.building_code);
        if (sop.building_address) parts.push(sop.building_address);
        if (sop.unit_type) parts.push(sop.manual_unit_type || sop.unit_type);
        if (sop.floor) parts.push(sop.floor);
        if (parts.length === 0) return '';
        return `<div style="padding: 8px 16px; color: var(--hint); font-size: 13px;">${parts.map(p => UI._escapeHtml(p)).join(' | ')}</div>`;
    },

    /**
     * Avanza allo step successivo
     */
    async _advance(container) {
        const sop = await DB.getSopralluogo(this.sopId);
        this._step = this._detectStep(sop);
        if (this._step === 'done') {
            App.navigate(`anagrafica/${this.sopId}`);
        } else {
            this._renderStep(container, sop);
        }
    },

    /**
     * Calcola step precedente
     */
    _getPrevStep(sop) {
        const order = ['building_code', 'building_address', 'unit_type', 'manual_desc',
            'subalterno', 'interno', 'indirizzo_civico', 'identificativo', 'identificativo_pc',
            'multi_floor', 'select_floors', 'floor', 'stair', 'planimetria'];
        const idx = order.indexOf(this._step);
        if (idx <= 0) return null;
        // Walk backwards to find applicable step
        for (let i = idx - 1; i >= 0; i--) {
            const s = order[i];
            if (this._isStepApplicable(s, sop)) return s;
        }
        return null;
    },

    _isStepApplicable(step, sop) {
        const ut = sop.unit_type;
        if (step === 'manual_desc') return ut === 'Scrivi a Mano' || ut === 'Edificio Complesso';
        if (step === 'subalterno') return ['Abitazione', 'Ufficio', 'Negozio', 'Garage', 'Autorimessa', 'Box', 'Posto auto'].includes(ut);
        if (step === 'interno') return ['Abitazione', 'Ufficio'].includes(ut);
        if (step === 'indirizzo_civico') return ['Negozio', 'Garage', 'Autorimessa', 'Box', 'Posto auto'].includes(ut);
        if (step === 'identificativo') return ['Cantina', 'Soffitta'].includes(ut);
        if (step === 'identificativo_pc') return ut === 'Parti Comuni';
        if (step === 'select_floors') return sop.is_multi_floor === true;
        return true;
    },

    /**
     * Undo: torna indietro cancellando il dato dello step
     */
    async _undoStep(prevStep, sop) {
        // Clear current step data
        const clearMap = {
            building_code: { building_code: '' },
            building_address: { building_address: '' },
            unit_type: { unit_type: '', manual_unit_type: null, subalterno: '', unit_internal: '' },
            manual_desc: { manual_unit_type: null },
            subalterno: { subalterno: '' },
            interno: { unit_internal: '' },
            indirizzo_civico: { unit_internal: '' },
            identificativo: { unit_internal: '' },
            identificativo_pc: { unit_internal: '' },
            multi_floor: { is_multi_floor: null, building_floors: [] },
            select_floors: { building_floors: [] },
            floor: { floor: '' },
            stair: { stair: '' }
        };

        // Clear data from current step
        const toClear = clearMap[this._step];
        if (toClear) {
            await Events.dispatch('update_setup', this.sopId, toClear);
        }

        const updated = await DB.getSopralluogo(this.sopId);
        this._step = prevStep;
        this._renderStep(document.getElementById('content'), updated);
    },

    /**
     * Genera unit_name da dati disponibili
     */
    async _buildUnitName(sop) {
        const ut = sop.unit_type;
        let unitName = '';

        if (ut === 'Scrivi a Mano' || ut === 'Edificio Complesso') {
            unitName = sop.manual_unit_type || ut;
        } else if (['Abitazione', 'Ufficio', 'Negozio', 'Garage', 'Autorimessa', 'Box', 'Posto auto'].includes(ut)) {
            const parts = [ut];
            if (sop.subalterno) parts.push(`Sub. ${sop.subalterno}`);
            if (sop.unit_internal) parts.push(sop.unit_internal);
            unitName = parts.join(' - ');
        } else if (['Cantina', 'Soffitta'].includes(ut)) {
            unitName = sop.unit_internal ? `${ut} - ${sop.unit_internal}` : ut;
        } else if (ut === 'Parti Comuni') {
            unitName = 'Parti Comuni';
        } else {
            unitName = ut || '';
        }

        if (unitName && sop.unit_name !== unitName) {
            await Events.dispatch('update_setup', this.sopId, { unit_name: unitName });
        }
    }
};
