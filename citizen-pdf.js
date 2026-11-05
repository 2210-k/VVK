// ============================================================================
// ГЕНЕРАЦИЯ PDF ДЛЯ ГРАЖДАНИНА (БЕЗ ЗАПИСИ В БД)
// ============================================================================

const MONTHS_GENITIVE_PDF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Расшифровка аббревиатур организаций
const ORG_MAP = {
    "ЕСС": "Единая служба спасения",
    "МВД": "Министерство внутренних дел по Соль-Илецкому г.о",
    "ВЧ": "Воинская часть №205"
};

// Справочник руководителей по полным названиям организаций
const ORG_BOSSES = {
    "Горнодобывающая организация": "Начальник",
    "Курьерская служба": "Начальник",
    "Почтовое отделение №7 г. Соль-Илецка": "Заведующий",
    "Таксопарк": "Начальник",
    "Автобусная компания": "Начальник",
    "Коммунальная служба": "Заведующий",
    "Служба доставки": "Начальник",
    "Транспортная компания": "Начальник",
    "Единая служба спасения": "Начальник департамента",
    "Министерство внутренних дел по Соль-Илецкому г.о": "Генерал",
    "Воинская часть №205": "Генерал"
};

// ============================================================================
// ⚠️ ТВОИ КООРДИНАТЫ ДЛЯ СПРАВКИ
// ============================================================================
const COORDS_SPRAVKA = {
    dateTop: { xStart: 308, xEnd: 536, y: 769 },
    fio: { x: 123, y: 666.3 },
    dob: { x: 126, y: 653 },
    passport: { x: 169, y: 640 },
    org: { x: 116, y: 596.5 },
    position: { x: 113, y: 583.3 },
    hireDate: { x: 168, y: 561.5 },
    status: { x: 128, y: 548.5 },
    reprimands: { x: 43, y: 508.3, maxWidth: 508, lineHeight: 13, indent: 80 },
    formDate: { x: 150, y: 467.3 },
    boss: { x: 183, y: 454.4 },
    regNumber: { x: 127, y: 294 },
    qrCode: { x: 481, y: 251, width: 70, height: 70 }
};

// ============================================================================
// ⚠️ КООРДИНАТЫ ДЛЯ ВЫПИСКИ ИЗ ТРУДОВОЙ (ЗАПОЛНИ ВЕРХНЮЮ ЧАСТЬ)
// ============================================================================
const COORDS_VYPISKA = {
    dateTop: { xStart: 308, xEnd: 536, y: 769 }, // Центр
    trknNumber: { x: 44, y: 728 }, // Темно-красный цвет
    firstName: { x: 65, y: 672 },
    patronymic: { x: 97, y: 658 },
    dob: { x: 124, y: 645 },
    passport: { x: 167, y: 632.3 },
    education: { x: 109, y: 617 }, // Прочерк
    profession: { x: 174.7, y: 605 }, // Прочерк
    responsible: { x: 204, y: 591 }, // Правительство
    regNumber: { x: 461, y: 672 },
    qrCode: { x: 375, y: 565, width: 60, height: 60 },
    
    // БЛОК АВТОМАТИЧЕСКОЙ ТАБЛИЦЫ (ширина колонок подберется сама)
    table: {
        yStart: 535,      // Y-координата, где начнется ПЕРВАЯ строка (под шапкой)
        yLimit: 31,       // Нижняя граница страницы (если дойдет до сюда, создастся новый лист)
        startX: 43,       // Левый край таблицы
        endX: 552         // Правый край таблицы
    }
};

// Вспомогательные функции
function drawCenteredInRange(page, text, xStart, xEnd, y, options) {
    if (!text) return;
    const textWidth = options.font.widthOfTextAtSize(text, options.size);
    const startX = xStart + ((xEnd - xStart) - textWidth) / 2;
    page.drawText(text, { ...options, x: startX, y });
}

function drawParagraph(page, text, x, y, options) {
    if (!text) return y;
    const { font, size, color, maxWidth, lineHeight, indent } = options;
    const words = text.split(' ');
    let lines = [], currentLine = '', isFirstLine = true;
    for (let word of words) {
        const availableWidth = isFirstLine ? (maxWidth - indent) : maxWidth;
        const testLine = currentLine === '' ? word : currentLine + ' ' + word;
        if (font.widthOfTextAtSize(testLine, size) <= availableWidth) {
            currentLine = testLine;
        } else {
            lines.push({ text: currentLine, isFirst: isFirstLine });
            currentLine = word;
            isFirstLine = false;
        }
    }
    if (currentLine !== '') lines.push({ text: currentLine, isFirst: isFirstLine });
    
    let currentY = y;
    for (let line of lines) {
        const currentX = line.isFirst ? x + indent : x;
        page.drawText(line.text, { x: currentX, y: currentY, font, size, color });
        currentY -= lineHeight;
    }
    return currentY;
}

function formatDatePDF(dateObj) {
    if (!dateObj) return '';
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = MONTHS_GENITIVE_PDF[dateObj.getMonth()];
    const y = dateObj.getFullYear();
    return `${d} ${m} ${y}`;
}

function wrapText(text, maxWidth, font, fontSize) {
    if (!text) return [''];
    const words = text.split(' ');
    let lines = [], currentLine = '';
    for (let word of words) {
        const testLine = currentLine === '' ? word : currentLine + ' ' + word;
        if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine !== '') lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine !== '') lines.push(currentLine);
    return lines.length > 0 ? lines : [text];
}


// ============================================================================
// 1. ГЕНЕРАЦИЯ СПРАВКИ С МЕСТА РАБОТЫ
// ============================================================================
async function downloadEmploymentCertificatePDF() {
    const p = state.userProfile;
    if (!p) return showToast('Профиль не загружен');
    if (!p.current_org) return showToast('Нет действующего места работы для справки');

    try {
        const pdfBytes = await fetch('./spravka_template.pdf').then(r => r.arrayBuffer());
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        pdfDoc.registerFontkit(fontkit);

        const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
        const fontBytes = await fetch(fontUrl).then(r => r.arrayBuffer());
        const customFont = await pdfDoc.embedFont(fontBytes);

        const page = pdfDoc.getPages()[0];
        const now = new Date();
        
        const fioStr = [p.last_name, p.first_name, p.patronymic].filter(Boolean).join(' ');
        const dobStr = p.dob ? formatDatePDF(new Date(p.dob)) : '—';
        const passportStr = `серия ${p.pass_series || '—'}, номер ${p.pass_number || '—'}`;
        
        const hireRecord = state.trRecords.find(r => /принят|трудоустроен|зачислен/i.test(r.record_text));
        const hireDateStr = hireRecord ? `${formatDatePDF(new Date(hireRecord.real_date))} (${hireRecord.game_day} день)` : '—';
        
        let reprimandsText = `${formatDatePDF(now)} `;
        if (Number(p.reprimands_count || 0) === 0) {
            reprimandsText += `активных выговоров не имеет.`;
        } else {
            reprimandsText += `имеет ${p.reprimands_count} выговор(ов): `;
            const reps = state.trRecords.filter(r => r.action_type === 'reprimand').slice(-p.reprimands_count);
            reps.sort((a, b) => new Date(a.real_date) - new Date(b.real_date));
            const repStrings = reps.map((r) => {
                let repNum = '?';
                const match = r.record_text.match(/№(\d+)/);
                if (match) repNum = match[1];
                return `№${repNum} от ${formatDatePDF(new Date(r.real_date))} (${r.game_day} день)`;
            });
            reprimandsText += repStrings.join('; ') + '.';
        }

        const rawOrg = p.current_org;
        const fullOrgName = ORG_MAP[rawOrg] || rawOrg;
        const bossTitle = ORG_BOSSES[fullOrgName] || 'Руководитель';
        const bossStr = `${bossTitle} организации "${fullOrgName}"`;
        const regNumberStr = `СПР-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;

        const opt12 = { size: 12, font: customFont, color: PDFLib.rgb(0, 0, 0) };
        const opt11 = { size: 11, font: customFont, color: PDFLib.rgb(0, 0, 0) };
        
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const topDateStr = `${formatDatePDF(now)} ${timeStr}`;

        drawCenteredInRange(page, topDateStr, COORDS_SPRAVKA.dateTop.xStart, COORDS_SPRAVKA.dateTop.xEnd, COORDS_SPRAVKA.dateTop.y, opt12);
        
        page.drawText(fioStr, { x: COORDS_SPRAVKA.fio.x, y: COORDS_SPRAVKA.fio.y, ...opt11 });
        page.drawText(dobStr, { x: COORDS_SPRAVKA.dob.x, y: COORDS_SPRAVKA.dob.y, ...opt11 });
        page.drawText(passportStr, { x: COORDS_SPRAVKA.passport.x, y: COORDS_SPRAVKA.passport.y, ...opt11 });
        
        page.drawText(fullOrgName, { x: COORDS_SPRAVKA.org.x, y: COORDS_SPRAVKA.org.y, ...opt11 });
        page.drawText(p.current_position || '—', { x: COORDS_SPRAVKA.position.x, y: COORDS_SPRAVKA.position.y, ...opt11 });
        page.drawText(hireDateStr, { x: COORDS_SPRAVKA.hireDate.x, y: COORDS_SPRAVKA.hireDate.y, ...opt11 });
        
        page.drawText('работает', { x: COORDS_SPRAVKA.status.x, y: COORDS_SPRAVKA.status.y, ...opt11 });
        
        drawParagraph(page, reprimandsText, COORDS_SPRAVKA.reprimands.x, COORDS_SPRAVKA.reprimands.y, {
            ...opt11, maxWidth: COORDS_SPRAVKA.reprimands.maxWidth, indent: COORDS_SPRAVKA.reprimands.indent, lineHeight: COORDS_SPRAVKA.reprimands.lineHeight
        });

        page.drawText(formatDatePDF(now), { x: COORDS_SPRAVKA.formDate.x, y: COORDS_SPRAVKA.formDate.y, ...opt11 });
        page.drawText(bossStr, { x: COORDS_SPRAVKA.boss.x, y: COORDS_SPRAVKA.boss.y, ...opt11 });
        page.drawText(regNumberStr, { x: COORDS_SPRAVKA.regNumber.x, y: COORDS_SPRAVKA.regNumber.y, ...opt11 });

        const qrText = `СПРАВКА\nРеестр: ${regNumberStr}\nФИО: ${fioStr}\nОрг: ${fullOrgName}\nДействительна на ${formatDatePDF(now)}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
        const qrBytes = await fetch(qrUrl).then(r => r.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrBytes);
        page.drawImage(qrImage, {
            x: COORDS_SPRAVKA.qrCode.x, y: COORDS_SPRAVKA.qrCode.y,
            width: COORDS_SPRAVKA.qrCode.width, height: COORDS_SPRAVKA.qrCode.height
        });

        const finalPdfBytes = await pdfDoc.save();
        const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Spravka_${p.last_name}_${regNumberStr}.pdf`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        showToast('Справка успешно сформирована');

    } catch (err) {
        console.error(err);
        showToast('Ошибка: ' + err.message + '\nУбедитесь, что файл spravka_template.pdf лежит в корне!');
    }
}

// ============================================================================
// 2. ГЕНЕРАЦИЯ ВЫПИСКИ ИЗ ТРУДОВОЙ КНИЖКИ (С АВТО-ТАБЛИЦЕЙ)
// ============================================================================
async function downloadTrBookPDF() {
    const p = state.userProfile;
    if (!p) return showToast('Профиль не загружен');

    try {
        const pdfBytes = await fetch('./vypiska_template.pdf').then(r => r.arrayBuffer());
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        pdfDoc.registerFontkit(fontkit);

        const fontUrlReg = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
        const fontUrlBold = 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf';
        
        const fontBytesReg = await fetch(fontUrlReg).then(r => r.arrayBuffer());
        const fontBytesBold = await fetch(fontUrlBold).then(r => r.arrayBuffer());
        
        const customFont = await pdfDoc.embedFont(fontBytesReg);
        const boldFont = await pdfDoc.embedFont(fontBytesBold);

        let currentPage = pdfDoc.getPages()[0];
        const now = new Date();
        
        // Подготовка данных
        const firstNameStr = p.first_name || '—';
        const patronymicStr = p.patronymic || '—';
        const dobStr = p.dob ? formatDatePDF(new Date(p.dob)) : '—';
        const passportStr = `серия ${p.pass_series || '—'}, номер ${p.pass_number || '—'}`;
        
        const trknNumber = getTrBookNumber(); 
        const regNumStr = `ТК-${String(Math.floor(Math.random() * 99)).padStart(2, '0')} ${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;

        // Рисуем верхнюю часть (Шапка)
        const opt12 = { size: 12, font: customFont, color: PDFLib.rgb(0, 0, 0) };
        const opt11 = { size: 11, font: customFont, color: PDFLib.rgb(0, 0, 0) };
        const darkRed = PDFLib.rgb(0.6, 0.1, 0.1); 

        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const topDateStr = `${formatDatePDF(now)} ${timeStr}`;

        drawCenteredInRange(currentPage, topDateStr, COORDS_VYPISKA.dateTop.xStart, COORDS_VYPISKA.dateTop.xEnd, COORDS_VYPISKA.dateTop.y, opt12);
        
        currentPage.drawText(trknNumber, { x: COORDS_VYPISKA.trknNumber.x, y: COORDS_VYPISKA.trknNumber.y, ...opt11, color: darkRed });
        
        currentPage.drawText(firstNameStr, { x: COORDS_VYPISKA.firstName.x, y: COORDS_VYPISKA.firstName.y, ...opt11 });
        currentPage.drawText(patronymicStr, { x: COORDS_VYPISKA.patronymic.x, y: COORDS_VYPISKA.patronymic.y, ...opt11 });
        currentPage.drawText(dobStr, { x: COORDS_VYPISKA.dob.x, y: COORDS_VYPISKA.dob.y, ...opt11 });
        currentPage.drawText(passportStr, { x: COORDS_VYPISKA.passport.x, y: COORDS_VYPISKA.passport.y, ...opt11 });
        
        currentPage.drawText('—', { x: COORDS_VYPISKA.education.x, y: COORDS_VYPISKA.education.y, ...opt11 });
        currentPage.drawText('—', { x: COORDS_VYPISKA.profession.x, y: COORDS_VYPISKA.profession.y, ...opt11 });
        
        currentPage.drawText('Правительство', { x: COORDS_VYPISKA.responsible.x, y: COORDS_VYPISKA.responsible.y, ...opt11 });
        currentPage.drawText(regNumStr, { x: COORDS_VYPISKA.regNumber.x, y: COORDS_VYPISKA.regNumber.y, ...opt11 });

        // QR-код
        const qrText = `ВЫПИСКА ИЗ ТРУДОВОЙ КНИЖКИ\nРеестр: ${regNumStr}\nТРКН: ${trknNumber}\nФИО: ${[p.last_name, p.first_name, p.patronymic].filter(Boolean).join(' ')}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
        const qrBytes = await fetch(qrUrl).then(r => r.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrBytes);
        currentPage.drawImage(qrImage, {
            x: COORDS_VYPISKA.qrCode.x, y: COORDS_VYPISKA.qrCode.y,
            width: COORDS_VYPISKA.qrCode.width, height: COORDS_VYPISKA.qrCode.height
        });

        // ==========================================
        // АВТОМАТИЧЕСКАЯ ТАБЛИЦА
        // ==========================================
        const tbl = COORDS_VYPISKA.table;
        
        // Автоматический расчет ширины колонок (исходя из startX и endX)
        const colNumW = 30;
        const colDateW = 90;
        const colDayW = 50;
        
        const colNumX = tbl.startX;
        const colDateX = colNumX + colNumW + 5;
        const colDayX = colDateX + colDateW + 5;
        const colTextX = colDayX + colDayW + 5;
        const colTextW = tbl.endX - colTextX; // Оставшееся место под текст

        let currentY = tbl.yStart;
        const sortedRecords = [...state.trRecords].sort((a, b) => new Date(a.real_date) - new Date(b.real_date));

        // Функция отрисовки шапки таблицы (полужирная)
        const drawTableHeader = (pg, y) => {
            pg.drawText('№', { x: colNumX, y: y, size: 10, font: boldFont });
            pg.drawText('Реальная дата', { x: colDateX, y: y, size: 10, font: boldFont });
            pg.drawText('Номер дня', { x: colDayX, y: y, size: 10, font: boldFont });
            pg.drawText('Кадровое событие', { x: colTextX, y: y, size: 10, font: boldFont });
            
            pg.drawLine({ 
                start: { x: colNumX, y: y - 4 }, 
                end: { x: tbl.endX, y: y - 4 }, 
                thickness: 1, color: PDFLib.rgb(0.5, 0.5, 0.5) 
            });
            return y - 20; // Отступ после шапки
        };

        // Рисуем шапку на первой странице
        if (sortedRecords.length > 0) {
            currentY = drawTableHeader(currentPage, currentY);
        }

        let rowIndex = 1;
        for (const r of sortedRecords) {
            const dateStr = new Date(r.real_date).toLocaleDateString('ru-RU');
            const dayStr = r.game_day ? String(r.game_day) : '—';
            
            // Переносим текст внутри колонки, если он длинный
            const eventLines = wrapText(r.record_text || '', colTextW, customFont, 9);
            
            // Высота строки зависит от количества строк в тексте
            const rowHeight = Math.max(18, eventLines.length * 12 + 6);
            
            // Если не влезает на текущую страницу — создаем новую
            if (currentY - rowHeight < tbl.yLimit) {
                currentPage = pdfDoc.addPage([595, 842]); // A4
                currentY = 790; // Верхний отступ на новой странице
                currentY = drawTableHeader(currentPage, currentY);
            }

            // Рисуем строку (основной текст 9 пт)
            currentPage.drawText(String(rowIndex), { x: colNumX, y: currentY, size: 9, font: customFont });
            currentPage.drawText(dateStr, { x: colDateX, y: currentY, size: 9, font: customFont });
            currentPage.drawText(dayStr, { x: colDayX, y: currentY, size: 9, font: customFont });

            // Многострочный текст события
            let textY = currentY;
            eventLines.forEach(line => {
                currentPage.drawText(line, { x: colTextX, y: textY, size: 9, font: customFont });
                textY -= 12;
            });

            currentY -= rowHeight; 
            rowIndex++;
        }

        // Сохранение и скачивание
        const finalPdfBytes = await pdfDoc.save();
        const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Vypiska_TK_${p.last_name}_${regNumStr.replace(/\s/g, '')}.pdf`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        showToast('Выписка успешно сформирована');

    } catch (err) {
        console.error(err);
        showToast('Ошибка: ' + err.message + '\nУбедитесь, что файл vypiska_template.pdf лежит в корне!');
    }
}
