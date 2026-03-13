/* ============================================================
 * formatters.js — Generazione testo IDENTICA a reports.py
 * Ogni funzione traduce 1:1 la logica Python del bot originale.
 * ============================================================ */

'use strict';

const Formatters = (() => {

    // ===== CLEAN TEXT HELPER (identico a clean_text_helper in reports.py) =====
    function cleanTextHelper(text) {
        if (!text) return '';
        let s = String(text);
        // Rimuove parentesi
        s = s.replace(/[()]/g, '');
        // Contrazioni (identiche al bot)
        const contractions = [
            [/\bvt verticale\b/gi, 'vt'],
            [/\boz orizzontale\b/gi, 'oz'],
            [/\bdg diagonale\b/gi, 'dg'],
            [/\but ulteriore\b/gi, 'ut'],
            [/\bdd\b/gi, 'dd'],
        ];
        contractions.forEach(([regex, repl]) => { s = s.replace(regex, repl); });
        return s.trim();
    }

    // ===== FORMAT OBSERVATION TEXT (identico a format_observation_text in reports.py) =====
    function formatObservationText(obs, options) {
        options = options || {};
        const includeVf = options.includeVf || false;
        const vfNumber = options.vfNumber || 0;
        const includeElement = options.includeElement !== false;

        if (!obs) return '';

        // Element label
        const rawElement = (obs.element === 'Intradosso') ? 'Intradosso superiore' : obs.element;
        let elemLabel = '';
        if (includeElement) {
            if (obs.infisso_type && obs.element !== obs.infisso_type) {
                // Elemento/Varco: usa infisso_type come label
                let infLabel = obs.infisso_type;
                if (obs.infisso_wall) infLabel += ` ${obs.infisso_wall}`;
                if (obs.infisso_which) infLabel += ` ${obs.infisso_which}`;
                elemLabel = infLabel;
            } else if (obs.stair_subsection) {
                // Scala: element senza subsection (subsection aggiunto dopo)
                elemLabel = obs.wall || rawElement || '';
            } else {
                elemLabel = obs.wall || rawElement || '';
            }
        }

        // Posizione
        let posStr = obs.position || '';

        // Deduplica element/position (come bot)
        if (elemLabel && posStr && posStr.toLowerCase().includes(elemLabel.toLowerCase())) {
            posStr = posStr.replace(new RegExp(elemLabel, 'gi'), '').trim();
            posStr = posStr.replace(/^,\s*|,\s*$/g, '').trim();
        }

        // Infisso sub pos
        if (obs.infisso_sub_pos) {
            posStr = posStr ? `${posStr}, ${obs.infisso_sub_pos}` : obs.infisso_sub_pos;
        }

        // Fenomeno
        const phenomenon = obs.phenomenon || '';

        // INGOMBRA early return
        if (phenomenon === 'INGOMBRA' || phenomenon === 'ingombra') {
            let text = elemLabel ? `${elemLabel} ingombra` : 'ingombra';
            if (includeVf && vfNumber > 0) text += ` V.F. ${vfNumber}`;
            if (obs.stair_subsection && includeElement && text) {
                text = `${obs.stair_subsection}: ${text}`;
            }
            return text;
        }

        // PARZIALMENTE INGOMBRA
        if (phenomenon === 'PARZIALMENTE INGOMBRA') {
            let text = elemLabel ? `${elemLabel} parzialmente ingombra` : 'parzialmente ingombra';
            if (includeVf && vfNumber > 0) text += ` V.F. ${vfNumber}`;
            if (obs.stair_subsection && includeElement && text) {
                text = `${obs.stair_subsection}: ${text}`;
            }
            return text;
        }

        // NON VISIBILE
        if (phenomenon === 'NON VISIBILE' || obs.non_visibile) {
            let text = elemLabel ? `${elemLabel} non visibile` : 'non visibile';
            if (includeVf && vfNumber > 0) text += ` V.F. ${vfNumber}`;
            if (obs.stair_subsection && includeElement && text) {
                text = `${obs.stair_subsection}: ${text}`;
            }
            return text;
        }

        // NDR
        if (phenomenon === 'NDR') {
            let text = elemLabel ? `${elemLabel} NDR` : 'NDR';
            if (obs.stair_subsection && includeElement && text) {
                text = `${obs.stair_subsection}: ${text}`;
            }
            return text;
        }

        // Normal defect
        const parts = [];

        // Element
        if (elemLabel) parts.push(elemLabel);

        // Counterwall
        if (obs.has_counterwall) parts.push('controparete');

        // CDP
        if (obs.has_cdp) parts.push('carta da parati');

        // Position
        if (posStr) parts.push(posStr);

        // Phenomenon (lowercase + cleanTextHelper, come bot)
        const phen = cleanTextHelper(phenomenon).toLowerCase();
        if (phen) parts.push(phen);

        // Specifics (lowercase + cleanTextHelper)
        const specifics = obs.specifics || [];
        if (specifics.length > 0) {
            const sSpec = cleanTextHelper(specifics.join(', ')).toLowerCase();
            if (sSpec) parts.push(sSpec);
        }

        // Attributes (lowercase + cleanTextHelper)
        const attributes = obs.attributes || [];
        if (attributes.length > 0) {
            const sAttrs = cleanTextHelper(attributes.join(', ')).toLowerCase();
            if (sAttrs) parts.push(sAttrs);
        }

        // Prosecutions
        const prosecutions = obs.prosecutions || [];
        if (prosecutions.length > 0) {
            parts.push(`in prosecuzione su ${prosecutions.join(', ')}`);
        }

        // Notes (filtro ingombra, come bot)
        const cleanedNotes = cleanTextHelper(obs.notes || '');
        if (cleanedNotes && !cleanedNotes.toLowerCase().includes('ingombra')) {
            parts.push(cleanedNotes);
        }

        // V.F.
        if (includeVf && vfNumber > 0) {
            parts.push(`V.F. ${vfNumber}`);
        }

        // Assembla
        let text = parts.filter(p => p).join(' ');

        // Stair subsection prefix
        if (obs.stair_subsection && includeElement && text) {
            text = `${obs.stair_subsection}: ${text}`;
        }

        // Prospetto floor/href
        if (obs.prosp_floor && text) {
            text += ` (${obs.prosp_floor}`;
            if (obs.prosp_href) text += `, ${obs.prosp_href}`;
            text += ')';
        }

        return text;
    }

    // ===== GROUP OBSERVATIONS BY ELEMENT (identico a group_observations_by_element in reports.py) =====
    function groupObservationsByElement(observations) {
        if (!observations || observations.length === 0) return [];

        const lines = [];
        const groups = {};
        let vfCounter = 0;

        // Raggruppa per chiave composta
        for (const obs of observations) {
            if (obs.phenomenon === 'NDR') continue; // NDR gestiti separatamente
            if (obs.element === 'Intera Sotto-sezione' && obs.phenomenon === 'NDR') continue;

            vfCounter++;
            const key = _groupKey(obs);
            if (!groups[key]) groups[key] = [];
            groups[key].push({ obs, vfNum: vfCounter });
        }

        // Genera testo per ogni gruppo
        for (const key in groups) {
            const items = groups[key];
            const texts = items.map((item, idx) => {
                let text = formatObservationText(item.obs, {
                    includeVf: true,
                    vfNumber: item.vfNum,
                    includeElement: idx === 0  // Solo primo del gruppo ha l'elemento
                });
                // Lowercase primo carattere per i successivi (come bot)
                if (idx > 0 && text) {
                    text = text.charAt(0).toLowerCase() + text.slice(1);
                }
                return text;
            });
            lines.push(texts.filter(t => t).join('; '));
        }

        // NDR: raggruppa pareti individuali (come bot)
        const ndrObs = observations.filter(o => o.phenomenon === 'NDR' && o.element !== 'Intera Sotto-sezione');
        if (ndrObs.length > 0) {
            const ndrByBase = {};
            for (const obs of ndrObs) {
                const el = obs.element || '';
                const m = el.match(/^Parete\s+([A-Z])$/);
                if (m) {
                    if (!ndrByBase['Pareti']) ndrByBase['Pareti'] = [];
                    ndrByBase['Pareti'].push({ letter: m[1], obs });
                } else {
                    const key = el || 'Other';
                    if (!ndrByBase[key]) ndrByBase[key] = [];
                    ndrByBase[key].push({ obs });
                }
            }

            for (const base in ndrByBase) {
                const items = ndrByBase[base];
                if (base === 'Pareti' && items.length > 0 && items[0].letter) {
                    // Accorpa: "Pareti A, C, D NDR (per quanto visibile)"
                    const letters = items.map(p => p.letter).sort().join(', ');
                    lines.push(`Pareti ${letters} NDR (per quanto visibile)`);
                } else {
                    items.forEach(item => {
                        lines.push(formatObservationText(item.obs, { includeElement: true }));
                    });
                }
            }
        }

        // Intera Sotto-sezione NDR (scale)
        const subNdrSet = new Set();
        for (const obs of observations) {
            if (obs.element === 'Intera Sotto-sezione' && obs.phenomenon === 'NDR' && obs.stair_subsection) {
                subNdrSet.add(obs.stair_subsection);
            }
        }
        const sortedSubNdr = Array.from(subNdrSet).sort();
        for (const ss of sortedSubNdr) {
            const hasOther = observations.some(o =>
                o.stair_subsection === ss &&
                !(o.element === 'Intera Sotto-sezione' && o.phenomenon === 'NDR')
            );
            const ndrText = hasOther ? `${ss}: NDR per i restanti elementi` : `${ss}: NDR`;
            lines.unshift(ndrText);
        }

        return lines;
    }

    function _groupKey(obs) {
        const parts = [
            obs.stair_subsection || '',
            obs.element || '',
            obs.wall || obs.infisso_type || ''
        ];
        return parts.join('|');
    }

    // ===== GENERATE ROOM TEXT (testo completo per un vano) =====
    function generateRoomText(room) {
        const observations = DB.getRoomObservations(room);
        const lines = groupObservationsByElement(observations);
        return lines.join(';\n');
    }

    // ===== GENERATE CAPPELLO TEXT (identico a _generate_cappello_text in bot.py) =====
    function generateCappelloText(sop) {
        if (sop.custom_cappello) return sop.custom_cappello;

        const d = sop.start_time ? new Date(sop.start_time) : new Date();
        const dateStr = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        const lines = [];
        lines.push(`In data ${dateStr} alle ore ${timeStr}, presso l'immobile sito in ${sop.building_address || '___'}, si procede al sopralluogo dell'unita immobiliare ${sop.unit_type || ''} ${sop.unit_name || ''}.`);

        if (sop.owner && sop.owner.name) {
            const ownerStr = sop.owner.type === 'societa' ?
                `${sop.owner.name}${sop.owner.admin ? ', nella persona di ' + sop.owner.admin : ''}` :
                sop.owner.name;
            lines.push(`Proprietario: ${ownerStr}.`);
        }

        const presenti = [];
        if (sop.attendees_metro_tech) presenti.push(`Tecnico Metro C: ${sop.attendees_metro_tech}`);
        if (sop.attendees_metro_coll && sop.attendees_metro_coll.length > 0) {
            presenti.push(`Collaboratori: ${sop.attendees_metro_coll.join(', ')}`);
        }
        if (sop.rm_presente && sop.attendees_rm) presenti.push(`Roma Metropolitane: ${sop.attendees_rm}`);
        if (presenti.length > 0) lines.push(`Figure presenti: ${presenti.join('; ')}.`);

        return lines.join('\n\n');
    }

    // ===== GENERATE CHIUSURA TEXT (identico a _generate_chiusura_text in bot.py) =====
    function generateChiusuraText(sop) {
        if (sop.custom_chiusura) return sop.custom_chiusura;

        const d = new Date();
        const dateStr = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        return `Le operazioni di sopralluogo si concludono in data ${dateStr} alle ore ${timeStr}. ` +
            `Il presente verbale, redatto in contraddittorio, viene sottoscritto dalle parti intervenute.`;
    }

    // ===== PUBLIC API =====
    return {
        cleanTextHelper,
        formatObservationText,
        groupObservationsByElement,
        generateRoomText,
        generateCappelloText,
        generateChiusuraText
    };

})();
