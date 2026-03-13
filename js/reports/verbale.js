/**
 * verbale.js — Generazione DOCX in-browser
 * Usa la libreria 'docx' (caricata da CDN) e FileSaver.js
 * Allineato a reports.py
 */
const VerbaleGenerator = {
    /**
     * Genera e scarica il verbale DOCX
     * @param {string} sopralluogoId
     */
    async generate(sopralluogoId) {
        const sop = await DB.getSopralluogo(sopralluogoId);
        if (!sop) {
            UI.toast('Sopralluogo non trovato');
            return;
        }

        // Verifica che la libreria docx sia caricata
        if (typeof docx === 'undefined') {
            UI.toast('Libreria DOCX non disponibile (offline?)');
            return;
        }

        try {
            UI.toast('Generazione verbale...');
            const doc = this._buildDocument(sop);
            const blob = await docx.Packer.toBlob(doc);
            const filename = this._buildFilename(sop, 'Verbale');

            if (typeof saveAs !== 'undefined') {
                saveAs(blob, filename);
            } else {
                // Fallback manuale
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            }

            UI.toast('Verbale generato');
        } catch (e) {
            console.error('Errore generazione verbale:', e);
            UI.toast('Errore generazione verbale');
        }
    },

    /**
     * Genera e scarica l'allegato foto DOCX
     * @param {string} sopralluogoId
     */
    async generateAllegato(sopralluogoId) {
        const sop = await DB.getSopralluogo(sopralluogoId);
        if (!sop) {
            UI.toast('Sopralluogo non trovato');
            return;
        }

        if (typeof docx === 'undefined') {
            UI.toast('Libreria DOCX non disponibile (offline?)');
            return;
        }

        try {
            UI.toast('Generazione allegato foto...');
            const doc = await this._buildAllegatoDocument(sop);
            const blob = await docx.Packer.toBlob(doc);
            const filename = this._buildFilename(sop, 'Allegato_Foto');

            if (typeof saveAs !== 'undefined') {
                saveAs(blob, filename);
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            }

            UI.toast('Allegato foto generato');
        } catch (e) {
            console.error('Errore generazione allegato:', e);
            UI.toast('Errore generazione allegato foto');
        }
    },

    // ========== DOCUMENT BUILDERS ==========

    /**
     * Costruisce il Document DOCX del verbale
     */
    _buildDocument(sop) {
        const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
                BorderStyle, PageBreak, Tab, TabStopType, TabStopPosition } = docx;

        const children = [];
        const rooms = sop.rooms || {};
        const roomNames = Object.keys(rooms);
        const isPC = CONFIG.isPartiComuni(sop.unit_name || sop.unit_type);

        // ===== INTESTAZIONE =====
        children.push(this._heading('VERBALE DI SOPRALLUOGO'));
        children.push(this._para(''));

        // Dati identificativi
        children.push(this._boldPara('Codice Fabbricato: ', sop.building_code || '___'));
        children.push(this._boldPara('Indirizzo: ', sop.building_address || '___'));
        children.push(this._boldPara('Piano: ', sop.floor || '___'));
        if (sop.stair) {
            children.push(this._boldPara('Scala: ', sop.stair));
        }
        const unitLabel = sop.manual_unit_type || sop.unit_name || sop.unit_type || '___';
        children.push(this._boldPara('Unita: ', unitLabel));
        if (sop.subalterno) {
            children.push(this._boldPara('Subalterno: ', sop.subalterno));
        }
        if (sop.unit_internal) {
            children.push(this._boldPara('Interno: ', sop.unit_internal));
        }
        children.push(this._para(''));

        // ===== CAPPELLO =====
        const cappelloText = Formatters.generateCappelloText(sop);
        const cappelloLines = cappelloText.split('\n');
        for (const line of cappelloLines) {
            children.push(this._para(line));
        }
        children.push(this._para(''));

        // ===== Disclaimer multi-piano =====
        if (sop.is_multi_floor && sop.building_floors && sop.building_floors.length > 1) {
            children.push(this._italicPara(
                'Nota: il presente verbale riguarda il piano ' + (sop.floor || '___') +
                '. L\'immobile si sviluppa su piu piani: ' + sop.building_floors.join(', ') + '.'
            ));
            children.push(this._para(''));
        }

        // ===== VANI =====
        children.push(this._heading('DESCRIZIONE DEI VANI', HeadingLevel.HEADING_2));
        children.push(this._para(''));

        for (const roomName of roomNames) {
            const room = rooms[roomName];
            const finishLabel = room.finishes === 'Controsoffitto' ? ' (C/S)' : '';

            // Titolo vano
            children.push(this._subheading(roomName + finishLabel));

            // Stato vano
            if (room.status && room.status !== 'accessible') {
                const statusLabel = CONFIG.ROOM_STATUS_LABELS[room.status] || room.status;
                children.push(this._italicPara('Stato: ' + statusLabel));
            }

            // Contenuto vano
            if (room.manual_text) {
                children.push(this._para(room.manual_text));
            } else {
                const observations = room.observations || [];
                if (observations.length === 0) {
                    children.push(this._para('Nessuna osservazione.'));
                } else {
                    const text = Formatters.generateRoomText(observations);
                    const textLines = text.split('\n');
                    for (const line of textLines) {
                        children.push(this._para(line));
                    }
                }
            }

            // Note vano
            if (room.notes) {
                children.push(this._italicPara('Nota: ' + room.notes));
            }

            children.push(this._para(''));
        }

        // ===== PERTINENZE =====
        if (sop.pertinenze && sop.pertinenze.length > 0) {
            children.push(this._heading('PERTINENZE', HeadingLevel.HEADING_2));
            children.push(this._para(''));

            for (const pert of sop.pertinenze) {
                children.push(this._subheading(pert.type + (pert.identifier ? ' - ' + pert.identifier : '')));

                const pertRooms = pert.rooms || {};
                for (const [pRoomName, pRoom] of Object.entries(pertRooms)) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: pRoomName, bold: true, size: 22 })],
                        spacing: { before: 100, after: 50 }
                    }));

                    if (pRoom.manual_text) {
                        children.push(this._para(pRoom.manual_text));
                    } else {
                        const obs = pRoom.observations || [];
                        if (obs.length === 0) {
                            children.push(this._para('Nessuna osservazione.'));
                        } else {
                            const text = Formatters.generateRoomText(obs);
                            for (const line of text.split('\n')) {
                                children.push(this._para(line));
                            }
                        }
                    }
                }
                children.push(this._para(''));
            }
        }

        // ===== ALLONTANA/RIENTRA =====
        if (sop.allontana_events && sop.allontana_events.length > 0) {
            children.push(this._heading('INTERRUZIONI', HeadingLevel.HEADING_2));
            for (const ev of sop.allontana_events) {
                children.push(this._para('[' + ev.time + '] ' + ev.type + ': ' + ev.text));
            }
            children.push(this._para(''));
        }

        // ===== NOTE GLOBALI =====
        if (Array.isArray(sop.global_notes) && sop.global_notes.length > 0) {
            children.push(this._heading('NOTE', HeadingLevel.HEADING_2));
            for (const note of sop.global_notes) {
                const prefix = note.room_name ? '[' + note.room_name + '] ' : '';
                children.push(this._para(prefix + note.text));
            }
            children.push(this._para(''));
        }

        // ===== CHIUSURA =====
        const chiusuraText = Formatters.generateChiusuraText(sop);
        const chiusuraLines = chiusuraText.split('\n');
        for (const line of chiusuraLines) {
            children.push(this._para(line));
        }
        children.push(this._para(''));

        // ===== FIRME =====
        children.push(this._heading('FIRME', HeadingLevel.HEADING_2));
        children.push(this._para(''));

        // Metro C
        children.push(this._signatureLine('Per Metro C S.p.A.'));
        children.push(this._para(sop.attendees?.metro_tech || ''));
        children.push(this._para(''));

        // Collaboratori
        const coll = sop.attendees?.metro_coll;
        if (Array.isArray(coll)) {
            for (const c of coll) {
                if (c) {
                    children.push(this._signatureLine('Collaboratore Metro C S.p.A.'));
                    children.push(this._para(c));
                    children.push(this._para(''));
                }
            }
        }

        // Roma Metropolitane (se presente)
        if (sop.rm_presente !== false) {
            children.push(this._signatureLine('Per Roma Metropolitane S.r.l.'));
            children.push(this._para(sop.attendees?.rm || ''));
            children.push(this._para(''));
        }

        // Proprietario/Delegato
        const ownerRole = isPC ? 'Amministratore/Delegato' : 'Proprietario/Delegato';
        children.push(this._signatureLine(ownerRole));
        if (sop.owner) {
            if (sop.owner.type === 'societa' && sop.owner.company_name) {
                children.push(this._para(sop.owner.company_name));
                if (sop.owner.company_admin) {
                    children.push(this._para(sop.owner.company_admin));
                }
            } else if (sop.owner.name) {
                children.push(this._para(sop.owner.name));
            }
        }

        return new Document({
            creator: 'Testimoniale WebApp',
            title: 'Verbale di Sopralluogo - ' + (sop.building_code || ''),
            styles: {
                default: {
                    document: {
                        run: {
                            font: 'Calibri',
                            size: 24
                        }
                    }
                }
            },
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1134,    // ~2cm
                            right: 1134,
                            bottom: 1134,
                            left: 1134
                        }
                    }
                },
                children: children
            }]
        });
    },

    /**
     * Costruisce il Document DOCX dell'allegato foto
     */
    async _buildAllegatoDocument(sop) {
        const { Document, Paragraph, TextRun, HeadingLevel, ImageRun } = docx;

        const children = [];
        const rooms = sop.rooms || {};
        const roomNames = Object.keys(rooms);
        const photos = await DB.getPhotosBySopralluogo(sop.id);

        // Intestazione
        children.push(this._heading('ALLEGATO FOTOGRAFICO'));
        children.push(this._para(''));
        children.push(this._boldPara('Codice Fabbricato: ', sop.building_code || '___'));
        children.push(this._boldPara('Indirizzo: ', sop.building_address || '___'));
        children.push(this._boldPara('Piano: ', sop.floor || '___'));
        const unitLabel = sop.manual_unit_type || sop.unit_name || sop.unit_type || '___';
        children.push(this._boldPara('Unita: ', unitLabel));
        children.push(this._para(''));

        // Planimetria
        const planPhotos = photos.filter(p => p.type === 'planimetria');
        if (planPhotos.length > 0) {
            children.push(this._subheading('Planimetria'));
            for (const photo of planPhotos) {
                const imgPara = await this._photoToParagraph(photo, 'Planimetria');
                if (imgPara) children.push(imgPara);
            }
            children.push(this._para(''));
        }

        // Foto per vano
        let globalPhotoNum = 0;
        for (const roomName of roomNames) {
            const room = rooms[roomName];
            const roomPhotos = photos.filter(p => p.room_name === roomName && p.type !== 'planimetria');

            if (roomPhotos.length === 0) continue;

            // Titolo vano
            children.push(this._subheading(roomName));

            // Panoramiche
            const panPhotos = roomPhotos.filter(p => p.type === 'panoramica');
            for (const photo of panPhotos) {
                globalPhotoNum++;
                const caption = 'Foto ' + globalPhotoNum + ' - Panoramica ' + roomName;
                const imgPara = await this._photoToParagraph(photo, caption);
                if (imgPara) {
                    children.push(imgPara);
                    children.push(this._captionPara(caption));
                }
            }

            // Foto dettaglio (legate a osservazioni)
            const detailPhotos = roomPhotos.filter(p => p.type === 'dettaglio');
            for (const photo of detailPhotos) {
                globalPhotoNum++;

                // Trova osservazione collegata
                let caption = 'Foto ' + globalPhotoNum;
                if (photo.observation_key !== null && photo.observation_key !== undefined) {
                    const observations = room.observations || [];
                    const obs = observations[photo.observation_key];
                    if (obs) {
                        const obsText = Formatters.formatObservationText(obs, { includeVF: false });
                        caption += ' - ' + obsText;
                    }
                }

                const imgPara = await this._photoToParagraph(photo, caption);
                if (imgPara) {
                    children.push(imgPara);
                    children.push(this._captionPara(caption));
                }
            }

            children.push(this._para(''));
        }

        // Pertinenze foto
        if (sop.pertinenze && sop.pertinenze.length > 0) {
            for (const pert of sop.pertinenze) {
                const pertLabel = pert.type + (pert.identifier ? ' - ' + pert.identifier : '');
                // Le foto delle pertinenze sono salvate con room_name che include il contesto
                const pertPhotos = photos.filter(p =>
                    p.room_name && p.room_name.startsWith('[' + pert.type + ']') && p.type !== 'planimetria'
                );

                if (pertPhotos.length === 0) continue;

                children.push(this._subheading('Pertinenza: ' + pertLabel));

                for (const photo of pertPhotos) {
                    globalPhotoNum++;
                    const caption = 'Foto ' + globalPhotoNum + ' - ' + pertLabel;
                    const imgPara = await this._photoToParagraph(photo, caption);
                    if (imgPara) {
                        children.push(imgPara);
                        children.push(this._captionPara(caption));
                    }
                }
                children.push(this._para(''));
            }
        }

        return new Document({
            creator: 'Testimoniale WebApp',
            title: 'Allegato Fotografico - ' + (sop.building_code || ''),
            styles: {
                default: {
                    document: {
                        run: {
                            font: 'Calibri',
                            size: 24
                        }
                    }
                }
            },
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1134,
                            right: 1134,
                            bottom: 1134,
                            left: 1134
                        }
                    }
                },
                children: children
            }]
        });
    },

    // ========== PARAGRAPH HELPERS ==========

    _heading(text, level) {
        return new docx.Paragraph({
            children: [new docx.TextRun({ text: text, bold: true, size: 32 })],
            heading: level || docx.HeadingLevel.HEADING_1,
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 200 }
        });
    },

    _subheading(text) {
        return new docx.Paragraph({
            children: [new docx.TextRun({ text: text, bold: true, size: 26, underline: {} })],
            spacing: { before: 200, after: 100 }
        });
    },

    _para(text) {
        return new docx.Paragraph({
            children: [new docx.TextRun({ text: text || '', size: 24 })],
            spacing: { after: 60 }
        });
    },

    _boldPara(label, value) {
        return new docx.Paragraph({
            children: [
                new docx.TextRun({ text: label, bold: true, size: 24 }),
                new docx.TextRun({ text: value || '', size: 24 })
            ],
            spacing: { after: 60 }
        });
    },

    _italicPara(text) {
        return new docx.Paragraph({
            children: [new docx.TextRun({ text: text, italics: true, size: 22 })],
            spacing: { after: 60 }
        });
    },

    _captionPara(text) {
        return new docx.Paragraph({
            children: [new docx.TextRun({ text: text, italics: true, size: 20 })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 120 }
        });
    },

    _signatureLine(role) {
        return new docx.Paragraph({
            children: [
                new docx.TextRun({ text: role + ': ', bold: true, size: 24 }),
                new docx.TextRun({ text: '________________________________', size: 24 })
            ],
            spacing: { before: 200, after: 60 }
        });
    },

    /**
     * Converte una foto (blob da IndexedDB) in un Paragraph con ImageRun
     */
    async _photoToParagraph(photo, altText) {
        try {
            const blob = photo.blob;
            if (!blob) return null;

            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Dimensioni immagine nel documento (max 15cm larghezza)
            const maxWidthEmu = 5400000; // ~15cm in EMU
            const maxHeightEmu = 7200000; // ~20cm in EMU

            // Calcola dimensioni reali dell'immagine
            const dims = await this._getImageDimensions(blob);
            let width = dims.width;
            let height = dims.height;

            // Scala per stare nei limiti
            const scaleW = maxWidthEmu / width;
            const scaleH = maxHeightEmu / height;
            const scale = Math.min(scaleW, scaleH, 1);

            const finalW = Math.round(width * scale);
            const finalH = Math.round(height * scale);

            return new docx.Paragraph({
                children: [
                    new docx.ImageRun({
                        data: uint8Array,
                        transformation: {
                            width: Math.round(finalW / 9525), // EMU to pixels approx
                            height: Math.round(finalH / 9525)
                        },
                        type: 'jpg'
                    })
                ],
                alignment: docx.AlignmentType.CENTER,
                spacing: { before: 100, after: 100 }
            });
        } catch (e) {
            console.warn('Errore inserimento foto:', e);
            return this._italicPara('[Foto non disponibile: ' + (altText || '') + ']');
        }
    },

    /**
     * Ottiene le dimensioni di un'immagine da un Blob
     * Ritorna dimensioni in EMU (English Metric Units: 1 inch = 914400 EMU)
     */
    _getImageDimensions(blob) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(url);
                // Converti pixel in EMU (assumendo 96 DPI)
                const emuPerPixel = 914400 / 96;
                resolve({
                    width: Math.round(img.width * emuPerPixel),
                    height: Math.round(img.height * emuPerPixel)
                });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                // Fallback: dimensione standard
                resolve({ width: 5400000, height: 3600000 });
            };
            img.src = url;
        });
    },

    // ========== FILENAME BUILDER ==========

    _buildFilename(sop, prefix) {
        const code = (sop.building_code || 'SENZA_CODICE').replace(/[^a-zA-Z0-9_-]/g, '_');
        const floor = (sop.floor || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const unit = (sop.manual_unit_type || sop.unit_type || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const date = new Date().toISOString().slice(0, 10);
        return prefix + '_' + code + '_' + floor + '_' + unit + '_' + date + '.docx';
    }
};
