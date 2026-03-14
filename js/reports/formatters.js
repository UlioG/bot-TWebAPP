/**
 * formatters.js — Formattazione testi osservazioni e report
 * ALLINEATO 1:1 a reports.py format_observation_text() + group_observations_by_element()
 * Single source of truth per stringhe osservazione nella webapp
 */

// ========== HELPERS (allineati a reports.py) ==========

/**
 * clean_text_helper — replica esatta di reports.py clean_text_helper()
 * Rimuove parentesi e applica contrazioni.
 */
function cleanTextHelper(text) {
    if (!text) return '';
    let t = text.trim().replace(/\(/g, '').replace(/\)/g, '');
    let tl = t.toLowerCase();
    tl = tl.replace('vt verticale', 'vt');
    tl = tl.replace('oz orizzontale', 'oz');
    tl = tl.replace('dg diagonale', 'dg');
    tl = tl.replace('ultimo tratto ut', 'ut');
    tl = tl.replace('ut ultimo tratto', 'ut');
    tl = tl.replace('diedro dd', 'dd');
    tl = tl.replace('dd diedro', 'dd');
    return tl.split(/\s+/).join(' ');
}

/**
 * fix_pos_case — replica esatta di reports.py fix_pos_case()
 */
function fixPosCase(p) {
    if (!p) return '';
    let out = p.toLowerCase();
    for (let i = 0; i < 26; i++) {
        const c = String.fromCharCode(97 + i); // a-z
        const C = c.toUpperCase();
        out = out.split(`parete ${c}`).join(`Parete ${C}`);
        out = out.split(`prospetto ${c}`).join(`Prospetto ${C}`);
    }
    out = out.split('Parete Vano ascensore').join('Parete vano ascensore');
    return out;
}

// ========== FORMAT OBSERVATION TEXT (replica reports.py riga 76-259) ==========

/**
 * Formatta il testo di una osservazione — replica esatta di format_observation_text()
 * @param {Object} data - Osservazione (formato metadata.json o webapp)
 * @param {string|null} keyOrIndex - Chiave metadata (es. "Foto_3_dettaglio.jpg") per V.F.
 * @param {boolean} includeElement - Se includere il nome elemento
 * @param {Object|null} vfRenumberMap - Mappa rinumerazione V.F.
 * @param {boolean} includeVF - Se includere riferimento (V.F. N)
 * @returns {string}
 */
function formatObservationText(obs, options = {}) {
    if (!obs) return '';

    // Supporta sia il formato chiamata legacy (obs, options) che il formato reports.py
    const data = obs;
    const includeElement = options.includeElement !== false;
    const includeVF = options.includeVF !== false;
    const vfNumber = options.vfNumber || null;
    const keyOrIndex = options.key || null;

    // Raw Data
    let rawEl = data.element || '';

    // Formato webapp: element "Pareti" + wall "Parete A" → element "Parete A"
    if (rawEl === 'Pareti' && data.wall) {
        rawEl = data.wall;
    }

    // Legacy: "Intradosso" -> "Intradosso superiore"
    if (rawEl === 'Intradosso') rawEl = 'Intradosso superiore';

    const rawPos = data.position || '';
    const rawPhen = data.phenomenon || '';
    // Note: gestisce sia 'notes' che il campo 'parz_ingombra' della webapp
    let rawNotes = data.notes || '';
    if (data.parz_ingombra && !rawNotes.toLowerCase().includes('parzialmente ingombra')) {
        rawNotes = rawNotes ? `${rawNotes}, parzialmente ingombra` : 'parzialmente ingombra';
    }

    let rawAttrs = data.attributes || data.details || [];
    if (Array.isArray(rawAttrs)) rawAttrs = rawAttrs.join(', ');

    let rawSpecifics = data.specifics || [];
    if (Array.isArray(rawSpecifics)) rawSpecifics = rawSpecifics.join(', ');

    const hasCounterwall = data.has_counterwall || false;
    const hasCdp = data.has_cdp || false;
    const nonVisibile = data.non_visibile || false;
    const prosecutions = data.prosecutions || [];

    // Check for Elemento/Varco overrides
    const infissoType = data.infisso_type || null;
    const infissoWall = data.infisso_wall || (data.infisso_location || null);
    // infisso_loc: nel bot = identificativo varco (infisso_which nella webapp)
    const infissoLoc = data.infisso_loc || data.infisso_which || '';
    const infissoConfine = data.infisso_confine || '';

    if ((rawEl === 'Elemento/Varco' || rawEl === 'Infisso') && infissoType) {
        rawEl = infissoType;
        if (infissoConfine && infissoType.toLowerCase().includes('porta interna')) {
            rawEl = `${infissoType} (Vs ${infissoConfine})`;
        }
    }

    // 1. Element
    let el = '';
    if (rawEl) {
        el = rawEl.charAt(0).toUpperCase() + rawEl.slice(1);
        for (let i = 0; i < 26; i++) {
            const c = String.fromCharCode(97 + i);
            const C = c.toUpperCase();
            el = el.split(`parete ${c}`).join(`Parete ${C}`);
            el = el.split(`Parete ${c}`).join(`Parete ${C}`);
            el = el.split(`prospetto ${c}`).join(`Prospetto ${C}`);
            el = el.split(`Prospetto ${c}`).join(`Prospetto ${C}`);
        }
        el = el.split('Parete Vano ascensore').join('Parete vano ascensore');
    }

    // Controparete
    if (hasCounterwall && !el.toLowerCase().includes('controparete')) {
        el = `${el} con controparete`;
    }

    // CDP
    if (hasCdp && !el.toLowerCase().includes('cdp')) {
        el = hasCounterwall ? `${el}, CDP` : `${el} CDP`;
    }

    // Non Visibile
    if (nonVisibile && !el.toLowerCase().includes('non visibile')) {
        el = `${el} non visibile`;
    }

    // 2. Position
    let pos = fixPosCase(rawPos);

    // Infisso: componi posizione
    if (infissoWall && includeElement) {
        const w = fixPosCase(infissoWall);
        const loc = infissoLoc ? infissoLoc.trim() : '';
        let prefix = `su ${w}${loc ? ' ' + loc : ''}`.trim();
        pos = pos ? `${prefix} ${pos}`.trim() : prefix;
    }
    // Se !includeElement, pos resta solo le sub-posizioni

    // 3. Phenomenon
    const phen = cleanTextHelper(rawPhen).toLowerCase();

    // 4. NDR Logic
    const isNdr = phen.includes('ndr') || phen.includes('nulla da rilevare');

    // 5. V.F. Photo Link
    let vfRef = '';
    if (includeVF && vfNumber) {
        vfRef = ` (V.F. ${vfNumber})`;
    }

    const parts = [];

    // Element (solo se includeElement)
    if (includeElement) {
        // Deduplicazione: se l'elemento e' gia' contenuto nella posizione
        if (el && pos && pos.toLowerCase().includes(el.toLowerCase())) {
            parts.push(pos);
            pos = ''; // evita di ri-aggiungerla
        } else {
            parts.push(el);
        }
    }

    if (isNdr) {
        // Se parzialmente ingombra, includere la nota prima di NDR
        const notesLower = rawNotes ? cleanTextHelper(rawNotes).toLowerCase() : '';
        if (notesLower.includes('parzialmente ingombra')) {
            parts.push('parzialmente ingombra');
        }
        parts.push(`NDR${vfRef}`);
    } else if (phen.includes('ingombra') && !phen.includes('parzialmente')) {
        parts.push(`ingombra${vfRef}`);
    } else {
        // Piano del difetto (solo Prospetti)
        const prospFloor = data.prosp_floor || '';
        if (prospFloor) parts.push(prospFloor);

        // Riferimento orizzontale (solo Prospetti)
        const prospHref = data.prosp_href || '';
        if (prospHref) parts.push(prospHref);

        if (pos) parts.push(pos);
        if (phen) parts.push(phen);

        // Specifiche difetto
        const sSpec = rawSpecifics ? cleanTextHelper(String(rawSpecifics)).toLowerCase() : '';
        if (sSpec) parts.push(sSpec);

        // Attributi
        const sAttrs = rawAttrs ? cleanTextHelper(String(rawAttrs)).toLowerCase() : '';
        if (sAttrs) parts.push(sAttrs);

        // Prosecuzione
        if (prosecutions && prosecutions.length > 0) {
            parts.push(`prosegue su ${prosecutions.join(', ')}`);
        }

        // Note operatore
        const cleanedNotes = cleanTextHelper(rawNotes);
        if (cleanedNotes && !cleanedNotes.toLowerCase().includes('ingombra')) {
            parts.push(cleanedNotes);
        }

        // V.F.
        if (vfRef && parts.length > 0) {
            parts[parts.length - 1] = parts[parts.length - 1] + vfRef;
        }
    }

    // Assemble come frase (spazio come separatore)
    const finalParts = parts.filter(p => p && p.trim());
    let sentence = finalParts.join(' ').trim();

    if (sentence) {
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }

    // Prefisso sotto-sezione scala
    const stairSub = data.stair_subsection || '';
    if (stairSub && includeElement && sentence) {
        sentence = `${stairSub}: ${sentence}`;
    }

    return sentence;
}


// ========== GROUP OBSERVATIONS BY ELEMENT (replica reports.py riga 262-432) ==========

/**
 * Raggruppa osservazioni per elemento e genera testo accorpato.
 * Replica esatta di group_observations_by_element() di reports.py.
 * Opera sul formato webapp (array di osservazioni), non su metadata dict.
 *
 * @param {Array} observations - Array di osservazioni dal formato webapp
 * @returns {string[]} - Array di stringhe, una per gruppo elemento
 */
function groupObservationsByElement(observations) {
    if (!observations || observations.length === 0) return [];

    // Costruisci mappa V.F. (solo obs con foto hanno V.F.)
    let vfIdx = 0;
    const vfMap = [];
    for (const obs of observations) {
        if (obs.photo_id || obs.photo_filename) {
            vfIdx++;
            vfMap.push(vfIdx);
        } else {
            vfMap.push(0);
        }
    }

    // Raggruppa per elemento mantenendo ordine
    const groups = {}; // group_key -> [{obs, vf, index}]
    const groupOrder = []; // per mantenere ordine di inserimento

    for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];

        // Skip "Intero Vano NDR" e "Intera Sotto-sezione NDR"
        if (obs.element === 'Intero Vano' && obs.phenomenon === 'NDR') continue;
        if (obs.element === 'Intera Sotto-sezione' && obs.phenomenon === 'NDR') continue;

        // Determina chiave di raggruppamento
        let rawEl = obs.element || '';
        // Formato webapp: element "Pareti" + wall "Parete A" → raggruppamento per "Parete A"
        if (rawEl === 'Pareti' && obs.wall) {
            rawEl = obs.wall;
        }
        const infissoType = obs.infisso_type || null;

        let groupKey;
        if ((rawEl === 'Infisso' || rawEl === 'Elemento/Varco') && infissoType) {
            groupKey = infissoType;
        } else {
            groupKey = rawEl;
        }

        // Per Elemento/Varco aggiungi wall + loc per distinguere
        const infissoWall = obs.infisso_wall || obs.infisso_location || '';
        const infissoLoc = obs.infisso_loc || obs.infisso_which || '';
        if (infissoWall && !['', 'Soffitto', 'Pavimento'].includes(groupKey) &&
            !groupKey.startsWith('Parete') && !groupKey.startsWith('Balcone')) {
            groupKey = `${groupKey}__${infissoWall}__${infissoLoc}`;
        }

        // Sotto-sezione scala
        const stairSub = obs.stair_subsection || '';
        if (stairSub) {
            groupKey = `${stairSub}::${groupKey}`;
        }

        if (!groups[groupKey]) {
            groups[groupKey] = [];
            groupOrder.push(groupKey);
        }
        groups[groupKey].push({ obs, vf: vfMap[i], index: i });
    }

    const resultLines = [];

    // --- Accorpamento Pareti NDR individuali ---
    const ndrBySubsection = {}; // {subsection: [{groupKey, letter}]}
    const prospNdrItems = []; // [{groupKey, letter}]

    for (const groupKey of groupOrder) {
        const items = groups[groupKey];
        if (items.length === 1) {
            const { obs } = items[0];
            if (obs.phenomenon === 'NDR') {
                let stairSub = '';
                let elPart = groupKey;
                if (groupKey.includes('::')) {
                    [stairSub, elPart] = groupKey.split('::', 2);
                }
                if (elPart.startsWith('Parete ') && elPart.length > 7) {
                    const letter = elPart.substring(7);
                    if (!ndrBySubsection[stairSub]) ndrBySubsection[stairSub] = [];
                    ndrBySubsection[stairSub].push({ groupKey, letter });
                } else if (elPart.startsWith('Prospetto ') && elPart.length > 10) {
                    const letter = elPart.substring(10);
                    prospNdrItems.push({ groupKey, letter });
                }
            }
        }
    }

    // Chiavi da accorpare (2+ pareti NDR nella stessa sotto-sezione)
    const ndrMergeKeys = new Set();
    for (const [sub, pairs] of Object.entries(ndrBySubsection)) {
        if (pairs.length >= 2) {
            for (const { groupKey } of pairs) ndrMergeKeys.add(groupKey);
        }
    }

    // Prospetti NDR: se 2+, accorpa
    const prospNdrMergeKeys = new Set();
    if (prospNdrItems.length >= 2) {
        for (const { groupKey } of prospNdrItems) prospNdrMergeKeys.add(groupKey);
    }

    for (const groupKey of groupOrder) {
        // Salta le chiavi che verranno accorpate
        if (ndrMergeKeys.has(groupKey) || prospNdrMergeKeys.has(groupKey)) continue;

        const items = groups[groupKey];

        if (items.length === 1) {
            // Singola osservazione
            const { obs, vf } = items[0];
            const line = formatObservationText(obs, {
                includeElement: true,
                includeVF: vf > 0,
                vfNumber: vf
            });
            if (line) resultLines.push(line);
        } else {
            // Piu' osservazioni: prima con elemento, successive senza
            const { obs: obs0, vf: vf0 } = items[0];
            const firstLine = formatObservationText(obs0, {
                includeElement: true,
                includeVF: vf0 > 0,
                vfNumber: vf0
            });

            const subParts = [];
            for (let j = 1; j < items.length; j++) {
                const { obs: obsJ, vf: vfJ } = items[j];
                let sub = formatObservationText(obsJ, {
                    includeElement: false,
                    includeVF: vfJ > 0,
                    vfNumber: vfJ
                });
                if (sub) {
                    // Prima lettera minuscola per le successive
                    sub = sub.charAt(0).toLowerCase() + sub.slice(1);
                    subParts.push(sub);
                }
            }

            const combined = subParts.length > 0
                ? firstLine + ', ' + subParts.join(', ')
                : firstLine;
            if (combined) resultLines.push(combined);
        }
    }

    // Inserisci righe accorpate per pareti NDR (per sotto-sezione)
    for (const [sub, pairs] of Object.entries(ndrBySubsection)) {
        if (pairs.length >= 2) {
            const sortedLetters = pairs.map(p => p.letter).sort();
            let mergedLine = `Pareti ${sortedLetters.join(', ')} NDR`;
            if (sub) mergedLine = `${sub}: ${mergedLine}`;
            resultLines.push(mergedLine);
        }
    }

    // Inserisci riga accorpata per prospetti NDR
    if (prospNdrItems.length >= 2) {
        const sortedLetters = prospNdrItems.map(p => p.letter).sort();
        resultLines.push(`Prospetti ${sortedLetters.join(', ')} NDR`);
    }

    // --- NDR per sotto-sezioni scala ("Intera Sotto-sezione") ---
    const subNdrSet = new Set();
    for (const obs of observations) {
        if (obs.element === 'Intera Sotto-sezione' && obs.phenomenon === 'NDR') {
            const ss = obs.stair_subsection || '';
            if (ss) subNdrSet.add(ss);
        }
    }

    for (const ss of [...subNdrSet].sort()) {
        const hasOther = observations.some(obs =>
            obs.stair_subsection === ss &&
            !(obs.element === 'Intera Sotto-sezione' && obs.phenomenon === 'NDR')
        );
        const ndrText = hasOther ? `${ss}: NDR per i restanti elementi` : `${ss}: NDR`;
        resultLines.unshift(ndrText); // Inserisci all'inizio
    }

    return resultLines;
}


// ========== GENERATE ROOM TEXT ==========

/**
 * Genera testo raggruppato per un vano — usa groupObservationsByElement
 * Output: righe separate da ";\n", ciascuna terminata da ";"
 * @param {Array} observations
 * @returns {string}
 */
function generateRoomText(observations) {
    if (!observations || observations.length === 0) return '';

    const lines = groupObservationsByElement(observations);
    // Ogni riga terminata da ";"
    return lines.map(l => l + ';').join('\n');
}


// ========== CAPPELLO (replica reports.py righe 523-584) ==========

/**
 * Genera testo cappello — replica esatta di reports.py
 * @param {Object} sop - Sopralluogo (formato webapp)
 * @returns {string}
 */
function generateCappelloText(sop) {
    if (sop.custom_cappello) return sop.custom_cappello;

    const lines = [];

    // Data e ora dal start_time
    let dateStr = '';
    let timeStr = '';
    if (sop.start_time) {
        try {
            const dt = new Date(sop.start_time);
            if (!isNaN(dt.getTime())) {
                const dd = String(dt.getDate()).padStart(2, '0');
                const mm = String(dt.getMonth() + 1).padStart(2, '0');
                const yyyy = dt.getFullYear();
                dateStr = `${dd}/${mm}/${yyyy}`;
                timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            }
        } catch (e) { /* fallback sotto */ }
    }
    if (!dateStr) {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        dateStr = `${dd}/${mm}/${yyyy}`;
        timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    const buildingAddress = sop.building_address || '___';
    const buildingCode = sop.building_code || '___';

    // Riga 1: apertura operazioni
    lines.push(`Il giorno ${dateStr} alle ore ${timeStr} si aprono le operazioni di sopralluogo con finalit\u00e0 descrittive e fotografiche, presso il fabbricato sito in ${buildingAddress}, con codice identificativo ${buildingCode}.`);
    lines.push('');

    // Riga 2: Metro C
    const metroTech = _getAttendee(sop, 'metro_tech');
    let line2 = `Sono presenti per Metro C S.c.p.A.: ${metroTech}`;
    const metroColl = _getAttendee(sop, 'metro_coll');
    if (metroColl) {
        line2 += ` con i collaboratori ${metroColl}`;
    }
    lines.push(line2);
    lines.push('');

    // Riga 3: Roma Metropolitane (solo se rm_presente)
    if (sop.rm_presente !== false) {
        const rm = _getAttendee(sop, 'rm');
        if (rm) {
            lines.push(`Sono presenti per Roma Metropolitane: ${rm}`);
            lines.push('');
        }
    }

    // Riga 4: Proprietario/Amministratore
    const isPC = _isPartiComuni(sop);
    const ownerLabel = isPC
        ? "l'Amministratore/Delegato"
        : "la Propriet\u00e0/Comproprietario/Affittuario/Delegato";
    const ownerStr = _getOwnerString(sop);
    lines.push(`Sono presenti per ${ownerLabel}: ${ownerStr}`);

    return lines.join('\n');
}

/** Helper: estrai attendee come stringa */
function _getAttendee(sop, field) {
    // Formato webapp: sop.attendees.metro_tech / sop.attendees.metro_coll (array) / sop.attendees.rm
    const att = sop.attendees || {};
    const val = att[field];
    if (!val) return '';
    if (Array.isArray(val)) return val.filter(Boolean).join(', ');
    return String(val);
}

/** Helper: estrai owner come stringa */
function _getOwnerString(sop) {
    const owner = sop.owner;
    if (!owner) return '';
    if (typeof owner === 'string') return owner;
    // Formato oggetto webapp
    if (owner.type === 'persona') {
        let s = owner.name || '';
        if (Array.isArray(owner.others_present)) {
            const others = owner.others_present.filter(o => o && o.trim());
            if (others.length > 0) s += ', ' + others.join(', ');
        }
        return s;
    }
    if (owner.type === 'societa') {
        const parts = [];
        if (owner.company_name) parts.push(owner.company_name);
        if (owner.company_admin) parts.push(owner.company_admin);
        if (Array.isArray(owner.others_present)) {
            const others = owner.others_present.filter(o => o && o.trim());
            parts.push(...others);
        }
        return parts.join(', ');
    }
    return String(owner);
}

/** Helper: controlla se e' Parti Comuni */
function _isPartiComuni(sop) {
    const name = (sop.unit_name || sop.unit_type || '').toLowerCase().replace(/_/g, ' ');
    return name === 'parti comuni';
}


// ========== CHIUSURA (replica reports.py righe 1130-1160) ==========

/**
 * Genera testo chiusura — replica esatta di reports.py
 * @param {Object} sop - Sopralluogo
 * @returns {string}
 */
function generateChiusuraText(sop) {
    if (sop.custom_chiusura) return sop.custom_chiusura;

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const finalDate = `${dd}/${mm}/${yyyy}`;
    const finalTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `Il giorno ${finalDate} alle ore ${finalTime} si concludono le operazioni di sopralluogo. ` +
        `Il presente verbale, composto da n.     pagine e pi\u00f9 allegati fotografici, viene letto e sottoscritto. ` +
        `La sottoscrizione attesta la presenza al sopralluogo e la presa visione del contenuto alla data odierna; ` +
        `eventuali osservazioni sono riportate nello spazio dedicato. La sottoscrizione non costituisce rinuncia ad alcun diritto n\u00e8 riconoscimento di responsabilit\u00e0.`;
}


// ========== UNIT INFO LINE (replica reports.py righe 605-616) ==========

/**
 * Genera la riga info unita' — replica esatta di reports.py
 * @param {Object} sop - Sopralluogo
 * @returns {string}
 */
function generateUnitInfoLine(sop) {
    if (sop.custom_unit_line) return sop.custom_unit_line;

    const isMultiFloor = sop.is_multi_floor || false;
    const unitFloors = sop.unit_floors || [];

    let floorStr = (sop.floor || '').replace(/_/g, ' ');
    let unitStr = (sop.unit_name || sop.unit_type || '').replace(/_/g, ' ');

    if (isMultiFloor && unitFloors.length > 0) {
        floorStr = `Multipiano (${unitFloors.length} piani complessivi)`;
    } else if (floorStr) {
        floorStr = floorStr.charAt(0).toUpperCase() + floorStr.slice(1).toLowerCase();
    }

    if (unitStr) {
        unitStr = unitStr.charAt(0).toUpperCase() + unitStr.slice(1);
    }

    const isPC = unitStr.toLowerCase() === 'parti comuni';
    const pertMultiMode = sop.pert_multi_mode || false;

    if (isPC || pertMultiMode) {
        return unitStr;
    }
    return `${floorStr}, ${unitStr}`;
}


// ========== ROOM HEADER (replica reports.py righe 758-819) ==========

/**
 * Genera header del vano — replica esatta di reports.py
 * "Vano 3 - Soggiorno" -> "VANO 3: Soggiorno, C/S;"
 * @param {string} roomName - Nome completo del vano
 * @param {Object} room - Room data
 * @returns {string}
 */
function generateRoomHeader(roomName, room) {
    // Header str
    const parts = roomName.split(' - ');
    let headerStr = '';
    if (parts.length >= 2) {
        const vanoPart = parts[0].toUpperCase();
        let destPart = parts.slice(1).join(' - ');
        if (vanoPart.startsWith('SCALA')) {
            headerStr = `VANO ${vanoPart}: ${destPart}`;
        } else {
            if (destPart === destPart.toUpperCase()) {
                // Title case
                destPart = destPart.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
            headerStr = `${vanoPart}: ${destPart}`;
        }
    } else {
        headerStr = roomName.toUpperCase();
    }

    // Finishes
    let finishes = 'finiture non rilevate';
    const rawFinishes = room.finishes || room.room_finishes || '';
    if (rawFinishes) {
        finishes = rawFinishes.replace('Soffitto:', '').replace('soffitto:', '').trim();
        if (finishes.endsWith('.')) finishes = finishes.slice(0, -1).trim();
        finishes = finishes.replace('A volta', 'VLT').replace('a volta', 'VLT');
        finishes = finishes.replace('Controsoffitto', 'C/S').replace('controsoffitto', 'C/S');
    }

    // NDR intero vano
    const observations = room.observations || [];
    const hasInteroVanoNdr = observations.some(obs =>
        obs.element === 'Intero Vano' && obs.phenomenon === 'NDR'
    );

    let ndrLabel = '';
    if (hasInteroVanoNdr) {
        const hasOtherObs = observations.some(obs =>
            !(obs.element === 'Intero Vano' && obs.phenomenon === 'NDR')
        );
        ndrLabel = hasOtherObs ? 'NDR per i restanti elementi' : 'NDR';
    }

    // Componi suffisso
    const validFinishes = finishes && !['niente', 'nessuno', 'no', '', 'finiture non rilevate'].includes(finishes.toLowerCase());
    let suffix = '';
    if (validFinishes) {
        suffix = `, ${finishes}`;
        if (ndrLabel) suffix += `, ${ndrLabel}`;
    } else if (ndrLabel) {
        suffix = `, ${ndrLabel}`;
    }

    return `${headerStr}${suffix};`;
}


// ========== FULL ROOM TEXT (replica reports.py logica vano completa) ==========

/**
 * Genera il testo completo di un vano
 * @param {string} roomName
 * @param {Object} room - Room data
 * @returns {string}
 */
function generateFullRoomText(roomName, room) {
    if (room.custom_room_text) return room.custom_room_text;

    const lines = [];
    const observations = room.observations || [];

    if (observations.length === 0) {
        lines.push('Nessuna osservazione.');
    } else {
        lines.push(generateRoomText(observations));
    }

    return lines.join('\n');
}


// ========== VERBALE PREVIEW (riepilogo completo come lo vedrebbe il DOCX) ==========

/**
 * Genera preview completa del verbale
 * @param {Object} sop
 * @returns {string}
 */
function generateVerbalePreview(sop) {
    const rooms = sop.rooms || {};
    const roomNames = Object.keys(rooms);
    const lines = [];

    // Cappello
    lines.push('=== TESTO INTRODUTTIVO ===');
    lines.push(generateCappelloText(sop));
    lines.push('');

    // Riga info unita'
    lines.push(generateUnitInfoLine(sop));
    lines.push('');

    // Vani
    for (const roomName of roomNames) {
        const room = rooms[roomName];

        // Skip vani con disclaimer (come reports.py)
        if (room.status && room.status !== 'accessible') continue;

        // Header con finishes
        lines.push(generateRoomHeader(roomName, room));

        // Corpo
        if (room.custom_room_text) {
            lines.push(room.custom_room_text);
        } else if (room.manual_text) {
            lines.push(room.manual_text);
        } else {
            const observations = room.observations || [];
            if (observations.length === 0) {
                lines.push('Nessuna osservazione.');
            } else {
                lines.push(generateRoomText(observations));
            }
        }
        lines.push('');
    }

    // Allontana/Rientra/Interruzione/Ripresa events
    if (sop.allontana_events && sop.allontana_events.length > 0) {
        let lastInterruptDate = null;
        for (const ev of sop.allontana_events) {
            if (ev.type === 'interruzione') {
                lastInterruptDate = ev.date || null;
                lines.push(`Il sopralluogo si interrompe alle ore ${ev.time} per ${ev.text}.`);
            } else if (ev.type === 'ripresa') {
                if (lastInterruptDate && ev.date && ev.date !== lastInterruptDate) {
                    lines.push(`Il sopralluogo riprende in data ${ev.date} alle ore ${ev.time}.`);
                } else {
                    lines.push(`Il sopralluogo riprende alle ore ${ev.time}.`);
                }
                lastInterruptDate = null;
            } else if (ev.type === 'allontana') {
                lines.push(`Si allontana alle ore ${ev.time} ${ev.text}.`);
            } else if (ev.type === 'rientra') {
                lines.push(`Rientra alle ore ${ev.time} ${ev.text}.`);
            }
        }
        lines.push('');
    }

    // Vani con disclaimer (aggregati alla fine come reports.py)
    const disclaimerGroups = {}; // type -> [roomName]
    const mapLabels = {
        'non_accessibile': 'non accessibili',
        'non_valutabile': 'non valutabili',
        'non_autorizzato': 'non autorizzati'
    };
    for (const roomName of roomNames) {
        const room = rooms[roomName];
        if (room.status && mapLabels[room.status]) {
            if (!disclaimerGroups[room.status]) disclaimerGroups[room.status] = [];
            disclaimerGroups[room.status].push(roomName);
        }
    }
    for (const [dtype, rList] of Object.entries(disclaimerGroups)) {
        const label = mapLabels[dtype] || dtype;
        const rStr = rList.join(', ');
        // Cerca nota globale per questo disclaimer
        let noteText = '';
        const globalNotes = sop.global_notes || [];
        if (Array.isArray(globalNotes)) {
            const noteObj = globalNotes.find(n => n.type === dtype.toUpperCase() ||
                n.type === dtype);
            if (noteObj) noteText = noteObj.text || '';
        } else if (typeof globalNotes === 'object') {
            // Formato dizionario (come global_notes.json su disco)
            const keyMap = {
                'non_accessibile': 'NON_ACCESSIBILE',
                'non_valutabile': 'NON_VALUTABILE',
                'non_autorizzato': 'NON_AUTORIZZATO'
            };
            noteText = globalNotes[keyMap[dtype]] || '';
        }
        lines.push(`Vani ${label}: ${rStr} in quanto ${noteText}`);
    }

    // Nota operatore
    const operatorNote = (sop.operator_note || '').trim();
    if (operatorNote) {
        lines.push('');
        lines.push(`Note dell'operatore: ${operatorNote}`);
    }

    lines.push('');

    // Chiusura
    lines.push('=== TESTO CONCLUSIVO ===');
    lines.push(generateChiusuraText(sop));

    return lines.join('\n');
}


/** Escape regex special chars */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ========== NAMESPACE ==========
const Formatters = {
    formatObservationText,
    cleanTextHelper,
    fixPosCase,
    groupObservationsByElement,
    generateRoomText,
    generateCappelloText,
    generateChiusuraText,
    generateUnitInfoLine,
    generateRoomHeader,
    generateFullRoomText,
    generateVerbalePreview,
    escapeRegex
};
