import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { PB_PALLET_TYPES } from './constants.js';

function fmt(n, dec = 2) { return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function usd(n) { return 'U$S ' + fmt(n); }
function ascii(str) {
  return String(str || '')
    .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u')
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U')
    .replace(/ñ/g,'n').replace(/Ñ/g,'N').replace(/ü/g,'u').replace(/Ü/g,'U')
    .replace(/¿/g,'').replace(/¡/g,'');
}

const PALLET_SHARE_ORIGIN = 'https://fleetloader.vercel.app';

export async function exportPalletPDF({ palletName, palletId, palletType, maxHeight, products, results, snapshots = [], tracking }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;

  const pt = PB_PALLET_TYPES[palletType] || { L: 120, W: 100, label: palletType };
  const totalBoxes = results.reduce((s, r) => s + (r.boxes?.length || 0), 0);
  const totalWeight = results.reduce((s, r) => s + (Number(r.totalWeight) || 0), 0);
  const totalValue = products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.qty) || 0), 0);

  // QR code
  let qrDataUrl = null;
  if (palletId) {
    const shareUrl = `${PALLET_SHARE_ORIGIN}/share/pallet/${palletId}`;
    try { qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 120, margin: 1 }); } catch {}
  }

  // ── PORTADA ──
  doc.setFillColor(245, 240, 233);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 20);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Armado de pallets', margin, 30);
  doc.text('fleetloader.vercel.app', pageW - margin, 30, { align: 'right' });

  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  doc.setTextColor(60, 50, 40);
  doc.setFontSize(26); doc.setFont('helvetica', 'bold');
  doc.text(ascii(palletName || 'Pallet sin nombre'), pageW / 2, 60, { align: 'center' });

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 100, 80);
  doc.text(`Fecha: ${dateStr}`, pageW / 2, 71, { align: 'center' });
  doc.text(ascii(`${results.length} pallet(s)  |  ${totalBoxes} cajas  |  ${fmt(totalWeight, 1)} kg`), pageW / 2, 79, { align: 'center' });
  doc.setDrawColor(200, 185, 165);
  doc.line(margin * 2, 85, pageW - margin * 2, 85);

  // Imagen del pallet activo en portada
  if (snapshots[0]) {
    const imgW = pageW - margin * 2;
    const imgH = imgW * 0.62;
    doc.addImage(snapshots[0].dataUrl, 'JPEG', margin, 90, imgW, imgH);
  }

  // QR
  if (qrDataUrl) {
    const qrSize = 28;
    const qrX = pageW - margin - qrSize;
    const qrY = pageH - margin - qrSize - 10;
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(160, 140, 120);
    doc.text('Ver online', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
  }

  doc.setFontSize(8);
  doc.setTextColor(180, 165, 150);
  doc.text('Generado por ImportaPro', margin, pageH - 10);
  doc.text('fleetloader.vercel.app', pageW - margin, pageH - 10, { align: 'right' });

  // ── PÁGINA: resumen general ──
  doc.addPage();
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 10);
  doc.text(ascii(palletName || 'Pallet'), pageW - margin, 10, { align: 'right' });
  let y = 24;

  doc.setTextColor(141, 121, 102);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Resumen general', margin, y); y += 7;

  doc.setTextColor(80, 65, 50);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const summaryLines = [
    `Tipo de pallet: ${pt.label || palletType} (${pt.L}×${pt.W} cm)`,
    `Altura maxima: ${maxHeight} cm`,
    `Total pallets armados: ${results.length}`,
    `Total cajas: ${totalBoxes}`,
    `Peso total: ${fmt(totalWeight, 1)} kg`,
    totalValue > 0 ? `Valor total: ${usd(totalValue)}` : null,
    tracking ? `Link de seguimiento: ${tracking}` : null,
  ].filter(Boolean);
  summaryLines.forEach(line => { doc.text(ascii(line), margin, y); y += 5; });
  y += 4;

  // Tabla resumen de productos
  doc.setTextColor(141, 121, 102);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Productos cargados', margin, y); y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Producto', 'Dims (cm)', 'Cant.', 'Peso/u', 'Peso total', 'Precio/u', 'Subtotal']],
    body: products.map(p => {
      const w = Number(p.weight) || 0;
      const q = Number(p.qty) || 0;
      const price = Number(p.price) || 0;
      return [
        ascii(p.name),
        `${p.dims.L}x${p.dims.W}x${p.dims.H}`,
        q,
        w > 0 ? fmt(w, 2) + ' kg' : '-',
        w > 0 ? fmt(w * q, 1) + ' kg' : '-',
        price > 0 ? usd(price) : '-',
        price > 0 ? usd(price * q) : '-',
      ];
    }),
    foot: [[
      'TOTAL', '',
      products.reduce((s, p) => s + (Number(p.qty) || 0), 0),
      '',
      fmt(products.reduce((s, p) => s + (Number(p.weight) || 0) * (Number(p.qty) || 0), 0), 1) + ' kg',
      '',
      totalValue > 0 ? usd(totalValue) : '-',
    ]],
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [60, 50, 40] },
    headStyles: { fillColor: [141, 121, 102], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [230, 220, 210], textColor: [60, 50, 40], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 247, 243] },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
  });

  // ── PÁGINAS: una por pallet con foto + detalle ──
  results.forEach((r, i) => {
    doc.addPage();
    doc.setFillColor(141, 121, 102);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ImportaPro', margin, 10);
    doc.text(ascii(`Pallet ${i + 1} de ${results.length}`), pageW - margin, 10, { align: 'right' });

    let py = 24;
    doc.setTextColor(141, 121, 102);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(`Pallet ${i + 1}`, margin, py); py += 8;

    doc.setTextColor(80, 65, 50);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    const stats = [
      `Cajas: ${r.boxes?.length || 0}`,
      `Altura: ${r.totalHeight || 0} cm`,
      `Peso: ${fmt(r.totalWeight || 0, 1)} kg`,
      `Base: ${r.palL}x${r.palW} cm`,
    ];
    doc.text(ascii(stats.join('   |   ')), margin, py); py += 6;

    // Foto del pallet
    const snap = snapshots.find(s => s.idx === i);
    if (snap) {
      const imgW = pageW - margin * 2;
      const imgH = imgW * 0.55;
      doc.addImage(snap.dataUrl, 'JPEG', margin, py, imgW, imgH);
      py += imgH + 6;
    }

    // Tabla por producto en este pallet
    const byId = new Map();
    (r.boxes || []).forEach(b => {
      if (!byId.has(b.id)) byId.set(b.id, { name: b.name, count: 0, weight: 0 });
      const e = byId.get(b.id);
      e.count++;
      e.weight += Number(b.weight) || 0;
    });
    const prodById = new Map(products.map(p => [p.id, p]));
    const rows = [...byId.entries()].map(([id, e]) => {
      const p = prodById.get(id);
      const price = Number(p?.price) || 0;
      return [
        ascii(e.name),
        p ? `${p.dims.L}x${p.dims.W}x${p.dims.H}` : '-',
        e.count,
        fmt(e.weight, 1) + ' kg',
        price > 0 ? usd(price) : '-',
        price > 0 ? usd(price * e.count) : '-',
      ];
    });

    autoTable(doc, {
      startY: py,
      margin: { left: margin, right: margin },
      head: [['Producto', 'Dims (cm)', 'Cant.', 'Peso', 'Precio/u', 'Subtotal']],
      body: rows,
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [60, 50, 40] },
      headStyles: { fillColor: [141, 121, 102], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 247, 243] },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
    });
  });

  // ── PÁGINA: Guía de carga ──
  doc.addPage();
  doc.setFillColor(141, 121, 102);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('ImportaPro', margin, 10);
  doc.text('Guia de carga', pageW - margin, 10, { align: 'right' });

  let gy = 24;
  doc.setTextColor(141, 121, 102);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Guia de carga del pallet', margin, gy); gy += 9;

  doc.setTextColor(80, 65, 50);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');

  // Construir capas por Y para guía de carga
  function guideForPallet(r, idx) {
    if (gy > pageH - 40) { doc.addPage(); gy = 24; }
    doc.setTextColor(141, 121, 102);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`Pallet ${idx + 1} — ${r.boxes?.length || 0} cajas`, margin, gy); gy += 6;

    // Agrupar boxes por nivel Y
    const byY = new Map();
    (r.boxes || []).forEach(b => {
      const k = Math.round(b.y);
      if (!byY.has(k)) byY.set(k, []);
      byY.get(k).push(b);
    });
    const levels = [...byY.entries()].sort(([a], [b]) => a - b);

    doc.setTextColor(80, 65, 50);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    levels.forEach(([yLvl, boxes], li) => {
      if (gy > pageH - 30) { doc.addPage(); gy = 24; }
      const byName = new Map();
      boxes.forEach(b => byName.set(b.name, (byName.get(b.name) || 0) + 1));
      const desc = [...byName.entries()].map(([n, c]) => `${c}x ${n}`).join(', ');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(141, 121, 102);
      const layerNum = li + 1;
      const yStr = yLvl === 0 ? 'BASE (y=0)' : `Capa ${layerNum} (y=${yLvl}cm)`;
      doc.text(ascii(yStr), margin, gy); gy += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 65, 50);
      const wrapped = doc.splitTextToSize(ascii(`Colocar: ${desc}`), pageW - margin * 2);
      wrapped.forEach(line => { doc.text(line, margin + 4, gy); gy += 4.5; });
      gy += 1.5;
    });
    gy += 4;
  }

  results.forEach((r, i) => guideForPallet(r, i));

  // Recomendaciones generales
  if (gy > pageH - 50) { doc.addPage(); gy = 24; }
  doc.setTextColor(141, 121, 102);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Recomendaciones generales', margin, gy); gy += 7;

  doc.setTextColor(80, 65, 50);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const tips = [
    '1. Cargar siempre desde la BASE hacia arriba, respetando el orden de capas listado.',
    '2. Las cajas pesadas van abajo, las livianas arriba.',
    '3. Mantener la cara mas larga apoyada en el pallet salvo indicacion contraria.',
    '4. Verificar estabilidad de cada capa antes de armar la siguiente.',
    '5. Usar film stretch en sentido horario, comenzando por la base y subiendo en espiral.',
    '6. Etiqueta de identificacion: pegar en una cara visible del pallet armado.',
    '7. Si el pallet se mueve por logistica externa, escanear el QR de la portada para ver online.',
  ];
  tips.forEach(t => {
    const wrapped = doc.splitTextToSize(ascii(t), pageW - margin * 2);
    wrapped.forEach(line => {
      if (gy > pageH - 15) { doc.addPage(); gy = 24; }
      doc.text(line, margin, gy); gy += 5;
    });
    gy += 1.5;
  });

  // ── Guardar ──
  const safeName = ascii(palletName || 'pallet').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  doc.save(`${safeName}_${dateStr.replace(/\//g, '-')}.pdf`);
}
