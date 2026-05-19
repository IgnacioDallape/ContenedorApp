import { readFileSync, writeFileSync } from 'fs';

const path = './src/stores/palletStore.js';
const orig = readFileSync(path, 'utf8');
// Inject console.log into pb_runPacking
const patched = orig.replace(
  'export function pb_runPacking(products, palL, palW, maxH) {',
  `export function pb_runPacking(products, palL, palW, maxH) {
    const _trace = (name, r) => {
      const byY = new Map();
      for (const b of r) { const k = Math.round(b.y); if (!byY.has(k)) byY.set(k, []); byY.get(k).push(b); }
      let tv = 0;
      for (const layer of byY.values()) {
        if (layer.length < 2) continue;
        const minX = Math.min(...layer.map(b => b.x));
        const maxX = Math.max(...layer.map(b => b.x + b.dX));
        const minZ = Math.min(...layer.map(b => b.z));
        const maxZ = Math.max(...layer.map(b => b.z + b.dZ));
        const filled = layer.reduce((s,b) => s + b.dX*b.dZ, 0);
        tv += Math.max(0, (maxX-minX)*(maxZ-minZ) - filled);
      }
      const top = r.length ? Math.max(...r.map(b => b.y + b.dY)) : 0;
      console.log('  '+name.padEnd(22)+' n=' + r.length + ' top=' + top + ' layers=' + byY.size + ' void=' + tv);
    };
    const _origBetter = pb_isBetterLayout;
    let _checkpoint = '';
    `,
).replace(
  'const layerResult = normalize(pb_runLayerPacking(products, palL, palW, maxH));',
  `const layerResult = normalize(pb_runLayerPacking(products, palL, palW, maxH));
  _trace('LAYER', layerResult);`
).replace(
  'const result = normalize(pb_runPackingContainerLike(products, palL, palW, maxH, variant, variantDeadline));',
  `const result = normalize(pb_runPackingContainerLike(products, palL, palW, maxH, variant, variantDeadline));
  _trace('container ' + variant, result);`
).replace(
  "const oldResult = normalize(runPalletPacking(products, { palL, palW, maxH, variant: 'auto' }));",
  `const oldResult = normalize(runPalletPacking(products, { palL, palW, maxH, variant: 'auto' }));
  _trace('OLD engine', oldResult);`
).replace(
  '  return best;\n}\n\nfunction pb_unitsByUidFromProducts',
  `  _trace('===> WINNER', best);
  return best;
}

function pb_unitsByUidFromProducts`
);
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
  m.pb_runPacking(products, 120, 100, 240);
} finally {
  writeFileSync(path, orig);
}
