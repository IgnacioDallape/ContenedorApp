import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

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

export async function exportShipmentPDF({ containers, currentContainerType, shipmentName, shipmentId, views = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH0 = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = margin;

  // ── QR code (generate before first page) ──────────────────────────────────
  let qrDataUrl = null;
  if (shipmentId) {
    const shareUrl = `https://fleetloader.vercel.app/share/${shipmentId}`;
    try { qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 120, margin: 1 }); } catch {}
  }

  // ── Portada ────────────────────────────────────────────────────────────────
  // Full cover background
  doc.setFillColor(245, 240, 233);
  doc.rect(0, 0, pageW, pageH0, 'F');

  // Top accent bar
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de gestion de importacion y contenedores', margin, 30);
  doc.text('fleetloader.vercel.app', pageW - margin, 30, { align: 'right' });

  // Shipment name — centered below header
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const allPCover = containers.flatMap(c => c.products || []);
  const totUCover = allPCover.reduce((s, p) => s + p.qty, 0);
  const totVCover = allPCover.reduce((s, p) => s + p.vol * p.qty, 0);

  doc.setTextColor(60, 50, 40);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  const titleText = ascii(shipmentName || 'Resumen de embarque');
  doc.text(titleText, pageW / 2, 60, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 100, 80);
  doc.text(`Fecha: ${dateStr}`, pageW / 2, 71, { align: 'center' });
  doc.text(ascii(`${containers.length} contenedor(es)  |  ${totUCover} unidades  |  ${fmt(totVCover)} m3`), pageW / 2, 79, { align: 'center' });

  // Divider
  doc.setDrawColor(200, 185, 165);
  doc.line(margin * 2, 85, pageW - margin * 2, 85);

  // 3D view — perspective — centered in the cover
  const coverView = views.length > 0 ? views[0] : null;
  if (coverView) {
    const imgW = pageW - margin * 2;
    const imgH = imgW * 0.58;
    const imgY = 90;
    doc.addImage(coverView.dataUrl, 'JPEG', margin, imgY, imgW, imgH);
  }

  // QR code — bottom-right corner
  if (qrDataUrl) {
    const qrSize = 28;
    const qrX = pageW - margin - qrSize;
    const qrY = pageH0 - margin - qrSize - 10;
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(160, 140, 120);
    doc.text('Ver online', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
  }

  // Footer on cover
  doc.setFontSize(8);
  doc.setTextColor(180, 165, 150);
  doc.text('Generado por ImportaPro', margin, pageH0 - 10);
  doc.text('fleetloader.vercel.app', pageW - margin, pageH0 - 10, { align: 'right' });

  // ── Página 2+: detalle por contenedor ────────────────────────────────────
  doc.addPage();
  y = margin;

  // Header reusable
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 10);
  doc.text(ascii(shipmentName || 'Resumen de embarque'), pageW - margin, 10, { align: 'right' });
  y = 22;

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
      head: [['Producto', 'Tipo', 'Dims (cm)', 'Cant.', 'Vol. (m3)', 'Peso (kg)', 'Precio/u', 'Subtotal', 'Notas']],
      body: products.map(p => [
        ascii(p.name),
        p.type === 'pallet' ? 'Pallet' : 'Caja',
        `${p.dims.L}x${p.dims.W}x${p.dims.H}`,
        p.qty,
        fmt(p.vol * p.qty),
        fmt((p.weight || 0) * p.qty, 1),
        p.price ? usd(p.price) : '-',
        p.price ? usd(p.price * p.qty) : '-',
        ascii(p.notes || ''),
      ]),
      foot: [[
        'TOTAL', '', '', totalUnits,
        fmt(totalVol),
        fmt(totalWeight, 1),
        '', usd(totalValue), '',
      ]],
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [60, 50, 40] },
      headStyles: { fillColor: [141, 121, 102], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      footStyles: { fillColor: [230, 220, 210], textColor: [60, 50, 40], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [250, 247, 243] },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 13, halign: 'center' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 10, halign: 'center' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 16, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 27 },
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

  // ── Documentacion aduanera ────────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 10);
  doc.text(ascii(shipmentName || 'Resumen de embarque'), pageW - margin, 10, { align: 'right' });

  y = 22;
  const isSemiDoc = containers.some(c => c.type && c.type.startsWith('semi'));
  const hasValue  = containers.flatMap(c => c.products || []).some(p => p.price > 0);

  function docSection(title) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(141, 121, 102);
    doc.text(ascii(title), margin, y); y += 1;
    doc.setDrawColor(200, 185, 165); doc.line(margin, y, pageW - margin, y); y += 5;
  }
  function docBullet(required, text, detail) {
    if (y > 262) { doc.addPage(); y = 20; }
    const tag = required ? '[OBLIGATORIO]' : '[RECOMENDADO]';
    const tagColor = required ? [184, 92, 92] : [100, 140, 100];
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...tagColor);
    doc.text(tag, margin + 3, y);
    const tagW = doc.getTextWidth(tag) + 4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 50, 40);
    const mainLines = doc.splitTextToSize(ascii(text), pageW - margin * 2 - tagW - 6);
    doc.text(mainLines, margin + 3 + tagW, y);
    y += mainLines.length * 4.5;
    if (detail) {
      doc.setFontSize(7.5); doc.setTextColor(120, 100, 80); doc.setFont('helvetica', 'italic');
      const dLines = doc.splitTextToSize(ascii(detail), pageW - margin * 2 - 10);
      doc.text(dLines, margin + 8, y);
      y += dLines.length * 4 + 1;
    }
    y += 2;
  }

  docSection('Documentos requeridos para la importacion');
  docBullet(true,  'Factura Comercial (Commercial Invoice)', 'Debe incluir: descripcion detallada de la mercaderia, valor FOB, incoterm, datos del vendedor y comprador, pais de origen.');
  docBullet(true,  'Packing List', 'Lista detallada de bultos, dimensiones, pesos y contenido. Este PDF puede servir como base.');
  docBullet(true,  'Conocimiento de Embarque (Bill of Lading / Air Waybill)', isSemiDoc ? 'Para semis terrestres: Carta de Porte (CMR o similar segun el pais de origen).' : 'Emitido por la naviera. Debe coincidir con la factura comercial.');
  docBullet(true,  'Declaracion Aduanera (SIM/SIMI o equivalente)', 'Tramitar con el despachante de aduana antes del arribo de la mercaderia.');
  docBullet(true,  'Certificado de Origen', 'Necesario para aplicar preferencias arancelarias (Mercosur, acuerdos bilaterales). Emitido en el pais exportador.');
  if (hasValue) {
    docBullet(true, 'Comprobante de pago / Swift bancario', 'Respaldo del pago al proveedor. Requerido por ARCA (ex-AFIP) para la liquidacion de divisas.');
  }
  docBullet(false, 'Seguro de carga (Certificate of Insurance)', 'Recomendado para embarques con valor alto. Cubre perdidas o danos durante el transporte.');
  docBullet(false, 'Certificados de calidad o conformidad', 'Puede ser exigido segun el tipo de producto (electronica, alimentos, textiles, etc.).');
  y += 2;

  docSection('Aranceles estimados (China - Argentina)');
  docBullet(false, 'Derecho de Importacion (DI): 20% sobre valor CIF', 'Variable segun posicion arancelaria NCM. Verificar con tu despachante.');
  docBullet(false, 'IVA importacion: 21% (o 10.5% para ciertos productos)', 'Se calcula sobre valor CIF + DI.');
  docBullet(false, 'Tasa estadistica: 3% sobre valor CIF', 'Aplicable a la mayoria de las importaciones.');
  docBullet(false, 'Gastos de despachante + agente maritimo', 'Variable. Estimar entre USD 300 y USD 800 para un contenedor estandar.');
  y += 4;

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
