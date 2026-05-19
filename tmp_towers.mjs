// Reproducir el caso de las 3 torres separadas con canales vacíos
import usePalletStore, { pb_runPacking } from './src/stores/palletStore.js';

const products = [
  { id: 'p1', name: 'AlfChica',  color: '#a86b3a', qty: 80, dims: { L: 22, W: 22, H: 22 }, weight: 1 },
  { id: 'p2', name: 'AlfMed',    color: '#3a6b4a', qty: 5,  dims: { L: 40, W: 40, H: 40 }, weight: 7 },
  { id: 'p3', name: 'AlfMed2',   color: '#5b3a2a', qty: 4,  dims: { L: 60, W: 40, H: 50 }, weight: 38 },
  { id: 'p4', name: 'fundas',    color: '#4a3a2a', qty: 7,  dims: { L: 60, W: 30, H: 30 }, weight: 50 },
  { id: 'p5', name: 'faja',      color: '#5b8c5e', qty: 12, dims: { L: 40, W: 40, H: 40 }, weight: 7 },
  { id: 'p6', name: 'Silla',     color: '#a3a3a3', qty: 3,  dims: { L: 83, W: 20, H: 10 }, weight: 4.5 },
  { id: 'p7', name: 'sand',      color: '#b85a3a', qty: 8,  dims: { L: 40, W: 20, H: 20 }, weight: 2 },
  { id: 'p8', name: 'AlfMed2b',  color: '#3a8c5e', qty: 3,  dims: { L: 60, W: 40, H: 50 }, weight: 38 },
];

const palL = 120, palW = 100, maxH = 240;

// Solo pb_runPacking (sin build pipeline) — para ver el resultado puro
console.log('=== pb_runPacking ÚNICO PALLET ===');
const t0 = Date.now();
const packed = pb_runPacking(products, palL, palW, maxH);
const dt = Date.now() - t0;

console.log(`${packed.length} cajas en ${dt}ms`);

// Histograma por Y
const byY = new Map();
for (const b of packed) {
  const k = Math.round(b.y);
  if (!byY.has(k)) byY.set(k, []);
  byY.get(k).push(b);
}
const ys = [...byY.keys()].sort((a,b)=>a-b);
console.log(`\nCapas: ${ys.length} (top=${Math.max(...packed.map(b=>b.y+b.dY))}cm)`);

// Análisis de cobertura por capa
for (const y of ys) {
  const layer = byY.get(y);
  const area = layer.reduce((s,b) => s + b.dX*b.dZ, 0);
  const pct = (area / (palL*palW) * 100).toFixed(0);
  // bounding box de la capa
  const minX = Math.min(...layer.map(b => b.x));
  const maxX = Math.max(...layer.map(b => b.x + b.dX));
  const minZ = Math.min(...layer.map(b => b.z));
  const maxZ = Math.max(...layer.map(b => b.z + b.dZ));
  const bbArea = (maxX-minX)*(maxZ-minZ);
  const voidPct = ((bbArea - area) / bbArea * 100).toFixed(0);
  console.log(`  y=${y.toString().padStart(3)}: ${layer.length.toString().padStart(3)} cajas, ` +
    `fill=${pct.padStart(2)}%, ` +
    `bbox=(${minX}..${maxX}, ${minZ}..${maxZ}) ${(maxX-minX)}×${(maxZ-minZ)}, ` +
    `voids_in_bbox=${voidPct.padStart(2)}%`);
}

// Detectar canales internos: a cada y, ¿hay un cuadrado vacío grande dentro del bbox?
console.log('\nCanales internos (huecos > 15×15 dentro del bounding box de la capa):');
for (const y of ys) {
  const layer = byY.get(y);
  if (layer.length < 4) continue;
  const minX = Math.min(...layer.map(b => b.x));
  const maxX = Math.max(...layer.map(b => b.x + b.dX));
  const minZ = Math.min(...layer.map(b => b.z));
  const maxZ = Math.max(...layer.map(b => b.z + b.dZ));
  // Sample positions inside bbox
  const stepX = 2;
  let voidCells = 0;
  for (let x = minX; x < maxX; x += stepX) {
    for (let z = minZ; z < maxZ; z += stepX) {
      const inside = layer.some(b =>
        x >= b.x - 0.1 && x < b.x + b.dX - 0.1 &&
        z >= b.z - 0.1 && z < b.z + b.dZ - 0.1
      );
      if (!inside) voidCells++;
    }
  }
  const totalCells = ((maxX-minX)/stepX) * ((maxZ-minZ)/stepX);
  const voidPct = (voidCells/totalCells*100).toFixed(0);
  if (voidCells * stepX * stepX > 225) { // >15×15
    console.log(`  y=${y}: ${voidCells * stepX*stepX} cm² huecos internos (${voidPct}% del bbox de capa)`);
  }
}
