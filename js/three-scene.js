// Inject Three.js + OrbitControls from CDN
(function loadThree() {
  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = () => {
    // Inline minimal OrbitControls (r128 compatible)
    injectOrbitControls();
    initThreeScene();
  };
  document.head.appendChild(s1);
})();

function injectOrbitControls() {
  // Minimal OrbitControls implementation
  THREE.OrbitControls = function(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3();
    this.enableDamping = true;
    this.dampingFactor = 0.08;
    this.enableZoom = true;
    this.enablePan = true;
    this.enableRotate = true;
    this.minDistance = 100;
    this.maxDistance = 2000;
    this.maxPolarAngle = Math.PI * 0.85;

    let _spherical = new THREE.Spherical();
    let _sphericalDelta = new THREE.Spherical();
    let _scale = 1;
    let _panOffset = new THREE.Vector3();
    let _rotateStart = new THREE.Vector2();
    let _rotateEnd = new THREE.Vector2();
    let _rotateDelta = new THREE.Vector2();
    let _panStart = new THREE.Vector2();
    let _panEnd = new THREE.Vector2();
    let _panDelta = new THREE.Vector2();
    let _state = -1;
    const STATE = { NONE:-1, ROTATE:0, DOLLY:1, PAN:2 };

    // init spherical from camera
    const offset = new THREE.Vector3();
    offset.copy(camera.position).sub(this.target);
    _spherical.setFromVector3(offset);

    const self = this;

    function rotateLeft(a) { _sphericalDelta.theta -= a; }
    function rotateUp(a) { _sphericalDelta.phi -= a; }

    function panLeft(dist, mat) {
      const v = new THREE.Vector3().setFromMatrixColumn(mat, 0);
      v.multiplyScalar(-dist);
      _panOffset.add(v);
    }
    function panUp(dist, mat) {
      const v = new THREE.Vector3().setFromMatrixColumn(mat, 1);
      v.multiplyScalar(dist);
      _panOffset.add(v);
    }
    function pan(dx, dy) {
      const el = domElement;
      const pos = camera.position;
      let targetDist = pos.clone().sub(self.target).length();
      targetDist *= Math.tan((camera.fov / 2) * Math.PI / 180);
      panLeft(2 * dx * targetDist / el.clientHeight, camera.matrix);
      panUp(2 * dy * targetDist / el.clientHeight, camera.matrix);
    }

    domElement.addEventListener('contextmenu', e => e.preventDefault());

    domElement.addEventListener('mousedown', e => {
      if (e.button === 0 && self.enableRotate) { _state = STATE.ROTATE; _rotateStart.set(e.clientX, e.clientY); }
      else if (e.button === 2) { _state = STATE.PAN; _panStart.set(e.clientX, e.clientY); }
    });
    domElement.addEventListener('mousemove', e => {
      // If rotate was disabled after mousedown (e.g. object drag started), stop rotating
      if (_state === STATE.ROTATE && !self.enableRotate) { _state = STATE.NONE; return; }
      if (_state === STATE.ROTATE) {
        _rotateEnd.set(e.clientX, e.clientY);
        _rotateDelta.subVectors(_rotateEnd, _rotateStart).multiplyScalar(0.0018);
        rotateLeft(_rotateDelta.x);
        rotateUp(_rotateDelta.y);
        _rotateStart.copy(_rotateEnd);
      } else if (_state === STATE.PAN) {
        _panEnd.set(e.clientX, e.clientY);
        _panDelta.subVectors(_panEnd, _panStart);
        pan(_panDelta.x, _panDelta.y);
        _panStart.copy(_panEnd);
      }
    });
    domElement.addEventListener('mouseup', () => { _state = STATE.NONE; });
    domElement.addEventListener('wheel', e => {
      e.preventDefault();
      _scale *= e.deltaY > 0 ? 1.06 : 0.945;
    }, { passive: false });

    // Touch
    let _touches = [];
    let _prevTouchDist = 0;
    domElement.addEventListener('touchstart', e => {
      _touches = Array.from(e.touches);
      if (_touches.length === 1) { _state = STATE.ROTATE; _rotateStart.set(_touches[0].clientX, _touches[0].clientY); }
      else if (_touches.length === 2) { _state = STATE.DOLLY; _prevTouchDist = Math.hypot(_touches[0].clientX-_touches[1].clientX, _touches[0].clientY-_touches[1].clientY); }
    }, { passive: true });
    domElement.addEventListener('touchmove', e => {
      _touches = Array.from(e.touches);
      if (_state === STATE.ROTATE && _touches.length === 1) {
        _rotateEnd.set(_touches[0].clientX, _touches[0].clientY);
        _rotateDelta.subVectors(_rotateEnd, _rotateStart).multiplyScalar(0.0018);
        rotateLeft(_rotateDelta.x); rotateUp(_rotateDelta.y);
        _rotateStart.copy(_rotateEnd);
      } else if (_state === STATE.DOLLY && _touches.length === 2) {
        const d = Math.hypot(_touches[0].clientX-_touches[1].clientX, _touches[0].clientY-_touches[1].clientY);
        _scale *= _prevTouchDist / d; _prevTouchDist = d;
      }
    }, { passive: true });
    domElement.addEventListener('touchend', () => { _state = STATE.NONE; });

    this.update = function() {
      const offset2 = new THREE.Vector3();
      const quat = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0,1,0));
      const quatInv = quat.clone().invert();

      offset2.copy(camera.position).sub(self.target);
      offset2.applyQuaternion(quat);
      _spherical.setFromVector3(offset2);

      _spherical.theta += _sphericalDelta.theta;
      _spherical.phi   += _sphericalDelta.phi;
      _spherical.phi = Math.max(0.05, Math.min(self.maxPolarAngle, _spherical.phi));
      _spherical.radius *= _scale;
      _spherical.radius = Math.max(self.minDistance, Math.min(self.maxDistance, _spherical.radius));

      self.target.add(_panOffset);
      offset2.setFromSpherical(_spherical);
      offset2.applyQuaternion(quatInv);
      camera.position.copy(self.target).add(offset2);
      camera.lookAt(self.target);

      if (self.enableDamping) {
        _sphericalDelta.theta *= (1 - self.dampingFactor);
        _sphericalDelta.phi   *= (1 - self.dampingFactor);
        _panOffset.multiplyScalar(1 - self.dampingFactor);
      } else {
        _sphericalDelta.set(0,0,0); _panOffset.set(0,0,0);
      }
      _scale = 1;
    };

    this.dispose = function() {};
  };
}

// Global Three.js state
let _three = null;


function getActiveZones() {
  return window._priorityZones.filter(z => z !== null);
}

function drawAllPriorityMarkers() {
  if (!_three || !_three.priorityGroup) return;
  clearPriorityMarker();

  // Get current heightmap to find top of stack at each zone XZ
  let hm = null;
  try {
    const result = runPackingCached(loadedProducts);
    hm = result ? result.hm : null;
  } catch(e) {}

  window._priorityZones.forEach((pz, i) => {
    if (!pz) return;
    const col = ZONE_COLORS[i];
    const size = 70;

    // Draw ring at the TOP of whatever is stacked at this XZ position
    const stackH = hm ? hmGetMax(hm, pz.x, pz.z, 1, 1) : (pz.y || 0);
    const displayY = stackH + 3; // 3cm above stack top

    const ringGeo = new THREE.RingGeometry(size * 0.4, size * 0.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pz.x, displayY, pz.z);
    _three.priorityGroup.add(ring);

    const dotGeo = new THREE.CircleGeometry(size * 0.2, 24);
    const dotMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(pz.x, displayY, pz.z);
    _three.priorityGroup.add(dot);

    // Vertical line from stack top up to mid-container
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pz.x, displayY, pz.z),
      new THREE.Vector3(pz.x, displayY + CONT_H * 0.4, pz.z)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.4 });
    _three.priorityGroup.add(new THREE.Line(lineGeo, lineMat));

    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = ZONE_COLORS_HEX[i];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZONE_LABELS[i], 100, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(100, 28, 1);
    sprite.position.set(pz.x, displayY + CONT_H * 0.45, pz.z);
    _three.priorityGroup.add(sprite);
  });
  updateZoneUI();
}

// Keep old name for compatibility
function drawPriorityMarker() { drawAllPriorityMarkers(); }

function clearPriorityMarker() {
  if (!_three || !_three.priorityGroup) return;
  while (_three.priorityGroup.children.length) {
    const c = _three.priorityGroup.children[0];
    c.geometry && c.geometry.dispose();
    c.material && c.material.dispose();
    _three.priorityGroup.remove(c);
  }
}

function updateZoneUI() {
  const hint = document.getElementById('priorityHint');
  const clearBtn = document.getElementById('clearPriorityBtn');
  const active = window._priorityZones.filter(z => z !== null).length;
  if (hint) hint.style.display = active > 0 ? 'inline-flex' : 'none';
  if (clearBtn) clearBtn.style.display = active > 0 ? 'inline-block' : 'none';
  // Update zone selector buttons
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById(`zoneBtn${i}`);
    if (!btn) continue;
    const set = window._priorityZones[i] !== null;
    btn.style.background = set ? ZONE_COLORS_HEX[i] : 'transparent';
    btn.style.color = set ? '#fff' : ZONE_COLORS_HEX[i];
    btn.style.borderColor = ZONE_COLORS_HEX[i];
    btn.style.fontWeight = _selectedZoneSlot === i ? '700' : '400';
    btn.style.outline = _selectedZoneSlot === i ? `2px solid ${ZONE_COLORS_HEX[i]}` : 'none';
    btn.title = set ? `${ZONE_LABELS[i]} activa — doble clic en el contenedor para mover` : `Seleccioná ${ZONE_LABELS[i]} y hacé doble clic en el contenedor para fijarla`;
  }
  // Refresh catalog to show zone selectors
  if (document.getElementById('catalogGrid') && catalog.length) renderCatalog();
}

function initThreeScene() {
  const wrap = document.getElementById('threeContainer');
  if (!wrap || _three) return;

  const W = wrap.clientWidth || 700;
  const H = wrap.clientHeight || 380;

  // Renderer — higher quality
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xEDE6DA, 1);
  wrap.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xEDE6DA, 2000, 4000);

  // Camera
  const camera = new THREE.PerspectiveCamera(35, W / H, 1, 8000);
  camera.position.set(CONT_L*0.8, CONT_H*2.2, CONT_W*2.5);
  camera.lookAt(CONT_L/2, CONT_H*0.4, CONT_W/2);

  // ── Lights — warm studio setup ──
  // Ambient (warm fill)
  scene.add(new THREE.AmbientLight(0xFFEDD8, 0.55));
  // Key light (warm sun from upper right)
  const sun = new THREE.DirectionalLight(0xFFF4E0, 1.2);
  sun.position.set(600, 1000, 500);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 5000;
  sun.shadow.camera.left = -800; sun.shadow.camera.right = 1400;
  sun.shadow.camera.top = 800;   sun.shadow.camera.bottom = -800;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 3;
  scene.add(sun);
  // Cool fill light from left
  const fill = new THREE.DirectionalLight(0xD0E8FF, 0.4);
  fill.position.set(-500, 300, -200);
  scene.add(fill);
  // Bounce light from below (simulates floor reflection)
  const bounce = new THREE.DirectionalLight(0xFFE8C0, 0.15);
  bounce.position.set(0, -200, 0);
  scene.add(bounce);

  // Controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(CONT_L/2, CONT_H*0.35, CONT_W/2);
  controls.minDistance = 150;
  controls.maxDistance = 3500;
  controls.maxPolarAngle = Math.PI * 0.82;
  controls.update();

  // Container group
  const containerGroup = new THREE.Group();
  scene.add(containerGroup);

  // Floor mesh (invisible, for raycasting — lives directly in scene, NOT containerGroup)
  const floorGeo = new THREE.PlaneGeometry(CONT_L * 4, CONT_W * 4);
  const floorMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(CONT_L / 2, 1, CONT_W / 2);
  scene.add(floorMesh);

  // Priority zone marker group
  const priorityGroup = new THREE.Group();
  scene.add(priorityGroup);

  if (window._priorityZone) drawPriorityMarker();

  // ── INTERACTION STATE ──
  let _interactMode = 'move'; // 'move' | 'rotate'
  let _selectedMeshes = []; // all meshes belonging to selected instance
  let _selectedOutlines = []; // highlight outline meshes
  let _selectedInstanceId = null; // currently selected instanceId
  let _isDragging3D = false;
  let _dragFloorStart = null;
  let _dragInstanceStart = null; // {x, z} of instance at drag start
  let _mouseDownPos = { x: 0, y: 0 };
  let _mouseDownTime2 = 0;

  // Global instance manual positions: { instanceId: {x, z} }
  window._instanceManualPos = window._instanceManualPos || {};

  // Cached dims for active drag (avoid runPacking in mousemove)
  let _dragCachedDims = null; // { dX, dZ }

  window.setInteractMode = function(mode) {
    _interactMode = mode;
    document.getElementById('panelMove').style.display = mode === 'move' ? 'block' : 'none';
    document.getElementById('panelRotate').style.display = mode === 'rotate' ? 'block' : 'none';
    const bMove = document.getElementById('btnModeMove');
    const bRot  = document.getElementById('btnModeRotate');
    if (mode === 'move') {
      bMove.style.background = 'var(--c1)'; bMove.style.color = 'var(--c5)'; bMove.style.borderColor = 'var(--c1)'; bMove.style.fontWeight = '700';
      bRot.style.background  = 'transparent'; bRot.style.color = 'var(--text2)'; bRot.style.borderColor = 'var(--border2)'; bRot.style.fontWeight = '400';
    } else {
      bRot.style.background  = 'var(--c1)'; bRot.style.color = 'var(--c5)'; bRot.style.borderColor = 'var(--c1)'; bRot.style.fontWeight = '700';
      bMove.style.background = 'transparent'; bMove.style.color = 'var(--text2)'; bMove.style.borderColor = 'var(--border2)'; bMove.style.fontWeight = '400';
      // Grey out X/Z for pallets (only Y makes sense)
      if (_selectedInstanceId) {
        const productId = _selectedInstanceId.split('_').slice(0,-1).join('_');
        const p = loadedProducts.find(p => String(p.id) == productId);
        if (p && p.type === 'pallet') {
          ['btnRotX','btnRotZ'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) { btn.style.opacity = '0.35'; btn.style.pointerEvents = 'none'; btn.title = 'Los pallets solo rotan horizontalmente'; }
          });
          const btnY = document.getElementById('btnRotY');
          if (btnY) { btnY.style.opacity = '1'; btnY.style.pointerEvents = ''; }
        } else {
          ['btnRotY','btnRotX','btnRotZ'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = ''; }
          });
        }
      }
    }
  };

  function getFloorIntersect(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);
    const hits = rc.intersectObject(floorMesh);
    return hits.length ? hits[0].point : null;
  }

  function selectInstance3D(instanceId) {
    deselectAll3D();
    if (instanceId == null) return;
    _selectedInstanceId = instanceId;
    window._selectedInstanceId_global = instanceId;
    _three._selectedProductId = instanceId;
    // Find all meshes for this instance
    containerGroup.children.forEach(obj => {
      if (obj.userData && obj.userData.instanceId === instanceId) {
        _selectedMeshes.push(obj);
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach(m => { if (m && m.emissive) m.emissive.setHex(0x2a1e10); });
      }
    });
    // Add selection outline
    if (_selectedMeshes.length > 0) {
      const mainMesh = _selectedMeshes.find(m => m.userData && m.userData.instanceId === instanceId && m.geometry && m.geometry.type === 'BoxGeometry');
      if (mainMesh) {
        const bb = new THREE.Box3().setFromObject(mainMesh);
        const size = bb.getSize(new THREE.Vector3());
        const outGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 3, size.y + 3, size.z + 3));
        const outMat = new THREE.LineBasicMaterial({ color: 0xFFCC44 });
        const outline = new THREE.LineSegments(outGeo, outMat);
        outline.position.copy(mainMesh.position);
        outline._isOutline = true;
        scene.add(outline);
        _selectedOutlines.push(outline);
      }
    }
    updateMoveCoords();
  }

  window.selectInstance3D = selectInstance3D;

  window.deselectAll3D = function() {
    _selectedMeshes.forEach(obj => {
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(m => { if (m && m.emissive) m.emissive.setHex(0x000000); });
    });
    _selectedOutlines.forEach(o => { o.geometry && o.geometry.dispose(); scene.remove(o); });
    _selectedMeshes = [];
    _selectedOutlines = [];
    _selectedInstanceId = null;
    window._selectedInstanceId_global = null;
    _three._selectedProductId = null;
  };

  function updateMoveCoords() {
    const el = document.getElementById('moveCoords');
    if (!el) return;
    if (!_selectedInstanceId) { el.textContent = 'X: — · Z: —'; return; }
    const { packed } = runPackingCached(loadedProducts);
    const item = packed.find(i => i.instanceId === _selectedInstanceId);
    if (item) el.textContent = `X: ${Math.round(item.x)} · Z: ${Math.round(item.z)} cm`;
  }

  window.nudgeSelected = function(dx, dz) {
    if (!_selectedInstanceId) return;
    const step = parseInt(document.getElementById('nudgeStep').value) || 10;
    // Get current position
    const { packed } = runPackingCached(loadedProducts);
    const item = packed.find(i => i.instanceId === _selectedInstanceId);
    if (!item) return;
    const cur = window._instanceManualPos[_selectedInstanceId] || { x: item.x, z: item.z };
    const nx = Math.max(0, Math.min(CONT_L - item.dX, cur.x + dx * step));
    const nz = Math.max(0, Math.min(CONT_W - item.dZ, cur.z + dz * step));
    window._instanceManualPos[_selectedInstanceId] = { x: Math.round(nx / 5) * 5, z: Math.round(nz / 5) * 5 };
    const iid = _selectedInstanceId;
    renderLoader();
    setTimeout(() => { selectInstance3D(iid); updateMoveCoords(); }, 60);
    showToast(`↔ ${item.name} #${item.instanceId.split('_')[1]} → X${Math.round(nx)} Z${Math.round(nz)} cm`, '');
  };

  // ── MOUSEDOWN — detect drag start ──
  renderer.domElement.addEventListener('mousedown', e => {
    _mouseDownTime2 = Date.now();
    _mouseDownPos = { x: e.clientX, y: e.clientY };
    _dragFloorStart = null;
    _isDragging3D = false;

    if (e.button === 0 && _selectedInstanceId != null && _interactMode === 'move') {
      // Immediately check if we're clicking on the selected object or near it
      const rect = renderer.domElement.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(mx, my), camera);
      const hits = rc.intersectObjects(containerGroup.children, true)
        .filter(h => h.object.userData && h.object.userData.instanceId === _selectedInstanceId);

      if (hits.length > 0) {
        // Clicking directly on selected object — prepare drag, block orbit
        const pt = getFloorIntersect(e);
        if (pt) {
          _dragFloorStart = { x: pt.x, z: pt.z };
          // Cache dims from packed data ONCE at drag start
          const { packed } = runPackingCached(loadedProducts);
          const item = packed.find(i => i.instanceId === _selectedInstanceId);
          if (item) {
            _dragInstanceStart = { x: item.x, z: item.z };
            _dragCachedDims = { dX: item.dX, dZ: item.dZ };
          } else if (window._instanceManualPos[_selectedInstanceId]) {
            _dragInstanceStart = { ...window._instanceManualPos[_selectedInstanceId] };
            // Estimate dims from product
            const productId = _selectedInstanceId.split('_').slice(0,-1).join('_');
            const p = loadedProducts.find(p => String(p.id) == productId);
            if (p) _dragCachedDims = { dX: p.dims.L, dZ: p.dims.W };
          }
          controls.enableRotate = false; // block orbit immediately
        }
      }
    }
  });

  // ── MOUSEMOVE — handle drag ──
  renderer.domElement.addEventListener('mousemove', e => {
    const rect = renderer.domElement.getBoundingClientRect();

    // Drag move logic
    if (_dragFloorStart && _selectedInstanceId != null && _interactMode === 'move') {
      const moved = Math.hypot(e.clientX - _mouseDownPos.x, e.clientY - _mouseDownPos.y);
      if (moved > 4 && !_isDragging3D) {
        _isDragging3D = true;
        renderer.domElement.style.cursor = 'grabbing';
        document.getElementById('hintBar').textContent = '✥ SOLTÁ para fijar la posición';
        document.getElementById('tooltip3d').style.display = 'none';
      }
      if (_isDragging3D) {
        const pt = getFloorIntersect(e);
        if (pt && _dragInstanceStart && _dragCachedDims) {
          const iid = _selectedInstanceId;
          const ddx = pt.x - _dragFloorStart.x;
          const ddz = pt.z - _dragFloorStart.z;
          const dX = _dragCachedDims.dX;
          const dZ = _dragCachedDims.dZ;
          const snap = 5;
          let nx = Math.round((_dragInstanceStart.x + ddx) / snap) * snap;
          let nz = Math.round((_dragInstanceStart.z + ddz) / snap) * snap;
          nx = Math.max(0, Math.min(CONT_L - dX, nx));
          nz = Math.max(0, Math.min(CONT_W - dZ, nz));
          window._instanceManualPos[iid] = { x: nx, z: nz };
          // Move ALL meshes belonging to this instance (includes pallet sub-parts)
          const cx = nx + dX / 2, cz = nz + dZ / 2;
          containerGroup.children.forEach(m => {
            if (m.userData && m.userData.instanceId === iid) {
              m.position.x = cx;
              m.position.z = cz;
            }
          });
          // Move outline
          if (_selectedOutlines.length > 0) {
            _selectedOutlines[0].position.x = cx;
            _selectedOutlines[0].position.z = cz;
          }
          document.getElementById('moveCoords').textContent = `X: ${Math.round(nx)} · Z: ${Math.round(nz)} cm`;
        }
        return;
      }
    }

    // ── Hover tooltip (only when not dragging) ──
    if (!_three) return;
    if (!_three._raycaster) {
      _three._raycaster = new THREE.Raycaster();
      _three._mouse = new THREE.Vector2();
      _three._tooltip = document.getElementById('tooltip3d');
      _three._hoveredMesh = null;
    }
    const mouse = _three._mouse;
    const raycaster = _three._raycaster;
    const tooltip = _three._tooltip;

    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(containerGroup.children, true);
    const hit = hits.find(h => h.object.userData && h.object.userData.label);

    if (hit && !_isDragging3D) {
      const ud = hit.object.userData;
      const isSelected = ud.instanceId === _selectedInstanceId;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      tooltip.style.top  = (e.clientY - rect.top  - 10) + 'px';
      tooltip.innerHTML = `
        <div style="font-weight:600;font-size:13px;margin-bottom:4px">${ud.label}${isSelected?' <span style="color:#FFcc44;font-size:10px">● sel</span>':''}</div>
        <div style="opacity:0.75;font-size:11px">${ud.type === 'pallet' ? '🟫 Pallet' : '📦 Caja'}</div>
        <div style="opacity:0.75;font-size:11px">${ud.dims}</div>
        ${ud.pct ? `<div style="margin-top:4px;color:#c8b89a;font-size:11px">${ud.pct}% del contenedor</div>` : ''}
        ${!isSelected ? '<div style="margin-top:4px;color:#aaa;font-size:10px">CLIC para seleccionar</div>' : ''}
      `;
      if (_three._hoveredMesh !== hit.object && !isSelected) {
        if (_three._hoveredMesh) {
          const mats = Array.isArray(_three._hoveredMesh.material) ? _three._hoveredMesh.material : [_three._hoveredMesh.material];
          mats.forEach(m => { if (m && m.emissive && _three._hoveredMesh.userData.instanceId !== _selectedInstanceId) m.emissive.setHex(0x000000); });
        }
        _three._hoveredMesh = hit.object;
        const mats = Array.isArray(_three._hoveredMesh.material) ? _three._hoveredMesh.material : [_three._hoveredMesh.material];
        mats.forEach(m => { if (m && m.emissive) m.emissive.setHex(0x1a1410); });
      }
    } else {
      tooltip.style.display = 'none';
      if (_three._hoveredMesh && _three._hoveredMesh.userData.instanceId !== _selectedInstanceId) {
        const mats = Array.isArray(_three._hoveredMesh.material) ? _three._hoveredMesh.material : [_three._hoveredMesh.material];
        mats.forEach(m => { if (m && m.emissive) m.emissive.setHex(0x000000); });
        _three._hoveredMesh = null;
      }
    }
    renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
  });

  // ── MOUSEUP — end drag or fire click ──
  renderer.domElement.addEventListener('mouseup', e => {
    const wasDragging = _isDragging3D;
    _isDragging3D = false;
    controls.enableRotate = true;
    renderer.domElement.style.cursor = 'default';

    if (_dragFloorStart && wasDragging) {
      _dragFloorStart = null;
      _dragInstanceStart = null;
      _dragCachedDims = null;
      const iid = _selectedInstanceId;
      document.getElementById('hintBar').textContent = '🖱 ARRASTRAR · SCROLL ZOOM · CLIC = SELECCIONAR · DOBLE CLIC = FIJAR ZONA';
      invalidatePackingCache();
      renderLoader();
      setTimeout(() => { selectInstance3D(iid); updateMoveCoords(); }, 60);
      return;
    }
    _dragFloorStart = null;
    _dragInstanceStart = null;
    _dragCachedDims = null;

    // Short click — select instance (but not if this was part of a dblclick)
    if (Date.now() - _mouseDownTime2 > 300) return;
    if (Date.now() - _lastDblClickTime < 400) return; // suppress after dblclick
    const moved = Math.hypot(e.clientX - _mouseDownPos.x, e.clientY - _mouseDownPos.y);
    if (moved > 8) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);
    const hits = rc.intersectObjects(containerGroup.children, true)
      .filter(h => h.object.userData && h.object.userData.instanceId != null);

    const menu = document.getElementById('inspectorPanel');
    if (hits.length > 0) {
      const ud = hits[0].object.userData;
      const iid = ud.instanceId;
      const productId = ud.productId;
      selectInstance3D(iid);
      const p = loadedProducts.find(p => p.id == productId);
      const unitIdx = parseInt(iid.split('_').pop()) + 1;
      const icon = ud.type === 'pallet' ? '🟫' : '📦';
      document.getElementById('inspectorIcon').textContent = icon;
      document.getElementById('inspectorTitle').textContent = `${ud.label} #${unitIdx}`;
      document.getElementById('inspectorDims').textContent = ud.dims + (p && p.weight > 0 ? ` · ⚖ ${p.weight} kg` : '');
      menu.style.display = 'block';
      updateMoveCoords();
    } else {
      menu.style.display = 'none';
      deselectAll3D();
    }
  });

  renderer.domElement.addEventListener('mouseleave', () => {
    document.getElementById('tooltip3d').style.display = 'none';
    if (_isDragging3D) {
      _isDragging3D = false;
      controls.enableRotate = true;
    }
  });

  // Track dblclick so mouseup doesn't also fire a selection
  let _lastDblClickTime = 0;

  renderer.domElement.addEventListener('dblclick', e => {
    _lastDblClickTime = Date.now();
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);

    // Hit test: check boxes/pallets FIRST to get XZ from top surface
    // Then also check floor to get the XZ coordinate reliably
    const boxHits = rc.intersectObjects(containerGroup.children, true)
      .filter(h => h.object.userData && h.object.userData.instanceId);
    const floorHits = rc.intersectObject(floorMesh);

    let px, pz2;

    if (floorHits.length > 0) {
      // Use floor for reliable XZ coordinate (floor covers entire container area)
      const pt = floorHits[0].point;
      px  = Math.max(0, Math.min(CONT_L, pt.x));
      pz2 = Math.max(0, Math.min(CONT_W, pt.z));
    } else if (boxHits.length > 0) {
      const pt = boxHits[0].point;
      px  = Math.max(0, Math.min(CONT_L, pt.x));
      pz2 = Math.max(0, Math.min(CONT_W, pt.z));
    } else {
      return;
    }

    // Y = height of the top of whatever occupies this XZ column in the heightmap
    // This makes the zone marker appear ON TOP of existing cargo, not below it
    const hm = runPackingCached(loadedProducts).hm;
    const colH = hm ? hmGetMax(hm, px, pz2, 1, 1) : 0;
    const py = colH; // marker floats at current stack height

    const slot = _selectedZoneSlot;
    window._priorityZones[slot] = { x: px, y: py, z: pz2 };
    drawAllPriorityMarkers();
    showToast(`${ZONE_LABELS[slot]} marcada — asignala a un producto con "→ zona" en la lista`, 'success');
  });

  // Right click = clear selected priority zone
  renderer.domElement.addEventListener('contextmenu', e => {
    e.preventDefault();
    document.getElementById('inspectorPanel').style.display = 'none';
    const slot = _selectedZoneSlot;
    if (window._priorityZones[slot]) {
      window._priorityZones[slot] = null;
      drawAllPriorityMarkers();
      showToast(`${ZONE_LABELS[slot]} eliminada`, '');
    }
  });

  // Animation loop — handles drop-in animation + orbit
  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Drop-in animation
    if (_three && _three._animItems && _three._animItems.length > 0) {
      const elapsed = Date.now() - (_three._animStartTime || 0);
      let allDone = true;
      for (const item of _three._animItems) {
        const t = Math.max(0, elapsed - item.delay);
        if (t <= 0) { allDone = false; continue; }
        const duration = 320;
        const progress = Math.min(1, t / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        // Drop from just above container ceiling (CONT_H + 20cm) instead of 1.5x above target
        // This keeps stacked items visible and prevents clipping through ceiling
        const dropFrom = CONT_H + 20;
        const startY = Math.max(item.targetY + dropFrom, item.targetY + 40);
        item.mesh.position.y = startY + (item.targetY - startY) * eased;
        if (progress < 1) allDone = false;
      }
      if (allDone) _three._animItems = [];
    }

    renderer.render(scene, camera);
  }
  animate();

  // Resize handler
  let _roTimer = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(_roTimer);
    _roTimer = setTimeout(() => {
      const nW = wrap.clientWidth;
      const nH = wrap.clientHeight;
      if (nW > 0 && nH > 0) {
        renderer.setSize(nW, nH);
        camera.aspect = nW / nH;
        camera.updateProjectionMatrix();
      }
    }, 50);
  });
  ro.observe(wrap);

  _three = { scene, camera, renderer, controls, containerGroup, priorityGroup, floorMesh };

  // Force correct size after DOM settles
  setTimeout(() => {
    const nW = wrap.clientWidth;
    const nH = wrap.clientHeight;
    if (nW > 0 && nH > 0) {
      renderer.setSize(nW, nH);
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
    }
    drawContainer();
  }, 50);
}