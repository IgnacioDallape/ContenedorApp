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

  const g = new THREE.Group();

  // ── Materiales ──
  const mBody    = new THREE.MeshPhongMaterial({ color:0x1a1f24, shininess:60, specular:0x334455 });
  const mBumper  = new THREE.MeshPhongMaterial({ color:0xcccccc, shininess:120, specular:0xffffff });
  const mGlass   = new THREE.MeshPhongMaterial({ color:0x3a5f8a, transparent:true, opacity:0.6, shininess:120, specular:0xaaccff });
  const mTire    = new THREE.MeshPhongMaterial({ color:0x111111, shininess:8 });
  const mRim     = new THREE.MeshPhongMaterial({ color:0xbbbbbb, shininess:150, specular:0xffffff });
  const mChrome  = new THREE.MeshPhongMaterial({ color:0x999999, shininess:100, specular:0xffffff });
  const mChassis = new THREE.MeshPhongMaterial({ color:0x222222, shininess:15 });
  const mExhaust = new THREE.MeshPhongMaterial({ color:0x555555, shininess:40 });
  const mLight   = new THREE.MeshPhongMaterial({ color:0xffffaa, shininess:200, specular:0xffffff, emissive:0x332200 });

  const R  = 52;  // radio rueda cm
  const TW = 26;  // ancho rueda

  // ── RUEDA: goma + rin + radios ──
  function addWheel(x, z) {
    // Neumático
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(R * 0.78, R * 0.22, 12, 24),
      mTire
    );
    tire.rotation.y = Math.PI / 2;
    tire.position.set(x, -R, z);
    g.add(tire);
    // Cara interna del neumático
    const sideGeo = new THREE.CylinderGeometry(R, R, TW * 0.3, 20);
    const side = new THREE.Mesh(sideGeo, mTire);
    side.rotation.z = Math.PI / 2;
    side.position.set(x, -R, z);
    g.add(side);
    // Rin
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.58, R * 0.58, TW * 0.28, 18),
      mRim
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, -R, z);
    g.add(rim);
    // Hub
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.15, R * 0.15, TW * 0.32, 8),
      mChrome
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, -R, z);
    g.add(hub);
    // Radios (6)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(TW * 0.26, R * 0.08, R * 0.42),
        mRim
      );
      spoke.rotation.x = angle;
      spoke.rotation.z = Math.PI / 2;
      spoke.position.set(x, -R + Math.sin(angle) * R * 0.38, z + Math.cos(angle) * R * 0.38);
      g.add(spoke);
    }
  }

  // ── Rueda doble (dos ruedas juntas) ──
  function addDoubleWheel(x, zOuter) {
    const gap = TW * 0.7;
    addWheel(x, zOuter);
    addWheel(x, zOuter + gap + TW * 0.5);
  }

  // ── 3 EJES TRASEROS ──
  const e1 = CL * 0.70, e2 = e1 + 138, e3 = e2 + 138;
  for (const ex of [e1, e2, e3]) {
    addDoubleWheel(ex, -(TW * 1.5 + 8));          // lado iz exterior
    addDoubleWheel(ex, CW + 8);                    // lado der exterior
  }

  // ── EJE DELANTERO ──
  const fax = -150;
  addWheel(fax, -(TW * 0.6));
  addWheel(fax, CW + TW * 0.6);

  // ── CHASIS perfil I ──
  const chH = 24;
  [-28, CW + 28].forEach(zc => {
    [[-chH/2, chH, 14], [-1, 5, 30], [-chH-1, 5, 30]].forEach(([y, h, w]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CL + 240, h, w), mChassis);
      m.position.set(CL/2 - 120, y, zc);
      g.add(m);
    });
  });
  // Travesaños
  for (let tx = 0; tx <= CL + 20; tx += 170) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, chH, CW + 56 + 30), mChassis);
    m.position.set(tx, -chH/2, CW/2);
    g.add(m);
  }

  // ── QUINTA RUEDA ──
  const kp = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 8, 20), mChrome);
  kp.position.set(CL * 0.10, 4, CW/2);
  g.add(kp);
  const kpBase = new THREE.Mesh(new THREE.BoxGeometry(110, 14, 120), mChassis);
  kpBase.position.set(CL * 0.10, -7, CW/2);
  g.add(kpBase);

  // ── CABINA tipo Actros ──
  // Proporciones: alto ~290cm, largo ~200cm, ancho = CW
  const CabL = 200, CabH = Math.min(CH * 0.92, 290), CabW = CW;
  const CX = -CabL/2 - 8;  // centro X de la cabina
  const CY = CabH/2;

  // Cuerpo principal
  const cabMain = new THREE.Mesh(new THREE.BoxGeometry(CabL, CabH * 0.58, CabW), mBody);
  cabMain.position.set(CX, CabH * 0.29, CabW/2);
  g.add(cabMain);

  // Parte superior (levemente más angosta — perfil aerodinámico)
  const cabTop = new THREE.Mesh(new THREE.BoxGeometry(CabL * 0.92, CabH * 0.42, CabW * 0.94), mBody);
  cabTop.position.set(CX - CabL*0.04, CabH * 0.71, CabW/2);
  g.add(cabTop);

  // Frente inferior (capó corto — Actros tiene frente plano bajo)
  const capot = new THREE.Mesh(new THREE.BoxGeometry(22, CabH * 0.38, CabW * 0.88), mBody);
  capot.position.set(CX - CabL/2 + 11, CabH * 0.19, CabW/2);
  g.add(capot);

  // Parabrisas (inclinado ligeramente)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(10, CabH * 0.36, CabW * 0.72), mGlass);
  windshield.position.set(CX - CabL/2 * 0.88, CabH * 0.72, CabW/2);
  g.add(windshield);

  // Ventana lateral der
  const winSideR = new THREE.Mesh(new THREE.BoxGeometry(CabL * 0.35, CabH * 0.28, 7), mGlass);
  winSideR.position.set(CX + CabL * 0.08, CabH * 0.72, CabW - 3);
  g.add(winSideR);
  // Ventana lateral izq
  const winSideL = winSideR.clone();
  winSideL.position.set(CX + CabL * 0.08, CabH * 0.72, 3);
  g.add(winSideL);

  // Spoiler / visera sobre el parabrisas
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(CabL * 0.72, 16, CabW * 0.84), mBody);
  spoiler.position.set(CX - CabL * 0.06, CabH + 8, CabW/2);
  g.add(spoiler);

  // Deflectores laterales del spoiler
  [-1, 1].forEach(side => {
    const def = new THREE.Mesh(new THREE.BoxGeometry(CabL * 0.55, CabH * 0.25, 14), mBody);
    def.position.set(CX - CabL * 0.1, CabH * 0.88, side > 0 ? CabW + 7 : -7);
    g.add(def);
  });

  // Parachoques inferior (cromo/gris claro)
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(18, 44, CabW * 0.86), mBumper);
  bumper.position.set(CX - CabL/2 + 9, 22, CabW/2);
  g.add(bumper);

  // Rejilla de ventilación (franjas oscuras en el frente)
  for (let i = 0; i < 4; i++) {
    const grill = new THREE.Mesh(new THREE.BoxGeometry(6, 8, CabW * 0.55), mChassis);
    grill.position.set(CX - CabL/2 + 3, 60 + i * 18, CabW/2);
    g.add(grill);
  }

  // Faros (LED-like: forma rectangular baja)
  [-1,1].forEach(side => {
    const faro = new THREE.Mesh(new THREE.BoxGeometry(12, 18, 38), mLight);
    faro.position.set(CX - CabL/2 + 6, 55, side > 0 ? CabW - 22 : 22);
    g.add(faro);
    // Luz de posición
    const drl = new THREE.Mesh(new THREE.BoxGeometry(8, 8, CabW * 0.36), mLight);
    drl.position.set(CX - CabL/2 + 4, 82, side > 0 ? CabW - CabW*0.18 : CabW*0.18);
    g.add(drl);
  });

  // Espejos retrovisores
  [-1,1].forEach(side => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 10), mChrome);
    arm.position.set(CX + CabL/2 - 18, CabH * 0.75, side > 0 ? CabW + 5 : -5);
    g.add(arm);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(8, 28, 18), mGlass);
    mirror.position.set(CX + CabL/2, CabH * 0.72, side > 0 ? CabW + 14 : -14);
    g.add(mirror);
  });

  // Escape (tubo vertical, lado der detrás de cabina)
  const esc = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, CabH * 0.68, 10), mExhaust);
  esc.position.set(CX + CabL/2 - 12, CabH * 0.34 + 20, CabW - 20);
  g.add(esc);
  // Capuchón del escape
  const escCap = new THREE.Mesh(new THREE.CylinderGeometry(10, 7, 16, 10), mExhaust);
  escCap.position.set(CX + CabL/2 - 12, CabH * 0.68 + 28, CabW - 20);
  g.add(escCap);

  // Escalones (2 peldaños)
  [20, 50].forEach(hy => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(28, 12, CabW * 0.5), mChassis);
    step.position.set(CX + CabL/2 - 14, hy, CabW/2);
    g.add(step);
  });

  scene.add(g);
}

renderLoader();