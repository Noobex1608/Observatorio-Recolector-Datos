import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Form, FormQuestion, FormShare } from './form.service';

export interface PdfExportData {
  form: Form | null;
  formTitle: string;
  questions: FormQuestion[];
  responses: Array<{
    id: string;
    submitted_at: string;
    answers: Record<string, string>;
    rawAnswers: Record<string, any>;
  }>;
  stats: Record<string, Record<string, number>>;
  shares: FormShare[];
}

@Injectable({
  providedIn: 'root',
})
export class PdfExportService {
  private readonly i18n = inject(TranslateService);

  /**
   * Genera y descarga un informe ejecutivo en PDF con los resúmenes estadísticos
   * y consolidados de las respuestas recolectadas.
   */
  async exportResponsesSummaryPdf(data: PdfExportData): Promise<void> {
    // El informe sale en el idioma elegido en la interfaz.
    const t = (key: string, params?: Record<string, unknown>): string => this.i18n.instant(key, params);
    const locale = this.i18n.getCurrentLang() === 'en' ? 'en-US' : 'es-EC';
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2; // 210 - 28 = 182mm
    let currentY = margin;

    // Colores corporativos (ULEAM / Barómetro)
    const primaryColor: [number, number, number] = [30, 58, 138]; // Azul marino #1e3a8a
    const secondaryColor: [number, number, number] = [0, 89, 168]; // Azul institucional #0059A8
    const textDark: [number, number, number] = [15, 23, 42]; // Slate 900
    const textMuted: [number, number, number] = [100, 116, 139]; // Slate 500

    // Función auxiliar para verificar si se necesita salto de página
    const checkPageBreak = (neededHeight: number) => {
      if (currentY + neededHeight > pageHeight - 20) {
        doc.addPage();
        currentY = margin + 10;
      }
    };

    // ==========================================
    // 1. ENCABEZADO INSTITUCIONAL
    // ==========================================
    doc.setFillColor(...primaryColor);
    doc.rect(margin, currentY, contentWidth, 3.5, 'F');
    currentY += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.text(t('pdfReport.university'), margin, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text(t('pdfReport.platform'), margin, currentY + 4);

    const nowFormatted = new Date().toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(t('pdfReport.issuedAt', { date: nowFormatted }), pageWidth - margin, currentY, { align: 'right' });
    currentY += 12;

    // Título Principal del Reporte
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...textDark);
    doc.text(t('pdfReport.title'), margin, currentY);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...primaryColor);
    const formTitle = data.formTitle || data.form?.title || t('pdfReport.defaultForm');
    const splitTitle = doc.splitTextToSize(formTitle, contentWidth);
    doc.text(splitTitle, margin, currentY);
    currentY += splitTitle.length * 5 + 3;

    // ==========================================
    // 2. TARJETA DE METADATOS DEL FORMULARIO
    // ==========================================
    const totalRespuestas = data.responses.length;
    const totalPreguntas = data.questions.length;
    const proyectoNombre = data.form?.project?.name || t('pdfReport.noProject');
    const estadoForm = data.form?.state || 'DEPLOYED';
    const periodoVigencia =
      data.form?.start_date || data.form?.end_date
        ? t('pdfReport.period', { start: data.form?.start_date || t('pdfReport.immediate'), end: data.form?.end_date || t('pdfReport.noLimit') })
        : t('pdfReport.indefinite');

    const metadataRows: any[] = [
      [
        { content: t('pdfReport.meta.project'), styles: { fontStyle: 'bold' } },
        proyectoNombre,
        { content: t('pdfReport.meta.responses'), styles: { fontStyle: 'bold' } },
        t('pdfReport.submissions', { count: totalRespuestas }),
      ],
      [
        { content: t('pdfReport.meta.period'), styles: { fontStyle: 'bold' } },
        periodoVigencia,
        { content: t('pdfReport.meta.questions'), styles: { fontStyle: 'bold' } },
        t('pdfReport.questions', { count: totalPreguntas }),
      ],
      [
        { content: t('pdfReport.meta.state'), styles: { fontStyle: 'bold' } },
        estadoForm,
        { content: t('pdfReport.meta.consent'), styles: { fontStyle: 'bold' } },
        t(data.form?.require_consent !== false ? 'pdfReport.consentRequired' : 'pdfReport.consentNotRequired'),
      ],
    ];

    if (data.form?.description) {
      metadataRows.push([
        { content: t('pdfReport.meta.description'), styles: { fontStyle: 'bold' } },
        { content: data.form.description, colSpan: 3 },
      ]);
    }

    autoTable(doc, {
      startY: currentY,
      tableWidth: contentWidth,
      margin: { left: margin, right: margin },
      body: metadataRows,
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
        textColor: textDark,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 38, fillColor: [248, 250, 252] },
        1: { cellWidth: 53 },
        2: { cellWidth: 43, fillColor: [248, 250, 252] },
        3: { cellWidth: 48 },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    // ==========================================
    // 3. RESUMEN DE CUMPLIMIENTO POR RECOLECTOR
    // ==========================================
    if (data.shares && data.shares.length > 0) {
      checkPageBreak(35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...primaryColor);
      doc.text(t('pdfReport.section1'), margin, currentY);
      currentY += 4;

      const sharesRows = data.shares.map((share, idx) => {
        const nombre = share.user_name || share.user_email || t('pdfReport.userN', { n: idx + 1 });
        const email = share.user_email || '-';
        const respuestas = share.responses_count ?? 0;
        const meta = share.target_responses ? `${share.target_responses}` : t('pdfReport.noLimit');
        const porcentaje = share.target_responses
          ? `${Math.min(100, Math.round((respuestas / share.target_responses) * 100))}%`
          : 'N/A';

        return [nombre, email, share.role || 'RECOLECTOR', `${respuestas}`, meta, porcentaje];
      });

      autoTable(doc, {
        startY: currentY,
        tableWidth: contentWidth,
        margin: { left: margin, right: margin },
        head: [[t('pdfReport.cols.member'), t('pdfReport.cols.email'), t('pdfReport.cols.role'), t('pdfReport.cols.responses'), t('pdfReport.cols.target'), t('pdfReport.cols.completion')]],
        body: sharesRows,
        theme: 'striped',
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.8,
          cellPadding: 2.2,
          lineColor: [226, 232, 240],
        },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 50 },
          2: { cellWidth: 27 },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 20, halign: 'center' },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }

    // ==========================================
    // 4. RESUMEN ESTADÍSTICO POR PREGUNTA
    // ==========================================
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...primaryColor);
    doc.text(t('pdfReport.section2'), margin, currentY);
    currentY += 5;

    if (totalRespuestas === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...textMuted);
      doc.text(t('pdfReport.noResponses'), margin, currentY);
      currentY += 8;
    } else {
      let questionIndex = 1;

      for (const question of data.questions) {
        checkPageBreak(35);

        // Subtítulo de la Pregunta
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        const questionHeader = `${questionIndex}. ${question.label}`;
        const splitQHeader = doc.splitTextToSize(questionHeader, contentWidth);
        doc.text(splitQHeader, margin, currentY);
        currentY += splitQHeader.length * 4 + 2;

        const qStats = data.stats[question.id] || {};

        // Caso A: Selección Única, Selección Múltiple o Likert
        if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'LIKERT'].includes(question.type)) {
          let categories: string[] = [];
          if (Array.isArray(question.options)) {
            categories = question.options.map(String).filter(Boolean);
          } else if (question.options && typeof question.options === 'object' && Array.isArray((question.options as any).columns)) {
            categories = (question.options as any).columns.map(String).filter(Boolean);
          }
          if (categories.length === 0) {
            categories = Object.keys(qStats);
          }

          const totalMenciones = Object.values(qStats).reduce((acc, val) => acc + val, 0);

          const tableRows = categories.map((cat) => {
            const count = qStats[cat] ?? 0;
            const pct = totalMenciones > 0 ? ((count / totalMenciones) * 100).toFixed(1) : '0.0';
            return [cat, `${count}`, `${pct}%`, '']; // La columna 4 se dibuja vectorialmente con didDrawCell
          });

          autoTable(doc, {
            startY: currentY,
            tableWidth: contentWidth, // Exactamente 182mm
            margin: { left: margin, right: margin },
            head: [[t('pdfReport.cols.option'), t('pdfReport.cols.frequency'), t('pdfReport.cols.percent'), t('pdfReport.cols.distribution')]],
            body: tableRows,
            theme: 'grid',
            headStyles: {
              fillColor: secondaryColor,
              textColor: [255, 255, 255],
              fontSize: 8,
              fontStyle: 'bold',
            },
            styles: {
              fontSize: 7.8,
              cellPadding: 2,
              lineColor: [226, 232, 240],
            },
            columnStyles: {
              0: { cellWidth: 70 },
              1: { cellWidth: 26, halign: 'center' },
              2: { cellWidth: 26, halign: 'center' },
              3: { cellWidth: 60, halign: 'left' },
            },
            didDrawCell: (cellData) => {
              // Dibujar la barra de progreso gráfica vectorial sin caracteres Unicode
              if (cellData.column.index === 3 && cellData.section === 'body') {
                const rowIdx = cellData.row.index;
                const cat = categories[rowIdx];
                const count = qStats[cat] ?? 0;
                const pct = totalMenciones > 0 ? (count / totalMenciones) * 100 : 0;

                const cell = cellData.cell;
                const padX = 4;
                const barWidth = cell.width - padX * 2; // se adapta al ancho de celda
                const barHeight = 4.2;
                const x = cell.x + padX;
                const y = cell.y + (cell.height - barHeight) / 2;

                // Barra de fondo gris
                doc.setFillColor(226, 232, 240);
                doc.roundedRect(x, y, barWidth, barHeight, 1.5, 1.5, 'F');

                // Barra de progreso rellena
                if (pct > 0) {
                  const fillW = Math.max(1.5, Math.min(barWidth, (pct / 100) * barWidth));
                  doc.setFillColor(...secondaryColor);
                  doc.roundedRect(x, y, fillW, barHeight, 1.5, 1.5, 'F');
                }
              }
            },
          });

          currentY = (doc as any).lastAutoTable.finalY + 6;
          const slices = categories.map((name) => ({ name, count: Number(qStats[name] ?? 0) }))
            .filter((slice) => slice.count > 0);
          if (slices.length > 0) {
            checkPageBreak(54);
            const palette: Array<[number, number, number]> = [
              [0, 89, 168], [70, 164, 255], [0, 86, 137], [0, 68, 153],
              [188, 20, 33], [22, 124, 202], [134, 195, 255], [216, 59, 71],
            ];
            const visible = slices.slice(0, 7);
            const otherCount = slices.slice(7).reduce((sum, slice) => sum + slice.count, 0);
            if (otherCount > 0) visible.push({ name: t('pdfReport.otherOptions'), count: otherCount });
            const total = visible.reduce((sum, slice) => sum + slice.count, 0);
            const centerX = margin + 25;
            const centerY = currentY + 22;
            const radius = 20;
            let angle = -Math.PI / 2;
            visible.forEach((slice, index) => {
              const sweep = (slice.count / total) * Math.PI * 2;
              const segments = Math.max(2, Math.ceil(sweep / 0.12));
              doc.setFillColor(...palette[index % palette.length]);
              for (let segment = 0; segment < segments; segment++) {
                const a = angle + (sweep * segment) / segments;
                const b = angle + (sweep * (segment + 1)) / segments;
                doc.triangle(centerX, centerY,
                  centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius,
                  centerX + Math.cos(b) * radius, centerY + Math.sin(b) * radius, 'F');
              }
              doc.rect(margin + 55, currentY + 4 + index * 5, 3, 3, 'F');
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7.5);
              doc.setTextColor(...textDark);
              doc.text(`${this.truncate(slice.name, 35)}: ${((slice.count / total) * 100).toFixed(1)}%`,
                margin + 61, currentY + 6.5 + index * 5);
              angle += sweep;
            });
            if (question.type === 'MULTIPLE_CHOICE') {
              doc.setFontSize(7);
              doc.text(t('pdfReport.mentionsNote'), margin + 55, currentY + 48);
            }
            currentY += 52;
          }
        }
        // Caso B: Pregunta Numérica (NUMBER, RATING, RANKING)
        else if (['NUMBER', 'RATING', 'RANKING'].includes(question.type)) {
          const numbers: number[] = [];
          for (const resp of data.responses) {
            const raw = resp.rawAnswers?.[question.id];
            if (raw !== undefined && raw !== null && raw !== '' && !Number.isNaN(Number(raw))) {
              numbers.push(Number(raw));
            }
          }

          if (numbers.length > 0) {
            const count = numbers.length;
            const sum = numbers.reduce((a, b) => a + b, 0);
            const avg = (sum / count).toFixed(2);
            const min = Math.min(...numbers);
            const max = Math.max(...numbers);

            autoTable(doc, {
              startY: currentY,
              tableWidth: contentWidth,
              margin: { left: margin, right: margin },
              head: [[t('pdfReport.cols.metric'), t('pdfReport.cols.value'), t('pdfReport.cols.meaning')]],
              body: [
                [t('pdfReport.num.valid'), t('pdfReport.ofTotal', { count, total: totalRespuestas }), t('pdfReport.responseRate', { rate: ((count / totalRespuestas) * 100).toFixed(1) })],
                [t('pdfReport.num.mean'), `${avg}`, t('pdfReport.num.meanHint')],
                [t('pdfReport.num.min'), `${min}`, t('pdfReport.num.minHint')],
                [t('pdfReport.num.max'), `${max}`, t('pdfReport.num.maxHint')],
              ],
              theme: 'grid',
              headStyles: {
                fillColor: secondaryColor,
                textColor: [255, 255, 255],
                fontSize: 8,
                fontStyle: 'bold',
              },
              styles: {
                fontSize: 7.8,
                cellPadding: 2,
                lineColor: [226, 232, 240],
              },
              columnStyles: {
                0: { cellWidth: 55, fontStyle: 'bold' },
                1: { cellWidth: 42, halign: 'center' },
                2: { cellWidth: 85 },
              },
            });

            currentY = (doc as any).lastAutoTable.finalY + 6;
          } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(...textMuted);
            doc.text(t('pdfReport.noNumeric'), margin + 2, currentY);
            currentY += 6;
          }
        }
        // Caso C: Pregunta Abierta / Texto (TEXT)
        else if (question.type === 'TEXT') {
          const textAnswers: string[] = [];
          for (const resp of data.responses) {
            const val = resp.answers[question.id];
            if (val && val.trim() !== '' && val !== '-') {
              textAnswers.push(val.trim());
            }
          }

          const answeredCount = textAnswers.length;
          const tasaRespuesta = ((answeredCount / totalRespuestas) * 100).toFixed(1);

          // Tomar hasta 5 respuestas de muestra
          const samples = textAnswers.slice(0, 5).map((txt, i) => [`#${i + 1}`, txt]);

          autoTable(doc, {
            startY: currentY,
            tableWidth: contentWidth,
            margin: { left: margin, right: margin },
            head: [[t('pdfReport.cols.sample'), t('pdfReport.textHeader', { answered: answeredCount, total: totalRespuestas, rate: tasaRespuesta })]],
            body: samples.length > 0 ? samples : [['-', t('pdfReport.noText')]],
            theme: 'grid',
            headStyles: {
              fillColor: secondaryColor,
              textColor: [255, 255, 255],
              fontSize: 8,
              fontStyle: 'bold',
            },
            styles: {
              fontSize: 7.8,
              cellPadding: 2,
              lineColor: [226, 232, 240],
            },
            columnStyles: {
              0: { cellWidth: 18, halign: 'center' },
              1: { cellWidth: 164 },
            },
          });

          currentY = (doc as any).lastAutoTable.finalY + 6;
        }
        // Caso D: GPS o Coordenadas
        else if (question.type === 'GPS') {
          let gpsCount = 0;
          const gpsRows: string[][] = [];
          for (const resp of data.responses) {
            const val = resp.rawAnswers?.[question.id];
            const latitude = val && typeof val === 'object' ? Number(val.latitude ?? val.lat) : Number.NaN;
            const longitude = val && typeof val === 'object' ? Number(val.longitude ?? val.lng) : Number.NaN;
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              gpsCount++;
              if (gpsRows.length < 20) gpsRows.push([String(gpsCount), longitude.toFixed(6), latitude.toFixed(6)]);
            }
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...textDark);
          doc.text(
            t('pdfReport.gpsSummary', { count: gpsCount, total: totalRespuestas, rate: ((gpsCount / totalRespuestas) * 100).toFixed(1) }),
            margin + 2,
            currentY,
          );
          currentY += 6;
          if (gpsRows.length > 0) {
            autoTable(doc, { startY: currentY, margin: { left: margin, right: margin },
              head: [['#', t('pdfReport.cols.lng'), t('pdfReport.cols.lat')]], body: gpsRows,
              theme: 'grid', styles: { fontSize: 7.5 },
              headStyles: { fillColor: secondaryColor, textColor: [255, 255, 255] } });
            currentY = (doc as any).lastAutoTable.finalY + 6;
          }
        }
        // Otros tipos (FECHA, HORA, MULTIMEDIA, FIRMA, etc.)
        else {
          let answeredCount = 0;
          for (const resp of data.responses) {
            const val = resp.answers[question.id];
            if (val && val !== '-' && val.trim() !== '') {
              answeredCount++;
            }
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...textDark);
          doc.text(
            t('pdfReport.answeredSummary', { count: answeredCount, total: totalRespuestas, rate: ((answeredCount / totalRespuestas) * 100).toFixed(1) }),
            margin + 2,
            currentY,
          );
          currentY += 6;
        }

        questionIndex++;
      }
    }

    // ==========================================
    // 5. REGISTRO RESUMEN DE RESPUESTAS RECIENTES
    // ==========================================
    if (totalRespuestas > 0) {
      checkPageBreak(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...primaryColor);
      doc.text(t('pdfReport.section3'), margin, currentY);
      currentY += 4;

      // Seleccionar hasta 3 preguntas representativas para no saturar horizontalmente
      const sampleQuestions = data.questions.slice(0, 3);
      const headers = ['#', t('pdfReport.cols.dateTime'), ...sampleQuestions.map((q) => this.truncate(q.label, 24))];

      // Hasta 20 envíos en la muestra
      const sampleRows = data.responses.slice(0, 20).map((resp, i) => {
        const fechaHora = resp.submitted_at
          ? new Date(resp.submitted_at).toLocaleDateString(locale, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';

        const rowAnswers = sampleQuestions.map((q) => {
          const raw = resp.rawAnswers?.[q.id];
          const formatted = resp.answers[q.id];
          return this.formatAnswerSummary(raw, formatted, q.type);
        });

        return [`${i + 1}`, fechaHora, ...rowAnswers];
      });

      // Anchos: 12 + 35 + 45 + 45 + 45 = 182mm (o ajustado al número de columnas de preguntas)
      const qColsCount = sampleQuestions.length;
      const remainingWidth = contentWidth - (12 + 35); // 135mm
      const perQWidth = qColsCount > 0 ? remainingWidth / qColsCount : 0;

      const sampleColStyles: Record<number, any> = {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 35 },
      };
      for (let c = 0; c < qColsCount; c++) {
        sampleColStyles[c + 2] = { cellWidth: perQWidth, overflow: 'ellipsize' };
      }

      autoTable(doc, {
        startY: currentY,
        tableWidth: contentWidth,
        margin: { left: margin, right: margin },
        head: [headers],
        body: sampleRows,
        theme: 'striped',
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.8,
          lineColor: [226, 232, 240],
        },
        columnStyles: sampleColStyles,
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }

    // ==========================================
    // 6. PIE DE PÁGINA Y NUMERACIÓN DE PÁGINAS
    // ==========================================
    const totalPages = doc.getNumberOfPages();
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      doc.setPage(pageNum);

      // Línea divisoria en pie de página
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

      // Texto de pie de página
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...textMuted);
      doc.text(
        t('pdfReport.footer'),
        margin,
        pageHeight - 8,
      );

      doc.text(t('pdfReport.page', { page: pageNum, total: totalPages }), pageWidth - margin, pageHeight - 8, {
        align: 'right',
      });
    }

    // Descargar el archivo
    const safeTitle = (formTitle || 'formulario')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 40);
    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `${t('pdfReport.filePrefix')}_${safeTitle}_${dateStamp}.pdf`;

    doc.save(filename);
  }

  private truncate(str: string, maxLen: number): string {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
  }

  private formatAnswerSummary(rawVal: any, formattedVal: string | undefined, qType: string): string {
    if (rawVal === undefined || rawVal === null || rawVal === '') return '-';

    if (qType === 'GPS') {
      if (typeof rawVal === 'object') {
        const lat = rawVal.latitude ?? rawVal.lat;
        const lng = rawVal.longitude ?? rawVal.lng;
        if (lat !== undefined && lng !== undefined) {
          return `X ${Number(lng).toFixed(6)}, Y ${Number(lat).toFixed(6)}`;
        }
      }
      return 'Coordenada GPS';
    }

    if (qType === 'MULTIMEDIA') return 'Archivo adjunto';
    if (qType === 'SIGNATURE') return 'Firma registrada';

    const val = formattedVal || String(rawVal);
    return this.truncate(val, 28);
  }
}
