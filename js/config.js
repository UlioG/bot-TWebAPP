/**
 * config.js — Vocabolario completo allineato a config.py + bot.py
 * Tutte le costanti, piani, scale, prospetti, pertinenze, PC
 */
const CONFIG = {
    // ========== TIPI UNITÀ (allineato a config.py) ==========
    UNIT_TYPES: [
        'Abitazione', 'Ufficio', 'Negozio', 'Autorimessa',
        'Box', 'Posto auto', 'Cantina', 'Soffitta', 'Parti Comuni'
    ],

    // Tipi che richiedono subalterno
    UNIT_TYPES_WITH_SUB: ['Abitazione', 'Ufficio', 'Negozio', 'Autorimessa'],

    // Tipi che possono avere pertinenze
    PERTINENZA_PARENT_TYPES: ['Abitazione', 'Ufficio', 'Negozio'],

    // Tipi di pertinenza
    PERTINENZA_TYPES: ['Cantina', 'Soffitta', 'Box', 'Posto auto'],

    // ========== TIPI VANO ==========
    ROOM_TYPES: [
        'INGRESSO', 'STANZA', 'DISIMPEGNO', 'CORRIDOIO', 'BAGNO',
        'SOGGIORNO + AC', 'CUCINA', 'DEPOSITO', 'UFFICIO', 'SCALA',
        'BALCONE', 'TERRAZZO'
    ],

    // Destinazioni vano per Parti Comuni
    ROOM_TYPES_PC: [
        'ANDRONE', 'CORRIDOIO', 'DISIMPEGNO', 'LOCALE TECNICO',
        'LOCALE CONTATORI', 'GUARDIOLA/PORTINERIA', 'DEPOSITO',
        'LAVANDERIA', 'CENTRALE TERMICA', 'AUTORIMESSA',
        'CAMERA', 'INGRESSO', 'BALCONE', 'TERRAZZO'
    ],

    // Soffitto
    CEIL_TYPES: ['Controsoffitto', 'Niente'],

    // ========== PIANI (17 predefiniti, allineato a bot.py) ==========
    PREDEFINED_FLOORS: [
        'Piano Interrato', 'Piano Seminterrato', 'Piano Terra', 'Piano Rialzato',
        'Piano 1', 'Piano 2', 'Piano 3', 'Piano 4', 'Piano 5',
        'Piano 6', 'Piano 7', 'Piano 8', 'Piano 9', 'Piano 10',
        'Sottotetto', 'Terrazzo', 'Copertura'
    ],

    FLOOR_ABBREVIATIONS: {
        'Piano Interrato': 'PInt', 'Piano Seminterrato': 'PSemi',
        'Piano Terra': 'PT', 'Piano Rialzato': 'PR',
        'Piano 1': 'P1', 'Piano 2': 'P2', 'Piano 3': 'P3',
        'Piano 4': 'P4', 'Piano 5': 'P5', 'Piano 6': 'P6',
        'Piano 7': 'P7', 'Piano 8': 'P8', 'Piano 9': 'P9',
        'Piano 10': 'P10',
        'Sottotetto': 'STT', 'Terrazzo': 'TER', 'Copertura': 'COP'
    },

    // Ordine logico piani (basso → alto) per navigazione scale
    get FLOOR_ORDER() {
        const order = {};
        this.PREDEFINED_FLOORS.forEach((f, i) => { order[f] = i; });
        return order;
    },

    FLOOR_LEGACY_MAP: {
        'Seminterrato': 'Piano Seminterrato',
        'Interrato': 'Piano Interrato'
    },

    // Scale predefinite
    STAIRS: ['Scala A', 'Scala B', 'Scala C', 'Scala D', 'Scala Unica'],

    // ========== ELEMENTI ISPEZIONABILI ==========
    ELEMENTS: ['Pareti', 'Soffitto', 'Pavimento', 'Elemento/Varco', 'Balcone'],

    // Elementi per vano con destinazione BALCONE (no Soffitto, Sotto balcone al posto di Soffitto)
    ELEMENTS_BALCONE: ['Pareti', 'Sotto balcone superiore', 'Pavimento', 'Elemento/Varco'],

    // Elementi per vano con destinazione TERRAZZO (no Soffitto, no Sotto balcone)
    ELEMENTS_TERRAZZO: ['Pareti', 'Pavimento', 'Elemento/Varco'],

    // Elementi per Prospetti (solo 2)
    ELEMENTS_PROSPETTI: ['Pareti', 'Elemento/Varco'],

    // Superfici obbligatorie
    REQUIRED_SURFACES: ['Parete A', 'Parete B', 'Parete C', 'Parete D', 'Soffitto', 'Pavimento'],

    // Etichette pareti
    WALL_LABELS: ['Parete A', 'Parete B', 'Parete C', 'Parete D'],

    // Sotto elementi Balcone
    BALCONE_SUB_ELEMENTS: [
        'Parete A', 'Parete B', 'Parete C', 'Parete D',
        'Sotto balcone superiore', 'Pavimento'
    ],

    // ========== SCALA: sotto-sezioni e elementi ==========
    STAIR_SUBSECTIONS_FIXED_TOP: ['Pianerottolo di piano'],
    STAIR_SUBSECTIONS_FIXED_BOTTOM: ['Sottoscala'],

    // Default con 2 rampe (usato da wizard.js se non configurato)
    get STAIR_SUBSECTIONS() {
        return this.generateStairSubsections(2);
    },

    generateStairSubsections(rampCount = 2) {
        const result = [...this.STAIR_SUBSECTIONS_FIXED_TOP];
        for (let i = 1; i <= rampCount; i++) {
            result.push(`Rampa ${i}`);
            if (i < rampCount) {
                result.push(`Pianerottolo interpiano ${i}`);
            }
        }
        result.push(...this.STAIR_SUBSECTIONS_FIXED_BOTTOM);
        return result;
    },

    STAIR_ELEMENTS_PIANEROTTOLO: [
        'Pareti', 'Parete vano ascensore', 'Parapetto',
        'Pavimento', 'Soffitto', 'Elemento/Varco'
    ],

    STAIR_ELEMENTS_RAMPA: [
        'Parete', 'Parete vano ascensore', 'Parapetto',
        'Rampa', 'Pedata', 'Sottogrado', 'Intradosso superiore', 'Elemento/Varco'
    ],

    // Elementi rampa che richiedono input gradino
    STAIR_GRADINO_ELEMENTS: ['Pedata', 'Sottogrado'],

    STAIR_ELEMENTS_SOTTOSCALA: [
        'Pareti', 'Parete vano ascensore', 'Parapetto',
        'Pavimento', 'Soffitto', 'Elemento/Varco'
    ],

    getStairElements(subsection) {
        if (!subsection) return this.STAIR_ELEMENTS_PIANEROTTOLO;
        const lower = subsection.toLowerCase();
        if (lower.includes('rampa')) return this.STAIR_ELEMENTS_RAMPA;
        if (lower.includes('sottoscala')) return this.STAIR_ELEMENTS_SOTTOSCALA;
        return this.STAIR_ELEMENTS_PIANEROTTOLO;
    },

    // ========== PROSPETTI ==========
    PROSPETTO_DEFAULT_LABELS: [
        'Prospetto A', 'Prospetto B', 'Prospetto C', 'Prospetto D',
        'Prospetto E', 'Prospetto F', 'Prospetto G', 'Prospetto H'
    ],

    PROSP_HREF_TYPES: ['finestra', 'balcone', 'portafinestra'],

    // Posizioni pareti Prospetti (standard + angoli)
    POS_WALL_PROSPETTI: [
        'in alto', 'in basso', 'a SX', 'a DX', 'al centro',
        'DD "spigolo"', 'intera superficie',
        'angolo SX', 'angolo DX'
    ],

    // ========== POSIZIONI ==========
    POS_WALL: [
        'in alto', 'in basso', 'a SX', 'a DX', 'al centro',
        'DD "spigolo"', 'intera superficie'
    ],

    POS_CEIL: [
        'in alto', 'in basso', 'a SX', 'a DX', 'al centro',
        'al travetto', 'presso varco', 'presso elemento',
        'intera superficie'
    ],

    POS_FLOOR: [
        'in alto', 'in basso', 'a SX', 'a DX', 'al centro',
        'presso varco', 'presso elemento',
        'intera superficie'
    ],

    POS_BALCONE: [
        'in alto', 'in basso', 'a SX', 'a DX', 'al centro',
        'al travetto', 'presso varco', 'presso elemento',
        'intera superficie'
    ],

    // ========== DIFETTI ==========
    DEFECTS_COMMON: [
        'lesione', 'microlesione', 'filatura', 'distacco',
        'umidità', 'avvallamento', 'degrado superficiale'
    ],

    DEFECTS_VARCO: [
        'lesione', 'microlesione', 'filatura', 'distacco',
        'umidità', 'avvallamento', 'degrado superficiale',
        'rottura', 'non funzionante', 'fuori asse'
    ],

    DEFECT_SPECIFICS: [
        'passante', 'a ragnatela', 'discontinua',
        'capillare', 'ramificata', 'in serie'
    ],

    ATTRIBUTES: [
        'VT', 'OZ', 'DG',
        'DG alto SX', 'DG alto DX', 'DG basso SX', 'DG basso DX',
        'pseudo VT', 'pseudo OZ', 'irregolare'
    ],

    // ========== ELEMENTO/VARCO ==========
    VARCO_SUB_ELEMENTS: [
        'finestra', 'portafinestra', 'porta interna',
        'porta di accesso', 'lucernario', 'apertura', 'arco',
        'arco con tamponatura', 'varco con tamponatura'
    ],

    // Sotto elementi Varco per Prospetti (standard + esterni)
    VARCO_SUB_ELEMENTS_PROSPETTI: [
        'finestra', 'portafinestra', 'porta di accesso',
        'lucernario', 'apertura', 'arco',
        'arco con tamponatura', 'varco con tamponatura',
        'balcone', 'cornicione', 'marcapiano',
        'gronda', 'pluviale', 'sporto',
        'pensilina', 'tettoia', 'insegna'
    ],

    VARCO_LOCATIONS: ['Parete A', 'Parete B', 'Parete C', 'Parete D', 'Soffitto', 'Pavimento'],

    VARCO_DEFECT_POSITIONS: [
        'telaio', 'anta', 'vetro', 'imbotte', 'davanzale', 'soglia',
        'architrave', 'piattabanda', 'spalletta', 'piedritto',
        'rene', 'chiave', 'cassonetto', 'sopra'
    ],

    // ========== PROSECUZIONE ==========
    PROSECUTION_TARGETS: ['Parete A', 'Parete B', 'Parete C', 'Parete D', 'Soffitto', 'Pavimento'],

    // ========== PRE-CHECK ==========
    PRE_CHECK: [
        { value: 'NDR', label: 'NDR (Nulla da Rilevare)', icon: '\u2705' },
        { value: 'NON_VISIBILE', label: 'NON VISIBILE', icon: '\uD83D\uDC41' },
        { value: 'INGOMBRA', label: 'INGOMBRA (Non Ispezionabile)', icon: '\uD83D\uDCE6' },
        { value: 'PARZIALE', label: 'PARZIALMENTE INGOMBRA', icon: '\uD83D\uDCE6' },
        { value: 'PROCEDI', label: 'PROCEDI', icon: '\u25B6\uFE0F' }
    ],

    // ========== STATI VANO ==========
    ROOM_STATUSES: ['accessible', 'non_accessibile', 'non_valutabile', 'non_autorizzato'],

    ROOM_STATUS_LABELS: {
        accessible: 'Accessibile',
        non_accessibile: 'Non Accessibile',
        non_valutabile: 'Non Valutabile',
        non_autorizzato: 'Non Autorizzato'
    },

    // ========== DISCLAIMER TYPES ==========
    DISCLAIMER_TYPES: [
        { value: 'UNIT_NO_FOTO', label: 'Unità non fotografabile' },
        { value: 'NON_ACCESSIBILE', label: 'Vano non accessibile' },
        { value: 'NON_VALUTABILE', label: 'Vano non valutabile' },
        { value: 'NON_AUTORIZZATO', label: 'Vano non autorizzato' }
    ],

    // ========== HELPER FUNCTIONS ==========

    getPositions(element, isProspetto = false) {
        if (isProspetto && element === 'Pareti') return this.POS_WALL_PROSPETTI;
        switch (element) {
            case 'Pareti': return this.POS_WALL;
            case 'Soffitto': return this.POS_CEIL;
            case 'Sotto balcone superiore': return this.POS_CEIL;
            case 'Pavimento': return this.POS_FLOOR;
            case 'Balcone': return this.POS_BALCONE;
            case 'Elemento/Varco': return this.VARCO_DEFECT_POSITIONS;
            default: return this.POS_WALL;
        }
    },

    getPhenomena(element) {
        switch (element) {
            case 'Pareti':
            case 'Soffitto':
            case 'Sotto balcone superiore':
            case 'Pavimento':
            case 'Balcone':
                return this.DEFECTS_COMMON;
            case 'Elemento/Varco':
                return this.DEFECTS_VARCO;
            default:
                return this.DEFECTS_COMMON;
        }
    },

    getElements(isProspetto = false, isStair = false, stairSubsection = null, roomDestination = null) {
        if (isProspetto) return this.ELEMENTS_PROSPETTI;
        if (isStair && stairSubsection) return this.getStairElements(stairSubsection);
        if (roomDestination === 'BALCONE') return this.ELEMENTS_BALCONE;
        if (roomDestination === 'TERRAZZO') return this.ELEMENTS_TERRAZZO;
        return this.ELEMENTS;
    },

    isBalconeRoom(destination) {
        return destination === 'BALCONE';
    },

    isTerrazzoRoom(destination) {
        return destination === 'TERRAZZO';
    },

    getVarcoSubElements(isProspetto = false) {
        return isProspetto ? this.VARCO_SUB_ELEMENTS_PROSPETTI : this.VARCO_SUB_ELEMENTS;
    },

    getRoomTypes(isPC = false) {
        return isPC ? this.ROOM_TYPES_PC : this.ROOM_TYPES;
    },

    isPartiComuni(sopOrName) {
        // Accetta sia stringa (unit_name) sia oggetto sop
        const name = (typeof sopOrName === 'object' && sopOrName !== null)
            ? (sopOrName.unit_name || sopOrName.unit_type || '')
            : (sopOrName || '');
        return name === 'Parti Comuni' || name.startsWith('Parti Comuni');
    },

    isProspettoRoom(roomName) {
        if (!roomName) return false;
        return roomName === 'Prospetti' || roomName.startsWith('Prospetti (') || roomName.startsWith('Prospetto ');
    },

    isStairRoom(roomName) {
        if (!roomName) return false;
        return roomName.toLowerCase().includes('scala');
    },

    generateWallLabels(count) {
        const labels = [];
        for (let i = 0; i < count; i++) {
            labels.push(`Parete ${String.fromCharCode(65 + i)}`);
        }
        return labels;
    },

    getFloorAbbr(floorName) {
        return this.FLOOR_ABBREVIATIONS[floorName] || floorName;
    },

    getNextFloor(currentFloor, direction) {
        const order = this.FLOOR_ORDER;
        const currentIdx = order[currentFloor];
        if (currentIdx === undefined) return null;
        const targetIdx = direction === 'salendo' ? currentIdx + 1 : currentIdx - 1;
        const floors = this.PREDEFINED_FLOORS;
        if (targetIdx < 0 || targetIdx >= floors.length) return null;
        return floors[targetIdx];
    },

    // ========== SYNC API (D1 — HTTP diretto via Cloudflare Tunnel) ==========
    // API_URL viene risolto dinamicamente dal Worker all'avvio della webapp.
    // Non impostare manualmente: Sync.init() lo popola automaticamente.
    API_URL: '',

    // URL fisso del Cloudflare Worker che fa da registry per l'URL tunnel.
    // Il Worker è deployato una volta e non cambia mai URL.
    WORKER_URL: 'https://tundai.g-nudi.workers.dev',

    API_TOKEN: '',          // Solo per test fuori da Telegram (fallback Bearer token)

    /**
     * cleanTextHelper - allineato a clean_text_helper() di reports.py
     * Rimuove parentesi, lowercase, applica contrazioni standard
     */
    cleanTextHelper(text) {
        if (!text) return '';
        let t = text.trim();
        // Rimuovi parentesi
        t = t.replace(/[()]/g, '');
        // Lowercase
        t = t.toLowerCase();
        // Contrazioni (allineate a reports.py)
        t = t.replace(/\bvt verticale\b/g, 'vt');
        t = t.replace(/\boz orizzontale\b/g, 'oz');
        t = t.replace(/\bdg diagonale\b/g, 'dg');
        t = t.replace(/\bultimo tratto ut\b/g, 'ut');
        t = t.replace(/\bdiedro dd\b/g, 'dd');
        // Normalizza spazi multipli
        t = t.replace(/\s+/g, ' ').trim();
        return t;
    },

    // ========== SYNC RELAY (legacy, fallback) ==========
    // Token relay bot e chat_id gruppo sync (Fase 0)
    // Usato come fallback se API_URL non configurato
    SYNC_RELAY_TOKEN: '',   // Token @testimoniale_sync_bot
    SYNC_GROUP_ID: '',      // Chat_id gruppo "Sync Testimoniale"
};
