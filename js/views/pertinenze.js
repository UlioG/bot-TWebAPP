/**
 * pertinenze.js - Gestione pertinenze (Cantina, Soffitta, Box, Posto auto)
 * Flusso: lista pertinenze -> aggiungi tipo -> entra in pertinenza -> vani
 */
const PertinenzaView = {
    sopId: null,

    async render(container, params) {
        this.sopId = params[0];
        if (!this.sopId) { App.navigate('home', true); return; }

        const sop = await DB.getSopralluogo(this.sopId);
        if (!sop) { App.navigate('home', true); return; }

        UI.setTitle('Pertinenze');
        UI.showBack(true, () => App.navigate(`rooms/${this.sopId}`));

        const pertinenze = sop.pertinenze || [];
        let html = '';

        // Header
        html += UI.contextHeader('📦 Pertinenze dell\'unita\'', '📦');

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
        html += `<div style="padding: 16px; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" id="btn-add-pert">Aggiungi Pertinenza</button>
            <button class="btn btn-secondary" id="btn-back-rooms">🏠 Torna all'Appartamento</button>
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

        // Back
        document.getElementById('btn-back-rooms').addEventListener('click', () => {
            App.navigate(`rooms/${this.sopId}`);
        });
    },

    _showAddPertModal(sop) {
        const types = CONFIG.PERTINENZA_TYPES || ['Cantina', 'Soffitta', 'Box', 'Posto auto'];
        UI.choiceModal('Tipo Pertinenza', types, async (type) => {
            await Events.dispatch('add_pertinenza', this.sopId, {
                type: type,
                floor: sop.floor
            });
            UI.toast(`${type} aggiunta`);

            // Entra subito nella nuova pertinenza
            const updated = await DB.getSopralluogo(this.sopId);
            const newIdx = (updated.pertinenze || []).length - 1;
            await Events.dispatch('enter_pertinenza', this.sopId, { index: newIdx });
            App.navigate(`rooms/${this.sopId}`);
        });
    }
};
