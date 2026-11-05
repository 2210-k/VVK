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
// ⚠️ ТВОИ КООРДИНАТЫ
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

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ СПРАВКИ
// ============================================================================
async function downloadEmploymentCertificatePDF() {
    const p = state.userProfile;
    if (!p) return showToast('Профиль не загружен');
    if (!p.current_org) return showToast('Нет действующего места работы для справки');

    try {
        // Загружаем шаблон
        const pdfBytes = await fetch('./spravka_template.pdf').then(r => r.arrayBuffer());
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        pdfDoc.registerFontkit(fontkit);

        const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
        const fontBytes = await fetch(fontUrl).then(r => r.arrayBuffer());
        const customFont = await pdfDoc.embedFont(fontBytes);

        const page = pdfDoc.getPages()[0];
        const now = new Date();
        
        // Подготовка данных
        const fioStr = [p.last_name, p.first_name, p.patronymic].filter(Boolean).join(' ');
        const dobStr = p.dob ? formatDatePDF(new Date(p.dob)) : '—';
        const passportStr = `серия ${p.pass_series || '—'}, номер ${p.pass_number || '—'}`;
        
        // Ищем дату приема на работу
        const hireRecord = state.trRecords.find(r => /принят|трудоустроен|зачислен/i.test(r.record_text));
        const hireDateStr = hireRecord ? `${formatDatePDF(new Date(hireRecord.real_date))} (${hireRecord.game_day} день)` : '—';
        
        // Формируем блок выговоров (УБРАЛИ "По состоянию на")
        let reprimandsText = `${formatDatePDF(now)} `;
        if (Number(p.reprimands_count || 0) === 0) {
            reprimandsText += `активных выговоров не имеет.`;
        } else {
            reprimandsText += `имеет ${p.reprimands_count} выговор(ов): `;
            const reps = state.trRecords.filter(r => r.action_type === 'reprimand').slice(-p.reprimands_count);
            const repStrings = reps.map((r, i) => `№${i+1} от ${formatDatePDF(new Date(r.real_date))} (${r.game_day} день)`);
            reprimandsText += repStrings.join('; ') + '.';
        }

        // Расшифровываем организацию
        const rawOrg = p.current_org;
        const fullOrgName = ORG_MAP[rawOrg] || rawOrg;

        // Подбираем должность руководителя
        const bossTitle = ORG_BOSSES[fullOrgName] || 'Руководитель';
        const bossStr = `${bossTitle} организации "${fullOrgName}"`;
        
        const regNumberStr = `СПР-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;

        // Рисование (12 пт для даты, 11 пт для остального)
        const opt12 = { size: 12, font: customFont, color: PDFLib.rgb(0, 0, 0) };
        const opt11 = { size: 11, font: customFont, color: PDFLib.rgb(0, 0, 0) };
        
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const topDateStr = `${formatDatePDF(now)} ${timeStr}`;

        // Отрисовка
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

        // QR-код
        const qrText = `СПРАВКА\nРеестр: ${regNumberStr}\nФИО: ${fioStr}\nОрг: ${fullOrgName}\nДействительна на ${formatDatePDF(now)}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
        const qrBytes = await fetch(qrUrl).then(r => r.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrBytes);
        page.drawImage(qrImage, {
            x: COORDS_SPRAVKA.qrCode.x, y: COORDS_SPRAVKA.qrCode.y,
            width: COORDS_SPRAVKA.qrCode.width, height: COORDS_SPRAVKA.qrCode.height
        });

        // Сохранение и скачивание
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
