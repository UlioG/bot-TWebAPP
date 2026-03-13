/* ============================================================
 * anagrafica.js — Schermata unica figure presenti + cappello
 * Flusso: schermata unificata → cappello → step 2
 * ============================================================ */

'use strict';

const AnagraficaView = (() => {

    let _sop = null;
    let _subStep = 'main'; // main | cappello | cappello_edit
    let _rmPresente = true;

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        if (!_sop) { App.toast('Sopralluogo non trovato'); return; }
        _rmPresente = _sop.rm_presente !== false;
        _subStep = (params && params.sub) || 'main';
        _render(container);
    }

    function _render(container) {
        container.innerHTML = '';
        switch (_subStep) {
            case 'main': _renderMain(container); break;
            case 'cappello': _renderCappello(container); break;
            case 'cappello_edit': _renderCappelloEdit(container); break;
        }
    }

    // ===== SCHERMATA UNIFICATA =====
    function _renderMain(container) {
        container.appendChild(UI.sectionHeader('Proprietario'));

        // Tipo proprietario (Persona / Societa)
        const ownerType = (_sop.owner && typeof _sop.owner === 'object') ? _sop.owner.type : 'persona';
        container.appendChild(UI.toggle('Tipo', [
            { label: 'Persona', value: 'persona' },
            { label: 'Societa', value: 'societa' }
        ], ownerType, (val) => {
            const nameInput = container.querySelector('#owner-name');
            const companyBlock = container.querySelector('#company-block');
            if (val === 'societa') {
                if (nameInput) nameInput.placeholder = 'Ragione Sociale';
                if (companyBlock) companyBlock.classList.remove('hidden');
            } else {
                if (nameInput) nameInput.placeholder = 'Nome e Cognome';
                if (companyBlock) companyBlock.classList.add('hidden');
            }
        }));

        // Nome
        const ownerName = (_sop.owner && typeof _sop.owner === 'object') ?
            (_sop.owner.name || '') : (_sop.owner || '');
        const { group: nameGrp, input: nameInput } = UI.formGroup(null, 'text', ownerName,
            ownerType === 'societa' ? 'Ragione Sociale' : 'Nome e Cognome');
        nameInput.id = 'owner-name';
        container.appendChild(nameGrp);

        // Amministratore (solo societa)
        const adminVal = (_sop.owner && typeof _sop.owner === 'object') ? (_sop.owner.admin || '') : '';
        const companyBlock = document.createElement('div');
        companyBlock.id = 'company-block';
        companyBlock.className = ownerType === 'societa' ? '' : 'hidden';
        const { group: adminGrp, input: adminInput } = UI.formGroup('Amministratore', 'text', adminVal, 'Nome amministratore');
        adminInput.id = 'owner-admin';
        companyBlock.appendChild(adminGrp);
        container.appendChild(companyBlock);

        // --- RM Presente ---
        container.appendChild(UI.sectionHeader('Roma Metropolitane'));
        const rmToggle = UI.toggle('Presente', [
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], _rmPresente, (val) => {
            _rmPresente = val;
            const rmField = container.querySelector('#rm-field');
            if (rmField) rmField.classList.toggle('hidden', !val);
        });
        container.appendChild(rmToggle);

        const rmField = document.createElement('div');
        rmField.id = 'rm-field';
        rmField.className = _rmPresente ? '' : 'hidden';
        const { group: rmGrp, input: rmInput } = UI.formGroup(null, 'text', _sop.attendees_rm || '', 'Nome RM');
        rmInput.id = 'rm-input';
        rmField.appendChild(rmGrp);
        container.appendChild(rmField);

        // --- Tecnico Metro C ---
        container.appendChild(UI.sectionHeader('Tecnico Metro C'));
        const { group: techGrp, input: techInput } = UI.formGroup(null, 'text', _sop.attendees_metro_tech || '', 'Nome Tecnico');
        techInput.id = 'tech-input';
        container.appendChild(techGrp);

        // --- Collaboratori ---
        container.appendChild(UI.sectionHeader('Collaboratori'));
        const collContainer = document.createElement('div');
        collContainer.id = 'coll-container';
        const collabs = _sop.attendees_metro_coll || [];
        if (Array.isArray(collabs)) {
            collabs.forEach((c, i) => {
                collContainer.appendChild(_collRow(i, c));
            });
        }
        container.appendChild(collContainer);

        container.appendChild(UI.btn('+ Aggiungi Collaboratore', 'btn-outline btn-block btn-sm mt-8', () => {
            const cc = document.getElementById('coll-container');
            const idx = cc.querySelectorAll('.coll-row').length;
            cc.appendChild(_collRow(idx, ''));
        }));

        // --- Avanti ---
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block btn-lg mt-16', () => _saveAll(container)));
    }

    function _collRow(index, value) {
        const row = document.createElement('div');
        row.className = 'coll-row';
        row.innerHTML = `
            <input type="text" class="form-input coll-input" value="${UI.esc(value || '')}" placeholder="Collaboratore ${index + 1}">
            <button class="btn-remove" aria-label="Rimuovi">×</button>
        `;
        row.querySelector('.btn-remove').addEventListener('click', () => {
            row.remove();
            _reindexCollaborators();
        });
        return row;
    }

    function _reindexCollaborators() {
        const rows = document.querySelectorAll('#coll-container .coll-row');
        rows.forEach((row, i) => {
            const input = row.querySelector('.coll-input');
            if (input) input.placeholder = `Collaboratore ${i + 1}`;
        });
    }

    async function _saveAll(container) {
        // Raccogliere TUTTI i campi dal DOM
        const nameInput = container.querySelector('#owner-name');
        const adminInput = container.querySelector('#owner-admin');
        const rmInput = container.querySelector('#rm-input');
        const techInput = container.querySelector('#tech-input');
        const typeToggle = container.querySelector('.toggle-btns .active');

        const ownerType = typeToggle ? (typeToggle.textContent === 'Societa' ? 'societa' : 'persona') : 'persona';

        _sop.owner = {
            type: ownerType,
            name: nameInput ? nameInput.value.trim() : '',
            admin: adminInput ? adminInput.value.trim() : ''
        };

        _sop.rm_presente = _rmPresente;
        _sop.attendees_rm = rmInput ? rmInput.value.trim() : '';
        _sop.attendees_metro_tech = techInput ? techInput.value.trim() : '';

        // Collaboratori
        const collInputs = container.querySelectorAll('.coll-input');
        _sop.attendees_metro_coll = Array.from(collInputs)
            .map(i => i.value.trim())
            .filter(v => v);

        // Cattura start_time se non presente
        if (!_sop.start_time) _sop.start_time = Date.now();

        await DB.saveSopralluogo(_sop);

        // Vai al cappello
        _subStep = 'cappello';
        _render(container);
    }

    // ===== CAPPELLO =====
    function _renderCappello(container) {
        container.appendChild(UI.sectionHeader('Anteprima Testo Introduttivo'));
        const text = _sop.custom_cappello || _generateCappello();
        container.appendChild(UI.previewBlock(text));

        container.appendChild(UI.btn('Conferma', 'btn-primary btn-block mt-16', async () => {
            if (!_sop.custom_cappello) _sop.custom_cappello = null; // auto
            _sop.phase = Config.PHASES.SOPRALLUOGO;
            await DB.saveSopralluogo(_sop);
            App.navigate('rooms', { id: _sop.id });
        }));

        container.appendChild(UI.btn('Modifica', 'btn-outline btn-block mt-8', () => {
            _subStep = 'cappello_edit';
            _render(container);
        }));

        container.appendChild(UI.btn('Salta', 'btn-secondary btn-block mt-8', async () => {
            _sop.custom_cappello = null;
            _sop.phase = Config.PHASES.SOPRALLUOGO;
            await DB.saveSopralluogo(_sop);
            App.navigate('rooms', { id: _sop.id });
        }));
    }

    function _renderCappelloEdit(container) {
        container.appendChild(UI.sectionHeader('Modifica Testo Introduttivo'));
        const text = _sop.custom_cappello || _generateCappello();
        const { group, input } = UI.formGroup(null, 'textarea', text, '');
        container.appendChild(group);

        container.appendChild(UI.btn('Salva', 'btn-primary btn-block mt-16', async () => {
            _sop.custom_cappello = input.value.trim() || null;
            await DB.saveSopralluogo(_sop);
            _subStep = 'cappello';
            _render(container);
        }));
    }

    function _generateCappello() {
        const d = _sop.start_time ? new Date(_sop.start_time) : new Date();
        const dateStr = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        const lines = [];
        lines.push(`In data ${dateStr} alle ore ${timeStr}, presso l'immobile sito in ${_sop.building_address || '___'}, si procede al sopralluogo dell'unita immobiliare ${_sop.unit_type || ''} ${_sop.unit_name || ''}.`);

        if (_sop.owner && _sop.owner.name) {
            const ownerStr = _sop.owner.type === 'societa' ?
                `${_sop.owner.name}${_sop.owner.admin ? ', nella persona di ' + _sop.owner.admin : ''}` :
                _sop.owner.name;
            lines.push(`Proprietario: ${ownerStr}.`);
        }

        const presenti = [];
        if (_sop.attendees_metro_tech) presenti.push(`Tecnico Metro C: ${_sop.attendees_metro_tech}`);
        if (_sop.attendees_metro_coll && _sop.attendees_metro_coll.length > 0) {
            presenti.push(`Collaboratori: ${_sop.attendees_metro_coll.join(', ')}`);
        }
        if (_sop.rm_presente && _sop.attendees_rm) presenti.push(`Roma Metropolitane: ${_sop.attendees_rm}`);
        if (presenti.length > 0) lines.push(`Figure presenti: ${presenti.join('; ')}.`);

        return lines.join('\n\n');
    }

    return { render };

})();
