/**
 * stairs.js - Wizard Scale Gruppo B (Parti Comuni)
 * Allineato al flusso bot.py:
 *   1. Una/Più scale → 2. Nome scala → 3. Piani edificio →
 *   4. Piano partenza → 5. Direzione (una volta) → 6. Rampe (una volta) →
 *   7. → Crea vano → sotto-sezioni (rooms.js) →
 *   8. Continua a Salire/Scendere → piano successivo → repeat
 *   9. Concludi Scala → altra scala? → PC menu
 *
 * Naming convention:
 *   Scala unica: "Scala - {piano}"
 *   Scala multi:  "Scala {nome} - {piano}"
 *
 * State stored on sop (persistent via update_setup):
 *   stair_is_multi, stair_names[], stair_current_name,
 *   stair_b_direction ('salendo'|'scendendo'), stair_ramp_count,
 *   building_floors[], stair_b_current_floor, stair_b_active
 */
const StairsView = {
    sopId: null,
    _step: 'multi',    // multi, name, building_floors, floor, direction, ramps
    _container: null,

    // ========== ENTRY POINT ==========

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        this._container = container;
        UI.setTitle('Scale - Parti Comuni');
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        // Check if stairs already exist → show list instead of asking multi
        const existingStairs = this._getExistingStairNames(sop);
        if (existingStairs.length > 0) {
            this._renderStairList(container, sop, existingStairs);
        } else {
            this._step = 'multi';
            this._renderStep(container, sop);
        }
    },

    _renderStep(container, sop) {
        switch (this._step) {
            case 'multi': return this._renderMulti(container, sop);
            case 'name': return this._renderName(container, sop);
            case 'building_floors': return this._renderBuildingFloors(container, sop);
            case 'floor': return this._renderFloor(container, sop);
            case 'direction': return this._renderDirection(container, sop);
            case 'ramps': return this._renderRamps(container, sop);
        }
    },

    // ========== HELPERS ==========

    /** Get list of distinct stair identifiers from room names */
    _getExistingStairNames(sop) {
        const rooms = sop.rooms || {};
        const names = new Set();
        for (const rn of Object.keys(rooms)) {
            if (!rn.startsWith('Scala')) continue;
            // "Scala - Piano Terra" → single (name = '')
            // "Scala A - Piano Terra" → multi (name = 'A')
            const match = rn.match(/^Scala\s*([A-Za-z0-9]*)\s*-\s*.+$/);
            if (match) {
                names.add(match[1] || '');
            }
        }
        return [...names];
    },

    /** Get rooms for a specific stair name */
    _getStairRooms(sop, stairName) {
        const rooms = sop.rooms || {};
        const prefix = stairName ? `Scala ${stairName} - ` : 'Scala - ';
        const result = {};
        for (const [rn, data] of Object.entries(rooms)) {
            if (rn.startsWith(prefix)) {
                result[rn] = data;
            }
        }
        return result;
    },

    /** Build room full name from stair name + floor */
    _buildRoomName(stairName, floor) {
        return stairName ? `Scala ${stairName} - ${floor}` : `Scala - ${floor}`;
    },

    /** Get stair label for display */
    _getStairLabel(stairName) {
        return stairName ? `Scala ${stairName}` : 'Scala';
    },

    // ========== STAIR LIST (when stairs already exist) ==========

    _renderStairList(container, sop, existingStairs) {
        const esc = UI._escapeHtml;
        let html = UI.wizardHeader('Scale', 'Scale analizzate');

        // List existing stairs with room counts
        let cells = '';
        for (const name of existingStairs) {
            const stairRooms = this._getStairRooms(sop, name);
            const roomCount = Object.keys(stairRooms).length;
            const label = this._getStairLabel(name);
            const obsCount = Object.values(stairRooms).reduce((sum, r) =>
                sum + (r.observations ? r.observations.length : 0), 0);
            cells += `<div class="cell" data-stair-name="${esc(name)}" style="cursor:pointer;">
                <div class="cell-content">
                    <div class="cell-title">🪜 ${esc(label)}</div>
                    <div class="cell-subtitle">${roomCount} piani, ${obsCount} osservazioni</div>
                </div>
                <div class="cell-chevron">›</div>
            </div>`;
        }
        html += UI.section('SCALE ESISTENTI', cells);

        // Add new stair button
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-add-stair">➕ Aggiungi Scala</button>
            <button class="btn btn-outline" id="btn-back-pc" style="border-color:var(--primary); color:var(--primary);">📋 Menu Parti Comuni</button>
        </div>`;

        container.innerHTML = html;

        // Click existing stair → enter it (resume at floor selection)
        container.querySelectorAll('.cell[data-stair-name]').forEach(cell => {
            cell.addEventListener('click', async () => {
                const name = cell.dataset.stairName;
                // Set current stair and go to floor selection
                await Events.dispatch('update_setup', this.sopId, {
                    stair_current_name: name,
                    stair_b_active: true
                });
                const fresh = await DB.getSopralluogo(this.sopId);
                this._step = 'floor';
                this._renderStep(container, fresh);
            });
        });

        document.getElementById('btn-add-stair')?.addEventListener('click', async () => {
            const isMulti = sop.stair_is_multi;
            if (isMulti) {
                // Already multi → go to name selection
                this._step = 'name';
                this._renderStep(container, sop);
            } else {
                // Was single → need to ask multi again
                this._step = 'multi';
                this._renderStep(container, sop);
            }
        });

        document.getElementById('btn-back-pc')?.addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });
    },

    // ========== STEP 1: UNA O PIÙ SCALE ==========

    _renderMulti(container, sop) {
        let html = UI.wizardHeader('Scale', 'L\'edificio ha una scala o più scale?');
        html += `<div style="padding: 0 16px; display:flex; flex-direction:column; gap:12px;">
            <button class="btn btn-primary" data-multi="single" style="font-size:16px; padding:14px;">
                1️⃣ Scala unica
            </button>
            <button class="btn btn-primary" data-multi="multi" style="font-size:16px; padding:14px;">
                🔢 Più scale
            </button>
            <button class="btn btn-outline" id="btn-back-pc">🔙 Indietro</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('[data-multi]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isMulti = btn.dataset.multi === 'multi';
                await Events.dispatch('update_setup', this.sopId, {
                    stair_is_multi: isMulti,
                    stair_names: sop.stair_names || []
                });
                const fresh = await DB.getSopralluogo(this.sopId);

                if (isMulti) {
                    this._step = 'name';
                } else {
                    // Single → stair_current_name = '' (empty)
                    await Events.dispatch('update_setup', this.sopId, {
                        stair_current_name: '',
                        stair_b_active: true
                    });
                    const fresh2 = await DB.getSopralluogo(this.sopId);
                    // Check if building_floors already set
                    if (fresh2.building_floors && fresh2.building_floors.length > 0) {
                        this._step = 'floor';
                    } else {
                        this._step = 'building_floors';
                    }
                }
                const latestSop = await DB.getSopralluogo(this.sopId);
                this._renderStep(container, latestSop);
            });
        });

        document.getElementById('btn-back-pc')?.addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });
    },

    // ========== STEP 2: NOME SCALA (solo multi) ==========

    _renderName(container, sop) {
        const usedNames = new Set(sop.stair_names || []);
        const options = ['A', 'B', 'C', '1', '2', '3'];
        const available = options.filter(o => !usedNames.has(o));

        let html = UI.wizardHeader('Nome Scala', 'Come identifichi questa scala?');

        if (usedNames.size > 0) {
            html += `<div style="padding: 0 16px 8px; color: var(--text-secondary); font-size: 13px;">
                📌 Scale già create: <strong>${[...usedNames].sort().join(', ')}</strong>
            </div>`;
        }

        html += UI.buttonGrid(available.map(o => ({ value: o, label: o })), { cols: 3 });

        html += `<div style="padding: 8px 16px;">
            <button class="btn btn-outline" id="btn-name-manual" style="width:100%;">✏️ Scrivi a Mano</button>
        </div>`;
        html += `<div style="padding: 0 16px 16px;">
            <button class="btn btn-outline" id="btn-back-step">🔙 Indietro</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._setStairName(btn.dataset.value, sop);
            });
        });

        document.getElementById('btn-name-manual')?.addEventListener('click', () => {
            UI.promptInput('Nome Scala', 'Es. A, B, Nord...', async (val) => {
                if (!val || !val.trim()) return;
                await this._setStairName(val.trim(), sop);
            });
        });

        document.getElementById('btn-back-step')?.addEventListener('click', () => {
            this._step = 'multi';
            this._renderStep(container, sop);
        });
    },

    async _setStairName(name, sop) {
        const names = [...(sop.stair_names || [])];
        if (!names.includes(name)) names.push(name);
        await Events.dispatch('update_setup', this.sopId, {
            stair_current_name: name,
            stair_names: names,
            stair_b_active: true
        });
        const fresh = await DB.getSopralluogo(this.sopId);
        // Check if building_floors already set
        if (fresh.building_floors && fresh.building_floors.length > 0) {
            this._step = 'floor';
        } else {
            this._step = 'building_floors';
        }
        this._renderStep(this._container, fresh);
    },

    // ========== STEP 3: PIANI EDIFICIO ==========

    _renderBuildingFloors(container, sop) {
        const esc = UI._escapeHtml;
        const selected = new Set(sop.building_floors || []);

        let html = UI.wizardHeader('Piani Edificio', 'Seleziona i piani dell\'edificio (multi-selezione)');

        html += `<div style="padding: 0 16px;" id="floor-grid">`;
        for (const f of CONFIG.PREDEFINED_FLOORS) {
            const isSelected = selected.has(f);
            const abbr = CONFIG.getFloorAbbr(f);
            html += `<button class="btn ${isSelected ? 'btn-primary' : 'btn-outline'} bf-btn"
                data-floor="${esc(f)}" style="margin:4px; min-width:80px; font-size:13px;">
                ${isSelected ? '✅ ' : ''}${esc(abbr)}
            </button>`;
        }
        html += `</div>`;

        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-confirm-floors" ${selected.size === 0 ? 'disabled' : ''}>
                Conferma (${selected.size} piani)
            </button>
            <button class="btn btn-outline" id="btn-back-step">🔙 Indietro</button>
        </div>`;

        container.innerHTML = html;

        // Toggle floor selection
        container.querySelectorAll('.bf-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const f = btn.dataset.floor;
                if (selected.has(f)) {
                    selected.delete(f);
                } else {
                    selected.add(f);
                }
                // Save and re-render
                const orderedFloors = CONFIG.PREDEFINED_FLOORS.filter(pf => selected.has(pf));
                await Events.dispatch('update_setup', this.sopId, {
                    building_floors: orderedFloors
                });
                const fresh = await DB.getSopralluogo(this.sopId);
                this._renderBuildingFloors(container, fresh);
            });
        });

        document.getElementById('btn-confirm-floors')?.addEventListener('click', async () => {
            if (selected.size === 0) {
                UI.toast('Seleziona almeno un piano');
                return;
            }
            const fresh = await DB.getSopralluogo(this.sopId);
            this._step = 'floor';
            this._renderStep(container, fresh);
        });

        document.getElementById('btn-back-step')?.addEventListener('click', async () => {
            const fresh = await DB.getSopralluogo(this.sopId);
            if (fresh.stair_is_multi) {
                this._step = 'name';
            } else {
                this._step = 'multi';
            }
            this._renderStep(container, fresh);
        });
    },

    // ========== STEP 4: PIANO DI PARTENZA ==========

    _renderFloor(container, sop) {
        const stairLabel = this._getStairLabel(sop.stair_current_name);
        let html = UI.wizardHeader(stairLabel, 'Da che piano parti?');

        const floors = (sop.building_floors && sop.building_floors.length > 0)
            ? sop.building_floors
            : CONFIG.PREDEFINED_FLOORS;

        // Mark floors already analyzed for this stair
        const stairRooms = this._getStairRooms(sop, sop.stair_current_name || '');
        const analyzedFloors = new Set();
        for (const rn of Object.keys(stairRooms)) {
            const match = rn.match(/^Scala\s*[A-Za-z0-9]*\s*-\s*(.+)$/);
            if (match) analyzedFloors.add(match[1]);
        }

        html += UI.buttonGrid(floors.map(f => {
            const analyzed = analyzedFloors.has(f);
            return {
                value: f,
                label: (analyzed ? '✅ ' : '') + (CONFIG.getFloorAbbr(f) || f)
            };
        }), { cols: 3 });

        html += `<div style="padding: 8px 16px;">
            <button class="btn btn-outline" id="btn-back-step">🔙 Indietro</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                await Events.dispatch('update_setup', this.sopId, {
                    stair_b_current_floor: btn.dataset.value
                });
                const fresh = await DB.getSopralluogo(this.sopId);

                // If direction already set → skip direction step
                if (fresh.stair_b_direction) {
                    // If ramp count already set → skip ramps step too
                    if (fresh.stair_ramp_count) {
                        this._enterOrCreateRoom(fresh);
                    } else {
                        this._step = 'ramps';
                        this._renderStep(container, fresh);
                    }
                } else {
                    this._step = 'direction';
                    this._renderStep(container, fresh);
                }
            });
        });

        document.getElementById('btn-back-step')?.addEventListener('click', async () => {
            const fresh = await DB.getSopralluogo(this.sopId);
            const existing = this._getExistingStairNames(fresh);
            if (existing.length > 0) {
                this._renderStairList(container, fresh, existing);
            } else {
                this._step = 'multi';
                this._renderStep(container, fresh);
            }
        });
    },

    // ========== STEP 5: DIREZIONE (chiesta una sola volta) ==========

    _renderDirection(container, sop) {
        const stairLabel = this._getStairLabel(sop.stair_current_name);
        const floorLabel = sop.stair_b_current_floor || '?';

        let html = UI.wizardHeader(`${stairLabel} - ${floorLabel}`, 'In che direzione procedi?');
        html += `<div style="padding: 0 16px; display:flex; flex-direction:column; gap:12px;">
            <button class="btn btn-primary" data-dir="salendo" style="font-size:18px; padding:14px;">
                ⬆️ Salendo
            </button>
            <button class="btn btn-primary" data-dir="scendendo" style="font-size:18px; padding:14px;">
                ⬇️ Scendendo
            </button>
            <button class="btn btn-outline" id="btn-back-step">🔙 Indietro</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('[data-dir]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await Events.dispatch('update_setup', this.sopId, {
                    stair_b_direction: btn.dataset.dir
                });
                const fresh = await DB.getSopralluogo(this.sopId);
                // If ramp count already set → skip
                if (fresh.stair_ramp_count) {
                    this._enterOrCreateRoom(fresh);
                } else {
                    this._step = 'ramps';
                    this._renderStep(container, fresh);
                }
            });
        });

        document.getElementById('btn-back-step')?.addEventListener('click', () => {
            this._step = 'floor';
            this._renderStep(container, sop);
        });
    },

    // ========== STEP 6: NUMERO RAMPE (chiesto una sola volta) ==========

    _renderRamps(container, sop) {
        let html = UI.wizardHeader('Rampe', 'Quante rampe ci sono tra un piano e l\'altro?');
        html += `<div style="padding: 4px 16px; color: var(--text-secondary); font-size: 13px;">
            Questa domanda viene fatta una sola volta
        </div>`;

        html += UI.buttonGrid([
            { value: '2', label: '2 Rampe' },
            { value: '3', label: '3 Rampe' },
            { value: '4', label: '4 Rampe' }
        ], { cols: 3 });

        html += `<div style="padding: 8px 16px;">
            <button class="btn btn-outline" id="btn-ramp-manual" style="width:100%;">✏️ Altro numero</button>
        </div>`;
        html += `<div style="padding: 0 16px 16px;">
            <button class="btn btn-outline" id="btn-back-step">🔙 Indietro</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._setRampCount(parseInt(btn.dataset.value), sop);
            });
        });

        document.getElementById('btn-ramp-manual')?.addEventListener('click', () => {
            UI.promptInput('Numero Rampe', 'Es. 5', async (val) => {
                const n = parseInt(val);
                if (!n || n < 1 || n > 20) { UI.toast('Numero non valido'); return; }
                await this._setRampCount(n, sop);
            });
        });

        document.getElementById('btn-back-step')?.addEventListener('click', () => {
            this._step = 'direction';
            this._renderStep(container, sop);
        });
    },

    async _setRampCount(count, sop) {
        await Events.dispatch('update_setup', this.sopId, {
            stair_ramp_count: count
        });
        const fresh = await DB.getSopralluogo(this.sopId);
        this._enterOrCreateRoom(fresh);
    },

    // ========== CREATE ROOM AND NAVIGATE ==========

    async _enterOrCreateRoom(sop) {
        const stairName = sop.stair_current_name || '';
        const floor = sop.stair_b_current_floor;
        if (!floor) { UI.toast('Piano non selezionato'); return; }

        const roomName = this._buildRoomName(stairName, floor);
        const rooms = sop.rooms || {};

        if (!rooms[roomName]) {
            // Create the stair room
            await Events.dispatch('add_vano', this.sopId, {
                room_number: roomName,
                room_name: roomName,
                full_name: roomName,
                destination: 'SCALA',
                stair_subsection: null
            });
        }

        // Navigate to room card
        App.navigate(`rooms/${this.sopId}/${encodeURIComponent(roomName)}`);
    },

    // ========== CONTINUE / CONCLUDE (called from rooms.js) ==========

    /**
     * Continua a Salire/Scendere: avanza al piano successivo
     */
    async continueToNextFloor() {
        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) return;

        const currentFloor = sop.stair_b_current_floor;
        const direction = sop.stair_b_direction || 'salendo';
        const bf = sop.building_floors || [];

        let nextFloor = null;
        if (bf.length > 0) {
            // Use building_floors order
            const idx = bf.indexOf(currentFloor);
            if (direction === 'salendo' && idx < bf.length - 1) {
                nextFloor = bf[idx + 1];
            } else if (direction === 'scendendo' && idx > 0) {
                nextFloor = bf[idx - 1];
            }
        } else {
            // Use CONFIG.PREDEFINED_FLOORS
            nextFloor = CONFIG.getNextFloor(currentFloor, direction);
        }

        if (nextFloor) {
            await Events.dispatch('update_setup', this.sopId, {
                stair_b_current_floor: nextFloor
            });
            const fresh = await DB.getSopralluogo(this.sopId);
            this._enterOrCreateRoom(fresh);
        } else {
            // No more floors → offer conclude or add floor
            this._renderNoMoreFloors(sop);
        }
    },

    _renderNoMoreFloors(sop) {
        const container = document.getElementById('app-content');
        if (!container) return;

        let html = UI.wizardHeader('Fine Piani', 'Hai completato tutti i piani selezionati.');
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-conclude-stair">🏁 Concludi Scala</button>
            <button class="btn btn-outline" id="btn-add-floor">➕ Seleziona altro Piano</button>
        </div>`;

        container.innerHTML = html;

        document.getElementById('btn-conclude-stair')?.addEventListener('click', async () => {
            await this.concludeStair();
        });

        document.getElementById('btn-add-floor')?.addEventListener('click', async () => {
            const fresh = await DB.getSopralluogo(this.sopId);
            this._step = 'floor';
            this._renderStep(container, fresh);
        });
    },

    /**
     * Concludi Scala: reset stato, chiedi se altra scala
     */
    async concludeStair() {
        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) return;

        const stairName = sop.stair_current_name;
        const label = this._getStairLabel(stairName);

        // Reset Gruppo B active state (keep direction + ramp count as structural)
        await Events.dispatch('update_setup', this.sopId, {
            stair_b_active: false,
            stair_b_current_floor: null
        });

        const container = document.getElementById('app-content');
        if (!container) return;

        let html = UI.wizardHeader('Scala Completata', `Hai completato: ${UI._escapeHtml(label)}`);
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:12px;">
            <button class="btn btn-primary" id="btn-add-more" style="font-size:16px; padding:14px;">
                ✅ Sì, altra scala
            </button>
            <button class="btn btn-secondary" id="btn-finish" style="font-size:16px; padding:14px;">
                🏁 No, ho finito
            </button>
        </div>`;

        container.innerHTML = html;

        document.getElementById('btn-add-more')?.addEventListener('click', async () => {
            const fresh = await DB.getSopralluogo(this.sopId);
            if (fresh.stair_is_multi) {
                // Multi → go to name selection for new stair
                this._step = 'name';
                this._renderStep(container, fresh);
            } else {
                // Was single → upgrade to multi
                await Events.dispatch('update_setup', this.sopId, {
                    stair_is_multi: true,
                    stair_names: fresh.stair_names || []
                });
                const fresh2 = await DB.getSopralluogo(this.sopId);
                this._step = 'name';
                this._renderStep(container, fresh2);
            }
        });

        document.getElementById('btn-finish')?.addEventListener('click', () => {
            // Back to PC room list
            App.navigate(`rooms/${this.sopId}`);
        });
    },

    // ========== UTILITY: get direction info for rooms.js ==========

    /** Returns direction label and icon for stair continue/conclude buttons */
    getDirectionInfo(sop) {
        const dir = sop.stair_b_direction || null;
        if (!dir) return null;
        return {
            direction: dir,
            label: dir === 'salendo' ? 'Salire' : 'Scendere',
            icon: dir === 'salendo' ? '⬆️' : '⬇️'
        };
    }
};
