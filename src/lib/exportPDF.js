import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CONTAINER_LABELS = {
  '20ft':    '20\' Dry  (5.89 × 2.35 × 2.39 m)',
  '40ft':    '40\' Dry  (12.0 × 2.35 × 2.39 m)',
  '40hc':    '40\' HC   (12.0 × 2.35 × 2.69 m)',
  'semi14':  'Semi 14.5 m (14.6 × 2.44 × 2.70 m)',
  'semi15':  'Semi 15.5 m (16.5 × 2.44 × 2.70 m)',
};

function fmt(n, dec = 2) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function usd(n) { return 'U$S ' + fmt(n); }

export function exportShipmentPDF({ containers, currentContainerType, shipmentName }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = margin;

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(dateStr, pageW - margin, 12, { align: 'right' });

  y = 26;
  doc.setTextColor(60, 50, 40);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(shipmentName || 'Resumen de embarque', margin, y);
  y += 8;

  // ── Por cada contenedor ────────────────────────────────────────────────────
  containers.forEach((cont, ci) => {
    const products = cont.products || [];
    if (products.length === 0) return;

    const totalVol    = products.reduce((s, p) => s + p.vol * p.qty, 0);
    const totalUnits  = products.reduce((s, p) => s + p.qty, 0);
    const totalWeight = products.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);
    const totalValue  = products.reduce((s, p) => s + (p.price || 0) * p.qty, 0);

    // Container info block
    if (ci > 0) y += 4;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(141, 121, 102);
    doc.text(`Contenedor ${ci + 1} — ${CONTAINER_LABELS[cont.type] || cont.type}`, margin, y);
    y += 5;

    // Stats row
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 85, 70);
    const stats = [
      `Unidades: ${totalUnits}`,
      `Volumen: ${fmt(totalVol)} m³`,
      `Peso: ${fmt(totalWeight, 1)} kg`,
      `Valor: ${usd(totalValue)}`,
    ];
    doc.text(stats.join('     '), margin, y);
    y += 6;

    // Products table
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Producto', 'Tipo', 'Dims (cm)', 'Cant.', 'Vol. total (m³)', 'Peso tot. (kg)', 'Precio/u', 'Subtotal']],
      body: products.map(p => [
        p.name,
        p.type === 'pallet' ? 'Pallet' : 'Caja',
        `${p.dims.L}×${p.dims.W}×${p.dims.H}`,
        p.qty,
        fmt(p.vol * p.qty),
        fmt((p.weight || 0) * p.qty, 1),
        p.price ? usd(p.price) : '—',
        p.price ? usd(p.price * p.qty) : '—',
      ]),
      foot: [[
        'TOTAL', '', '', totalUnits,
        fmt(totalVol),
        fmt(totalWeight, 1),
        '', usd(totalValue),
      ]],
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [60, 50, 40] },
      headStyles: { fillColor: [141, 121, 102], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [230, 220, 210], textColor: [60, 50, 40], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [250, 247, 243] },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 20, halign: 'right' },
      },
    });

    y = doc.lastAutoTable.finalY + 8;
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setTextColor(180, 165, 150);
  doc.setFont('helvetica', 'normal');
  doc.text('Generado por ImportaPro', margin, pageH - 8);
  doc.text('fleetloader.vercel.app', pageW - margin, pageH - 8, { align: 'right' });

  const filename = (shipmentName || 'embarque').replace(/\s+/g, '_').toLowerCase() + '.pdf';
  doc.save(filename);
}
