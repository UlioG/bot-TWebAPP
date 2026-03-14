/**
 * app.js - Router SPA e inizializzazione Telegram WebApp
 */
const App = {
    currentView: null,
    currentParams: {},

    // Mappa route → modulo vista
    routes: {
        'home': HomeView,
        'setup': SetupView,
        'anagrafica': AnagraficaView,
        'rooms': RoomsView,
        'room': RoomsView,
        'wizard': WizardView,
        'review': ReviewView,
        'archive': ArchiveView,
        'stairs': StairsView,
        'pertinenze': PertinenzaView,
        'prospetti': ProspettiView
    },

    /**
     * Inizializzazione app
     */
    async init() {
        // Init Telegram WebApp
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.ready();
            Telegram.WebApp.expand();

            // Fullscreen (Telegram WebApp SDK 8.0+)
            try {
                if (Telegram.WebApp.requestFullscreen) {
                    Telegram.WebApp.requestFullscreen();
                }
            } catch (e) { /* older SDK */ }

            // Imposta colore header
            try {
                Telegram.WebApp.setHeaderColor('secondary_bg_color');
            } catch (e) { /* older SDK */ }

            // Salva dati operatore da Telegram
            try {
                const user = Telegram.WebApp.initDataUnsafe?.user;
                if (user) {
                    App._telegramUser = {
                        id: user.id,
                        name: [user.first_name, user.last_name].filter(Boolean).join(' ')
                    };
                }
            } catch (e) { /* no user data */ }
        }

        // Init IndexedDB
        await DB.open();

        // Init sync: risolvi URL tunnel + avvia indicatore
        await Sync.init();

        // Register Service Worker + force activate waiting SW
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.register('./sw.js');
                // Se c'è un SW in attesa, attivalo subito per evitare cache stale
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    }
                });
            } catch (e) {
                console.warn('Service Worker registration failed:', e);
            }
        }

        // Router: ascolta hash changes
        window.addEventListener('hashchange', () => this.handleRoute());

        // Gestisci tasto back di Telegram
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.BackButton.onClick(() => {
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    this.navigate('home');
                }
            });
        }

        // Pulsante Home (sempre visibile)
        document.getElementById('btn-home')?.addEventListener('click', () => {
            this.navigate('home');
        });

        // Pulsante Sync nell'header
        document.getElementById('btn-sync')?.addEventListener('click', () => {
            Sync.syncCurrentSopralluogo();
        });

        // Prima navigazione
        if (!location.hash || location.hash === '#') {
            this.navigate('home');
        } else {
            this.handleRoute();
        }
    },

    /**
     * Naviga a una route
     */
    navigate(route, replace = false) {
        if (replace) {
            location.replace('#' + route);
        } else {
            location.hash = route;
        }
    },

    /**
     * Gestisci cambio route
     */
    handleRoute() {
        const hash = location.hash.slice(1) || 'home';
        const parts = hash.split('/');
        const viewName = parts[0];
        const params = parts.slice(1);

        // Trova il modulo vista
        const ViewModule = this.routes[viewName];
        if (!ViewModule) {
            this.navigate('home', true);
            return;
        }

        // Gestisci back button Telegram
        if (window.Telegram && Telegram.WebApp) {
            if (viewName === 'home') {
                Telegram.WebApp.BackButton.hide();
            } else {
                Telegram.WebApp.BackButton.show();
            }
        }

        // Gestisci back button HTML
        UI.showBack(viewName !== 'home');

        // Nascondi/mostra Home button (inutile sulla home stessa)
        const homeBtn = document.getElementById('btn-home');
        if (homeBtn) homeBtn.classList.toggle('hidden', viewName === 'home');

        this.currentView = viewName;
        this.currentParams = params;

        // Aggiorna pulsante sync (abilitato solo con sopralluogo attivo)
        if (typeof Sync !== 'undefined') Sync.updateSyncButtonEnabled();

        // Libera object URL orfani dalla vista precedente
        if (typeof Photos !== 'undefined' && Photos.revokeAllUrls) {
            Photos.revokeAllUrls();
        }

        // Render vista
        const content = document.getElementById('app-content');
        if (content) {
            content.scrollTop = 0;
            ViewModule.render(content, params);
        }
    },

    /**
     * Ottieni il sopralluogo corrente dall'URL
     */
    getSopralluogoId() {
        return this.currentParams[0] || null;
    },

    /**
     * Dati operatore Telegram (se disponibili)
     */
    _telegramUser: null,

    getTelegramUser() {
        return this._telegramUser;
    }
};

// ========== AVVIO ==========
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch((e) => console.error('App init error:', e));
});
