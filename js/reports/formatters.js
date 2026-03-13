/**
 * formatters.js — Formattazione testi osservazioni e report
 * Allineato a reports.py format_observation_text()
 * Single source of truth per stringhe osservazione
 */

/**
 * Formatta il testo di una osservazione
 * @param {Object} obs - Osservazione
 * @param {Object} options - {includeVF: bool, vfNumber: number}
 * @returns {string}
 */
function formatObservationText(obs, options = {}) {
    if (!obs) return '';

    // Determina label elemento
    let elemLabel = '';
    if (obs.infisso_type) {
        // Elemento/Varco: tipo + which + location + sub_pos
        const parts = [obs.infisso_type];
        if (obs.infisso_which) parts.push(obs.infisso_which);
        if (obs.infisso_wall || obs.infisso_location) {
            parts.push(obs.infisso_wall || obs.infisso_location);
        }
        if (obs.infisso_sub_pos) parts.push(obs.infisso_sub_pos);
        elemLabel = parts.join(' ');
    } else if (obs.balcone_sub) {
        elemLabel = `Balcone ${obs.balcone_sub}`;
    } else if (obs.stair_subsection) {
        // Scale: sotto-sezione + elemento
        elemLabel = obs.stair_subsection;
        if (obs.wall) elemLabel += ` ${obs.wall}`;
        else if (obs.element && obs.element !== 'Pareti') elemLabel += ` ${obs.element}`;
    } else {
        elemLabel = obs.wall || obs.element || '';
    }

    // Deduplicazione elemento/posizione (evita "Parete A Parete A lato sx")
    // Se la posizione contiene l'elemento, non ripetere
    let positions = obs.position || '';
    if (positions && elemLabel) {
        positions = positions.replace(new RegExp(`^${escapeRegex(elemLabel)}\\s*`, 'i'), '');
    }

    // Controparete
    if (obs.has_counterwall) {
        elemLabel += ' con controparete';
    }

    // Carta da parati (CDP)
    if (obs.has_cdp) {
        elemLabel += ' carta da parati';
    }

    // NDR
    if (obs.phenomenon === 'NDR' || obs.phenomenon === 'Nulla da Rilevare') {
        let text = `${elemLabel} NDR (per quanto visibile)`;
        if (options.includeVF && options.vfNumber) {
            text += ` (V.F. ${options.vfNumber})`;
        }
        return text;
    }

    // INGOMBRA
    if (obs.phenomenon === 'INGOMBRA') {
        return `${elemLabel} ingombra`;
    }

    // NON VISIBILE
    if (obs.phenomenon === 'NON VISIBILE') {
        return `${elemLabel} non visibile`;
    }

    // PARZIALMENTE INGOMBRA (senza difetto)
    if (obs.phenomenon === 'PARZIALMENTE INGOMBRA') {
        return `${elemLabel} parzialmente ingombra`;
    }

    // NESSUN DIFETTO
    if (obs.phenomenon === 'NESSUN DIFETTO') {
        return `${elemLabel} nessun difetto rilevato`;
    }

    // Nessun fenomeno
    if (!obs.phenomenon) return elemLabel;

    // Standard observation
    const parts = [];
    parts.push(elemLabel);

    // Posizione
    if (positions) {
        parts.push(positions);
    }

    // Fenomeno
    parts.push(obs.phenomenon);

    // Specifiche
    if (obs.specifics && obs.specifics.length > 0) {
        parts.push(obs.specifics.join(' '));
    }

    // Attributi
    if (obs.attributes && obs.attributes.length > 0) {
        parts.push(obs.attributes.join(' '));
    }

    // Prosecuzione
    if (obs.prosecutions && obs.prosecutions.length > 0) {
        parts.push('prosegue su ' + obs.prosecutions.join(', '));
    }

    // Note (aggiungere nel testo come il bot)
    if (obs.notes && obs.notes !== 'Parzialmente Ingombra') {
        parts.push(`(${obs.notes})`);
    }

    let text = parts.join(' ');
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);

    // V.F.
    if (options.includeVF && options.vfNumber) {
        text += ` (V.F. ${options.vfNumber})`;
    }

    return text;
}

/**
 * Raggruppa osservazioni per elemento (come reports.py group_observations_by_element)
 * @param {Array} observations
 * @returns {Object} { elemKey: [{ obs, vf, index }] }
 */
function groupObservationsByElement(observations) {
    if (!observations || observations.length === 0) return {};

    // V.F. renumbering
    let vfIndex = 0;
    const vfMap = [];
    for (const obs of observations) {
        if (obs.photo_id) {
            vfIndex++;
            vfMap.push(vfIndex);
        } else {
            vfMap.push(0);
        }
    }

    // Raggruppa
    const groups = {};
    for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];
        let elemKey;
        if (obs.stair_subsection) {
            elemKey = obs.stair_subsection;
        } else {
            elemKey = obs.wall || obs.balcone_sub || obs.infisso_type || obs.element || '?';
        }
        if (!groups[elemKey]) groups[elemKey] = [];
        groups[elemKey].push({ obs, vf: vfMap[i], index: i });
    }

    return groups;
}

/**
 * Genera testo raggruppato per un vano con V.F.
 * @param {Array} observations
 * @returns {string}
 */
function generateRoomText(observations) {
    if (!observations || observations.length === 0) return '';

    const groups = groupObservationsByElement(observations);
    const lines = [];

    for (const [elemKey, items] of Object.entries(groups)) {
        // Gestione NDR pareti individuali: accorpa
        const ndrItems = items.filter(it => it.obs.phenomenon === 'NDR');
        const nonNdrItems = items.filter(it => it.obs.phenomenon !== 'NDR');

        const parts = [];

        // NDR accorpati
        if (ndrItems.length > 1 && ndrItems.length === items.length) {
            // Tutti NDR → accorpa
            const walls = ndrItems.map(it => it.obs.wall || elemKey).join(', ');
            parts.push(`${walls} NDR (per quanto visibile)`);
        } else {
            // Mix o singoli
            for (const { obs, vf } of items) {
                const text = formatObservationText(obs, {
                    includeVF: vf > 0,
                    vfNumber: vf
                });
                parts.push(text);
            }
        }

        lines.push(parts.join(', '));
    }

    return lines.join(';\n') + (lines.length > 0 ? ';' : '');
}

/**
 * Genera testo cappello
 * @param {Object} sop - Sopralluogo
 * @returns {string}
 */
function generateCappelloText(sop) {
    if (sop.custom_cappello) return sop.custom_cappello;

    const lines = [];
    const date = new Date(sop.start_time || sop.created_at);
    const dateStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    lines.push(`In data ${dateStr} alle ore ${timeStr}, i sottoscritti:`);

    // Metro C tecnico
    if (sop.attendees?.metro_tech) {
        lines.push(`- ${sop.attendees.metro_tech}, per Metro C S.p.A.`);
    }

    // Collaboratori
    const coll = sop.attendees?.metro_coll;
    if (Array.isArray(coll) && coll.length > 0) {
        for (const c of coll) {
            if (c) lines.push(`- ${c}, collaboratore Metro C S.p.A.`);
        }
    }

    // Roma Metropolitane
    if (sop.rm_presente !== false && sop.attendees?.rm) {
        lines.push(`- ${sop.attendees.rm}, per Roma Metropolitane S.r.l.`);
    }

    // Proprietario / Amministratore
    if (sop.owner) {
        if (sop.owner.type === 'persona' && sop.owner.name) {
            const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);
            const role = isPC ? 'Amministratore/Delegato' : 'Proprietario';
            lines.push(`- ${sop.owner.name}, ${role}`);
        } else if (sop.owner.type === 'societa') {
            if (sop.owner.company_name) {
                lines.push(`- ${sop.owner.company_name}`);
            }
            if (sop.owner.company_admin) {
                const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);
                const role = isPC ? 'Amministratore/Delegato' : 'Amministratore della società';
                lines.push(`  ${sop.owner.company_admin}, ${role}`);
            }
        }
    }

    lines.push('');
    lines.push(`procedono al sopralluogo dell'immobile sito in ${sop.building_address || '___'}, ` +
        `Fabbricato ${sop.building_code || '___'}, ${sop.floor || '___'}, ` +
        `${sop.unit_name || sop.unit_type || '___'}.`);

    return lines.join('\n');
}

/**
 * Genera testo chiusura
 * @param {Object} sop - Sopralluogo
 * @returns {string}
 */
function generateChiusuraText(sop) {
    if (sop.custom_chiusura) return sop.custom_chiusura;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    return `Il presente verbale viene redatto in contraddittorio e firmato dalle parti alle ore ${timeStr}. ` +
        `Copia del presente verbale viene consegnata al proprietario/conduttore dell'unità immobiliare.`;
}

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

    // Vani
    for (const roomName of roomNames) {
        const room = rooms[roomName];
        const finishLabel = room.finishes === 'Controsoffitto' ? 'C/S' : '';
        lines.push(`--- ${roomName}${finishLabel ? ', ' + finishLabel : ''} ---`);

        if (room.status !== 'accessible') {
            lines.push(`NOTA: ${CONFIG.ROOM_STATUS_LABELS[room.status] || room.status}`);
        }

        if (room.manual_text) {
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

    // Allontana/Rientra events
    if (sop.allontana_events && sop.allontana_events.length > 0) {
        lines.push('--- INTERRUZIONI ---');
        for (const ev of sop.allontana_events) {
            lines.push(`[${ev.time}] ${ev.type}: ${ev.text}`);
        }
        lines.push('');
    }

    // Note globali
    if (Array.isArray(sop.global_notes) && sop.global_notes.length > 0) {
        lines.push('--- NOTE ---');
        for (const note of sop.global_notes) {
            const prefix = note.room_name ? `[${note.room_name}] ` : '';
            lines.push(`${prefix}${note.text}`);
        }
        lines.push('');
    }

    // Chiusura
    lines.push('=== TESTO DI CHIUSURA ===');
    lines.push(generateChiusuraText(sop));
    lines.push('');

    // Firme
    lines.push('--- FIRME ---');
    const signers = sop.signers || {};
    lines.push(`Metro C: ${signers.metro_tech || '________________'}`);
    if (sop.rm_presente !== false) {
        lines.push(`Roma Metropolitane: ${signers.rm || '________________'}`);
    }
    lines.push(`Proprietario/Delegato: ________________`);

    return lines.join('\n');
}

/** Escape regex special chars */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========== NAMESPACE ==========
// Le viste usano Formatters.xxx come namespace
const Formatters = {
    formatObservationText,
    groupObservationsByElement,
    generateRoomText,
    generateCappelloText,
    generateChiusuraText,
    generateVerbalePreview,
    escapeRegex
};
