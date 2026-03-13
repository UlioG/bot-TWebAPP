/* ============================================================
 * config.js — Costanti IDENTICHE a config.py del bot originale
 * Ogni nome, valore, ordine è copiato 1:1 dal bot.
 * ============================================================ */

'use strict';

const Config = (() => {

    // ===== TIPI UNITA =====
    const UNIT_TYPES = [
        "Abitazione", "Ufficio", "Negozio", "Autorimessa",
        "Box", "Posto auto", "Cantina", "Soffitta", "Parti Comuni"
    ];

    const PERTINENZA_TYPES = ["Cantina", "Soffitta", "Box", "Posto auto"];
    const PERTINENZA_PARENT_TYPES = ["Abitazione", "Ufficio"];

    // ===== DESTINAZIONI VANO =====
    const ROOM_TYPES = [
        "INGRESSO", "STANZA", "DISIMPEGNO", "CORRIDOIO", "BAGNO",
        "SOGGIORNO", "SOGGIORNO + AC", "CUCINA", "DEPOSITO",
        "UFFICIO", "SCALA", "BALCONE", "TERRAZZO"
    ];

    const ROOM_TYPES_PC = [
        "ANDRONE", "CORRIDOIO", "DISIMPEGNO", "LOCALE TECNICO",
        "LOCALE CONTATORI", "GUARDIOLA/PORTINERIA", "DEPOSITO",
        "LAVANDERIA", "CENTRALE TERMICA", "AUTORIMESSA",
        "CAMERA", "INGRESSO"
    ];

    // ===== FINITURE =====
    const CEIL_TYPES = ["Controsoffitto", "Niente"];

    // ===== ELEMENTI =====
    const ELEMENTS = ["Pareti", "Soffitto", "Pavimento", "Elemento/Varco"];
    const ELEMENTS_PROSPETTI = ["Pareti", "Elemento/Varco"];
    const ELEMENTS_BALCONE = ["Pareti", "Sotto balcone superiore", "Pavimento", "Elemento/Varco"];
    const ELEMENTS_TERRAZZO = ["Pareti", "Pavimento", "Elemento/Varco"];

    // ===== SCALA: SOTTO-SEZIONI E ELEMENTI =====
    const STAIR_SUBSECTIONS_FIXED_TOP = ["Pianerottolo di piano"];
    const STAIR_SUBSECTIONS_FIXED_BOTTOM = ["Sottoscala"];

    const STAIR_LEGACY_SUBSECTIONS = [
        "Rampa a salire", "Rampa a scendere",
        "Pianerottolo di piano", "Pianerottolo interpiano", "Sottoscala"
    ];

    function generateStairSubsections(rampCount) {
        rampCount = rampCount || 2;
        const result = [...STAIR_SUBSECTIONS_FIXED_TOP];
        for (let i = 1; i <= rampCount; i++) {
            result.push(`Rampa ${i}`);
            if (i < rampCount) {
                result.push(`Pianerottolo interpiano ${i}`);
            }
        }
        result.push(...STAIR_SUBSECTIONS_FIXED_BOTTOM);
        return result;
    }

    const STAIR_ELEMENTS_PIANEROTTOLO = [
        "Pareti", "Parete vano ascensore", "Parapetto",
        "Pavimento", "Soffitto", "Elemento/Varco"
    ];
    const STAIR_ELEMENTS_RAMPA = [
        "Parete", "Parete vano ascensore", "Parapetto",
        "Rampa", "Intradosso superiore", "Elemento/Varco"
    ];
    const STAIR_ELEMENTS_SOTTOSCALA = [
        "Pareti", "Parete vano ascensore", "Parapetto",
        "Pavimento", "Soffitto", "Elemento/Varco"
    ];

    // ===== SUPERFICI E PARETI =====
    const REQUIRED_SURFACES = ["Parete A", "Parete B", "Parete C", "Parete D", "Soffitto", "Pavimento"];
    const WALL_LABELS = ["Parete A", "Parete B", "Parete C", "Parete D"];
    const BALCONE_SUB_ELEMENTS = ["Parete A", "Parete B", "Parete C", "Parete D", "Sotto balcone superiore", "Pavimento"];

    // ===== POSIZIONI =====
    const POS_WALL = [
        "in alto", "in basso", "a SX", "a DX", "al centro",
        'DD "spigolo"', "intera superficie"
    ];

    const POS_WALL_PROSPETTI = [
        "in alto", "in basso", "a SX", "a DX", "al centro",
        'DD "spigolo"', "intera superficie",
        "angolo SX", "angolo DX"
    ];

    const PROSPETTO_DEFAULT_LABELS = [];
    for (let i = 0; i < 8; i++) {
        PROSPETTO_DEFAULT_LABELS.push(`Prospetto ${String.fromCharCode(65 + i)}`);
    }
    const PROSP_HREF_TYPES = ["finestra", "balcone", "portafinestra"];

    const POS_CEIL = [
        "in alto", "in basso", "a SX", "a DX", "al centro",
        "al travetto", "presso varco", "presso elemento",
        "intera superficie"
    ];

    const POS_FLOOR = [
        "in alto", "in basso", "a SX", "a DX", "al centro",
        "presso varco", "presso elemento",
        "intera superficie"
    ];

    const POS_BALCONE = [
        "in alto", "in basso", "a SX", "a DX", "al centro",
        "al travetto", "presso varco", "presso elemento",
        "intera superficie"
    ];

    // ===== DIFETTI =====
    const DEFECTS_COMMON = [
        "lesione", "microlesione", "filatura", "distacco",
        "umidita", "avvallamento", "degrado superficiale"
    ];

    const DEFECTS_VARCO = [
        "lesione", "microlesione", "filatura", "distacco",
        "umidita", "avvallamento", "degrado superficiale",
        "rottura", "non funzionante", "fuori asse"
    ];

    // ===== ELEMENTO/VARCO =====
    const VARCO_SUB_ELEMENTS = [
        "finestra", "portafinestra", "porta interna",
        "porta di accesso", "lucernario", "apertura", "arco",
        "arco con tamponatura", "varco con tamponatura"
    ];

    const VARCO_SUB_ELEMENTS_PROSPETTI = [
        "finestra", "portafinestra", "porta di accesso",
        "lucernario", "apertura", "arco",
        "arco con tamponatura", "varco con tamponatura",
        "balcone", "cornicione", "marcapiano",
        "gronda", "pluviale", "sporto",
        "pensilina", "tettoia", "insegna"
    ];

    const VARCO_LOCATIONS = ["Parete A", "Parete B", "Parete C", "Parete D", "Soffitto", "Pavimento"];

    const VARCO_DEFECT_POSITIONS = [
        "telaio", "anta", "vetro", "imbotte", "davanzale", "soglia",
        "architrave", "piattabanda", "spalletta", "piedritto",
        "rene", "chiave", "cassonetto", "sopra"
    ];

    // ===== SPECIFICHE DIFETTO =====
    const DEFECT_SPECIFICS = [
        "passante", "a ragnatela", "discontinua",
        "capillare", "ramificata", "in serie"
    ];

    // ===== ATTRIBUTI =====
    const ATTRIBUTES = [
        "VT", "OZ", "DG",
        "DG alto SX", "DG alto DX", "DG basso SX", "DG basso DX",
        "pseudo VT", "pseudo OZ", "irregolare"
    ];

    // ===== OBSERVATION MATRIX =====
    const OBSERVATION_MATRIX = {
        "Pareti":                  { positions: POS_WALL,              phenomena: DEFECTS_COMMON },
        "Soffitto":                { positions: POS_CEIL,              phenomena: DEFECTS_COMMON },
        "Pavimento":               { positions: POS_FLOOR,             phenomena: DEFECTS_COMMON },
        "Elemento/Varco":          { positions: VARCO_DEFECT_POSITIONS, phenomena: DEFECTS_VARCO },
        "Sotto balcone superiore": { positions: POS_CEIL,              phenomena: DEFECTS_COMMON },
    };

    // ===== PROSECUZIONE =====
    const PROSECUTION_TARGETS = ["Parete A", "Parete B", "Parete C", "Parete D", "Soffitto", "Pavimento"];

    // ===== PIANI =====
    const PREDEFINED_FLOORS = [
        "Piano Interrato", "Piano Seminterrato", "Piano Terra", "Piano Rialzato",
        "Piano 1", "Piano 2", "Piano 3", "Piano 4", "Piano 5",
        "Piano 6", "Piano 7", "Piano 8", "Piano 9", "Piano 10",
        "Sottotetto", "Terrazzo", "Copertura"
    ];

    const FLOOR_ABBREVIATIONS = {
        "Piano Interrato": "PInt", "Piano Seminterrato": "PSemi",
        "Piano Terra": "PT", "Piano Rialzato": "PR",
        "Piano 1": "P1", "Piano 2": "P2", "Piano 3": "P3",
        "Piano 4": "P4", "Piano 5": "P5", "Piano 6": "P6",
        "Piano 7": "P7", "Piano 8": "P8", "Piano 9": "P9",
        "Piano 10": "P10",
        "Sottotetto": "STT", "Terrazzo": "TER", "Copertura": "COP"
    };

    const FLOOR_ORDER = {};
    PREDEFINED_FLOORS.forEach((f, i) => { FLOOR_ORDER[f] = i; });

    const FLOOR_LEGACY_MAP = {
        "Seminterrato": "Piano Seminterrato",
        "Interrato": "Piano Interrato"
    };

    // ===== STATI VANO =====
    const ROOM_STATUSES = {
        ACCESSIBLE: "accessible",
        NON_ACCESSIBILE: "non_accessibile",
        NON_VALUTABILE: "non_valutabile",
        NON_AUTORIZZATO: "non_autorizzato"
    };

    // ===== FASI =====
    const PHASES = { ANAGRAFICA: 1, SOPRALLUOGO: 2, RIEPILOGO: 3 };

    // ===== HELPER: Sanitize path component (identico a bot.py) =====
    function sanitizePathComponent(name) {
        if (!name) return "Unknown";
        name = name.replace(/\//g, '-').replace(/\\/g, '-').replace(/\.\./g, '_');
        [':', '*', '?', '"', '<', '>', '|'].forEach(ch => {
            name = name.split(ch).join('_');
        });
        name = name.replace(/^[.\s]+|[.\s]+$/g, '');
        return name || "Unknown";
    }

    function getFloorAbbrev(floorName) {
        if (FLOOR_ABBREVIATIONS[floorName]) return FLOOR_ABBREVIATIONS[floorName];
        return floorName.substring(0, 3).toUpperCase();
    }

    function extractFloorFromRoomName(roomName) {
        const m = roomName.match(/\(([^)]+)\)\s*$/);
        return m ? m[1] : null;
    }

    // ===== OBSERVATION DATA TEMPLATE (chiavi identiche a bot.py _save_observation_data_impl) =====
    function emptyObservation() {
        return {
            element: "",
            position: "",
            phenomenon: "",
            specifics: [],
            attributes: [],
            notes: "",
            timestamp_detection: "",
            infisso_type: "",
            infisso_wall: "",
            infisso_loc: "",
            infisso_confine: "",
            has_counterwall: false,
            has_cdp: false,
            non_visibile: false,
            balcone_sub: "",
            prosecutions: [],
            stair_subsection: "",
            prosp_floor: "",
            prosp_href: ""
        };
    }

    // ===== PUBLIC API =====
    return {
        UNIT_TYPES, PERTINENZA_TYPES, PERTINENZA_PARENT_TYPES,
        ROOM_TYPES, ROOM_TYPES_PC,
        CEIL_TYPES,
        ELEMENTS, ELEMENTS_PROSPETTI, ELEMENTS_BALCONE, ELEMENTS_TERRAZZO,
        STAIR_SUBSECTIONS_FIXED_TOP, STAIR_SUBSECTIONS_FIXED_BOTTOM,
        STAIR_LEGACY_SUBSECTIONS, generateStairSubsections,
        STAIR_ELEMENTS_PIANEROTTOLO, STAIR_ELEMENTS_RAMPA, STAIR_ELEMENTS_SOTTOSCALA,
        REQUIRED_SURFACES, WALL_LABELS, BALCONE_SUB_ELEMENTS,
        POS_WALL, POS_WALL_PROSPETTI, POS_CEIL, POS_FLOOR, POS_BALCONE,
        PROSPETTO_DEFAULT_LABELS, PROSP_HREF_TYPES,
        DEFECTS_COMMON, DEFECTS_VARCO,
        VARCO_SUB_ELEMENTS, VARCO_SUB_ELEMENTS_PROSPETTI,
        VARCO_LOCATIONS, VARCO_DEFECT_POSITIONS,
        DEFECT_SPECIFICS, ATTRIBUTES,
        OBSERVATION_MATRIX, PROSECUTION_TARGETS,
        PREDEFINED_FLOORS, FLOOR_ABBREVIATIONS, FLOOR_ORDER, FLOOR_LEGACY_MAP,
        ROOM_STATUSES, PHASES,
        sanitizePathComponent, getFloorAbbrev, extractFloorFromRoomName,
        emptyObservation
    };

})();
