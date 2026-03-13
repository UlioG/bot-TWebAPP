/* ============================================================
 * app.js — SPA controller e routing hash-based
 * ============================================================ */

'use strict';

const App = (() => {

    let _currentView = null;
    let _history = [];

    // ===== ROUTES =====
    const ROUTES = {
        ''          : () => HomeView,
        'home'      : () => HomeView,
        'setup'     : () => SetupView,
        'anagrafica': () => AnagraficaView,
        'rooms'     : () => RoomsView,
        'wizard'    : () => WizardView,
        'review'    : () => ReviewView,
        'pertinenze': () => PertinenzeView,
        'stairs'    : () => StairsView,
        'prospetti' : () => ProspettiView,
    };

    // ===== INIT =====
    async function init() {
        // Telegram WebApp setup
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.ready();
            Telegram.WebApp.expand();
            if (Telegram.WebApp.requestFullscreen) Telegram.WebApp.requestFullscreen();
            Telegram.WebApp.BackButton.onClick(() => goBack());
        }

        // Open DB
        await DB.open();

        // Sync init
        if (typeof Sync !== 'undefined') Sync.init();

        // Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }

        // Header buttons
        document.getElementById('btn-back').addEventListener('click', goBack);
        document.getElementById('btn-home').addEventListener('click', () => navigate('home'));

        // Hash routing
        window.addEventListener('hashchange', _onHashChange);
        _onHashChange();
    }

    // ===== NAVIGATION =====
    function navigate(route, params) {
        const hash = params ? `${route}?${_encodeParams(params)}` : route;
        if (location.hash === '#' + hash) {
            // Stesso hash, forza re-render
            _onHashChange();
        } else {
            location.hash = hash;
        }
    }

    function goBack() {
        if (_history.length > 1) {
            _history.pop();
            const prev = _history[_history.length - 1];
            location.hash = prev;
        } else {
            navigate('home');
        }
    }

    function _onHashChange() {
        const raw = location.hash.replace(/^#\/?/, '');
        const [route, queryStr] = raw.split('?');
        const params = queryStr ? _decodeParams(queryStr) : {};
        const viewName = route || 'home';

        // Track history
        const fullHash = location.hash;
        if (_history[_history.length - 1] !== fullHash) {
            _history.push(fullHash);
            if (_history.length > 50) _history.shift();
        }

        // Header
        _updateHeader(viewName);

        // Resolve view
        const viewFactory = ROUTES[viewName];
        if (!viewFactory) {
            _showError('Pagina non trovata: ' + viewName);
            return;
        }

        const ViewModule = viewFactory();
        if (!ViewModule || !ViewModule.render) {
            _showError('Modulo non caricato: ' + viewName);
            return;
        }

        const container = document.getElementById('app-content');
        container.innerHTML = '';
        _currentView = ViewModule;

        try {
            ViewModule.render(container, params);
        } catch (err) {
            console.error('Render error:', err);
            _showError('Errore nel caricamento della pagina.');
        }
    }

    function _updateHeader(viewName) {
        const backBtn = document.getElementById('btn-back');
        const homeBtn = document.getElementById('btn-home');
        const title = document.getElementById('header-title');

        const isHome = viewName === 'home' || viewName === '';
        backBtn.classList.toggle('hidden', isHome);
        homeBtn.classList.toggle('hidden', isHome);

        // Telegram back button
        if (window.Telegram && Telegram.WebApp) {
            isHome ? Telegram.WebApp.BackButton.hide() : Telegram.WebApp.BackButton.show();
        }

        const titles = {
            'home': 'Testimoniale',
            'setup': 'Nuovo Sopralluogo',
            'anagrafica': 'Anagrafica',
            'rooms': 'Sopralluogo',
            'wizard': 'Osservazione',
            'review': 'Riepilogo',
            'pertinenze': 'Pertinenze',
            'stairs': 'Scala',
            'prospetti': 'Prospetti'
        };
        title.textContent = titles[viewName] || 'Testimoniale';
    }

    // ===== TOAST =====
    function toast(msg, duration) {
        duration = duration || 3000;
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.add('hidden'), duration);
    }

    // ===== MODAL =====
    function showModal(html) {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        content.innerHTML = html;
        overlay.classList.remove('hidden');
        overlay.onclick = (e) => {
            if (e.target === overlay) hideModal();
        };
    }

    function hideModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    // ===== CONFIRM =====
    function confirm(msg) {
        return new Promise(resolve => {
            showModal(`
                <p>${msg}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="modal-no">No</button>
                    <button class="btn btn-primary" id="modal-yes">Si</button>
                </div>
            `);
            document.getElementById('modal-yes').onclick = () => { hideModal(); resolve(true); };
            document.getElementById('modal-no').onclick = () => { hideModal(); resolve(false); };
        });
    }

    // ===== HELPERS =====
    function _encodeParams(params) {
        return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    }

    function _decodeParams(str) {
        const params = {};
        str.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            params[k] = decodeURIComponent(v || '');
        });
        return params;
    }

    function _showError(msg) {
        document.getElementById('app-content').innerHTML = `<div class="error-page"><p>${msg}</p></div>`;
    }

    // ===== PUBLIC =====
    return { init, navigate, goBack, toast, showModal, hideModal, confirm };

})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
