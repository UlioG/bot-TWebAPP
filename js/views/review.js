/* ============================================================
 * review.js — Riepilogo finale (Step 3)
 * Mostra TUTTE le sezioni del verbale nell'ordine del DOCX.
 * Niente bottone "Anteprima Verbale" — la schermata E' il verbale.
 * ============================================================ */

'use strict';

const ReviewView = (() => {

    let _sop = null;
    let _editSection = null;

    async function render(container, params) {
        _sop = await DB.getSopralluogo(params.id);
        if (!_sop) { App.toast('Sopralluogo non trovato'); return; }
        _editSection = (params && params.edit) || null;

        if (_editSection) {
            _renderEdit(container);
        } else {
            await _renderMain(container);
        }
    }

    async function _renderMain(container) {
        container.innerHTML = '';

        // 1. INFO CARD
        const info = UI.card(
            `${_sop.building_code} — ${_sop.unit_type || ''}`,
            `Piano: ${_sop.floor || '-'} | Sub: ${_sop.subalterno || '-'} | Indirizzo: ${_sop.building_address || '-'}`
        );
        container.appendChild(info);

        // 2. STATISTICHE
        const stats = _calcStats();
        const statsCard = UI.card('Statistiche');
        statsCard.innerHTML += `
            <p>Vani: <strong>${stats.roomCount}</strong> | Osservazioni: <strong>${stats.obsCount}</strong> | Foto: <strong>${stats.photoCount}</strong></p>
            ${stats.pertCount > 0 ? `<p>Pertinenze: <strong>${stats.pertCount}</strong></p>` : ''}
        `;
        container.appendChild(statsCard);

        // 3. WARNINGS
        const warnings = _getWarnings();
        if (warnings.length > 0) {
            const warnCard = UI.card('Avvisi');
            warnings.forEach(w => {
                const p = document.createElement('p');
                p.innerHTML = `⚠️ ${UI.esc(w)}`;
                p.style.color = 'var(--warning)';
                warnCard.appendChild(p);
            });
            container.appendChild(warnCard);
        }

        // 4. CAPPELLO
        container.appendChild(UI.reviewSection(
            'Testo Introduttivo (Cappello)',
            Formatters.generateCappelloText(_sop),
            () => { _editSection = 'cappello'; _renderEdit(container); }
        ));

        // 5. VANI (testo generato per ogni vano)
        container.appendChild(UI.sectionHeader('Vani'));
        const roomNames = Object.keys(_sop.rooms);
        for (const name of roomNames) {
            const room = _sop.rooms[name];
            const status = _sop.room_status[name];
            const isSpecial = status && status !== 'accessible';

            let roomText;
            if (room.manual_text) {
                roomText = room.manual_text;
            } else if (isSpecial) {
                const labels = {
                    non_accessibile: 'NON ACCESSIBILE',
                    non_valutabile: 'NON VALUTABILE',
                    non_autorizzato: 'NON AUTORIZZATO'
                };
                roomText = labels[status] || status;
                if (room.disclaimer_note) roomText += ` — ${room.disclaimer_note}`;
            } else {
                roomText = Formatters.generateRoomText(room);
            }

            const header = `${name}`;
            const finishes = room.room_finishes ? `Finiture: ${room.room_finishes}` : '';

            const sec = document.createElement('div');
            sec.className = 'review-section';

            const hdr = document.createElement('div');
            hdr.className = 'review-section-header';
            const title = document.createElement('div');
            title.className = 'review-section-title';
            title.textContent = header;
            hdr.appendChild(title);

            const editBtn = document.createElement('button');
            editBtn.className = 'review-edit-btn';
            editBtn.textContent = 'Modifica Testo';
            editBtn.addEventListener('click', () => {
                _editSection = `room:${name}`;
                _renderEdit(container);
            });
            hdr.appendChild(editBtn);
            sec.appendChild(hdr);

            if (finishes) {
                const f = document.createElement('p');
                f.className = 'text-sm text-muted';
                f.textContent = finishes;
                sec.appendChild(f);
            }

            sec.appendChild(UI.previewBlock(roomText || '(nessuna osservazione)'));
            container.appendChild(sec);
        }

        // 6. PERTINENZE
        if (_sop.pertinenze && _sop.pertinenze.length > 0) {
            container.appendChild(UI.sectionHeader('Pertinenze'));
            _sop.pertinenze.forEach((pert, idx) => {
                const pertLabel = `${pert.type || ''} — Sub: ${pert.sub || '-'}`;
                const pertRooms = pert.rooms || pert._room_data || {};
                const roomKeys = Object.keys(pertRooms);

                container.appendChild(UI.card(pertLabel, `${roomKeys.length} vani`));

                roomKeys.forEach(rn => {
                    const pRoom = pertRooms[rn];
                    const pText = pRoom.manual_text || Formatters.generateRoomText(pRoom);
                    container.appendChild(UI.reviewSection(rn, pText || '(vuoto)'));
                });
            });
        }

        // 7. INTERRUZIONI
        if (_sop.allontana_events && _sop.allontana_events.length > 0) {
            const evList = document.createElement('div');
            _sop.allontana_events.forEach(ev => {
                const p = document.createElement('p');
                p.textContent = `${ev.type === 'allontana' ? 'Si Allontana' : 'Rientra'} alle ${ev.time}${ev.text ? ' — ' + ev.text : ''}`;
                evList.appendChild(p);
            });
            container.appendChild(UI.reviewSection('Interruzioni', evList));
        }

        // 8. NOTE GLOBALI
        if (_sop.global_notes && _sop.global_notes.length > 0) {
            const notesText = _sop.global_notes.join('\n');
            container.appendChild(UI.reviewSection('Note Globali', notesText, () => {
                _editSection = 'global_notes';
                _renderEdit(container);
            }));
        }

        // 9. NOTA OPERATORE
        container.appendChild(UI.reviewSection(
            'Nota Operatore',
            _sop.operator_note || '(nessuna nota)',
            () => { _editSection = 'operator_note'; _renderEdit(container); }
        ));

        // 10. CHIUSURA
        container.appendChild(UI.reviewSection(
            'Testo di Chiusura',
            Formatters.generateChiusuraText(_sop),
            () => { _editSection = 'chiusura'; _renderEdit(container); }
        ));

        // 11. FIRMATARI
        const signersEl = document.createElement('div');
        const signers = [
            { label: 'Tecnico Metro C', key: 'signer_metro_tech', value: _sop.signer_metro_tech },
            { label: 'Roma Metropolitane', key: 'signer_rm', value: _sop.signer_rm },
            { label: 'Collaboratore', key: 'signer_metro_coll', value: _sop.signer_metro_coll },
            { label: 'Proprietario', key: 'signer_owner', value: _sop.signer_owner }
        ];
        signers.forEach(s => {
            const p = document.createElement('p');
            p.innerHTML = `<strong>${s.label}:</strong> ${UI.esc(s.value || '(non impostato)')}`;
            signersEl.appendChild(p);
        });
        container.appendChild(UI.reviewSection('Firmatari', signersEl, () => {
            _editSection = 'signers';
            _renderEdit(container);
        }));

        // 12. PLANIMETRIA
        container.appendChild(UI.reviewSection('Planimetria', 'Sostituzione planimetria'));
        container.appendChild(UI.btn('Sostituisci Planimetria', 'btn-outline btn-block btn-sm', async () => {
            try {
                const result = await Photos.captureFromCamera();
                const filename = `PLANIMETRIA_sostituzione.jpg`;
                await Photos.savePhoto(_sop.id, '_planimetria', 'planimetria', filename, result.blob, result.thumbnail);
                App.toast('Planimetria sostituita!');
            } catch (e) { App.toast('Errore foto'); }
        }));

        // 13. EXPORT BUTTONS
        container.appendChild(UI.sectionHeader('Export'));
        const exportRow = document.createElement('div');
        exportRow.className = 'flex flex-col gap-8';

        exportRow.appendChild(UI.btn('Sincronizza e Genera DOCX', 'btn-primary btn-block btn-lg', async () => {
            try {
                App.toast('Sincronizzazione in corso...');
                await Sync.syncSopralluogo(_sop);
                App.toast('Sincronizzato! Il bot generera i documenti.');
            } catch (e) {
                App.toast('Errore sync: ' + e.message);
            }
        }));

        exportRow.appendChild(UI.btn('Esporta JSON (Backup)', 'btn-outline btn-block', () => {
            Sync.exportJSON(_sop);
            App.toast('JSON esportato!');
        }));

        exportRow.appendChild(UI.btn('← Torna al Sopralluogo', 'btn-secondary btn-block', () => {
            _sop.phase = Config.PHASES.SOPRALLUOGO;
            DB.saveSopralluogo(_sop);
            App.navigate('rooms', { id: _sop.id });
        }));

        container.appendChild(exportRow);
    }

    // ===== EDIT SECTION =====
    function _renderEdit(container) {
        container.innerHTML = '';

        if (_editSection === 'cappello') {
            container.appendChild(UI.sectionHeader('Modifica Cappello'));
            const text = _sop.custom_cappello || Formatters.generateCappelloText(_sop);
            const { group, input } = UI.formGroup(null, 'textarea', text, '');
            container.appendChild(group);
            _editButtons(container, async () => {
                _sop.custom_cappello = input.value.trim() || null;
                await DB.saveSopralluogo(_sop);
            });

        } else if (_editSection === 'chiusura') {
            container.appendChild(UI.sectionHeader('Modifica Chiusura'));
            const text = _sop.custom_chiusura || Formatters.generateChiusuraText(_sop);
            const { group, input } = UI.formGroup(null, 'textarea', text, '');
            container.appendChild(group);
            _editButtons(container, async () => {
                _sop.custom_chiusura = input.value.trim() || null;
                await DB.saveSopralluogo(_sop);
            });

        } else if (_editSection === 'operator_note') {
            container.appendChild(UI.sectionHeader('Nota Operatore'));
            const { group, input } = UI.formGroup(null, 'textarea', _sop.operator_note || '', '');
            container.appendChild(group);
            _editButtons(container, async () => {
                _sop.operator_note = input.value.trim();
                await DB.saveSopralluogo(_sop);
            });

        } else if (_editSection === 'global_notes') {
            container.appendChild(UI.sectionHeader('Note Globali'));
            const text = (_sop.global_notes || []).join('\n');
            const { group, input } = UI.formGroup(null, 'textarea', text, '');
            container.appendChild(group);
            _editButtons(container, async () => {
                _sop.global_notes = input.value.split('\n').filter(l => l.trim());
                await DB.saveSopralluogo(_sop);
            });

        } else if (_editSection === 'signers') {
            container.appendChild(UI.sectionHeader('Firmatari'));
            const fields = [
                { label: 'Tecnico Metro C', key: 'signer_metro_tech' },
                { label: 'Roma Metropolitane', key: 'signer_rm' },
                { label: 'Collaboratore', key: 'signer_metro_coll' },
                { label: 'Proprietario', key: 'signer_owner' }
            ];
            const inputs = {};
            fields.forEach(f => {
                const { group, input } = UI.formGroup(f.label, 'text', _sop[f.key] || '', f.label);
                inputs[f.key] = input;
                container.appendChild(group);
            });
            _editButtons(container, async () => {
                fields.forEach(f => { _sop[f.key] = inputs[f.key].value.trim(); });
                await DB.saveSopralluogo(_sop);
            });

        } else if (_editSection && _editSection.startsWith('room:')) {
            const roomName = _editSection.substring(5);
            container.appendChild(UI.sectionHeader(`Modifica Testo: ${roomName}`));
            const room = _sop.rooms[roomName];
            const currentText = room.manual_text || Formatters.generateRoomText(room);
            const { group, input } = UI.formGroup(null, 'textarea', currentText, '');
            container.appendChild(group);

            const row = document.createElement('div');
            row.className = 'flex gap-8 mt-16';
            row.appendChild(UI.btn('Auto-genera', 'btn-secondary', async () => {
                room.manual_text = null;
                await DB.saveSopralluogo(_sop);
                _editSection = null;
                await _renderMain(container);
            }));
            row.appendChild(UI.btn('Salva', 'btn-primary', async () => {
                room.manual_text = input.value.trim() || null;
                await DB.saveSopralluogo(_sop);
                _editSection = null;
                await _renderMain(container);
            }));
            container.appendChild(row);
            return;
        }
    }

    function _editButtons(container, saveFn) {
        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Annulla', 'btn-secondary', async () => {
            _editSection = null;
            await _renderMain(container);
        }));
        row.appendChild(UI.btn('Salva', 'btn-primary', async () => {
            await saveFn();
            _editSection = null;
            await _renderMain(container);
        }));
        container.appendChild(row);
    }

    // ===== STATISTICHE =====
    function _calcStats() {
        let obsCount = 0, photoCount = 0;
        const roomCount = Object.keys(_sop.rooms).length;
        for (const name in _sop.rooms) {
            const room = _sop.rooms[name];
            const fotoKeys = Object.keys(room).filter(k => k.startsWith('Foto_'));
            obsCount += fotoKeys.length;
            photoCount += fotoKeys.filter(k => !k.includes('NOFOTO')).length;
        }
        const pertCount = (_sop.pertinenze || []).length;
        return { roomCount, obsCount, photoCount, pertCount };
    }

    // ===== WARNINGS =====
    function _getWarnings() {
        const warnings = [];
        for (const name in _sop.rooms) {
            const room = _sop.rooms[name];
            const status = _sop.room_status[name];
            const hasObs = Object.keys(room).some(k => k.startsWith('Foto_'));
            if (status === 'accessible' && !hasObs) {
                warnings.push(`${name}: nessuna osservazione`);
            }
        }
        if (!_sop.signer_metro_tech) warnings.push('Firmatario Tecnico non impostato');
        return warnings;
    }

    return { render };

})();
