/**
 * components.js - Componenti UI riutilizzabili
 * Flat Design: rgb(128,0,0) + rgb(27,29,31) + white
 * XSS prevention: _escapeHtml() su tutti i dati utente
 */
const UI = {
    /**
     * Escape HTML per prevenzione XSS
     */
    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Mostra toast notification
     */
    toast(message, duration = 2500) {
        const el = document.getElementById('toast');
        el.textContent = message;
        el.classList.remove('hidden');
        clearTimeout(UI._toastTimer);
        UI._toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
    },
    _toastTimer: null,

    /**
     * Mostra/nascondi modal
     */
    showModal(html) {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        content.innerHTML = html;
        overlay.classList.remove('hidden');
        overlay.onclick = (e) => {
            if (e.target === overlay) UI.hideModal();
        };
    },

    hideModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    },

    /**
     * Imposta titolo header
     */
    setTitle(title) {
        document.getElementById('header-title').textContent = title;
    },

    /**
     * Mostra/nascondi back button
     */
    showBack(show, onClick) {
        const btn = document.getElementById('btn-back');
        if (show) {
            btn.classList.remove('hidden');
            btn.onclick = onClick || (() => history.back());
        } else {
            btn.classList.add('hidden');
            btn.onclick = null;
        }
    },

    // ========== LAYOUT COMPONENTS ==========

    /**
     * Crea una sezione raggruppata
     */
    section(header, bodyHtml) {
        return `
            <div class="section">
                ${header ? `<div class="section-header">${UI._escapeHtml(header)}</div>` : ''}
                <div class="section-body">${bodyHtml}</div>
            </div>
        `;
    },

    /**
     * Header contestuale (appartamento / pertinenza)
     */
    contextHeader(text, icon) {
        return `
            <div class="context-header">
                ${icon ? `<span class="context-header-icon">${icon}</span>` : ''}
                <span class="context-header-text">${UI._escapeHtml(text)}</span>
            </div>
        `;
    },

    /**
     * Info card (per riepilogo dati)
     */
    infoCard(rows) {
        const rowsHtml = rows.map(r => `
            <div class="summary-row">
                <span class="summary-label">${UI._escapeHtml(r.label)}</span>
                <span class="summary-value">${UI._escapeHtml(r.value)}</span>
            </div>
        `).join('');
        return `<div class="info-card">${rowsHtml}</div>`;
    },

    /**
     * Divider
     */
    divider() {
        return '<div class="divider"></div>';
    },

    // ========== INTERACTIVE COMPONENTS ==========

    /**
     * Crea una cella cliccabile
     */
    cell({ icon, title, subtitle, badge, chevron = true, onClick, dataId, className }) {
        const esc = UI._escapeHtml;
        const attrs = dataId ? ` data-id="${esc(dataId)}"` : '';
        const cls = className ? ` ${className}` : '';
        const onClickAttr = onClick ? ` onclick="${onClick}"` : '';
        return `
            <div class="cell${cls}"${attrs}${onClickAttr}>
                ${icon ? `<div class="cell-icon">${icon}</div>` : ''}
                <div class="cell-body">
                    <div class="cell-title">${esc(title)}</div>
                    ${subtitle ? `<div class="cell-subtitle">${esc(subtitle)}</div>` : ''}
                </div>
                ${badge ? `<span class="cell-badge">${esc(badge)}</span>` : ''}
                ${chevron ? '<span class="cell-chevron">&#8250;</span>' : ''}
            </div>
        `;
    },

    /**
     * Crea griglia di bottoni scelta
     */
    buttonGrid(items, options = {}) {
        const colsCls = options.cols === 3 ? 'btn-grid-3' : options.cols === 1 ? 'btn-grid-1' : '';
        const buttons = items.map((item) => {
            const val = typeof item === 'string' ? item : item.value;
            const label = typeof item === 'string' ? item : item.label;
            const cls = (typeof item === 'object' && item.className) ? ` ${item.className}` : '';
            const disabled = (typeof item === 'object' && item.disabled) ? ' disabled' : '';
            return `<button class="btn-choice${cls}" data-value="${UI._escapeHtml(val)}"${disabled}>${UI._escapeHtml(label)}</button>`;
        }).join('');
        return `<div class="btn-grid ${colsCls}">${buttons}</div>`;
    },

    /**
     * Griglia piani (layout 3 colonne con abbreviazioni)
     */
    floorGrid(floors, selectedFloors) {
        selectedFloors = selectedFloors || [];
        const buttons = floors.map(f => {
            const abbr = CONFIG.getFloorAbbr(f);
            const selected = selectedFloors.includes(f) ? ' selected' : '';
            return `<button class="btn-choice btn-floor${selected}" data-value="${UI._escapeHtml(f)}" title="${UI._escapeHtml(f)}">${UI._escapeHtml(abbr)}</button>`;
        }).join('');
        return `<div class="btn-grid btn-grid-3">${buttons}</div>`;
    },

    /**
     * Griglia categorie Parti Comuni (3 pulsanti grandi)
     */
    pcCategoryGrid() {
        return `
            <div class="pc-cat-grid">
                <button class="pc-cat-btn" data-cat="vani">
                    <span class="pc-cat-icon">🏠</span>
                    <span class="pc-cat-label">Vani</span>
                </button>
                <button class="pc-cat-btn" data-cat="scale">
                    <span class="pc-cat-icon">🪜</span>
                    <span class="pc-cat-label">Scale</span>
                </button>
                <button class="pc-cat-btn" data-cat="prospetti">
                    <span class="pc-cat-icon">🏛</span>
                    <span class="pc-cat-label">Prospetti</span>
                </button>
            </div>
        `;
    },

    /**
     * Crea menu raggruppato con chips (per wizard)
     */
    groupedMenu(groups, multiSelect = false) {
        let html = '';
        for (const [title, items] of Object.entries(groups)) {
            const chips = items.map((item) => {
                const cls = multiSelect ? 'menu-chip check' : 'menu-chip';
                return `<button class="${cls}" data-value="${UI._escapeHtml(item)}">${UI._escapeHtml(item)}</button>`;
            }).join('');
            html += `
                <div class="menu-group">
                    <div class="menu-group-title">${UI._escapeHtml(title)}</div>
                    <div class="menu-group-items">${chips}</div>
                </div>
            `;
        }
        return html;
    },

    /**
     * Crea chips piatti (senza gruppi)
     */
    chipList(items, multiSelect = false) {
        const cls = multiSelect ? 'menu-chip check' : 'menu-chip';
        const chips = items.map((item) =>
            `<button class="${cls}" data-value="${UI._escapeHtml(item)}">${UI._escapeHtml(item)}</button>`
        ).join('');
        return `<div class="menu-group-items" style="padding: 8px 16px;">${chips}</div>`;
    },

    /**
     * Toggle switch con label
     */
    toggleRow(label, checked, id) {
        return `
            <div class="toggle-row">
                <span class="toggle-label">${UI._escapeHtml(label)}</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="${UI._escapeHtml(id)}"${checked ? ' checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `;
    },

    // ========== PROGRESS & STATUS ==========

    /**
     * Stepper indicatore step
     */
    stepper(total, current) {
        let dots = '';
        for (let i = 0; i < total; i++) {
            const cls = i < current ? 'done' : i === current ? 'active' : '';
            dots += `<div class="stepper-dot ${cls}"></div>`;
        }
        return `<div class="stepper">${dots}</div>`;
    },

    /**
     * Progress bar
     */
    progressBar(current, total, label) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        return `
            <div class="progress-container">
                ${label ? `<div class="progress-label">${UI._escapeHtml(label)}</div>` : ''}
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${pct}%"></div>
                </div>
                <div class="progress-text">${current}/${total}</div>
            </div>
        `;
    },

    /**
     * Status badge
     */
    statusBadge(status) {
        const labels = {
            accessible: 'Accessibile',
            non_accessibile: 'Non Accessibile',
            non_valutabile: 'Non Valutabile',
            non_autorizzato: 'Non Autorizzato',
            completed: 'Completato',
            in_progress: 'In Corso'
        };
        return `<span class="status-badge status-${UI._escapeHtml(status)}">${UI._escapeHtml(labels[status] || status)}</span>`;
    },

    /**
     * Mostra superfici mancanti per un vano
     */
    missingSurfaces(completedSurfaces, isStair, isProspetto) {
        if (isStair || isProspetto) return ''; // No surface tracking
        const completed = completedSurfaces || [];
        const required = CONFIG.REQUIRED_SURFACES || ['Soffitto', 'Pareti', 'Pavimento'];
        const missing = required.filter(s => !completed.includes(s));
        if (missing.length === 0) return '';
        return `<div class="missing-surfaces">Superfici mancanti: ${UI._escapeHtml(missing.join(', '))}</div>`;
    },

    // ========== OBSERVATION CARD ==========

    /**
     * Card osservazione con bottoni edit/delete
     */
    observationCard(obs, index, options = {}) {
        const esc = UI._escapeHtml;
        const photoLabel = obs.photo_id ? '📷 Con foto' : 'Senza foto';
        const showActions = options.showActions !== false;

        let elemLabel = obs.stair_subsection || obs.wall || obs.balcone_sub || obs.element || '';
        if (obs.has_counterwall) elemLabel += ' (c/p)';
        if (obs.infisso_type) {
            const parts = [obs.infisso_type];
            if (obs.infisso_which) parts.push(obs.infisso_which);
            elemLabel = parts.join(' ');
        }

        // Use formatters.js if available, fallback to simple text
        let obsText = '';
        if (typeof Formatters !== 'undefined' && Formatters.formatObservationText) {
            obsText = Formatters.formatObservationText(obs, { includeVF: false });
        } else {
            obsText = obs.phenomenon || '';
        }

        let actionsHtml = '';
        if (showActions) {
            actionsHtml = `<div class="obs-card-actions">
                <button class="obs-btn-edit" data-obs-index="${index}" title="Modifica">✏️</button>
                <button class="obs-btn-delete" data-obs-index="${index}" title="Elimina">🗑</button>
            </div>`;
        }

        return `
            <div class="obs-card" data-obs-index="${index}">
                <div class="obs-card-element">${esc(elemLabel)}</div>
                <div class="obs-card-text">${esc(obsText)}</div>
                <div class="obs-card-footer">
                    <span class="obs-card-photo">${photoLabel}</span>
                    ${actionsHtml}
                </div>
            </div>
        `;
    },

    // ========== EMPTY STATES & FEEDBACK ==========

    /**
     * Empty state
     */
    emptyState(icon, title, text) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <div class="empty-state-title">${UI._escapeHtml(title)}</div>
                <div class="empty-state-text">${UI._escapeHtml(text)}</div>
            </div>
        `;
    },

    /**
     * Loading spinner
     */
    spinner(text) {
        return `
            <div class="loading-container">
                <div class="spinner"></div>
                ${text ? `<div class="loading-text">${UI._escapeHtml(text)}</div>` : ''}
            </div>
        `;
    },

    /**
     * Banner allontanamento
     */
    allontanaBanner(text) {
        return `
            <div class="allontana-banner">
                <span class="allontana-icon">🚪</span>
                <span class="allontana-text">${UI._escapeHtml(text)}</span>
            </div>
        `;
    },

    // ========== FORM COMPONENTS ==========

    /**
     * Form input con label
     */
    formInput({ label, placeholder, id, type = 'text', value = '', multiline = false, rows = 3 }) {
        const esc = UI._escapeHtml;
        const inputEl = multiline
            ? `<textarea class="form-input form-textarea" id="${esc(id)}" placeholder="${esc(placeholder || '')}" rows="${rows}">${esc(value)}</textarea>`
            : `<input class="form-input" type="${esc(type)}" id="${esc(id)}" placeholder="${esc(placeholder || '')}" value="${esc(value)}">`;
        return `
            <div class="form-group">
                ${label ? `<label class="form-label" for="${esc(id)}">${esc(label)}</label>` : ''}
                ${inputEl}
            </div>
        `;
    },

    // ========== DIALOGS ==========

    /**
     * Conferma azione distruttiva
     */
    confirmAction(message, onConfirm, options = {}) {
        const confirmLabel = options.confirmLabel || 'Conferma';
        const cancelLabel = options.cancelLabel || 'Annulla';
        const destructive = options.destructive !== false;
        const btnStyle = destructive ? ' style="background:var(--destructive)"' : '';

        const html = `
            <div class="modal-title">${UI._escapeHtml(message)}</div>
            <div style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px;">
                <button class="btn btn-primary" id="modal-confirm"${btnStyle}>${UI._escapeHtml(confirmLabel)}</button>
                <button class="btn btn-secondary" id="modal-cancel">${UI._escapeHtml(cancelLabel)}</button>
            </div>
        `;
        UI.showModal(html);
        document.getElementById('modal-confirm').addEventListener('click', () => {
            UI.hideModal();
            onConfirm();
        });
        document.getElementById('modal-cancel').addEventListener('click', () => UI.hideModal());
    },

    /**
     * Prompt con input testuale
     */
    promptInput(title, placeholder, onConfirm, options = {}) {
        const defaultVal = options.defaultValue || '';
        const multiline = options.multiline || false;
        const inputEl = multiline
            ? `<textarea class="form-input form-textarea" id="modal-input" placeholder="${UI._escapeHtml(placeholder)}" rows="4">${UI._escapeHtml(defaultVal)}</textarea>`
            : `<input class="form-input" id="modal-input" type="text" placeholder="${UI._escapeHtml(placeholder)}" value="${UI._escapeHtml(defaultVal)}">`;

        const html = `
            <div class="modal-title">${UI._escapeHtml(title)}</div>
            <div style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px;">
                ${inputEl}
                <button class="btn btn-primary" id="modal-confirm">Conferma</button>
                <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
            </div>
        `;
        UI.showModal(html);
        const input = document.getElementById('modal-input');
        input.focus();
        document.getElementById('modal-confirm').addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                UI.hideModal();
                onConfirm(val);
            }
        });
        document.getElementById('modal-cancel').addEventListener('click', () => UI.hideModal());
    },

    /**
     * Modal scelta multipla
     */
    choiceModal(title, choices, onSelect) {
        const btns = choices.map((c, i) => {
            const val = typeof c === 'string' ? c : c.value;
            const label = typeof c === 'string' ? c : c.label;
            return `<button class="btn btn-secondary modal-choice-btn" data-idx="${i}" data-value="${UI._escapeHtml(val)}">${UI._escapeHtml(label)}</button>`;
        }).join('');

        const html = `
            <div class="modal-title">${UI._escapeHtml(title)}</div>
            <div style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px;">
                ${btns}
            </div>
        `;
        UI.showModal(html);
        document.querySelectorAll('.modal-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.hideModal();
                onSelect(btn.dataset.value, parseInt(btn.dataset.idx));
            });
        });
    },

    // ========== PERTINENZE ==========

    /**
     * Item pertinenza nella lista
     */
    pertinenzaItem(pert, index, options = {}) {
        const esc = UI._escapeHtml;
        const completed = pert.completed ? '✅' : '⬜';
        const roomCount = pert.rooms ? Object.keys(pert.rooms).length : 0;
        const subtitle = roomCount > 0 ? `${roomCount} vani` : 'Nessun vano';
        return `
            <div class="cell pert-item" data-pert-index="${index}">
                <div class="cell-icon">${completed}</div>
                <div class="cell-body">
                    <div class="cell-title">${esc(pert.type || 'Pertinenza')}</div>
                    <div class="cell-subtitle">${esc(subtitle)}</div>
                </div>
                <span class="cell-chevron">&#8250;</span>
            </div>
        `;
    },

    // ========== WIZARD HEADER ==========

    /**
     * Header wizard con titolo elemento e step
     */
    wizardHeader(elementLabel, stepInfo) {
        return `
            <div class="wizard-header">
                <div class="wizard-element">${UI._escapeHtml(elementLabel)}</div>
                ${stepInfo ? `<div class="wizard-step">${UI._escapeHtml(stepInfo)}</div>` : ''}
            </div>
        `;
    },

    /**
     * Preview box (per anteprima testo verbale/cappello/chiusura)
     */
    previewBox(text, options = {}) {
        const maxHeight = options.maxHeight || '300px';
        return `
            <div class="preview-box" style="max-height: ${maxHeight}; overflow-y: auto;">
                <pre class="preview-text">${UI._escapeHtml(text)}</pre>
            </div>
        `;
    },

    /**
     * Phase tabs (per navigazione Step 1/2/3)
     */
    phaseTabs(currentPhase) {
        const phases = [
            { num: 1, label: 'Anagrafica' },
            { num: 2, label: 'Sopralluogo' },
            { num: 3, label: 'Revisione' }
        ];
        const tabs = phases.map(p => {
            const active = p.num === currentPhase ? ' active' : '';
            const done = p.num < currentPhase ? ' done' : '';
            return `<div class="phase-tab${active}${done}" data-phase="${p.num}">${p.num}. ${p.label}</div>`;
        }).join('');
        return `<div class="phase-tabs">${tabs}</div>`;
    },

    // ========== RENDER TO CONTENT ==========

    /**
     * Render HTML nel content area principale
     */
    render(html) {
        const content = document.getElementById('content');
        if (content) content.innerHTML = html;
    },

    /**
     * Append HTML al content area
     */
    append(html) {
        const content = document.getElementById('content');
        if (content) content.insertAdjacentHTML('beforeend', html);
    }
};
