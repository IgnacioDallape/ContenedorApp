import { pb_runPacking } from './src/stores/palletStore.js';
let fails = 0;
const log = (ok, msg) => { console.log(`${ok?'✓':'✗'} ${msg}`); if (!ok) fails++; };
function floats(p) {
  const out = [];
  for (const b of p) {
    if (b.y < 0.1) continue;
    const sup = p.filter(o => o !== b && Math.abs((o.y + o.dY) - b.y) < 0.5);
    let cov = 0, cs = false;
    const cx = b.x+b.dX/2, cz = b.z+b.dZ/2;
    for (const s of sup) {
      const ox = Math.max(0, Math.min(s.x+s.dX, b.x+b.dX) - Math.max(s.x, b.x));
      const oz = Math.max(0, Math.min(s.z+s.dZ, b.z+b.dZ) - Math.max(s.z, b.z));
      cov += ox*oz;
      if (cx >= s.x && cx <= s.x+s.dX && cz >= s.z && cz <= s.z+s.dZ) cs = true;
    }
    if (cov/(b.dX*b.dZ) < 0.97 || !cs) out.push(b);
  }
  return out;
}

let r = pb_runPacking([
  { id:'p1', name:'C', color:'#a', qty:80, dims:{L:22,W:22,H:22}, weight:1 },
  { id:'p2', name:'M', color:'#b', qty:5,  dims:{L:40,W:40,H:40}, weight:7 },
], 120, 100, 180);
log(r.length === 85, `80+5: ${r.length}/85`);
log(floats(r).length === 0, `80+5: ${floats(r).length} flotantes`);

r = pb_runPacking([{id:'p1',name:'X',color:'#a',qty:1,dims:{L:30,W:30,H:30},weight:5}], 120, 100, 180);
log(r.length === 1, `1 caja: ${r.length}`);

r = pb_runPacking([
  { id:'p1', name:'A', color:'#a', qty:50, dims:{L:20,W:20,H:20}, weight:5 },
  { id:'p2', name:'B', color:'#b', qty:50, dims:{L:15,W:15,H:15}, weight:3 },
], 120, 100, 180);
log(floats(r).length === 0, `100 cubos: ${floats(r).length} flotantes`);

r = pb_runPacking([
  { id:'h', name:'P', color:'#a', qty:2, dims:{L:60,W:50,H:30}, weight:100, mustBeBase:true },
  { id:'l', name:'L', color:'#b', qty:3, dims:{L:30,W:30,H:30}, weight:5 },
], 120, 100, 180);
log(r.filter(b => b.name === 'P').every(b => b.y < 0.1), `mustBeBase`);

r = pb_runPacking([{id:'f',name:'F',color:'#a',qty:2,dims:{L:40,W:30,H:20},weight:10,noRotate:true}], 120, 100, 180);
log(r.every(b => b.dX === 40 && b.dY === 20 && b.dZ === 30), `noRotate`);

console.log(`\n${fails === 0 ? '✓ ALL PASS' : `✗ ${fails} FAILURES`}`);
process.exit(fails === 0 ? 0 : 1);
