/**
 * pertinenze.js - Gestione pertinenze (Cantina, Soffitta, Box, Posto auto)
 * Flusso: lista pertinenze -> aggiungi tipo -> entra in pertinenza -> vani
 * pert_multi_mode: true = "Più unità pertinenziali" (loop aggiunta)
 */
const PertinenzaView = {
    sopId: null,

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        const isPertPC = sop.pert_order === 'pert_pc';
        const isMulti = !!sop.pert_multi_mode;
        UI.setTitle(isPertPC ? 'Pertinenze PC' : 'Pertinenze');
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        const pertinenze = sop.pertinenze || [];
        let html = '';

        // Header
        html += UI.contextHeader('📦 Pertinenze dell\'unita\'', '📦');

        // Banner multi-mode
        if (isMulti) {
            html += `<div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 8px; padding: 10px 14px; margin: 0 16px 8px;">
                <div style="font-weight: 600; font-size: 13px;">📦 Più unità pertinenziali</div>
                <div style="font-size: 12px; color: #555;">Puoi aggiungere più pertinenze in sequenza</div>
            </div>`;
        }

        // Lista pertinenze esistenti
        if (pertinenze.length > 0) {
            let cells = '';
            for (let i = 0; i < pertinenze.length; i++) {
                cells += UI.pertinenzaItem(pertinenze[i], i);
            }
            html += UI.section('PERTINENZE', cells);
        } else {
            html += UI.emptyState('📦', 'Nessuna pertinenza', 'Aggiungi una pertinenza per iniziare');
        }

        // Bottoni
        const backLabel = isPertPC ? '📋 Menu Parti Comuni' : '🏠 Torna all\'Appartamento';
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-add-pert">Aggiungi Pertinenza</button>`;

        // Multi-mode + ha già pertinenze → bottone "Ho finito"
        if (isMulti && pertinenze.length > 0) {
            html += `<button class="btn btn-outline" id="btn-pert-done" style="border-color: #4caf50; color: #4caf50;">
                🏁 Ho finito con le pertinenze
            </button>`;
        }

        html += `<button class="btn btn-secondary" id="btn-back-rooms">${backLabel}</button>
        </div>`;

        container.innerHTML = html;

        // Click pertinenza -> entra
        container.querySelectorAll('.pert-item').forEach(item => {
            item.addEventListener('click', async () => {
                const idx = parseInt(item.dataset.pertIndex);
                await Events.dispatch('enter_pertinenza', this.sopId, { index: idx });
                App.navigate(`rooms/${this.sopId}`);
            });
        });

        // Aggiungi
        document.getElementById('btn-add-pert').addEventListener('click', () => {
            this._showAddPertModal(sop);
        });

        // Ho finito (multi-mode)
        document.getElementById('btn-pert-done')?.addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });

        // Back
        document.getElementById('btn-back-rooms').addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });

        // Multi-mode auto-prompt: se è la prima visita e nessuna pertinenza → apri subito il modale
        if (isMulti && pertinenze.length === 0 && !this._autoPrompted) {
            this._autoPrompted = true;
            setTimeout(() => this._showAddPertModal(sop), 300);
        }
    },

    /**
     * Flow multi-step per aggiunta pertinenza (allineato a bot.py):
     * 1. Tipo (Cantina/Soffitta/Box/Posto auto)
     * 2. Subalterno
     * 3. Numero
     * 4. Indirizzo (solo Box/Posto auto)
     * 5. Piano
     * → dispatch add_pertinenza → entra
     */
    _showAddPertModal(sop) {
        const types = CONFIG.PERTINENZA_TYPES || ['Cantina', 'Soffitta', 'Box', 'Posto auto'];
        UI.choiceModal('Tipo Pertinenza', types, (type) => {
            this._pertData = { type, sub: '', numero: '', indirizzo: '', piano: '' };
            this._askPertSub(sop);
        });
    },

    _askPertSub(sop) {
        UI.promptInput('Subalterno', 'Inserisci il subalterno della pertinenza', (sub) => {
            this._pertData.sub = (sub || '').trim();
            this._askPertNumero(sop);
        }, { placeholder: 'Es. 12', allowEmpty: true });
    },

    _askPertNumero(sop) {
        UI.promptInput('Numero', 'Inserisci il numero della pertinenza', (numero) => {
            this._pertData.numero = (numero || '').trim();
            // Box e Posto auto richiedono indirizzo
            const needsAddress = ['Box', 'Posto auto'].includes(this._pertData.type);
            if (needsAddress) {
                this._askPertIndirizzo(sop);
            } else {
                this._askPertPiano(sop);
            }
        }, { placeholder: 'Es. 3', allowEmpty: true });
    },

    _askPertIndirizzo(sop) {
        UI.promptInput('Indirizzo', `Indirizzo del ${this._pertData.type}`, (indirizzo) => {
            this._pertData.indirizzo = (indirizzo || '').trim();
            this._askPertPiano(sop);
        }, { placeholder: 'Es. Via Roma 10', allowEmpty: true });
    },

    _askPertPiano(sop) {
        const floors = CONFIG.PREDEFINED_FLOORS || [];
        const choices = floors.map(f => ({ value: f, label: f }));
        choices.push({ value: '__manual__', label: '✏️ Scrivi a mano' });

        UI.choiceModal('Piano Pertinenza', choices, async (piano) => {
            if (piano === '__manual__') {
                UI.promptInput('Piano', 'Scrivi il piano', async (customPiano) => {
                    this._pertData.piano = (customPiano || '').trim();
                    await this._finalizePert(sop);
                }, { placeholder: 'Es. Piano Interrato 2' });
            } else {
                this._pertData.piano = piano;
                await this._finalizePert(sop);
            }
        });
    },

    async _finalizePert(sop) {
        await Events.dispatch('add_pertinenza', this.sopId, {
            type: this._pertData.type,
            sub: this._pertData.sub,
            numero: this._pertData.numero,
            indirizzo: this._pertData.indirizzo,
            piano: this._pertData.piano,
            floor: sop.floor
        });

        // Build display name for toast
        const parts = [this._pertData.type];
        if (this._pertData.sub) parts.push(`Sub. ${this._pertData.sub}`);
        if (this._pertData.numero) parts.push(`N. ${this._pertData.numero}`);
        UI.toast(`${parts.join(' - ')} aggiunta`);

        // Entra subito nella nuova pertinenza
        const updated = await DB.getSopralluogo(this.sopId);
        const newIdx = (updated.pertinenze || []).length - 1;
        await Events.dispatch('enter_pertinenza', this.sopId, { index: newIdx });
        App.navigate(`rooms/${this.sopId}`);
    },

    _pertData: null,

    /** Reset auto-prompt flag (called when navigating away) */
    resetAutoPrompt() {
        this._autoPrompted = false;
    }
};
