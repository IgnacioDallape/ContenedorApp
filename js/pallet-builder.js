// ── PALLET BUILDER ──
// Motor de packing BFD adaptado para escala pallet
// Independiente de packing.js — no modifica globals del Container Loader

const PB_GRID_RES = 2; // 2cm de precisión para cajas pequeñas

const PB_PALLET_TYPES = {
  euro: { L: 120, W: 80,  label: 'Euro Pallet', dims: '120×80 cm' },
  eua:  { L: 120, W: 100, label: 'Pallet EUA',  dims: '120×100 cm' },
};

let pb_palletType    = 'euro';
let pb_maxHeight     = 180; // cm
let pb_products      = []; // { id, name, dims:{L,W,H}, qty, weight, color, mustBeBase }
let pb_results       = []; // array de pallets armados
let pb_editingId     = null;
let pb_three         = null;
let pb_scene         = null;
let pb_activeResult  = 0;

const PB_COLORS = ['#6b7d9b','#8D7966','#4a7dc1','#9b7966','#4ac16b','#b8906b','#7d6b9b','#6b9b8b','#c1704a','#8b6b6b'];

// ── HEIGHTMAP para pallet ──
function pb_makeHM(palW, palL) {
  const cols = Math.ceil((palL + PB_GRID_RES) / PB_GRID_RES);
  const rows = Math.ceil((palW + PB_GRID_RES) / PB_GRID_RES);
  return { data: new Float32Array(cols * rows), cols, rows, palL, palW };
}

function pb_hmGetMax(hm, px, pz, dX, dZ) {
  const gx0 = Math.max(0, Math.floor(px / PB_GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / PB_GRID_RES));
  const gx1 = Math.min(hm.cols, Math.ceil((px + dX) / PB_GRID_RES));
  const gz1 = Math.min(hm.rows, Math.ceil((pz + dZ) / PB_GRID_RES));
  let max = 0;
  for (let gz = gz0; gz < gz1; gz++)
    for (let gx = gx0; gx < gx1; gx++)
      max = Math.max(max, hm.data[gz * hm.cols + gx]);
  return max;
}

function pb_hmSet(hm, px, pz, dX, dZ, h) {
  const gx0 = Math.max(0, Math.floor(px / PB_GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / PB_GRID_RES));
  const gx1 = Math.min(hm.cols, Math.ceil((px + dX) / PB_GRID_RES));
  const gz1 = Math.min(hm.rows, Math.ceil((pz + dZ) / PB_GRID_RES));
  for (let gz = gz0; gz < gz1; gz++)
    for (let gx = gx0; gx < gx1; gx++)
      hm.data[gz * hm.cols + gx] = h;
}

// ── MOTOR BFD PALLET ──
function pb_runPacking(products, palL, palW, maxH) {
  const hm = pb_makeHM(palW, palL);
  const packed = [];
  const placed = {};

  // Expandir unidades
  const units = [];
  for (const p of products) {
    placed[p.id] = 0;
    for (let i = 0; i < p.qty; i++) {
      units.push({ ...p, _idx: i });
    }
  }

  // Sort: mustBeBase primero, luego por huella (área de base) desc, luego altura desc
  // Esto pone las cajas más grandes y pesadas abajo, las chicas rellenan huecos arriba
  units.sort((a, b) => {
    if (a.mustBeBase !== b.mustBeBase) return a.mustBeBase ? -1 : 1;
    // Huella máxima posible = mayor de las dos dimensiones horizontales × la otra
    const footprintA = Math.max(a.dims.L * a.dims.W, a.dims.L * a.dims.H, a.dims.W * a.dims.H);
    const footprintB = Math.max(b.dims.L * b.dims.W, b.dims.L * b.dims.H, b.dims.W * b.dims.H);
    if (footprintB !== footprintA) return footprintB - footprintA;
    // Igual huella: la más alta va primero (mejor soporte)
    return Math.max(b.dims.L, b.dims.W, b.dims.H) - Math.max(a.dims.L, a.dims.W, a.dims.H);
  });

  for (const u of units) {
    // Orientaciones: todas las rotaciones que caben en el pallet
    const { L, W, H } = u.dims;
    const baseH = u.mustBeBase ? pb_hmGetMax(hm, 0, 0, palL, palW) : null;

    let orientations = [
      { dX: L, dZ: W, dY: H },
      { dX: W, dZ: L, dY: H },
      { dX: L, dZ: H, dY: W },
      { dX: H, dZ: L, dY: W },
      { dX: W, dZ: H, dY: L },
      { dX: H, dZ: W, dY: L },
    ].filter(o => o.dX <= palL + 1 && o.dZ <= palW + 1 && o.dY > 0);

    if (!orientations.length) continue;

    let bestPx = -1, bestPz = -1, bestH = Infinity, bestScore = Infinity, bestOri = orientations[0];

    for (const ori of orientations) {
      for (let pz = 0; pz < palW; pz += PB_GRID_RES) {
        for (let px = 0; px < palL; px += PB_GRID_RES) {
          if (px + ori.dX > palL + 1) continue;
          if (pz + ori.dZ > palW + 1) continue;
          const h = pb_hmGetMax(hm, px, pz, ori.dX, ori.dZ);
          if (h + ori.dY > maxH + 1) continue;
          // mustBeBase: solo en el piso (h === 0)
          if (u.mustBeBase && h > 0.5) continue;
          // Score: minimizar altura resultante (compactar hacia abajo),
          // desempate por posición: llenar X antes que Z (izquierda→derecha, frente→atrás)
          // Bonus: preferir posiciones donde la caja queda bien apoyada (h uniforme bajo ella)
          const hMax = pb_hmGetMax(hm, px, pz, ori.dX, ori.dZ);
          const score = hMax * 10000000 + px * 100 + pz;
          if (score < bestScore) { bestScore = score; bestH = h; bestPx = px; bestPz = pz; bestOri = ori; }
        }
      }
    }

    if (bestPx === -1) continue; // no entra en este pallet
    pb_hmSet(hm, bestPx, bestPz, bestOri.dX, bestOri.dZ, bestH + bestOri.dY);
    packed.push({
      x: bestPx, y: bestH, z: bestPz,
      dX: bestOri.dX, dY: bestOri.dY, dZ: bestOri.dZ,
      color: u.color, name: u.name, productId: u.id,
      mustBeBase: u.mustBeBase,
    });
    placed[u.id]++;
  }

  // Calcular altura real usada
  let maxUsedH = 0;
  for (let i = 0; i < hm.data.length; i++) maxUsedH = Math.max(maxUsedH, hm.data[i]);

  return { packed, placed, maxUsedH };
}

// ── ARMAR PALLETS ──
function pb_build() {
  if (!pb_products.length) return showToast('Agregá productos primero', 'error');

  const pt = PB_PALLET_TYPES[pb_palletType];
  const palL = pt.L, palW = pt.W;
  const maxH  = pb_maxHeight;

  // Copiar productos con cantidades restantes
  let remaining = pb_products.map(p => ({ ...p }));
  pb_results = [];

  let safetyLimit = 20; // máximo 20 pallets
  while (remaining.some(p => p.qty > 0) && safetyLimit-- > 0) {
    const { packed, placed, maxUsedH } = pb_runPacking(
      remaining.filter(p => p.qty > 0), palL, palW, maxH
    );

    if (!packed.length) break; // ninguna caja entra

    // Descontar lo que se ubicó
    for (const p of remaining) {
      p.qty -= (placed[p.id] || 0);
    }

    const palletNum = pb_results.length + 1;
    const totalWeight = packed.reduce((s, box) => {
      const prod = pb_products.find(p => p.id === box.productId);
      return s + (prod ? prod.weight : 0);
    }, 0);

    pb_results.push({
      id: palletNum,
      type: pb_palletType,
      palL, palW,
      heightUsed: Math.round(maxUsedH),
      boxes: packed,
      totalWeight,
      totalBoxes: packed.length,
    });
  }

  if (!pb_results.length) {
    showToast('Ninguna caja entra en el pallet con esas dimensiones', 'error');
    return;
  }

  // Calcular sobrantes
  const leftover = remaining.filter(p => p.qty > 0);

  pb_activeResult = 0;
  pb_renderResults(leftover);
  pb_draw3D(pb_results[0]);

  let msg = '✓ ' + pb_results.length + ' pallet' + (pb_results.length > 1 ? 's' : '') + ' armado' + (pb_results.length > 1 ? 's' : '');
  if (leftover.length) {
    msg = '⚠ ' + leftover.length + ' producto' + (leftover.length > 1 ? 's' : '') + ' no entraron — revisá el resumen';
    showToast(msg, 'error');
  } else {
    showToast(msg, 'success');
  }
}

// ── RENDER RESULTADOS ──
function pb_renderLeftover(leftover) {
  if (!leftover || !leftover.length) return '';
  var rows = leftover.map(function(p) {
    var prod = pb_products.find(function(x) { return x.id === p.id; });
    var color = prod ? prod.color : '#999';
    var name = prod ? prod.name : String(p.id);
    return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:4px">'
      + '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + color + ';flex-shrink:0"></span>'
      + '<span>' + name + '</span>'
      + '<span style="color:var(--danger);font-weight:600;margin-left:auto">' + p.qty + ' cajas sin ubicar</span>'
      + '</div>';
  }).join('');
  return '<div style="background:rgba(184,92,92,0.08);border:1.5px solid rgba(184,92,92,0.35);border-radius:8px;padding:12px 16px;margin-bottom:14px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--danger);letter-spacing:1px;margin-bottom:8px">NO ENTRARON EN NINGUN PALLET</div>'
    + rows
    + '<div style="font-size:10px;color:var(--muted);margin-top:8px">Aumenta la altura maxima o reduce las cantidades</div>'
    + '</div>';
}


function pb_renderResults(leftover) {
  leftover = leftover || [];
  const el = document.getElementById('pbResults');
  if (!el) return;

  if (!pb_results.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">Configurá los productos y presioná "Armar pallets"</div></div>';
    return;
  }

  // Tabs de pallets
  const tabs = pb_results.map((r, i) => `
    <button onclick="pb_selectResult(${i})" style="
      padding:6px 14px;font-size:11px;font-family:'DM Mono',monospace;letter-spacing:0.5px;
      border-radius:6px;cursor:pointer;transition:all 0.15s;
      border:1.5px solid ${i === pb_activeResult ? 'var(--c1)' : 'var(--border)'};
      background:${i === pb_activeResult ? 'var(--c1)' : 'transparent'};
      color:${i === pb_activeResult ? 'var(--c5)' : 'var(--muted)'};
      font-weight:${i === pb_activeResult ? '700' : '400'}
    ">🟫 Pallet ${r.id} <span style="opacity:0.7">${r.totalBoxes} cj</span></button>
  `).join('');

  const r = pb_results[pb_activeResult];
  const pt = PB_PALLET_TYPES[r.type];

  // Resumen por producto en este pallet
  const boxCount = {};
  for (const b of r.boxes) {
    boxCount[b.productId] = (boxCount[b.productId] || 0) + 1;
  }
  const summaryRows = Object.entries(boxCount).map(([pid, cnt]) => {
    const prod = pb_products.find(p => p.id == pid);
    return `<tr>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${prod?.color||'#999'};margin-right:6px;vertical-align:middle"></span>${prod?.name || pid}</td>
      <td class="td-mono">${cnt}</td>
      <td class="td-mono">${prod?.dims.L}×${prod?.dims.W}×${prod?.dims.H}</td>
      <td class="td-mono">${prod?.mustBeBase ? '⬇ Base' : '—'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      ${tabs}
      <button onclick="pb_addActiveToContainer()" style="margin-left:auto;padding:6px 16px;font-size:11px;font-family:'DM Mono',monospace;letter-spacing:0.5px;border-radius:6px;cursor:pointer;border:1.5px solid var(--c1);background:var(--c1);color:var(--c5);font-weight:700;white-space:nowrap">+ Este pallet</button>
      ${pb_results.length > 1 ? `<button onclick="pb_addAllToContainer()" style="padding:6px 16px;font-size:11px;font-family:'DM Mono',monospace;letter-spacing:0.5px;border-radius:6px;cursor:pointer;border:1.5px solid var(--c1);background:transparent;color:var(--c1);font-weight:700;white-space:nowrap">+ Todos (${pb_results.length})</button>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:var(--surface2);border-radius:8px;padding:10px 14px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--muted);font-family:'DM Mono',monospace;letter-spacing:1px;margin-bottom:3px">TIPO</div>
        <div style="font-size:14px;font-weight:600;color:var(--text)">${pt.label}</div>
        <div style="font-size:10px;color:var(--muted)">${pt.dims}</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px 14px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--muted);font-family:'DM Mono',monospace;letter-spacing:1px;margin-bottom:3px">ALTURA</div>
        <div style="font-size:14px;font-weight:600;color:var(--text)">${r.heightUsed} cm</div>
        <div style="font-size:10px;color:var(--muted)">de ${pb_maxHeight} cm máx</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px 14px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--muted);font-family:'DM Mono',monospace;letter-spacing:1px;margin-bottom:3px">CAJAS</div>
        <div style="font-size:14px;font-weight:600;color:var(--text)">${r.totalBoxes}</div>
        <div style="font-size:10px;color:var(--muted)">unidades</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px 14px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--muted);font-family:'DM Mono',monospace;letter-spacing:1px;margin-bottom:3px">PESO</div>
        <div style="font-size:14px;font-weight:600;color:var(--text)">${r.totalWeight.toFixed(1)} kg</div>
        <div style="font-size:10px;color:var(--muted)">estimado</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:500">Producto</th>
        <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:500">Cajas</th>
        <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:500">Dims (cm)</th>
        <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:500">Posición</th>
      </tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>
    ${pb_renderLeftover(leftover)}
  `;
}

function pb_selectResult(i) {
  pb_activeResult = i;
  pb_renderResults();
  pb_draw3D(pb_results[i]);
}

// ── VISUALIZACIÓN 3D ──
function pb_init3D() {
  const container = document.getElementById('pbThreeContainer');
  if (!container || pb_three) return;

  const W = container.clientWidth || 600;
  const H = container.clientHeight || 400;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8f1e9);

  const camera = new THREE.PerspectiveCamera(45, W / H, 1, 5000);
  camera.position.set(200, 300, 300);
  camera.lookAt(60, 90, 40);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(200, 400, 200);
  scene.add(dirLight);

  // OrbitControls
  let controls = null;
  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }

  pb_three = { renderer, scene, camera, controls };
  pb_scene = scene;

  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    const W2 = container.clientWidth;
    const H2 = container.clientHeight;
    camera.aspect = W2 / H2;
    camera.updateProjectionMatrix();
    renderer.setSize(W2, H2);
  });
}

function pb_draw3D(result) {
  if (!pb_three) pb_init3D();
  if (!pb_three) return;

  const scene = pb_three.scene;

  // Limpiar escena
  while (scene.children.length > 0) scene.remove(scene.children[0]);

  // Luz
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(200, 400, 200);
  scene.add(dl);

  const palL = result.palL;
  const palW = result.palW;
  const PALLET_H = 14; // altura estructura del pallet cm

  // Pallet base
  const palletMat = new THREE.MeshLambertMaterial({ color: 0xc8a96e });
  const palletGeo = new THREE.BoxGeometry(palL, PALLET_H, palW);
  const palletMesh = new THREE.Mesh(palletGeo, palletMat);
  palletMesh.position.set(palL / 2, PALLET_H / 2, palW / 2);
  scene.add(palletMesh);

  // Grilla del piso
  const gridHelper = new THREE.GridHelper(Math.max(palL, palW) * 1.5, 10, 0xddccbb, 0xddccbb);
  gridHelper.position.set(palL / 2, 0, palW / 2);
  scene.add(gridHelper);

  // Cajas
  for (const box of result.boxes) {
    const color = new THREE.Color(box.color);
    const mat = new THREE.MeshLambertMaterial({ color });
    const geo = new THREE.BoxGeometry(box.dX - 0.3, box.dY - 0.3, box.dZ - 0.3);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      box.x + box.dX / 2,
      PALLET_H + box.y + box.dY / 2,
      box.z + box.dZ / 2
    );
    scene.add(mesh);

    // Wireframe
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(box.dX - 0.3, box.dY - 0.3, box.dZ - 0.3));
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
    line.position.copy(mesh.position);
    scene.add(line);
  }

  // Ajustar cámara
  const maxDim = Math.max(palL, palW, result.heightUsed + PALLET_H);
  pb_three.camera.position.set(palL * 1.5, maxDim * 1.8, palW * 2);
  pb_three.camera.lookAt(palL / 2, (result.heightUsed + PALLET_H) / 2, palW / 2);
  if (pb_three.controls) {
    pb_three.controls.target.set(palL / 2, (result.heightUsed + PALLET_H) / 2, palW / 2);
    pb_three.controls.update();
  }
}


function pb_addActiveToContainer() {
  if (!pb_results.length) return showToast("Armá los pallets primero", "error");
  const result = pb_results[pb_activeResult];
  const pt = PB_PALLET_TYPES[result.type];
  const productData = {
    name: "Pallet " + result.id + " (" + result.totalBoxes + " cj)",
    type: "pallet",
    dims: { L: pt.L, W: pt.W, H: result.heightUsed + 14 },
    qty: 1,
    price: 0,
    weight: result.totalWeight,
    priorityZone: null,
    packedItems: result.boxes,
    palletBase: { L: pt.L, W: pt.W },
  };
  switchSection("container");
  checkCapacityAndAdd(productData);
  showToast("✓ Pallet " + result.id + " agregado al contenedor", "success");
}

// ── AGREGAR AL CONTENEDOR ──
function pb_addAllToContainer() {
  if (!pb_results.length) return showToast('Armá los pallets primero', 'error');

  for (const result of pb_results) {
    const pt = PB_PALLET_TYPES[result.type];
    const productData = {
      name: 'Pallet ' + result.id + ' (' + result.totalBoxes + ' cj)',
      type: 'pallet',
      dims: { L: pt.L, W: pt.W, H: result.heightUsed + 14 },
      qty: 1,
      price: 0,
      weight: result.totalWeight,
      priorityZone: null,
      packedItems: result.boxes,
      palletBase: { L: pt.L, W: pt.W },
    };
    doAddProduct(productData);
  }

  switchSection('container');
  showToast('✓ ' + pb_results.length + ' pallets agregados al contenedor', 'success');
}

// ── GESTIÓN DE PRODUCTOS ──

function pb_openCatalogPicker() {
  const catalog = JSON.parse(localStorage.getItem('cl_catalog') || '[]');
  if (!catalog.length) return showToast('No tenés productos en el catálogo aún', 'error');

  const existing = document.getElementById('pbCatalogModal');
  if (existing) existing.remove();

  const items = catalog.filter(p => p.dims && p.type !== 'pallet');
  if (!items.length) {
    return showToast('No hay cajas con dimensiones en el catálogo', 'error');
  }

  const rows = items.map(p => {
    const dims = p.dims.L + '×' + p.dims.W + '×' + p.dims.H;
    const img = p.imgUrl
      ? `<img src="${p.imgUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0">`
      : `<div style="width:40px;height:40px;background:var(--border);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>`;
    return `<div style="padding:10px 4px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <input type="checkbox" id="pbsel_${p.id}" onchange="pb_updateCatalogBtn()"
          style="width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:var(--c1)">
        ${img}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${p.name}</div>
          <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace">${dims} cm${p.weight ? ' · ' + p.weight + ' kg/u' : ''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding-left:26px">
        <div style="display:flex;align-items:center;border:1.5px solid var(--border);border-radius:6px;overflow:hidden;flex-shrink:0">
          <button onclick="var i=document.getElementById('pbqty_${p.id}');i.value=Math.max(1,parseInt(i.value)-1)"
            style="width:28px;height:28px;background:transparent;border:none;font-size:16px;cursor:pointer;color:var(--text);line-height:1">−</button>
          <input id="pbqty_${p.id}" type="number" value="1" min="1" max="500"
            style="width:70px!important;max-width:70px!important;height:28px;border:none;border-left:1.5px solid var(--border);border-right:1.5px solid var(--border);text-align:center;font-size:13px;font-family:'DM Mono',monospace;background:var(--c5);color:var(--text);-moz-appearance:textfield;padding:0;box-sizing:border-box"
            oninput="this.value=Math.max(1,Math.min(500,parseInt(this.value)||1))">
          <button onclick="var i=document.getElementById('pbqty_${p.id}');i.value=Math.min(500,parseInt(i.value)+1)"
            style="width:28px;height:28px;background:transparent;border:none;font-size:16px;cursor:pointer;color:var(--text);line-height:1">+</button>
        </div>
        <button onclick="pb_addFromCatalog(${p.id}, parseInt(document.getElementById('pbqty_${p.id}').value))"
          style="flex:1;padding:6px 8px;background:transparent;color:var(--c1);border:1.5px solid var(--c1);border-radius:6px;font-size:11px;font-family:var(--font);font-weight:600;cursor:pointer">
          + Individual
        </button>
      </div>
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'pbCatalogModal';
  modal.className = 'cap-overlay open';
  modal.style.zIndex = '300';
  modal.innerHTML = `
    <div class="cap-modal" style="max-width:500px;width:90vw;max-height:80vh;overflow:hidden;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="cap-title" style="margin:0">Catálogo de productos</div>
        <button onclick="document.getElementById('pbCatalogModal').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted)">×</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <button onclick="pb_selectAllCatalog(true)" style="font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--muted);cursor:pointer">Seleccionar todo</button>
        <button onclick="pb_selectAllCatalog(false)" style="font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--muted);cursor:pointer">Deseleccionar</button>
        <button id="pbCatalogLoadBtn" onclick="pb_loadSelectedFromCatalog()" disabled
          style="margin-left:auto;padding:6px 16px;background:var(--c1);color:var(--c5);border:none;border-radius:6px;font-size:12px;font-family:var(--font);font-weight:700;cursor:pointer;opacity:0.4;transition:opacity 0.15s">
          ✓ Cargar selección
        </button>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
    </div>`;
  document.body.appendChild(modal);
}

function pb_updateCatalogBtn() {
  const modal = document.getElementById('pbCatalogModal');
  if (!modal) return;
  const anyChecked = modal.querySelectorAll('input[type=checkbox]:checked').length > 0;
  const btn = document.getElementById('pbCatalogLoadBtn');
  if (btn) { btn.disabled = !anyChecked; btn.style.opacity = anyChecked ? '1' : '0.4'; }
}

function pb_selectAllCatalog(val) {
  const modal = document.getElementById('pbCatalogModal');
  if (!modal) return;
  modal.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = val);
  pb_updateCatalogBtn();
}

function pb_loadSelectedFromCatalog() {
  const modal = document.getElementById('pbCatalogModal');
  if (!modal) return;
  const catalog = JSON.parse(localStorage.getItem('cl_catalog') || '[]');
  const checked = [...modal.querySelectorAll('input[type=checkbox]:checked')];
  let added = 0;
  for (const cb of checked) {
    const pid = cb.id.replace('pbsel_', '');
    const qty = parseInt(document.getElementById('pbqty_' + pid)?.value) || 1;
    const p = catalog.find(x => String(x.id) === pid);
    if (!p || !p.dims) continue;
    const existing = pb_products.find(x => x.name === p.name);
    if (existing) {
      existing.qty += qty;
    } else {
      pb_products.push({
        id: Date.now() + Math.random(),
        name: p.name,
        dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
        qty, weight: p.weight || 0, mustBeBase: false,
        color: PB_COLORS[pb_products.length % PB_COLORS.length],
      });
    }
    added++;
  }
  modal.remove();
  pb_renderProductList();
  pb_results = [];
  pb_renderResults();
  showToast('✓ ' + added + ' producto' + (added !== 1 ? 's' : '') + ' agregado' + (added !== 1 ? 's' : '') + ' al pallet', 'success');
}


function pb_addFromCatalog(id, qty) {
  qty = Math.max(1, parseInt(qty) || 1);
  const catalog = JSON.parse(localStorage.getItem('cl_catalog') || '[]');
  const p = catalog.find(x => x.id == id);
  if (!p || !p.dims) return showToast('Producto sin dimensiones', 'error');

  const modal = document.getElementById('pbCatalogModal');
  if (modal) modal.remove();

  const existing = pb_products.find(x => x.name === p.name);
  if (existing) {
    existing.qty += qty;
    pb_renderProductList();
    showToast('+ ' + qty + ' ' + p.name, 'success');
    return;
  }

  pb_products.push({
    id: Date.now() + Math.random(),
    name: p.name,
    dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
    qty: qty,
    weight: p.weight || 0,
    mustBeBase: false,
    color: PB_COLORS[pb_products.length % PB_COLORS.length],
  });
  pb_renderProductList();
  pb_results = [];
  pb_renderResults();
  showToast('✓ ' + p.name + ' (' + qty + ' u) agregado', 'success');
}

function pb_openProductForm(editId) {
  pb_editingId = editId || null;
  if (editId) {
    const p = pb_products.find(x => x.id === editId);
    if (!p) return;
    document.getElementById('pbProdName').value = p.name;
    document.getElementById('pbProdL').value = p.dims.L;
    document.getElementById('pbProdW').value = p.dims.W;
    document.getElementById('pbProdH').value = p.dims.H;
    document.getElementById('pbProdQty').value = p.qty;
    document.getElementById('pbProdWeight').value = p.weight;
    document.getElementById('pbProdBase').checked = p.mustBeBase;
  } else {
    document.getElementById('pbProdName').value = '';
    document.getElementById('pbProdL').value = '';
    document.getElementById('pbProdW').value = '';
    document.getElementById('pbProdH').value = '';
    document.getElementById('pbProdQty').value = '';
    document.getElementById('pbProdWeight').value = '';
    document.getElementById('pbProdBase').checked = false;
  }

  document.getElementById('pbProductModal').classList.add('open');
  setTimeout(() => document.getElementById('pbProdName').focus(), 80);
}

function pb_saveProduct() {
  const name   = document.getElementById('pbProdName').value.trim();
  const L      = parseFloat(document.getElementById('pbProdL').value);
  const W      = parseFloat(document.getElementById('pbProdW').value);
  const H      = parseFloat(document.getElementById('pbProdH').value);
  const qty    = parseInt(document.getElementById('pbProdQty').value);
  const weight = parseFloat(document.getElementById('pbProdWeight').value) || 0;
  const mustBeBase = document.getElementById('pbProdBase').checked;

  if (!name) return showToast('Ingresá el nombre', 'error');
  if (!L || !W || !H) return showToast('Ingresá las dimensiones', 'error');
  if (!qty || qty < 1) return showToast('Ingresá la cantidad', 'error');
  if (qty > 250) return showToast('Máximo 250 por producto', 'error');

  const pt = PB_PALLET_TYPES[pb_palletType];
  const minDim = Math.min(L, W, H);
  if (minDim > Math.max(pt.L, pt.W)) return showToast('La caja es más grande que el pallet', 'error');

  if (pb_editingId) {
    const idx = pb_products.findIndex(p => p.id === pb_editingId);
    if (idx >= 0) pb_products[idx] = { ...pb_products[idx], name, dims: { L, W, H }, qty, weight, mustBeBase };
  } else {
    pb_products.push({
      id: Date.now() + Math.random(),
      name, dims: { L, W, H }, qty, weight, mustBeBase,
      color: PB_COLORS[pb_products.length % PB_COLORS.length],
    });
  }

  document.getElementById('pbProductModal').classList.remove('open');
  pb_renderProductList();
  pb_results = [];
  pb_renderResults();
}

function pb_removeProduct(id) {
  pb_products = pb_products.filter(p => p.id !== id);
  pb_renderProductList();
  pb_results = [];
  pb_renderResults();
}

function pb_renderProductList() {
  const el = document.getElementById('pbProductList');
  if (!el) return;

  if (!pb_products.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">Sin productos aún.</div></div>';
    return;
  }

  el.innerHTML = pb_products.map(p => `
    <div class="queue-item">
      <div class="queue-dot" style="background:${p.color}"></div>
      <div class="queue-info">
        <div class="queue-name">${p.name} ${p.mustBeBase ? '<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:var(--c1);color:var(--c5);font-family:\'DM Mono\',monospace">⬇ BASE</span>' : ''}</div>
        <div class="queue-meta">${p.dims.L}×${p.dims.W}×${p.dims.H} cm · ${p.qty} cj · ${p.weight > 0 ? p.weight + ' kg/u' : 'sin peso'}</div>
      </div>
      <div style="display:flex;gap:3px;flex-shrink:0">
        <button onclick="pb_openProductForm(${p.id})" style="background:none;border:1px solid var(--border);border-radius:3px;padding:2px 5px;font-size:9px;color:var(--muted);cursor:pointer;font-family:'DM Mono',monospace">✎</button>
        <button onclick="pb_removeProduct(${p.id})" class="btn-remove">×</button>
      </div>
    </div>
  `).join('');
}

function pb_setPalletType(type) {
  pb_palletType = type;
  document.getElementById('pbBtnEuro').classList.toggle('active', type === 'euro');
  document.getElementById('pbBtnEua').classList.toggle('active',  type === 'eua');
  const pt = PB_PALLET_TYPES[type];
  const dimEl = document.getElementById('pbPalletDims');
  if (dimEl) dimEl.textContent = pt.dims;
}

function pb_setMaxHeight(val) {
  pb_maxHeight = parseInt(val);
  document.getElementById('pbMaxHeightVal').textContent = val + ' cm';
}

// Inicializar cuando se abre la sección
function pb_init() {
  pb_renderProductList();
  pb_renderResults();
  if (!pb_three) {
    setTimeout(() => {
      pb_init3D();
    }, 100);
  }
}