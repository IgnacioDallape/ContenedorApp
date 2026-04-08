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


// ── CAMIÓN 3D PARA SEMIS — carga GLB via GLTFLoader ──
function drawTruck(scene, CL, CW, CH) {
  if (!currentContainerType.startsWith('semi')) return;

  // Cargar GLTFLoader desde jsdelivr (compatible r128)
  function loadGLTFLoader(cb) {
    if (typeof THREE.GLTFLoader !== 'undefined') { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
    s.onload = cb;
    s.onerror = () => { console.warn('GLTFLoader no disponible'); drawTruckFallback(scene, CL, CW, CH); };
    document.head.appendChild(s);
  }

  loadGLTFLoader(() => {
    const loader = new THREE.GLTFLoader();
    // El archivo debe estar en assets/truck.glb dentro del repo
    // Ruta relativa funciona tanto en local como en GitHub Pages
    const base = window.location.pathname.replace(/\/[^/]*$/, '/');
    const url = base + 'assets/truck.glb';

    loader.load(url, (gltf) => {
      const truck = gltf.scene;

      // El modelo tiene largo en eje Y → rotar para que quede en eje X
      truck.rotation.x = Math.PI / 2;   // Y→Z primero
      truck.rotation.z = -Math.PI / 2;  // luego Z→X

      // Escala: ajustamos para que la cabina mida ~200cm de largo y ~CH de alto
      // Bounding box del GLB: Y=8.073, X=5.474, Z=3.815 (unidades)
      // Queremos alto = CH*0.9 → scale = CH*0.9 / 547.4
      const scale = (CH * 0.88) / 547.4;
      truck.scale.set(scale, scale, scale);

      // Ancho del modelo escalado en Z
      const modelW = 381.5 * scale;
      const modelL = 807.3 * scale;

      // Centrar en Z (ancho del semi) y posicionar en X (antes del semi)
      truck.position.set(
        -modelL * 0.5 - 20,   // justo antes del frente del semirremolque
        0,                     // piso
        (CW - modelW) / 2      // centrado en ancho
      );

      // Mejorar materiales — oscurecer para que combine con la escena
      truck.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => { if (m.color) m.color.multiplyScalar(0.85); });
            } else {
              if (child.material.color) child.material.color.multiplyScalar(0.85);
            }
          }
        }
      });

      scene.add(truck);

      // Ejes traseros del semirremolque (siempre con geometría propia)
      drawSemiAxles(scene, CL, CW, CH);

    }, undefined, (err) => {
      console.warn('Error cargando truck.glb, usando fallback:', err);
      drawTruckFallback(scene, CL, CW, CH);
    });
  });
}

// ── EJES TRASEROS (siempre se dibujan, independiente del GLB) ──
function drawSemiAxles(scene, CL, CW, CH) {
  const g = new THREE.Group();
  const mTire   = new THREE.MeshPhongMaterial({ color:0x111111, shininess:8 });
  const mRim    = new THREE.MeshPhongMaterial({ color:0xbbbbbb, shininess:120, specular:0xffffff });
  const mChrome = new THREE.MeshPhongMaterial({ color:0x888888, shininess:60 });
  const mChassis= new THREE.MeshPhongMaterial({ color:0x222222, shininess:10 });

  const R = 52, TW = 26;

  function addWheel(x, z) {
    // Torus: por defecto en plano XY → rotar PI/2 en X para que quede parado (plano XZ)
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R*0.78, R*0.22, 10, 22), mTire);
    tire.rotation.x = Math.PI/2;
    tire.position.set(x, -R, z);
    g.add(tire);
    // Rin y hub: cilindro horizontal → rotation.z = PI/2
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R*0.55, R*0.55, TW*0.3, 16), mRim);
    rim.rotation.z = Math.PI/2;
    rim.position.set(x, -R, z);
    g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R*0.14, R*0.14, TW*0.32, 8), mChrome);
    hub.rotation.z = Math.PI/2;
    hub.position.set(x, -R, z);
    g.add(hub);
  }

  function addDouble(x, zOuter) {
    addWheel(x, zOuter);
    addWheel(x, zOuter + TW + 8);
  }

  // 3 ejes traseros — ruedas dobles justo en los bordes del semi
  const e1 = CL*0.70, e2 = e1+138, e3 = e2+138;
  for (const ex of [e1, e2, e3]) {
    addDouble(ex, -(TW + 6));   // lado izquierdo
    addDouble(ex, CW + 6);     // lado derecho
  }

  // Chasis
  [-28, CW+28].forEach(zc => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(CL+10, 22, 14), mChassis);
    m.position.set(CL/2, -11, zc);
    g.add(m);
  });
  for (let tx = 0; tx <= CL; tx += 170) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 22, CW+56+14), mChassis);
    m.position.set(tx, -11, CW/2);
    g.add(m);
  }

  scene.add(g);
}

// ── FALLBACK si no carga el GLB ──
function drawTruckFallback(scene, CL, CW, CH) {
  drawSemiAxles(scene, CL, CW, CH);
  // Cabina básica
  const g = new THREE.Group();
  const m = new THREE.MeshPhongMaterial({ color:0x1a1f24, shininess:40 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(190, CH*0.88, CW), m);
  cab.position.set(-95, CH*0.44, CW/2);
  g.add(cab);
  scene.add(g);
}

renderLoader();