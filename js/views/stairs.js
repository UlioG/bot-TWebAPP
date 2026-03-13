/**
 * stairs.js - Wizard Scale Gruppo B (Parti Comuni)
 * Flusso: Piano -> Direzione (una volta) -> N vano -> sotto-sezioni -> elementi
 * "Continua a Salire/Scendere": auto-avanza piano, chiede solo n vano
 * "Concludi Scala": reset, torna a room list
 */
const StairsView = {
    sopId: null,
    _step: 'floor', // floor, direction, room_num, confirm
    _direction: null, // 'salire' | 'scendere'
    _currentFloor: null,
    _roomNum: null,

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.setTitle('Scala - Parti Comuni');
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        this._step = 'floor';
        this._direction = null;
        this._currentFloor = null;
        this._roomNum = null;

        this._renderStep(container, sop);
    },

    _renderStep(container, sop) {
        switch (this._step) {
            case 'floor': return this._renderFloor(container, sop);
            case 'direction': return this._renderDirection(container, sop);
            case 'room_num': return this._renderRoomNum(container, sop);
            case 'confirm': return this._renderConfirm(container, sop);
        }
    },

    // ========== STEP: PIANO ==========

    _renderFloor(container, sop) {
        let html = UI.wizardHeader('Scala', 'Seleziona il piano di partenza');

        const floors = sop.building_floors && sop.building_floors.length > 0
            ? sop.building_floors
            : CONFIG.PREDEFINED_FLOORS;

        html += UI.buttonGrid(floors.map(f => ({
            value: f,
            label: CONFIG.getFloorAbbr(f) || f
        })), { cols: 3 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this._currentFloor = btn.dataset.value;
                this._step = 'direction';
                this._renderStep(container, sop);
            });
        });
    },

    // ========== STEP: DIREZIONE ==========

    _renderDirection(container, sop) {
        let html = UI.wizardHeader(`Scala - ${this._currentFloor}`, 'In che direzione?');

        html += `<div style="padding: 0 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" data-dir="salire" style="font-size:18px;">⬆️ Salire</button>
            <button class="btn btn-primary" data-dir="scendere" style="font-size:18px;">⬇️ Scendere</button>
        </div>`;

        container.innerHTML = html;

        container.querySelectorAll('[data-dir]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._direction = btn.dataset.dir;
                this._step = 'room_num';
                this._renderStep(container, sop);
            });
        });
    },

    // ========== STEP: NUMERO VANO ==========

    _renderRoomNum(container, sop) {
        const dirLabel = this._direction === 'salire' ? '⬆️ Salire' : '⬇️ Scendere';
        let html = UI.wizardHeader(`Scala ${this._currentFloor} - ${dirLabel}`, 'Numero vano scala');

        // Griglia numeri 1-12
        const nums = [];
        for (let i = 1; i <= 12; i++) nums.push({ value: String(i), label: `Vano ${i}` });
        html += UI.buttonGrid(nums, { cols: 3 });

        container.innerHTML = html;

        container.querySelectorAll('.btn-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                this._roomNum = btn.dataset.value;
                this._step = 'confirm';
                this._renderStep(container, sop);
            });
        });
    },

    // ========== STEP: CONFERMA E CREAZIONE ==========

    async _renderConfirm(container, sop) {
        const dirLabel = this._direction === 'salire' ? 'Salire' : 'Scendere';
        const roomName = `Scala ${this._currentFloor} ${dirLabel} Vano ${this._roomNum}`;

        let html = UI.wizardHeader('Conferma Scala', '');
        html += UI.infoCard([
            { label: 'Piano', value: this._currentFloor },
            { label: 'Direzione', value: dirLabel },
            { label: 'Vano', value: `Vano ${this._roomNum}` }
        ]);

        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-create-stair">Crea e Analizza</button>
        </div>`;

        container.innerHTML = html;

        document.getElementById('btn-create-stair').addEventListener('click', async () => {
            const rooms = Events.getActiveRooms(sop);
            const fullName = `Vano ${this._roomNum} - Scala`;

            if (!rooms[fullName]) {
                await Events.dispatch('add_vano', this.sopId, {
                    room_number: `Vano ${this._roomNum}`,
                    room_name: 'Scala',
                    full_name: fullName,
                    destination: 'Scala',
                    stair_subsection: null
                });
            }

            // Navigate to room card for observation
            App.navigate(`rooms/${this.sopId}/${encodeURIComponent(fullName)}`);
        });
    }
};
