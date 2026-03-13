/* ============================================================
 * home.js — Schermata iniziale: lista sopralluoghi + nuovo
 * ============================================================ */

'use strict';

const HomeView = (() => {

    async function render(container) {
        container.innerHTML = '';

        // Bottone nuovo sopralluogo
        const newBtn = UI.btn('+ Nuovo Sopralluogo', 'btn-primary btn-block btn-lg', () => {
            App.navigate('setup');
        });
        container.appendChild(newBtn);

        // Sync config (se non configurato)
        if (!Sync.isConfigured()) {
            const syncCard = UI.card('Configurazione Sync', 'Configura la connessione al PC per sincronizzare i dati.');
            const cfgBtn = UI.btn('Configura', 'btn-outline btn-sm mt-8', _showSyncConfig);
            syncCard.appendChild(cfgBtn);
            container.appendChild(syncCard);
        }

        // Lista sopralluoghi esistenti
        container.appendChild(UI.sectionHeader('Sopralluoghi'));

        const sopralluoghi = await DB.getAllSopralluoghi();

        if (sopralluoghi.length === 0) {
            container.appendChild(UI.emptyState('📋', 'Nessun sopralluogo. Crea il primo!'));
            return;
        }

        for (const sop of sopralluoghi) {
            const roomCount = Object.keys(sop.rooms || {}).length;
            const obsCount = _countObservations(sop);
            const date = new Date(sop.created_at).toLocaleDateString('it-IT');
            const syncIcon = sop.synced ? '🟢' : '🟠';
            const meta = `${date} | ${roomCount} vani | ${obsCount} oss. | ${syncIcon}`;
            const statusClass = sop.phase === 3 ? 'completed' : '';

            const cardEl = UI.roomCard(
                `${sop.building_code} — ${sop.unit_type || ''}`,
                meta,
                statusClass,
                () => _openSopralluogo(sop)
            );
            container.appendChild(cardEl);
        }
    }

    function _openSopralluogo(sop) {
        if (sop.phase === Config.PHASES.ANAGRAFICA) {
            App.navigate('anagrafica', { id: sop.id });
        } else if (sop.phase === Config.PHASES.SOPRALLUOGO) {
            App.navigate('rooms', { id: sop.id });
        } else {
            App.navigate('review', { id: sop.id });
        }
    }

    function _countObservations(sop) {
        let count = 0;
        for (const roomName in sop.rooms) {
            const room = sop.rooms[roomName];
            count += Object.keys(room).filter(k => k.startsWith('Foto_')).length;
        }
        return count;
    }

    function _showSyncConfig() {
        const url = prompt('URL Tunnel Cloudflare:');
        if (!url) return;
        const token = prompt('Token di sicurezza:');
        Sync.configure(url, token || '');
        App.toast('Sync configurato!');
        App.navigate('home');
    }

    return { render };

})();
