function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function wrapParagraph(text: string, maxChars = 64): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface SamplePdfPage {
  heading?: string;
  paragraphs: string[];
}

/**
 * Generates a valid, selectable-text PDF 1.4 Blob in memory without external dependencies.
 * Used exclusively when the user triggers the optional "Load sample library" demo.
 */
export function buildTextPdfBlob(
  title: string,
  author: string,
  pages: SamplePdfPage[]
): Blob {
  const objects: string[] = [];

  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // 1: Catalog (placeholder, updated below)
  const catalogId = addObject('');
  // 2: Pages (placeholder, updated below)
  const pagesId = addObject('');
  // 3: Standard Times-Roman font
  const fontRomanId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
  // 4: Standard Times-Bold font
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>');
  // 5: Standard Helvetica font
  const fontSansId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageIds: number[] = [];

  pages.forEach((pageData, index) => {
    const pageNum = index + 1;
    const cmds: string[] = [];
    // Warm paper background is rendered by viewer; keep PDF canvas clean white/cream
    cmds.push('BT');

    if (pageNum === 1) {
      // Title page
      cmds.push(`/F2 26 Tf 72 640 Td (${escapePdfText(title.toUpperCase())}) Tj`);
      cmds.push(`/F1 15 Tf 0 -36 Td (${escapePdfText(author)}) Tj`);
      cmds.push(`/F3 9 Tf 0 -48 Td (SAMPLE EDITION  /  THE GROWTH SHELF) Tj`);
      let yOffset = -48;
      for (const p of pageData.paragraphs) {
        const lines = wrapParagraph(p, 62);
        cmds.push(`/F1 12 Tf 0 ${yOffset} Td (${escapePdfText(lines[0] ?? '')}) Tj`);
        for (let i = 1; i < lines.length; i++) {
          cmds.push(`0 -18 Td (${escapePdfText(lines[i])}) Tj`);
        }
        yOffset = -28;
      }
    } else {
      cmds.push(`/F3 8 Tf 72 742 Td (${escapePdfText(title.toUpperCase())}) Tj`);
      cmds.push(`/F3 8 Tf 420 0 Td (PAGE ${pageNum}) Tj`);
      cmds.push('-420 -46 Td');

      if (pageData.heading) {
        cmds.push(`/F2 16 Tf (${escapePdfText(pageData.heading)}) Tj`);
        cmds.push('0 -28 Td');
      }

      cmds.push('/F1 12 Tf');
      for (const p of pageData.paragraphs) {
        const lines = wrapParagraph(p, 64);
        for (const line of lines) {
          cmds.push(`(${escapePdfText(line)}) Tj 0 -18 Td`);
        }
        cmds.push('0 -10 Td');
      }
    }

    cmds.push('ET');
    const streamContent = cmds.join('\n');
    const contentId = addObject(
      `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`
    );

    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRomanId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontSansId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}
