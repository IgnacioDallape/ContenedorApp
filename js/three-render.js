function drawContainer() {
  if (!_three) {
    // Three.js not ready yet — retry in 200ms
    setTimeout(drawContainer, 200);
    return;
  }

  const { scene, containerGroup } = _three;

  // Clear previous boxes
  while (containerGroup.children.length) {
    const c = containerGroup.children[0];
    c.geometry && c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m && m.dispose());
      else c.material.dispose();
    }
    containerGroup.remove(c);
  }

  // Container dims in cm (used as scene units)
  const CL = CONT_L, CW = CONT_W, CH = CONT_H;

  // ── Draw container shell — corrugated metal look ──
  // Floor (solid metal plate)
  const floorPlateGeo = new THREE.BoxGeometry(CL, 3, CW);
  const floorPlateMat = new THREE.MeshPhongMaterial({ color: 0x8C7B6A, shininess: 15, specular: 0x222222 });
  const floorPlate = new THREE.Mesh(floorPlateGeo, floorPlateMat);
  floorPlate.position.set(CL/2, -1.5, CW/2);
  floorPlate.receiveShadow = true;
  containerGroup.add(floorPlate);

  // Container walls — transparent with subtle tint
  const wallMat = new THREE.MeshPhongMaterial({
    color: 0xA89880, transparent: true, opacity: 0.06,
    side: THREE.BackSide, shininess: 5
  });
  const wallGeo = new THREE.BoxGeometry(CL, CH, CW);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.set(CL/2, CH/2, CW/2);
  containerGroup.add(wallMesh);

  // Wireframe edges — bolder, more defined
  const edgeGeo = new THREE.EdgesGeometry(wallGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x6B5A48, opacity: 0.7, transparent: true });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.position.copy(wallMesh.position);
  containerGroup.add(edges);

  // Corrugation lines on front face (visual detail)
  const corrugLines = 8;
  for (let i = 0; i <= corrugLines; i++) {
    const y = (CH / corrugLines) * i;
    const lg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, y, 0), new THREE.Vector3(CL, y, 0)
    ]);
    const lm = new THREE.LineBasicMaterial({ color: 0x7A6A58, transparent: true, opacity: 0.25 });
    containerGroup.add(new THREE.Line(lg, lm));
  }

  // Floor grid — subtle
  const gridHelper = new THREE.GridHelper(Math.max(CL, CW) * 1.2, 12, 0xC8B8A8, 0xD8CCC0);
  gridHelper.position.set(CL/2, 0.5, CW/2);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.5;
  containerGroup.add(gridHelper);

  // ── Camión 3D para semis ──
  drawTruck(containerGroup, CL, CW, CH);

  // ── Use shared precision packing engine ──
  const { packed } = runPacking(loadedProducts);

  // ── Draw packed boxes as 3D meshes — realistic materials ──
  const matCache = {};
  function getMat(hex, opts = {}) {
    const key = hex + JSON.stringify(opts);
    if (!matCache[key]) {
      const c = parseInt(hex.replace('#',''), 16);
      matCache[key] = new THREE.MeshPhongMaterial({
        color: c,
        shininess: opts.shininess || 18,
        specular: opts.specular || 0x111111,
        ...opts
      });
    }
    return matCache[key];
  }

  // Per-face cardboard material — top lighter, sides vary, gives 3D depth
  function makeBoxMaterials(hex) {
    const col = new THREE.Color(parseInt(hex.replace('#',''), 16));
    return [
      new THREE.MeshPhongMaterial({ color: col.clone().multiplyScalar(0.90), shininess: 10, specular: 0x080808 }),
      new THREE.MeshPhongMaterial({ color: col.clone().multiplyScalar(0.75), shininess: 6,  specular: 0x060606 }),
      new THREE.MeshPhongMaterial({ color: col.clone().multiplyScalar(1.18), shininess: 28, specular: 0x181818 }),
      new THREE.MeshPhongMaterial({ color: col.clone().multiplyScalar(0.65), shininess: 4,  specular: 0x040404 }),
      new THREE.MeshPhongMaterial({ color: col.clone().multiplyScalar(1.0),  shininess: 14, specular: 0x0c0c0c }),
      new THREE.MeshPhongMaterial({ color: col.clone().multiplyScalar(0.82), shininess: 8,  specular: 0x080808 }),
    ];
  }

  // Animation queue
  const animItems = [];

  for (const b of packed) {
    const gap = 0.2;
    // Animation delay: stagger up to 400ms, but offset based on y position so
    // floor items animate first, stacked items animate after floor settles
    const baseDelay = Math.min(animItems.length * 6, 400);
    const stackDelay = b.y > 1 ? 300 : 0; // stacked items wait for floor animation
    const delay = baseDelay + stackDelay;

    // ── Pallet base visual ──
    if (b.type === 'pallet') {
      const baseH = Math.min(14, b.dY * 0.13);
      const cargoH = b.dY - baseH;
      const iid = b.instanceId; // shared tag for all sub-parts

      // 3 deck planks along length
      const plankW = (b.dX - gap - 2) / 3;
      [0, 1, 2].forEach(pi => {
        const shade = [0xC9985C, 0xDAB870, 0xB07840][pi];
        const pg = new THREE.BoxGeometry(plankW, baseH * 0.75, b.dZ - gap);
        const pm = new THREE.MeshPhongMaterial({ color: shade, shininess: 10, specular: 0x0c0a04 });
        const plank = new THREE.Mesh(pg, pm);
        const ty = b.y + baseH * 0.375;
        plank.position.set(b.x + plankW/2 + pi*(plankW+1) + 0.5, ty + CONT_H * 1.5, b.z + b.dZ/2);
        plank.castShadow = true; plank.receiveShadow = true;
        plank.userData = { instanceId: iid, productId: b.productId, label: b.name, type: b.type, dims: b.dims, pct: b.pct };
        animItems.push({ mesh: plank, targetY: ty, delay });
        containerGroup.add(plank);
      });

      // Cross runners (3 slats underneath)
      [0.1, 0.5, 0.9].forEach(t => {
        const sg = new THREE.BoxGeometry(b.dX - gap, baseH, Math.max(6, b.dZ * 0.12));
        const sm = new THREE.MeshPhongMaterial({ color: 0x8B6030, shininess: 5, specular: 0x060400 });
        const sl = new THREE.Mesh(sg, sm);
        const ty = b.y + baseH/2;
        sl.position.set(b.x + b.dX/2, ty + CONT_H * 1.5, b.z + t * b.dZ);
        sl.castShadow = true;
        sl.userData = { instanceId: iid, productId: b.productId };
        animItems.push({ mesh: sl, targetY: ty, delay });
        containerGroup.add(sl);
      });

      // Pallet edge lines
      const dg = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.dX - gap, baseH, b.dZ - gap));
      const dl = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x4A2E10, transparent: true, opacity: 0.25 }));
      const dty = b.y + baseH/2;
      dl.position.set(b.x + b.dX/2, dty + CONT_H * 1.5, b.z + b.dZ/2);
      dl.userData = { instanceId: iid, productId: b.productId };
      animItems.push({ mesh: dl, targetY: dty, delay });
      containerGroup.add(dl);

      // Cargo: si tiene cajas individuales del pallet builder, renderizarlas
      if (b.packedItems && b.packedItems.length) {
        // Calcular escala: las cajas del pallet builder están en coords del pallet (0..palL, 0..palW)
        // b.dX y b.dZ son las dims del pallet en el contenedor (pueden estar rotadas)
        const palL = b.palletBase ? b.palletBase.L : b.dX;
        const palW = b.palletBase ? b.palletBase.W : b.dZ;
        const scaleX = b.dX / palL;
        const scaleZ = b.dZ / palW;

        for (const box of b.packedItems) {
          const bDelay = delay + Math.min(box.y * 2, 200); // cajas altas aparecen después
          const bColor = box.color || b.color;
          const bGeo = new THREE.BoxGeometry(Math.max(0.1, box.dX * scaleX - 0.2), Math.max(0.1, box.dY - 0.2), Math.max(0.1, box.dZ * scaleZ - 0.2));
          const bMesh = new THREE.Mesh(bGeo, makeBoxMaterials(bColor));
          const ty = b.y + baseH + box.y + box.dY / 2;
          bMesh.position.set(
            b.x + box.x * scaleX + box.dX * scaleX / 2,
            ty + CONT_H * 1.5,
            b.z + box.z * scaleZ + box.dZ * scaleZ / 2
          );
          bMesh.castShadow = true; bMesh.receiveShadow = true;
          bMesh.userData = { label: b.name, type: b.type, dims: b.dims, pct: b.pct, productId: b.productId, instanceId: iid };
          animItems.push({ mesh: bMesh, targetY: ty, delay: bDelay });
          containerGroup.add(bMesh);
          // Wireframe sutil
          const bEg = new THREE.EdgesGeometry(bGeo); // wireframe sutil
          const bEl = new THREE.LineSegments(bEg, new THREE.LineBasicMaterial({ color: 0x100808, transparent: true, opacity: 0.05 }));
          bEl.position.copy(bMesh.position);
          bEl.position.y = ty + CONT_H * 1.5;
          bEl.userData = { instanceId: iid, productId: b.productId };
          animItems.push({ mesh: bEl, targetY: ty, delay: bDelay });
          containerGroup.add(bEl);
        }
      } else if (cargoH > 2) {
        // Fallback: bloque genérico si no hay packedItems
        const cgo = new THREE.BoxGeometry(b.dX - gap, cargoH - gap, b.dZ - gap);
        const cmesh = new THREE.Mesh(cgo, makeBoxMaterials(b.color));
        const ty = b.y + baseH + cargoH/2;
        cmesh.position.set(b.x + b.dX/2, ty + CONT_H * 1.5, b.z + b.dZ/2);
        cmesh.castShadow = true; cmesh.receiveShadow = true;
        cmesh.userData = { label: b.name, type: b.type, dims: b.dims, pct: b.pct, productId: b.productId, instanceId: iid };
        animItems.push({ mesh: cmesh, targetY: ty, delay });
        containerGroup.add(cmesh);
        const ceg = new THREE.EdgesGeometry(cgo);
        const cel = new THREE.LineSegments(ceg, new THREE.LineBasicMaterial({ color: 0x100808, transparent: true, opacity: 0.06 }));
        cel.position.set(b.x + b.dX/2, ty + CONT_H * 1.5, b.z + b.dZ/2);
        cel.userData = { instanceId: iid, productId: b.productId };
        animItems.push({ mesh: cel, targetY: ty, delay });
        containerGroup.add(cel);
      }
      continue;
    }

    // ── Box — cardboard per-face shading + drop animation ──
    const geo = new THREE.BoxGeometry(b.dX - gap, b.dY - gap, b.dZ - gap);
    const mesh = new THREE.Mesh(geo, makeBoxMaterials(b.color));
    const targetY = b.y + b.dY/2;
    mesh.position.set(b.x + b.dX/2, targetY + CONT_H * 1.5, b.z + b.dZ/2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { label: b.name, type: b.type, dims: b.dims, pct: b.pct, productId: b.productId, instanceId: b.instanceId };
    animItems.push({ mesh, targetY, delay });
    containerGroup.add(mesh);

    const eg = new THREE.EdgesGeometry(geo);
    const el = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x100808, transparent: true, opacity: 0.06 }));
    el.position.set(b.x + b.dX/2, targetY + CONT_H * 1.5, b.z + b.dZ/2);
    animItems.push({ mesh: el, targetY, delay });
    containerGroup.add(el);
  }

  // Store for animation loop
  if (_three) {
    _three._animItems = animItems;
    _three._animStartTime = Date.now();
  }

  // ── Dimension labels as sprites ──
  function makeLabel(text, pos) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 28px Jost, sans-serif';
    ctx.fillStyle = '#8D7966';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(80, 20, 1);
    sprite.position.set(...pos);
    containerGroup.add(sprite);
  }

  makeLabel((CL/100).toFixed(2)+' m', [CL/2, -18, -30]);
  makeLabel((CW/100).toFixed(2)+' m', [-40, -18, CW/2]);
  makeLabel((CH/100).toFixed(2)+' m', [-50, CH/2, -20]);

  // % occupancy label
  const pct = loadedProducts.reduce((s,p)=>s+p.vol*p.qty,0)/CONTAINER_VOL*100;
  document.getElementById('pctVol') && (document.getElementById('pctVol').textContent = pct.toFixed(1)+'%');

  // Redraw priority markers on top after boxes are rendered
  drawAllPriorityMarkers();
}

renderLoader();

// ResizeObserver on the 3D wrap
var _cw = document.getElementById('canvasWrap');
if (_cw) {
  new ResizeObserver(() => {
    if (_three) {
      const w = _cw.clientWidth, h = _cw.clientHeight;
      _three.renderer.setSize(w, h);
      _three.camera.aspect = w / h;
      _three.camera.updateProjectionMatrix();
    }
  }).observe(_cw);
}

// ── PRODUCT ROTATION (per-instance) ──
function rotateSelected(axis) {
  if (!window._selectedInstanceId_global) return;
  const iid = window._selectedInstanceId_global;
  const productId = iid.split('_').slice(0,-1).join('_');
  const p = loadedProducts.find(p => String(p.id) == productId);
  if (!p) return;

  window._instanceLockedOri = window._instanceLockedOri || {};

  // Current orientation: instance override > product > default
  const prev = window._instanceLockedOri[iid] || p.lockedOri || null;
  const cur = prev || { dX: p.dims.L, dZ: p.dims.W, dY: p.dims.H };
  let { dX, dZ, dY } = cur;
  dX = dX || p.dims.L; dZ = dZ || p.dims.W; dY = dY || p.dims.H;

  if (p.type === 'pallet') {
    if (axis !== 'Y') {
      showToast('Los pallets solo rotan horizontalmente (eje Y)', '');
      return;
    }
    [dX, dZ] = [dZ, dX];
  } else {
    if (axis === 'Y') { [dX, dZ] = [dZ, dX]; }
    else if (axis === 'X') { [dZ, dY] = [dY, dZ]; }
    else if (axis === 'Z') { [dX, dY] = [dY, dX]; }
  }

  // Validate dimensions fit container
  if (dX > CONT_L + 0.5 || dZ > CONT_W + 0.5 || dY > CONT_H + 0.5) {
    showToast(`↻ "${p.name}" no cabe rotado (${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm)`, 'error');
    return;
  }

  // Apply to THIS instance only
  const newOri = { dX, dZ, dY };
  window._instanceLockedOri[iid] = newOri;
  delete window._instanceManualPos[iid]; // clear manual pos (footprint changed)

  // Test-pack to verify this instance fits
  invalidatePackingCache();
  const testPacked = runPacking(loadedProducts);
  const instancePacked = testPacked.packed.find(item => item.instanceId === iid);

  if (!instancePacked) {
    // Revert — doesn't fit
    if (prev) window._instanceLockedOri[iid] = prev;
    else delete window._instanceLockedOri[iid];
    invalidatePackingCache();
    showToast(`↻ "${p.name} #${parseInt(iid.split('_').pop())+1}" no entra en esta orientación — sin espacio`, 'error');
    return;
  }

  document.getElementById('inspectorDims').textContent =
    `${p.name} #${parseInt(iid.split('_').pop())+1} — ${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm`;
  invalidatePackingCache();
  showToast(`↻ "${p.name} #${parseInt(iid.split('_').pop())+1}" → ${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm`, 'success');
  const savedIid = iid;
  renderLoader();
  setTimeout(() => { if (window.selectInstance3D) selectInstance3D(savedIid); }, 60);
}

function clearRotation() {
  if (!window._selectedInstanceId_global) return;
  const iid = window._selectedInstanceId_global;
  const productId = iid.split('_').slice(0,-1).join('_');
  const p = loadedProducts.find(p => String(p.id) == productId);
  if (!p) return;
  // Clear instance-level override only (doesn't affect other instances)
  window._instanceLockedOri = window._instanceLockedOri || {};
  delete window._instanceLockedOri[iid];
  delete window._instanceManualPos[iid];
  invalidatePackingCache();
  renderLoader();
  showToast(`"${p.name} #${parseInt(iid.split('_').pop())+1}" orientación automática`, '');
}

// Close inspector when clicking outside
document.addEventListener('click', e => {
  const panel = document.getElementById('inspectorPanel');
  const wrap  = document.getElementById('threeContainer');
  if (panel && !panel.contains(e.target) && wrap && !wrap.contains(e.target)) {
    panel.style.display = 'none';
    if (window.deselectAll3D) deselectAll3D();
  }
});

function closeInspector() {
  const panel = document.getElementById('inspectorPanel');
  if (panel) panel.style.display = 'none';
  if (window.deselectAll3D) deselectAll3D();
}

function removeSelectedProduct() {
  if (!window._selectedInstanceId_global) return;
  const iid = window._selectedInstanceId_global;
  const productId = iid.split('_').slice(0,-1).join('_');
  const p = loadedProducts.find(p => String(p.id) == productId);
  if (!p) return;
  // Remove one unit: decrease qty or remove product entirely
  if (p.qty > 1) {
    p.qty--;
    // Clear any manual pos for instances with idx >= new qty
    const unitIdx = parseInt(iid.split('_').pop());
    delete window._instanceManualPos[iid];
    showToast(`🗑 "${p.name}" #${unitIdx+1} eliminado (quedan ${p.qty})`, '');
  } else {
    loadedProducts = loadedProducts.filter(x => x.id != p.id);
    // Clear all manual positions and rotations for this product
    Object.keys(window._instanceManualPos).forEach(k => {
      if (k.startsWith(p.id + '_')) delete window._instanceManualPos[k];
    });
    Object.keys(window._instanceLockedOri || {}).forEach(k => {
      if (k.startsWith(p.id + '_')) delete window._instanceLockedOri[k];
    });
    showToast(`🗑 "${p.name}" eliminado`, '');
  }
  closeInspector();
  renderLoader();
}

function duplicateSelectedProduct() {
  if (!window._selectedInstanceId_global) return;
  const iid = window._selectedInstanceId_global;
  const productId = iid.split('_').slice(0,-1).join('_');
  const p = loadedProducts.find(p => String(p.id) == productId);
  if (!p) return;
  // Add one more unit to the same product
  p.qty++;
  renderLoader();
  showToast(`⧉ "${p.name}" duplicado (${p.qty} unidades)`, 'success');
}


// ── CAMIÓN 3D PARA SEMIS ──
function drawTruck(scene, CL, CW, CH) {
  if (!currentContainerType.startsWith('semi')) return;

  const truckGroup = new THREE.Group();

  const matDark   = new THREE.MeshPhongMaterial({ color: 0x2e2e2e, shininess: 40 });
  const matMid    = new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 20 });
  const matBlack  = new THREE.MeshPhongMaterial({ color: 0x111111 });
  const matChrome = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, shininess: 80 });
  const matGlass  = new THREE.MeshPhongMaterial({ color: 0x88aacc, transparent: true, opacity: 0.45, shininess: 60 });

  const R     = 48;   // radio rueda cm
  const TREAD = 22;   // ancho rueda
  const AXLE_Y = -R;  // centro de rueda: R cm por debajo del piso (Y=0)

  // ── Rueda helper ──
  function addWheel(x, z) {
    const wGeo = new THREE.CylinderGeometry(R, R, TREAD, 18);
    const w = new THREE.Mesh(wGeo, matBlack);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, AXLE_Y, z);
    truckGroup.add(w);
    const rGeo = new THREE.CylinderGeometry(R * 0.52, R * 0.52, TREAD + 2, 14);
    const r = new THREE.Mesh(rGeo, matChrome);
    r.rotation.z = Math.PI / 2;
    r.position.set(x, AXLE_Y, z);
    truckGroup.add(r);
  }

  // ── Chasis (2 largueros bajos) ──
  const CHASSIS_H = 16;
  const CHASSIS_Y = -R * 2 + CHASSIS_H / 2 + R; // apoya sobre las ruedas
  function addChassis(zPos) {
    const g = new THREE.BoxGeometry(CL + 230, CHASSIS_H, 18);
    const m = new THREE.Mesh(g, matDark);
    m.position.set((CL - 230) / 2, -CHASSIS_H / 2, zPos);
    truckGroup.add(m);
  }
  addChassis(28);
  addChassis(CW - 28);

  // ── Ruedas cabina (eje delantero) ──
  const frontAxleX = -160;
  addWheel(frontAxleX, 20);
  addWheel(frontAxleX, CW - 20);

  // ── Ejes traseros semirremolque (a 78% y 88% del largo) ──
  const ax1 = CL * 0.78;
  const ax2 = CL * 0.88;
  for (const ax of [ax1, ax2]) {
    addWheel(ax, 14);
    addWheel(ax, 14 + TREAD + 4);   // doble izq
    addWheel(ax, CW - 14);
    addWheel(ax, CW - 14 - TREAD - 4); // doble der
  }

  // ── Cabina ──
  const CAB_L = 200;
  const CAB_H = CH * 0.82;
  const CAB_W = CW;
  const CAB_X = -CAB_L / 2 - 10; // pegada al frente del semirremolque
  const CAB_Y = CAB_H / 2;       // apoya en Y=0 (piso del semi)

  // Cuerpo
  const cabGeo = new THREE.BoxGeometry(CAB_L, CAB_H, CAB_W);
  const cab = new THREE.Mesh(cabGeo, matDark);
  cab.position.set(CAB_X, CAB_Y, CW / 2);
  truckGroup.add(cab);

  // Parabrisas (cara trasera de la cabina = frente del semi)
  const windGeo = new THREE.BoxGeometry(6, CAB_H * 0.42, CAB_W * 0.72);
  const wind = new THREE.Mesh(windGeo, matGlass);
  wind.position.set(CAB_X + CAB_L / 2, CAB_Y + CAB_H * 0.12, CW / 2);
  truckGroup.add(wind);

  // Spoiler / visera superior
  const spoilerGeo = new THREE.BoxGeometry(CAB_L * 0.6, 12, CAB_W * 0.9);
  const spoiler = new THREE.Mesh(spoilerGeo, matMid);
  spoiler.position.set(CAB_X + CAB_L * 0.1, CAB_Y + CAB_H / 2 + 6, CW / 2);
  truckGroup.add(spoiler);

  // Parachoques
  const bumpGeo = new THREE.BoxGeometry(18, 28, CAB_W * 0.85);
  const bump = new THREE.Mesh(bumpGeo, matChrome);
  bump.position.set(CAB_X - CAB_L / 2 + 9, CAB_Y - CAB_H / 2 + 14, CW / 2);
  truckGroup.add(bump);

  // ── Quinta rueda ──
  const kpGeo = new THREE.CylinderGeometry(28, 28, 12, 14);
  const kp = new THREE.Mesh(kpGeo, matChrome);
  kp.position.set(CL * 0.10, 6, CW / 2);
  truckGroup.add(kp);

  scene.add(truckGroup);
}

renderLoader();