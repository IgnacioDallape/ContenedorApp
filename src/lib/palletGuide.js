// Helpers puros para la guía de armado del PDF de pallet. Extraídos de
// exportPalletPDF.js para poder testearlos sin cargar jsPDF. Describen la
// posición y la orientación de una caja en lenguaje humano (es-AR).

/** "el centro del pallet" / "la esquina trasera izquierda" / "la zona delantera"… */
export function posDescription(box, palL, palW) {
  const cx = box.x + box.dX / 2;
  const cz = box.z + box.dZ / 2;
  // Eje X (largo, 0 → palL): izquierda / centro / derecha
  let xPart;
  if (cx < palL * 0.33) xPart = 'izquierda';
  else if (cx > palL * 0.67) xPart = 'derecha';
  else xPart = 'centro';
  // Eje Z (ancho, 0 → palW): trasera / central / delantera
  let zPart;
  if (cz < palW * 0.33) zPart = 'trasera';
  else if (cz > palW * 0.67) zPart = 'delantera';
  else zPart = 'central';
  if (xPart === 'centro' && zPart === 'central') return 'el centro del pallet';
  if (xPart === 'centro') return `la zona ${zPart}`;
  if (zPart === 'central') return `la zona central ${xPart}`;
  return `la esquina ${zPart} ${xPart}`;
}

/** "parada" / "acostada" / "de costado", o null si es cubo (orientación irrelevante). */
export function orientationDescription(box) {
  const src = box.sourceDims || { L: box.dX, W: box.dZ, H: box.dY };
  const dims = [src.L, src.W, src.H];
  const maxD = Math.max(...dims);
  const minD = Math.min(...dims);
  if (Math.abs(maxD - minD) < 0.5) return null; // cubo
  const isStanding = Math.abs(box.dY - maxD) < 0.5;
  const isLying = Math.abs(box.dY - minD) < 0.5;
  if (isStanding) return 'parada';
  if (isLying) return 'acostada';
  return 'de costado';
}

/** Pluraliza la orientación según la cantidad. */
export function pluralOri(ori, count) {
  if (!ori) return null;
  if (count <= 1) return ori;
  if (ori === 'parada') return 'paradas';
  if (ori === 'acostada') return 'acostadas';
  return ori; // "de costado" no cambia
}
