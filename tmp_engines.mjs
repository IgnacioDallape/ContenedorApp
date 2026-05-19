// Comparar resultado de cada motor por separado
// Hack: importar funciones internas via re-export
import { readFileSync, writeFileSync } from 'fs';

// Inyectar exports temporarios al palletStore
const path = './src/stores/palletStore.js';
const orig = readFileSync(path, 'utf8');
const patched = orig + `
export { pb_runLayerPacking, pb_runPackingContainerLike, pb_compactPackedLayout, pb_gravitySettle, pb_dropFloaters, pb_centerPackedLayout, pb_alignLoneApex };
`;
writeFileSync(path, patched);

try {
  const m = await import('./src/stores/palletStore.js');
  const products = [
    { id: 'p1', name: 'AlfChica',  color: '#a', qty: 80, dims: { L: 22, W: 22, H: 22 }, weight: 1 },
    { id: 'p2', name: 'AlfMed',    color: '#b', qty: 5,  dims: { L: 40, W: 40, H: 40 }, weight: 7 },
    { id: 'p3', name: 'AlfMed2',   color: '#c', qty: 4,  dims: { L: 60, W: 40, H: 50 }, weight: 38 },
    { id: 'p4', name: 'fundas',    color: '#d', qty: 7,  dims: { L: 60, W: 30, H: 30 }, weight: 50 },
    { id: 'p5', name: 'faja',      color: '#e', qty: 12, dims: { L: 40, W: 40, H: 40 }, weight: 7 },
    { id: 'p6', name: 'Silla',     color: '#f', qty: 3,  dims: { L: 83, W: 20, H: 10 }, weight: 4.5 },
    { id: 'p7', name: 'sand',      color: '#g', qty: 8,  dims: { L: 40, W: 20, H: 20 }, weight: 2 },
    { id: 'p8', name: 'AlfMed2b',  color: '#h', qty: 3,  dims: { L: 60, W: 40, H: 50 }, weight: 38 },
  ];
  const palL = 120, palW = 100, maxH = 240;

  function analyze(name, packed) {
    const byY = new Map();
    for (const b of packed) {
      const k = Math.round(b.y);
      if (!byY.has(k)) byY.set(k, []);
      byY.get(k).push(b);
    }
    let totalVoid = 0;
    for (const layer of byY.values()) {
      if (layer.length < 2) continue;
      const minX = Math.min(...layer.map(b => b.x));
      const maxX = Math.max(...layer.map(b => b.x + b.dX));
      const minZ = Math.min(...layer.map(b => b.z));
      const maxZ = Math.max(...layer.map(b => b.z + b.dZ));
      const bboxArea = (maxX - minX) * (maxZ - minZ);
      const filledArea = layer.reduce((s, b) => s + b.dX * b.dZ, 0);
      totalVoid += Math.max(0, bboxArea - filledArea);
    }
    const top = packed.length ? Math.max(...packed.map(b => b.y + b.dY)) : 0;
    console.log(`${name.padEnd(28)} ${packed.length.toString().padStart(3)} cajas, ${byY.size.toString().padStart(2)} capas, top=${top.toString().padStart(3)}cm, void=${totalVoid.toString().padStart(5)}cm²`);
  }

  const layerOnly = m.pb_runLayerPacking(products, palL, palW, maxH);
  analyze('Layer engine (puro)', layerOnly);

  for (const v of ['auto', 'grid', 'low-height', 'layers']) {
    const r = m.pb_runPackingContainerLike(products, palL, palW, maxH, v, Date.now() + 3000);
    analyze(`Container ${v}`, r);
  }

  const full = m.pb_runPacking(products, palL, palW, maxH);
  analyze('pb_runPacking (ganador)', full);
} finally {
  writeFileSync(path, orig);
}
