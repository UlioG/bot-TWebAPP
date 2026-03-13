/* ============================================================
 * setup.js — Creazione nuovo sopralluogo (Step 1 dati base)
 * Flusso: Indirizzo → Tipo Unita → dettagli → Multi-piano → Piano → Scala → Planimetria
 * (Ordine identico al bot dopo il riordino del 2026-03-05)
 * ============================================================ */

'use strict';

const SetupView = (() => {

    let _sop = null;
    let _step = 'building_code'; // building_code, address, unit_type, subalterno, unit_detail, multi_floor, floor, stair, planimetria

    async function render(container, params) {
        if (params && params.id) {
            _sop = await DB.getSopralluogo(params.id);
        }
        _step = (params && params.step) || 'building_code';
        _render(container);
    }

    function _render(container) {
        container.innerHTML = '';

        switch (_step) {
            case 'building_code': _renderBuildingCode(container); break;
            case 'address': _renderAddress(container); break;
            case 'unit_type': _renderUnitType(container); break;
            case 'subalterno': _renderSubalterno(container); break;
            case 'unit_detail': _renderUnitDetail(container); break;
            case 'multi_floor': _renderMultiFloor(container); break;
            case 'floor': _renderFloor(container); break;
            case 'stair': _renderStair(container); break;
            case 'planimetria': _renderPlanimetria(container); break;
        }
    }

    // ===== CODICE FABBRICATO =====
    function _renderBuildingCode(container) {
        container.appendChild(UI.sectionHeader('Codice Fabbricato'));
        const { group, input } = UI.formGroup(null, 'text', '', 'Es: 0010A');
        container.appendChild(group);
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', async () => {
            const code = Config.sanitizePathComponent(input.value.trim());
            if (!code || code === 'Unknown') { App.toast('Inserisci un codice valido'); return; }
            _sop = await DB.createSopralluogo(code);
            _step = 'address';
            _render(container);
        }));
    }

    // ===== INDIRIZZO FABBRICATO =====
    function _renderAddress(container) {
        container.appendChild(UI.sectionHeader('Indirizzo Fabbricato'));
        const { group, input } = UI.formGroup(null, 'text', _sop.building_address || '', 'Via Roma, 1');
        container.appendChild(group);
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', async () => {
            _sop.building_address = input.value.trim();
            await DB.saveSopralluogo(_sop);
            _step = 'unit_type';
            _render(container);
        }));
    }

    // ===== TIPO UNITA =====
    function _renderUnitType(container) {
        container.appendChild(UI.sectionHeader('Tipo Unita'));
        const types = [...Config.UNIT_TYPES, "Scrivi a Mano", "Edificio Complesso"];
        const grid = UI.buttonGrid(types, 2, async (val) => {
            if (val === 'Scrivi a Mano') {
                _sop.manual_unit_type = true;
                _step = 'unit_detail';
            } else if (val === 'Edificio Complesso') {
                _sop.manual_unit_type = 'edificio_complesso';
                _step = 'unit_detail';
            } else if (val === 'Parti Comuni') {
                _sop.unit_type = 'Parti Comuni';
                _sop.unit_name = 'Parti Comuni';
                _step = 'multi_floor';
            } else {
                _sop.unit_type = val;
                _sop.manual_unit_type = false;
                _step = 'subalterno';
            }
            await DB.saveSopralluogo(_sop);
            _render(container);
        });
        container.appendChild(grid);
    }

    // ===== SUBALTERNO =====
    function _renderSubalterno(container) {
        container.appendChild(UI.sectionHeader('Subalterno'));
        const { group, input } = UI.formGroup(null, 'text', _sop.subalterno || '', 'Numero subalterno');
        container.appendChild(group);
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', async () => {
            _sop.subalterno = input.value.trim();
            await DB.saveSopralluogo(_sop);

            // Tipo unita determina prossimo step
            const needsInternal = ['Abitazione', 'Ufficio'].includes(_sop.unit_type);
            const needsAddress = ['Negozio', 'Autorimessa'].includes(_sop.unit_type);
            const needsNumero = ['Cantina', 'Soffitta', 'Box', 'Posto auto'].includes(_sop.unit_type);

            if (needsInternal || needsAddress || needsNumero) {
                _step = 'unit_detail';
            } else {
                _step = 'multi_floor';
            }
            _render(container);
        }));
    }

    // ===== DETTAGLIO UNITA =====
    function _renderUnitDetail(container) {
        let label = 'Interno';
        let placeholder = 'Numero interno';

        if (_sop.manual_unit_type === true) {
            label = 'Descrizione Unita';
            placeholder = 'Descrizione completa';
        } else if (_sop.manual_unit_type === 'edificio_complesso') {
            label = 'Descrizione Edificio Complesso';
            placeholder = 'Descrizione edificio';
        } else if (['Negozio', 'Autorimessa'].includes(_sop.unit_type)) {
            label = 'Indirizzo';
            placeholder = 'Via/Civico';
        } else if (['Cantina', 'Soffitta', 'Box', 'Posto auto'].includes(_sop.unit_type)) {
            label = 'Numero';
            placeholder = 'Numero';
        }

        container.appendChild(UI.sectionHeader(label));
        const { group, input } = UI.formGroup(null, 'text', _sop.unit_name || '', placeholder);
        container.appendChild(group);
        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', async () => {
            const val = input.value.trim();
            if (_sop.manual_unit_type === true) {
                _sop.unit_type = val;
                _sop.unit_name = val;
            } else if (_sop.manual_unit_type === 'edificio_complesso') {
                _sop.unit_type = `Edificio Complesso: ${val}`;
                _sop.unit_name = val;
            } else if (['Negozio', 'Autorimessa'].includes(_sop.unit_type)) {
                _sop.unit_address = val;
                _sop.unit_name = val;
            } else {
                _sop.unit_name = val;
            }
            await DB.saveSopralluogo(_sop);
            _step = 'multi_floor';
            _render(container);
        }));
    }

    // ===== MULTI PIANO =====
    function _renderMultiFloor(container) {
        container.appendChild(UI.sectionHeader("L'unita si sviluppa su piu piani?"));
        const grid = UI.buttonGrid([
            { label: 'Si', value: true },
            { label: 'No', value: false }
        ], 2, async (val) => {
            _sop.is_multi_floor = val;
            if (val) {
                _step = 'multi_floor_select';
                _renderMultiFloorSelect(container);
            } else {
                _step = 'floor';
                await DB.saveSopralluogo(_sop);
                _render(container);
            }
        });
        container.appendChild(grid);
    }

    function _renderMultiFloorSelect(container) {
        container.innerHTML = '';
        container.appendChild(UI.sectionHeader('Seleziona i piani'));
        const selected = new Set(_sop.unit_floors || []);

        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';
        Config.PREDEFINED_FLOORS.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            const b = UI.btn(abbr, selected.has(f) ? 'btn-primary' : 'btn-secondary', () => {
                if (selected.has(f)) { selected.delete(f); b.className = 'btn btn-secondary'; }
                else { selected.add(f); b.className = 'btn btn-primary'; }
            });
            grid.appendChild(b);
        });
        container.appendChild(grid);

        // Scrivi a mano
        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block mt-8', () => {
            const custom = prompt('Nome piano:');
            if (custom) { selected.add(custom.trim()); App.toast('Piano aggiunto'); }
        }));

        container.appendChild(UI.btn('Avanti', 'btn-primary btn-block mt-16', async () => {
            if (selected.size === 0) { App.toast('Seleziona almeno un piano'); return; }
            _sop.unit_floors = Array.from(selected).sort((a, b) =>
                (Config.FLOOR_ORDER[a] || 99) - (Config.FLOOR_ORDER[b] || 99)
            );
            _sop.is_multi_floor = true;
            _sop.floor = _sop.unit_floors[0]; // Piano di partenza
            await DB.saveSopralluogo(_sop);
            _step = 'stair';
            _render(container);
        }));
    }

    // ===== PIANO =====
    function _renderFloor(container) {
        container.appendChild(UI.sectionHeader('Piano'));
        const grid = document.createElement('div');
        grid.className = 'btn-grid cols-3';
        Config.PREDEFINED_FLOORS.forEach(f => {
            const abbr = Config.getFloorAbbrev(f);
            grid.appendChild(UI.btn(abbr, 'btn-secondary', async () => {
                _sop.floor = f;
                _sop.unit_floors = [f];
                await DB.saveSopralluogo(_sop);
                _step = 'stair';
                _render(container);
            }));
        });
        container.appendChild(grid);
        container.appendChild(UI.btn('Scrivi a Mano', 'btn-outline btn-block mt-8', () => {
            const custom = prompt('Nome piano:');
            if (custom) {
                _sop.floor = custom.trim();
                _sop.unit_floors = [_sop.floor];
                DB.saveSopralluogo(_sop).then(() => { _step = 'stair'; _render(container); });
            }
        }));
    }

    // ===== SCALA =====
    function _renderStair(container) {
        container.appendChild(UI.sectionHeader('Scala'));
        const { group, input } = UI.formGroup(null, 'text', _sop.stair || '', 'Es: A, B, Unica');
        container.appendChild(group);
        const row = document.createElement('div');
        row.className = 'flex gap-8 mt-16';
        row.appendChild(UI.btn('Salta', 'btn-secondary', async () => {
            _sop.stair = null;
            await DB.saveSopralluogo(_sop);
            _step = 'planimetria';
            _render(container);
        }));
        row.appendChild(UI.btn('Avanti', 'btn-primary', async () => {
            _sop.stair = input.value.trim() || null;
            await DB.saveSopralluogo(_sop);
            _step = 'planimetria';
            _render(container);
        }));
        container.appendChild(row);
    }

    // ===== PLANIMETRIA =====
    function _renderPlanimetria(container) {
        container.appendChild(UI.sectionHeader('Planimetria'));
        container.appendChild(document.createTextNode('Carica la planimetria o salta.'));

        const photoBtn = UI.btn('Scatta Foto', 'btn-primary btn-block mt-16', async () => {
            try {
                const result = await Photos.captureFromCamera();
                const filename = `PLANIMETRIA_${_sop.floor || 'piano'}.jpg`;
                await Photos.savePhoto(_sop.id, '_planimetria', 'planimetria', filename, result.blob, result.thumbnail);
                _sop.planimetria_photos.push({ floor: _sop.floor, filename });
                if (_sop.floor) _sop.floors_with_planimetria.push(_sop.floor);
                await DB.saveSopralluogo(_sop);
                App.toast('Planimetria salvata!');
                _goToAnagrafica();
            } catch (e) {
                App.toast('Errore: ' + e.message);
            }
        });
        container.appendChild(photoBtn);

        container.appendChild(UI.btn('Salta', 'btn-secondary btn-block mt-8', _goToAnagrafica));
    }

    function _goToAnagrafica() {
        App.navigate('anagrafica', { id: _sop.id });
    }

    return { render };

})();
