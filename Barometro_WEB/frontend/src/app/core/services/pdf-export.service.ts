import { Injectable } from '@angular/core';
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
  /**
   * Genera y descarga un informe ejecutivo en PDF con los resúmenes estadísticos
   * y consolidados de las respuestas recolectadas.
   */
  async exportResponsesSummaryPdf(data: PdfExportData): Promise<void> {
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
    const secondaryColor: [number, number, number] = [15, 118, 110]; // Verde azulado #0f766e
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
    doc.text('UNIVERSIDAD LAICA ELOY ALFARO DE MANABÍ', margin, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text('Sistema Barómetro / DataField — Plataforma de Recolección e Investigación', margin, currentY + 4);

    const nowFormatted = new Date().toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(`Fecha de emisión: ${nowFormatted}`, pageWidth - margin, currentY, { align: 'right' });
    currentY += 12;

    // Título Principal del Reporte
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...textDark);
    doc.text('INFORME RESUMEN DE RESULTADOS', margin, currentY);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...primaryColor);
    const formTitle = data.formTitle || data.form?.title || 'Formulario de Recolección';
    const splitTitle = doc.splitTextToSize(formTitle, contentWidth);
    doc.text(splitTitle, margin, currentY);
    currentY += splitTitle.length * 5 + 3;

    // ==========================================
    // 2. TARJETA DE METADATOS DEL FORMULARIO
    // ==========================================
    const totalRespuestas = data.responses.length;
    const totalPreguntas = data.questions.length;
    const proyectoNombre = data.form?.project?.name || 'Sin proyecto asignado';
    const estadoForm = data.form?.state || 'DEPLOYED';
    const periodoVigencia =
      data.form?.start_date || data.form?.end_date
        ? `${data.form?.start_date || 'Inmediato'} al ${data.form?.end_date || 'Sin límite'}`
        : 'Indefinido';

    const metadataRows: any[] = [
      [
        { content: 'Proyecto:', styles: { fontStyle: 'bold' } },
        proyectoNombre,
        { content: 'Total Respuestas:', styles: { fontStyle: 'bold' } },
        `${totalRespuestas} envíos`,
      ],
      [
        { content: 'Vigencia de Encuesta:', styles: { fontStyle: 'bold' } },
        periodoVigencia,
        { content: 'Total Preguntas:', styles: { fontStyle: 'bold' } },
        `${totalPreguntas} preguntas`,
      ],
      [
        { content: 'Estado Actual:', styles: { fontStyle: 'bold' } },
        estadoForm,
        { content: 'Consentimiento Informado:', styles: { fontStyle: 'bold' } },
        data.form?.require_consent !== false ? 'Requerido y Validado' : 'No requerido',
      ],
    ];

    if (data.form?.description) {
      metadataRows.push([
        { content: 'Descripción / Objetivo:', styles: { fontStyle: 'bold' } },
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
      doc.text('1. AVANCE Y CUMPLIMIENTO POR RECOLECTOR / ENCARGADO', margin, currentY);
      currentY += 4;

      const sharesRows = data.shares.map((share, idx) => {
        const nombre = share.user_name || share.user_email || `Usuario #${idx + 1}`;
        const email = share.user_email || '-';
        const respuestas = share.responses_count ?? 0;
        const meta = share.target_responses ? `${share.target_responses}` : 'Sin límite';
        const porcentaje = share.target_responses
          ? `${Math.min(100, Math.round((respuestas / share.target_responses) * 100))}%`
          : 'N/A';

        return [nombre, email, share.role || 'RECOLECTOR', `${respuestas}`, meta, porcentaje];
      });

      autoTable(doc, {
        startY: currentY,
        tableWidth: contentWidth,
        margin: { left: margin, right: margin },
        head: [['Encuestador / Miembro', 'Correo Electrónico', 'Rol', 'Respuestas', 'Meta', '% Cumplimiento']],
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
    doc.text('2. RESUMEN ESTADÍSTICO CONSOLIDADO POR PREGUNTA', margin, currentY);
    currentY += 5;

    if (totalRespuestas === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...textMuted);
      doc.text('No se registran respuestas recolectadas para calcular estadísticas.', margin, currentY);
      currentY += 8;
    } else {
      let questionIndex = 1;

      for (const question of data.questions) {
        checkPageBreak(35);

        // Subtítulo de la Pregunta
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        const questionHeader = `${questionIndex}. [${question.type}] ${question.label}`;
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
            head: [['Opción / Categoría', 'Frecuencia (N)', 'Porcentaje (%)', 'Distribución Visual']],
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
        }
        // Caso B: Pregunta Numérica (NUMBER, RATING, RANKING)
        else if (['NUMBER', 'RATING', 'RANKING'].includes(question.type)) {
          const numbers: number[] = [];
          for (const resp of data.responses) {
            const raw = resp.rawAnswers?.[question.id];
            if (raw !== undefined && raw !== null && raw !== '' && !isNaN(Number(raw))) {
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
              head: [['Métrica Estadística', 'Valor Calculado', 'Interpretación']],
              body: [
                ['Respuestas numéricas válidas', `${count} de ${totalRespuestas}`, `${((count / totalRespuestas) * 100).toFixed(1)}% tasa de respuesta`],
                ['Promedio (Media Aritmética)', `${avg}`, 'Valor medio de las respuestas recolectadas'],
                ['Valor Mínimo Registrado', `${min}`, 'Respuesta más baja observada'],
                ['Valor Máximo Registrado', `${max}`, 'Respuesta más alta observada'],
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
            doc.text('Sin registros numéricos válidos en las respuestas recibidas.', margin + 2, currentY);
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
            head: [['Muestra', `Respuestas Recolectadas (${answeredCount}/${totalRespuestas} contestadas — ${tasaRespuesta}%)`]],
            body: samples.length > 0 ? samples : [['-', 'No se registraron comentarios de texto.']],
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
          for (const resp of data.responses) {
            const val = resp.rawAnswers?.[question.id];
            if (val && (typeof val === 'object' || String(val).includes(','))) {
              gpsCount++;
            }
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...textDark);
          doc.text(
            `Coordenadas geográficas capturadas: ${gpsCount} de ${totalRespuestas} respuestas (${((gpsCount / totalRespuestas) * 100).toFixed(1)}%).`,
            margin + 2,
            currentY,
          );
          currentY += 6;
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
            `Respuestas registradas: ${answeredCount} de ${totalRespuestas} (${((answeredCount / totalRespuestas) * 100).toFixed(1)}% tasa de respuesta).`,
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
      doc.text('3. MUESTRA CONSOLIDADA DE ENVÍOS RECIENTES', margin, currentY);
      currentY += 4;

      // Seleccionar hasta 3 preguntas representativas para no saturar horizontalmente
      const sampleQuestions = data.questions.slice(0, 3);
      const headers = ['#', 'Fecha / Hora', ...sampleQuestions.map((q) => this.truncate(q.label, 24))];

      // Hasta 20 envíos en la muestra
      const sampleRows = data.responses.slice(0, 20).map((resp, i) => {
        const fechaHora = resp.submitted_at
          ? new Date(resp.submitted_at).toLocaleDateString('es-EC', {
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
        'Universidad Laica Eloy Alfaro de Manabí (ULEAM) — Sistema de Recolección Barómetro / DataField',
        margin,
        pageHeight - 8,
      );

      doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 8, {
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
    const filename = `resumen_resultados_${safeTitle}_${dateStamp}.pdf`;

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
          return `GPS (${Number(lat).toFixed(3)}, ${Number(lng).toFixed(3)})`;
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
