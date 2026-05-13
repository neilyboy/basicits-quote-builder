import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PdfQuote {
  quote_number: string;
  job_name: string;
  job_description?: string | null;
  scope_of_work?: string | null;
  notes?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_company?: string | null;
  customer_address?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  discount_type: string;
  total: number;
  created_at: string;
  status: string;
}

interface PdfLineItem {
  description: string | null;
  quantity: number;
  unit_price: number;
  multiplier: number;
  line_total: number;
  unit_type?: string;
  item_type?: string;
  category_name?: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export function generateQuotePdf(quote: PdfQuote, lineItems: PdfLineItem[], companyName = 'Basic ITS') {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  // Colors
  const brandColor: [number, number, number] = [30, 41, 59]; // slate-800
  const mutedColor: [number, number, number] = [100, 116, 139]; // slate-500

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandColor);
  doc.text(companyName, margin, 28);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);

  // Quote number & date - right aligned
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandColor);
  doc.text(quote.quote_number, pageWidth - margin, 28, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);
  doc.text(`Created ${new Date(quote.created_at).toLocaleDateString()}`, pageWidth - margin, 35, { align: 'right' });
  doc.text(`Status: ${quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}`, pageWidth - margin, 41, { align: 'right' });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, 48, pageWidth - margin, 48);

  let y = 58;

  // Two-column layout: Job info (left) + Customer info (right)
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandColor);
  doc.text(quote.job_name || 'Untitled Quote', margin, y);

  if (quote.customer_company || quote.customer_name) {
    doc.text(quote.customer_company || quote.customer_name || '', pageWidth - margin, y, { align: 'right' });
  }

  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);

  if (quote.job_description) {
    doc.text(quote.job_description, margin, y);
    y += 5;
  }

  // Customer details on right
  let rightY = y - (quote.job_description ? 5 : 0);
  if (quote.customer_company && quote.customer_name) {
    doc.text(quote.customer_name, pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }
  if (quote.customer_email) {
    doc.text(quote.customer_email, pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }
  if (quote.customer_phone) {
    doc.text(quote.customer_phone, pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }
  if (quote.customer_address) {
    doc.text(quote.customer_address, pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }

  y = Math.max(y, rightY) + 4;

  // Scope of work
  if (quote.scope_of_work) {
    y += 2;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240);
    const scopeLines = doc.splitTextToSize(quote.scope_of_work, pageWidth - margin * 2 - 16);
    const boxHeight = scopeLines.length * 4.5 + 14;
    doc.roundedRect(margin, y, pageWidth - margin * 2, boxHeight, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandColor);
    doc.text('Scope of Work', margin + 8, y + 8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedColor);
    doc.text(scopeLines, margin + 8, y + 15);
    y += boxHeight + 8;
  } else {
    y += 6;
  }

  // Line items table
  const tableBody = lineItems.map(item => {
    const tag = item.item_type === 'product' && item.category_name ? item.category_name : (item.item_type || '');
    const label = tag ? `[${tag.charAt(0).toUpperCase() + tag.slice(1)}]  ` : '';
    const desc = item.description || '';
    return [
      label + desc + (item.multiplier !== 1 ? ` (×${item.multiplier})` : ''),
      String(item.quantity),
      fmt(item.unit_price),
      fmt(item.line_total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['ITEM', 'QTY', 'UNIT PRICE', 'TOTAL']],
    body: tableBody,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: brandColor,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 4,
    },
    bodyStyles: {
      textColor: brandColor,
      fontSize: 9,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 25 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 },
    },
    alternateRowStyles: {
      fillColor: [252, 252, 253],
    },
    theme: 'plain',
    didDrawPage: () => {
      // Draw border under head
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Totals section
  const totalsX = pageWidth - margin - 80;
  const valuesX = pageWidth - margin;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);
  doc.text('Subtotal', totalsX, y);
  doc.setTextColor(...brandColor);
  doc.text(fmt(quote.subtotal), valuesX, y, { align: 'right' });
  y += 7;

  if (quote.discount_amount > 0) {
    doc.setTextColor(...mutedColor);
    doc.text('Discount', totalsX, y);
    doc.setTextColor(225, 29, 72); // rose-600
    const discountValue = quote.discount_type === 'percent'
      ? quote.subtotal * (quote.discount_amount / 100)
      : quote.discount_amount;
    doc.text(`-${fmt(discountValue)}`, valuesX, y, { align: 'right' });
    y += 7;
  }

  if (quote.tax_rate > 0) {
    doc.setTextColor(...mutedColor);
    doc.text(`Tax (${quote.tax_rate}%)`, totalsX, y);
    doc.setTextColor(...brandColor);
    doc.text(fmt(quote.tax_amount), valuesX, y, { align: 'right' });
    y += 7;
  }

  // Total line
  doc.setDrawColor(226, 232, 240);
  doc.line(totalsX - 5, y, valuesX, y);
  y += 7;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandColor);
  doc.text('Total', totalsX, y);
  doc.text(fmt(quote.total), valuesX, y, { align: 'right' });
  y += 12;

  // Notes
  if (quote.notes) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandColor);
    doc.text('Notes', margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedColor);
    const noteLines = doc.splitTextToSize(quote.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, y);
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedColor);
    doc.text(`Generated by ScopeForge • ${companyName}`, margin, pageH - 10);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageH - 10, { align: 'right' });
  }

  return doc;
}
