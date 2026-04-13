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

export function exportShipmentPDF({ containers, currentContainerType, shipmentName, views = [] }) {
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

  // ── Vistas 3D — una página por vista ──────────────────────────────────────
  if (views.length > 0) {
    const pageH = doc.internal.pageSize.getHeight();
    const imgW = pageW - margin * 2;
    const imgH = imgW * 0.58;

    views.forEach(v => {
      doc.addPage();

      // Mini header
      doc.setFillColor(141, 121, 102);
      doc.rect(0, 0, pageW, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('ImportaPro — Visualización 3D', margin, 7);

      // Label
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(141, 121, 102);
      doc.text(v.label, pageW / 2, 22, { align: 'center' });

      // Image centered vertically
      const iy = (pageH - imgH) / 2 - 4;
      doc.addImage(v.dataUrl, 'JPEG', margin, iy, imgW, imgH);
    });
  }

  // ── Instrucciones de carga ────────────────────────────────────────────────
  doc.addPage();
  const pageH2 = doc.internal.pageSize.getHeight();

  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Instrucciones de carga', margin, 12);

  // Calcular datos reales de todos los contenedores
  const allProducts = containers.flatMap(c => c.products || []);
  const pallets   = allProducts.filter(p => p.type === 'pallet');
  const boxes     = allProducts.filter(p => p.type !== 'pallet');
  const heavy     = [...allProducts].filter(p => p.weight > 0).sort((a, b) => b.weight - a.weight);
  const byVol     = [...allProducts].sort((a, b) => (b.dims.L*b.dims.W*b.dims.H) - (a.dims.L*a.dims.W*a.dims.H));
  const withZone  = allProducts.filter(p => p.priorityZone);

  let iy = 28;

  function section(title) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(141, 121, 102);
    doc.text(title, margin, iy);
    iy += 1;
    doc.setDrawColor(200, 185, 165);
    doc.line(margin, iy, pageW - margin, iy);
    iy += 5;
  }

  function bullet(icon, text) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 50, 40);
    const lines = doc.splitTextToSize(`${icon}  ${text}`, pageW - margin * 2 - 6);
    doc.text(lines, margin + 3, iy);
    iy += lines.length * 5 + 1;
  }

  // 1. Orden de carga
  section('1. Orden de carga recomendado');
  if (pallets.length > 0) {
    bullet('①', `Cargá primero los ${pallets.length} pallet(s) — van en la base del contenedor por su mayor volumen y peso.`);
  }
  if (byVol.length > 0) {
    const top = byVol.slice(0, 3).map(p => `${p.name} (${p.dims.L}×${p.dims.W}×${p.dims.H} cm)`).join(', ');
    bullet('②', `Luego las cajas más grandes primero: ${top}.`);
  }
  bullet('③', 'Finalizá con los productos más pequeños y livianos, rellenando los espacios vacíos.');
  if (withZone.length > 0) {
    const zoneNames = [...new Set(withZone.map(p => p.priorityZone))].join(', ');
    bullet('⚠', `Respetá las zonas de prioridad configuradas: ${zoneNames}. Estos productos deben ir en el sector indicado.`);
  }
  iy += 2;

  // 2. Distribución del peso
  section('2. Distribución del peso');
  if (heavy.length > 0) {
    const top = heavy.slice(0, 3).map(p => `${p.name} (${fmt(p.weight, 1)} kg/u)`).join(', ');
    bullet('⬇', `Los más pesados van en la parte inferior: ${top}.`);
  }
  bullet('↔', 'Distribuí el peso de forma uniforme entre lado izquierdo y derecho del contenedor para evitar vuelcos.');
  bullet('↑', 'Nunca apilés productos pesados sobre frágiles. Los livianos siempre arriba.');
  iy += 2;

  // 3. Estiba y seguridad
  section('3. Estiba y aseguramiento');
  bullet('📦', 'Usá esquineros de cartón o madera en los cantos de las cajas para proteger bordes durante el transporte.');
  bullet('🔒', 'Flejá o envolvé con film stretch los pallets antes de introducirlos al contenedor.');
  bullet('🧱', 'Completá los espacios vacíos con relleno (aire, espuma, papel) para evitar movimiento durante el viaje.');
  bullet('📋', 'Pegá la lista de contenido (packing list) en el interior de la puerta del contenedor.');
  iy += 2;

  // 4. Resumen rápido
  section('4. Resumen del embarque');
  const totU = allProducts.reduce((s, p) => s + p.qty, 0);
  const totV = allProducts.reduce((s, p) => s + p.vol * p.qty, 0);
  const totW = allProducts.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);
  bullet('📊', `Total: ${totU} unidades · ${fmt(totV)} m³ · ${fmt(totW, 1)} kg en ${containers.length} contenedor(es).`);
  if (totW > 0) {
    const densidad = totW / totV;
    bullet('⚖', `Densidad promedio de carga: ${fmt(densidad, 1)} kg/m³.`);
  }

  // ── Footer en todas las páginas ────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(180, 165, 150);
    doc.setFont('helvetica', 'normal');
    doc.text('Generado por ImportaPro', margin, pageH - 8);
    doc.text('fleetloader.vercel.app', pageW - margin, pageH - 8, { align: 'right' });
    doc.text(`${p} / ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
  }

  const filename = (shipmentName || 'embarque').replace(/\s+/g, '_').toLowerCase() + '.pdf';
  doc.save(filename);
}
