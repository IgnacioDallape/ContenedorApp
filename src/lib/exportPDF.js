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

// jsPDF helvetica no soporta tildes/ñ — convertir a ASCII
function ascii(str) {
  return str
    .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u')
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U')
    .replace(/ñ/g,'n').replace(/Ñ/g,'N').replace(/ü/g,'u').replace(/Ü/g,'U')
    .replace(/¿/g,'').replace(/¡/g,'');
}

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
  doc.text(ascii(shipmentName || 'Resumen de embarque'), margin, y);
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
    doc.text(ascii(`Contenedor ${ci + 1} - ${CONTAINER_LABELS[cont.type] || cont.type}`), margin, y);
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
    doc.text(ascii(stats.join('     ')), margin, y);
    y += 6;

    // Products table
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Producto', 'Tipo', 'Dims (cm)', 'Cant.', 'Vol. total (m3)', 'Peso tot. (kg)', 'Precio/u', 'Subtotal']],
      body: products.map(p => [
        ascii(p.name),
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
      doc.text('ImportaPro - Visualizacion 3D', margin, 7);

      // Label
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(141, 121, 102);
      doc.text(ascii(v.label), pageW / 2, 22, { align: 'center' });

      // Image centered vertically
      const iy = (pageH - imgH) / 2 - 4;
      doc.addImage(v.dataUrl, 'JPEG', margin, iy, imgW, imgH);
    });
  }

  // ── Instrucciones de carga ────────────────────────────────────────────────
  doc.addPage();

  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Instrucciones de carga', margin, 12);

  // Datos reales
  const allProducts = containers.flatMap(c => c.products || []);
  const pallets  = allProducts.filter(p => p.type === 'pallet');
  const boxes    = allProducts.filter(p => p.type !== 'pallet');
  const heavy    = [...allProducts].filter(p => p.weight > 0).sort((a, b) => b.weight - a.weight);
  const byVol    = [...allProducts].sort((a, b) => (b.dims.L*b.dims.W*b.dims.H) - (a.dims.L*a.dims.W*a.dims.H));
  const withZone = allProducts.filter(p => p.priorityZone);
  const totU = allProducts.reduce((s, p) => s + p.qty, 0);
  const totV = allProducts.reduce((s, p) => s + p.vol * p.qty, 0);
  const totW = allProducts.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);

  let iy = 28;

  function section(title) {
    if (iy > 240) { doc.addPage(); iy = 20; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(141, 121, 102);
    doc.text(ascii(title), margin, iy);
    iy += 1;
    doc.setDrawColor(200, 185, 165);
    doc.line(margin, iy, pageW - margin, iy);
    iy += 5;
  }

  function bullet(prefix, text) {
    if (iy > 265) { doc.addPage(); iy = 20; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 50, 40);
    const full = ascii(`${prefix}  ${text}`);
    const lines = doc.splitTextToSize(full, pageW - margin * 2 - 6);
    doc.text(lines, margin + 3, iy);
    iy += lines.length * 5 + 2;
  }

  function note(text) {
    if (iy > 265) { doc.addPage(); iy = 20; }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120, 100, 80);
    const lines = doc.splitTextToSize(ascii(text), pageW - margin * 2 - 6);
    doc.text(lines, margin + 3, iy);
    iy += lines.length * 4.5 + 2;
  }

  // ── 1. Orden de carga ────────────────────────────────────────────────────
  section('1. Orden de carga recomendado');

  let step = 1;
  if (pallets.length > 0) {
    const palletNames = pallets.map(p => p.name).join(', ');
    bullet(`${step++}.`, `PRIMERO: Los pallets (${palletNames}). Son los bultos mas grandes y pesados — entran primero, bien asentados en el piso del contenedor.`);
  }
  if (byVol.length > 0) {
    const bigBoxes = byVol.filter(p => p.type !== 'pallet').slice(0, 3);
    if (bigBoxes.length > 0) {
      const names = bigBoxes.map(p => `${p.name} (${p.dims.L}x${p.dims.W}x${p.dims.H} cm)`).join(' / ');
      bullet(`${step++}.`, `SEGUNDO: Las cajas mas grandes y pesadas al fondo. Empeza con: ${names}.`);
    }
  }
  const smallBoxes = byVol.filter(p => p.type !== 'pallet').slice(-Math.min(3, boxes.length));
  if (smallBoxes.length > 0) {
    const names = smallBoxes.map(p => p.name).join(', ');
    bullet(`${step++}.`, `ULTIMO: Productos mas pequenos al final y arriba: ${names}. Usalos para rellenar huecos.`);
  }
  if (withZone.length > 0) {
    const zoneProds = withZone.map(p => p.name).join(', ');
    bullet('!', `ATENCION — Zona de prioridad: ${zoneProds}. Estos productos tienen posicion fija segun la configuracion del embarque. No moverlos de su sector.`);
  }
  iy += 2;

  // ── 2. Distribución del peso ─────────────────────────────────────────────
  section('2. Distribucion del peso');

  if (heavy.length > 0) {
    const top3 = heavy.slice(0, 3).map(p => `${p.name} (${fmt(p.weight, 1)} kg/u)`).join(', ');
    bullet('-', `Los productos mas pesados siempre en la parte INFERIOR: ${top3}.`);
    bullet('-', 'Nunca apiles productos pesados sobre cajas livianas o fragiles.');
  } else {
    bullet('-', 'No se cargo informacion de peso. Colocar manualmente los productos mas densos en la parte inferior.');
  }

  if (totW > 0) {
    const weightPct = totW;
    bullet('-', `Peso total del embarque: ${fmt(totW, 0)} kg. Distribuirlo de forma uniforme entre lado izquierdo y derecho para evitar ladeo durante el transporte.`);
    if (totW > 20000) {
      bullet('!', `AVISO: El peso total supera las 20 toneladas. Verificar el limite de carga del contenedor antes de cerrar.`);
    }
  } else {
    bullet('-', 'Distribuir el peso de forma uniforme entre lado izquierdo y derecho del contenedor.');
  }
  iy += 2;

  // ── 3. Estiba ────────────────────────────────────────────────────────────
  section('3. Estiba y aseguramiento');
  bullet('-', 'Usar esquineros de carton o madera en los cantos de las cajas para proteger bordes.');
  bullet('-', 'Flejar o envolver con film stretch cada pallet antes de ingresarlo al contenedor.');
  bullet('-', 'Rellenar todos los espacios vacios con relleno (bolsas de aire, espuma o papel kraft) para evitar movimiento durante la navegacion.');
  bullet('-', 'Si hay cajas de distintos tamanos, intercalar capas para lograr una pared solida sin huecos verticales.');
  note('Tip: una carga bien estibada no se mueve. Si al sacudir el contenedor se escucha movimiento, agregar mas relleno.');
  iy += 2;

  // ── 4. Resumen ───────────────────────────────────────────────────────────
  section('4. Resumen del embarque');
  bullet('>', `${containers.length} contenedor(es) | ${totU} unidades | ${fmt(totV)} m3 | ${fmt(totW, 0)} kg`);
  if (totW > 0 && totV > 0) {
    const dens = totW / totV;
    let densLabel = 'baja (carga liviana o con mucho aire)';
    if (dens > 300) densLabel = 'media';
    if (dens > 600) densLabel = 'alta (carga densa)';
    bullet('>', `Densidad de carga: ${fmt(dens, 0)} kg/m3 — ${densLabel}.`);
  }
  bullet('>', 'Pegar el packing list en el interior de la puerta del contenedor antes de cerrar.');
  iy += 2;

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
