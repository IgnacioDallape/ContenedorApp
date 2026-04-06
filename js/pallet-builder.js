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

  // Sort: mustBeBase primero, luego por volumen desc
  units.sort((a, b) => {
    if (a.mustBeBase !== b.mustBeBase) return a.mustBeBase ? -1 : 1;
    return (b.dims.L * b.dims.W * b.dims.H) - (a.dims.L * a.dims.W * a.dims.H);
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
          const score = (h + ori.dY) * 10000000 + px * 100 + pz;
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

  pb_activeResult = 0;
  pb_renderResults();
  pb_draw3D(pb_results[0]);
  showToast('✓ ' + pb_results.length + ' pallet' + (pb_results.length > 1 ? 's' : '') + ' armado' + (pb_results.length > 1 ? 's' : ''), 'success');
}

// ── RENDER RESULTADOS ──
function pb_renderResults() {
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
      <button onclick="pb_addAllToContainer()" style="margin-left:auto;padding:6px 16px;font-size:11px;font-family:'DM Mono',monospace;letter-spacing:0.5px;border-radius:6px;cursor:pointer;border:1.5px solid var(--c1);background:var(--c1);color:var(--c5);font-weight:700;white-space:nowrap">+ Agregar al contenedor</button>
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
    const geo = new THREE.BoxGeometry(box.dX - 1, box.dY - 1, box.dZ - 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      box.x + box.dX / 2,
      PALLET_H + box.y + box.dY / 2,
      box.z + box.dZ / 2
    );
    scene.add(mesh);

    // Wireframe
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(box.dX, box.dY, box.dZ));
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

// ── AGREGAR AL CONTENEDOR ──
function pb_addAllToContainer() {
  if (!pb_results.length) return showToast('Armá los pallets primero', 'error');

  let added = 0;
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
    };
    doAddProduct(productData);
    added++;
  }

  switchSection('container');
  showToast('✓ ' + added + ' pallet' + (added > 1 ? 's' : '') + ' agregado' + (added > 1 ? 's' : '') + ' al contenedor', 'success');
}

// ── GESTIÓN DE PRODUCTOS ──
function pb_openProductForm(editId) {
  pb_editingId = editId || null;
  const form = document.getElementById('pbProductForm');
  if (!form) return;

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
