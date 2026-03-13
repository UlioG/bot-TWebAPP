/* ============================================================
 * components.js — UI helpers riutilizzabili
 * ============================================================ */

'use strict';

const UI = (() => {

    // ===== CREA BOTTONE =====
    function btn(text, className, onClick) {
        const b = document.createElement('button');
        b.className = 'btn ' + (className || '');
        b.textContent = text;
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }

    // ===== GRIGLIA BOTTONI =====
    function buttonGrid(items, cols, onClick) {
        const grid = document.createElement('div');
        grid.className = `btn-grid cols-${cols || 2}`;
        items.forEach(item => {
            const label = typeof item === 'string' ? item : item.label;
            const value = typeof item === 'string' ? item : item.value;
            const cls = typeof item === 'object' && item.className ? item.className : 'btn-secondary';
            const b = btn(label, cls, () => onClick(value, b));
            if (typeof item === 'object' && item.selected) b.classList.add('selected');
            grid.appendChild(b);
        });
        return grid;
    }

    // ===== CARD =====
    function card(title, content, onClick) {
        const c = document.createElement('div');
        c.className = 'card';
        if (onClick) { c.style.cursor = 'pointer'; c.addEventListener('click', onClick); }
        if (title) {
            const t = document.createElement('div');
            t.className = 'card-title';
            t.textContent = title;
            c.appendChild(t);
        }
        if (typeof content === 'string') {
            const p = document.createElement('div');
            p.className = 'card-subtitle';
            p.textContent = content;
            c.appendChild(p);
        } else if (content instanceof HTMLElement) {
            c.appendChild(content);
        }
        return c;
    }

    // ===== SECTION HEADER =====
    function sectionHeader(text) {
        const h = document.createElement('div');
        h.className = 'section-header';
        h.textContent = text;
        return h;
    }

    // ===== FORM INPUT =====
    function formGroup(label, type, value, placeholder, attrs) {
        const group = document.createElement('div');
        group.className = 'form-group';
        if (label) {
            const lbl = document.createElement('label');
            lbl.className = 'form-label';
            lbl.textContent = label;
            group.appendChild(lbl);
        }
        let input;
        if (type === 'textarea') {
            input = document.createElement('textarea');
        } else {
            input = document.createElement('input');
            input.type = type || 'text';
        }
        input.className = 'form-input';
        input.value = value || '';
        if (placeholder) input.placeholder = placeholder;
        if (attrs) Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
        group.appendChild(input);
        return { group, input };
    }

    // ===== ROOM CARD =====
    function roomCard(name, meta, statusClass, onClick) {
        const c = document.createElement('div');
        c.className = 'room-card ' + (statusClass || '');
        c.innerHTML = `
            <div class="room-info">
                <div class="room-name">${_esc(name)}</div>
                <div class="room-meta">${_esc(meta || '')}</div>
            </div>
            <div class="room-arrow">&#8250;</div>
        `;
        if (onClick) c.addEventListener('click', onClick);
        return c;
    }

    // ===== BADGE =====
    function badge(text, type) {
        const b = document.createElement('span');
        b.className = 'badge badge-' + (type || 'info');
        b.textContent = text;
        return b;
    }

    // ===== EMPTY STATE =====
    function emptyState(icon, text) {
        const d = document.createElement('div');
        d.className = 'empty-state';
        d.innerHTML = `<div class="empty-icon">${icon || ''}</div><div class="empty-text">${_esc(text)}</div>`;
        return d;
    }

    // ===== PREVIEW BLOCK =====
    function previewBlock(text) {
        const d = document.createElement('div');
        d.className = 'preview-block';
        d.textContent = text;
        return d;
    }

    // ===== REVIEW SECTION =====
    function reviewSection(title, content, onEdit) {
        const sec = document.createElement('div');
        sec.className = 'review-section';
        const header = document.createElement('div');
        header.className = 'review-section-header';
        const t = document.createElement('div');
        t.className = 'review-section-title';
        t.textContent = title;
        header.appendChild(t);
        if (onEdit) {
            const editBtn = document.createElement('button');
            editBtn.className = 'review-edit-btn';
            editBtn.textContent = 'Modifica';
            editBtn.addEventListener('click', onEdit);
            header.appendChild(editBtn);
        }
        sec.appendChild(header);
        if (typeof content === 'string') {
            sec.appendChild(previewBlock(content));
        } else if (content instanceof HTMLElement) {
            sec.appendChild(content);
        }
        return sec;
    }

    // ===== TOGGLE =====
    function toggle(label, options, selected, onChange) {
        const row = document.createElement('div');
        row.className = 'toggle-row';
        const lbl = document.createElement('span');
        lbl.textContent = label;
        row.appendChild(lbl);
        const btns = document.createElement('div');
        btns.className = 'toggle-btns';
        options.forEach(opt => {
            const b = document.createElement('button');
            b.className = 'toggle-btn' + (opt.value === selected ? ' active' : '');
            b.textContent = opt.label;
            b.addEventListener('click', () => {
                btns.querySelectorAll('.toggle-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                onChange(opt.value);
            });
            btns.appendChild(b);
        });
        row.appendChild(btns);
        return row;
    }

    // ===== OBSERVATION ITEM =====
    function obsItem(number, text, onDelete) {
        const li = document.createElement('li');
        li.className = 'obs-item';
        li.innerHTML = `<div class="obs-number">${number}</div><div class="obs-text">${_esc(text)}</div>`;
        if (onDelete) {
            const del = document.createElement('button');
            del.className = 'btn btn-sm btn-danger';
            del.textContent = 'X';
            del.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
            li.appendChild(del);
        }
        return li;
    }

    // ===== ESCAPE HTML =====
    function _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return {
        btn, buttonGrid, card, sectionHeader, formGroup,
        roomCard, badge, emptyState, previewBlock,
        reviewSection, toggle, obsItem, esc: _esc
    };

})();
