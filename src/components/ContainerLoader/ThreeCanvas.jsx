import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { ZONE_COLORS, ZONE_COLORS_HEX, ZONE_LABELS } from '../../lib/constants.js';
import { runPacking, runPackingCached, invalidatePackingCache, hmGetMax } from '../../lib/packing.js';

// ── Material cache: one template per hex color, cloned per mesh ──
const _matTemplates = new Map();
function makeBoxMaterials(hex) {
  let h = (hex || '#8D7966').replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (!_matTemplates.has(h)) {
    _matTemplates.set(h, new THREE.MeshPhongMaterial({ color: parseInt(h, 16), shininess: 14, specular: 0x111111 }));
  }
  return _matTemplates.get(h).clone();
}

function ThreeCanvas({ onSelectInstance, onSetZone, onClearZone }, ref) {
  const wrapRef = useRef(null);
  const threeRef = useRef(null); // { scene, camera, renderer, controls, containerGroup, priorityGroup, floorMesh }

  const {
    loadedProducts, CONT_L, CONT_W, CONT_H, CONTAINER_VOL, currentContainerType,
    priorityZones, instanceManualPos, instanceLockedOri, selectedZoneSlot,
    setInstanceManualPos, setSelectedInstance,
  } = useContainerStore();
  const { showToast } = useAppStore();

  // ─── Init Three.js (once) ───
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || threeRef.current) return;

    const W = wrap.clientWidth  || 700;
    const H = wrap.clientHeight || 380;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0xEDE6DA, 1);
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xEDE6DA, 2000, 4000);

    const camera = new THREE.PerspectiveCamera(35, W / H, 1, 8000);
    camera.position.set(CONT_L * 0.8, CONT_H * 2.2, CONT_W * 2.5);
    camera.lookAt(CONT_L / 2, CONT_H * 0.4, CONT_W / 2);

    scene.add(new THREE.AmbientLight(0xFFEDD8, 0.55));
    const sun = new THREE.DirectionalLight(0xFFF4E0, 1.2);
    sun.position.set(600, 1000, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 5000;
    sun.shadow.camera.left = -800; sun.shadow.camera.right = 1400;
    sun.shadow.camera.top = 800; sun.shadow.camera.bottom = -800;
    sun.shadow.bias = -0.0005; sun.shadow.radius = 3;
    scene.add(sun);
    const fillLight = new THREE.DirectionalLight(0xD0E8FF, 0.4);
    fillLight.position.set(-500, 300, -200);
    scene.add(fillLight);
    const backLight = new THREE.DirectionalLight(0xFFE8C0, 0.15);
    backLight.position.set(0, -200, 0);
    scene.add(backLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(CONT_L / 2, CONT_H * 0.35, CONT_W / 2);
    controls.minDistance = 150;
    controls.maxDistance = 3500;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    const containerGroup = new THREE.Group();
    scene.add(containerGroup);

    const floorGeo = new THREE.PlaneGeometry(CONT_L * 4, CONT_W * 4);
    const floorMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(CONT_L / 2, 1, CONT_W / 2);
    scene.add(floorMesh);

    const priorityGroup = new THREE.Group();
    scene.add(priorityGroup);

    function animate() {
      requestAnimationFrame(animate);
      controls.update();

      let needsShadowUpdate = false;
      if (threeRef.current?._animItems?.length > 0) {
        const elapsed = Date.now() - (threeRef.current._animStartTime || 0);
        let allDone = true;
        for (const item of threeRef.current._animItems) {
          const t = Math.max(0, elapsed - item.delay);
          if (t <= 0) { allDone = false; continue; }
          const progress = Math.min(1, t / 320);
          const eased = 1 - Math.pow(1 - progress, 3);
          const startY = item.targetY + CONT_H + 20;
          item.mesh.position.y = progress >= 1 ? item.targetY : startY + (item.targetY - startY) * eased;
          if (progress < 1) allDone = false;
        }
        if (allDone) threeRef.current._animItems = [];
        needsShadowUpdate = true;
      }
      if (needsShadowUpdate || threeRef.current?._shadowDirty) {
        renderer.shadowMap.needsUpdate = true;
        threeRef.current._shadowDirty = false;
      }

      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const nW = wrap.clientWidth;
      const nH = wrap.clientHeight;
      if (nW > 0 && nH > 0) {
        renderer.setSize(nW, nH);
        camera.aspect = nW / nH;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(wrap);

    threeRef.current = { scene, camera, renderer, controls, containerGroup, priorityGroup, floorMesh, ro,
      _animItems: [], _animStartTime: 0,
      _selectedInstanceId: null, _selectedMeshes: [], _selectedOutlines: [],
      _hoveredMesh: null, _raycaster: new THREE.Raycaster(), _mouse: new THREE.Vector2(),
      _isDragging: false, _dragFloorStart: null, _dragInstanceStart: null, _dragCachedDims: null,
      _mouseDownPos: { x: 0, y: 0 }, _mouseDownTime: 0, _lastDblClickTime: 0,
    };

    setTimeout(() => {
      const nW = wrap.clientWidth, nH = wrap.clientHeight;
      if (nW > 0 && nH > 0) {
        renderer.setSize(nW, nH);
        camera.aspect = nW / nH;
        camera.updateProjectionMatrix();
      }
    }, 50);

    return () => {
      ro.disconnect();
      renderer.dispose();
      if (wrap.contains(renderer.domElement)) wrap.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Re-render when products, container type, or manual positioning changes ───
  const _drawTimer = useRef(null);
  useEffect(() => {
    if (_drawTimer.current) clearTimeout(_drawTimer.current);
    _drawTimer.current = setTimeout(drawContainer, 40);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedProducts, CONT_L, CONT_W, CONT_H, currentContainerType, instanceLockedOri, instanceManualPos]);

  // ─── Expose captureViews to parent via ref ───
  useImperativeHandle(ref, () => ({
    async captureViews() {
      const t = threeRef.current;
      if (!t) return [];
      const { camera, renderer, scene, controls } = t;

      // Save current camera state
      const origPos = camera.position.clone();
      const origTarget = controls.target.clone();
      controls.enabled = false;

      const cx = CONT_L / 2, cy = CONT_H / 2, cz = CONT_W / 2;
      const d = Math.max(CONT_L, CONT_W, CONT_H);

      const views = [
        { label: 'Perspectiva', pos: [cx + d * 0.9, cy + d * 0.8, cz + d * 1.1] },
        { label: 'Frente',      pos: [cx, cy, cz + d * 1.6] },
        { label: 'Lateral',     pos: [cx + d * 1.6, cy, cz] },
        { label: 'Superior',    pos: [cx, cy + d * 1.8, cz] },
      ];

      const images = [];
      for (const v of views) {
        camera.position.set(...v.pos);
        camera.lookAt(cx, cy, cz);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        images.push({ label: v.label, dataUrl: renderer.domElement.toDataURL('image/jpeg', 0.85) });
      }

      // Restore camera
      camera.position.copy(origPos);
      controls.target.copy(origTarget);
      controls.enabled = true;
      controls.update();
      renderer.render(scene, camera);

      return images;
    }
  }), [CONT_L, CONT_W, CONT_H]);

  // ─── Re-draw priority markers when zones change ───
  useEffect(() => {
    if (threeRef.current) drawAllPriorityMarkers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorityZones]);

  // ─── Update camera when container type changes ───
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    const maxD = currentContainerType === '20ft' ? 1650 : currentContainerType.startsWith('semi') ? 3600 : 2700;
    t.controls.maxDistance = maxD;
    t.camera.position.set(CONT_L * 0.8, CONT_H * 2.2, CONT_W * 2.5);
    t.camera.lookAt(CONT_L / 2, CONT_H * 0.4, CONT_W / 2);
    t.controls.target.set(CONT_L / 2, CONT_H * 0.4, CONT_W / 2);
    t.controls.update();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContainerType, CONT_L, CONT_W, CONT_H]);

  function drawAllPriorityMarkers() {
    const t = threeRef.current;
    if (!t) return;
    const pg = t.priorityGroup;
    while (pg.children.length) {
      const c = pg.children[0];
      c.geometry?.dispose(); c.material?.dispose(); pg.remove(c);
    }
    let hm = null;
    try { const r = runPackingCached(loadedProducts); hm = r?.hm || null; } catch {}
    useContainerStore.getState().priorityZones.forEach((pz, i) => {
      if (!pz) return;
      const col = ZONE_COLORS[i];
      const size = 70;
      const stackH = hm ? hmGetMax(hm, pz.x, pz.z, 1, 1) : (pz.y || 0);
      const displayY = stackH + 3;
      const ringGeo = new THREE.RingGeometry(size * 0.4, size * 0.55, 32);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(pz.x, displayY, pz.z);
      pg.add(ring);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(size * 0.2, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
      dot.rotation.x = -Math.PI / 2; dot.position.set(pz.x, displayY, pz.z);
      pg.add(dot);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pz.x, displayY, pz.z), new THREE.Vector3(pz.x, displayY + CONT_H * 0.4, pz.z)]);
      pg.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.4 })));
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = ZONE_COLORS_HEX[i];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ZONE_LABELS[i], 100, 32);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
      sprite.scale.set(100, 28, 1);
      sprite.position.set(pz.x, displayY + CONT_H * 0.45, pz.z);
      pg.add(sprite);
    });
  }

  function drawContainer() {
    const t = threeRef.current;
    if (!t) { setTimeout(drawContainer, 200); return; }
    const { containerGroup } = t;
    while (containerGroup.children.length) {
      const c = containerGroup.children[0];
      c.geometry?.dispose();
      if (c.material) { Array.isArray(c.material) ? c.material.forEach(m => m?.dispose()) : c.material.dispose(); }
      containerGroup.remove(c);
    }
    const state = useContainerStore.getState();
    const CL = state.CONT_L, CW = state.CONT_W, CH = state.CONT_H;

    // ── Phase 1: draw container shell immediately (fast) ──
    const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(CL, 3, CW), new THREE.MeshPhongMaterial({ color: 0x8C7B6A, shininess: 15, specular: 0x222222 }));
    floorPlate.position.set(CL/2, -1.5, CW/2); floorPlate.receiveShadow = true;
    containerGroup.add(floorPlate);

    const wallGeo = new THREE.BoxGeometry(CL, CH, CW);
    const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshPhongMaterial({ color: 0xA89880, transparent: true, opacity: 0.06, side: THREE.BackSide, shininess: 5 }));
    wallMesh.position.set(CL/2, CH/2, CW/2);
    containerGroup.add(wallMesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(wallGeo), new THREE.LineBasicMaterial({ color: 0x6B5A48, opacity: 0.7, transparent: true }));
    edges.position.copy(wallMesh.position);
    containerGroup.add(edges);

    for (let i = 0; i <= 8; i++) {
      const y = (CH / 8) * i;
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(CL, y, 0)]);
      containerGroup.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7A6A58, transparent: true, opacity: 0.25 })));
    }

    const gridHelper = new THREE.GridHelper(Math.max(CL, CW) * 1.2, 12, 0xC8B8A8, 0xD8CCC0);
    const gridY = state.currentContainerType.startsWith('semi') ? -52 : 0.5;
    gridHelper.position.set(CL/2, gridY, CW/2);
    gridHelper.material.transparent = true; gridHelper.material.opacity = 0.5;
    containerGroup.add(gridHelper);

    // ── Phase 2: pack + draw products (deferred so shell renders first) ──
    const products = state.loadedProducts;
    if (!products.length) return;

    const drawOverlay = document.getElementById('three-loading');
    if (drawOverlay) drawOverlay.style.display = 'flex';

    setTimeout(() => {
      if (!threeRef.current) return;
      const { packed } = runPackingCached(products);
    const totalItems = packed.length;
    const skipAnim = totalItems > 40;
    const animItems = [];

    for (const b of packed) {
      const gap = 0.2;
      const baseDelay = skipAnim ? 0 : Math.min(animItems.length * 6, 400);
      const stackDelay = (!skipAnim && b.y > 1) ? 300 : 0;
      const delay = baseDelay + stackDelay;

      if (b.type === 'pallet') {
        const iid = b.instanceId;
        const baseH = Math.min(14, b.dY * 0.13);
        const cargoH = b.dY - baseH;

        [0, 1, 2].forEach(pi => {
          const shade = [0xC9985C, 0xDAB870, 0xB07840][pi];
          const plankW = (b.dX - gap - 2) / 3;
          const pg = new THREE.BoxGeometry(plankW, baseH * 0.75, b.dZ - gap);
          const plank = new THREE.Mesh(pg, new THREE.MeshPhongMaterial({ color: shade, shininess: 10, specular: 0x0c0a04 }));
          const ty = b.y + baseH * 0.375;
          plank.position.set(b.x + plankW/2 + pi*(plankW+1) + 0.5, skipAnim ? ty : ty + CH * 1.5, b.z + b.dZ/2);
          plank.castShadow = true; plank.receiveShadow = true;
          plank.userData = { instanceId: iid, productId: b.productId, label: b.name, type: b.type, dims: b.dims, pct: b.pct };
          if (!skipAnim) animItems.push({ mesh: plank, targetY: ty, delay });
          containerGroup.add(plank);
        });

        [0.1, 0.5, 0.9].forEach(t2 => {
          const sl = new THREE.Mesh(new THREE.BoxGeometry(b.dX - gap, baseH, Math.max(6, b.dZ * 0.12)), new THREE.MeshPhongMaterial({ color: 0x8B6030, shininess: 5, specular: 0x060400 }));
          const ty = b.y + baseH/2;
          sl.position.set(b.x + b.dX/2, skipAnim ? ty : ty + CH * 1.5, b.z + t2 * b.dZ);
          sl.castShadow = true; sl.userData = { instanceId: iid, productId: b.productId };
          if (!skipAnim) animItems.push({ mesh: sl, targetY: ty, delay });
          containerGroup.add(sl);
        });

        if (b.packedItems?.length) {
          const palL = b.palletBase?.L || b.dX;
          const palW = b.palletBase?.W || b.dZ;
          for (const box of b.packedItems) {
            const bDelay = skipAnim ? 0 : delay + Math.min(box.y * 2, 200);
            const bGeo = new THREE.BoxGeometry(Math.max(0.1, box.dX * b.dX / palL - 0.2), Math.max(0.1, box.dY - 0.2), Math.max(0.1, box.dZ * b.dZ / palW - 0.2));
            const bMesh = new THREE.Mesh(bGeo, makeBoxMaterials(box.color || b.color));
            const ty = b.y + baseH + box.y + box.dY / 2;
            bMesh.position.set(b.x + box.x * b.dX / palL + box.dX * b.dX / palL / 2, skipAnim ? ty : ty + CH * 1.5, b.z + box.z * b.dZ / palW + box.dZ * b.dZ / palW / 2);
            bMesh.castShadow = true; bMesh.receiveShadow = true;
            bMesh.userData = { label: b.name, type: b.type, dims: b.dims, pct: b.pct, productId: b.productId, instanceId: iid };
            if (!skipAnim) animItems.push({ mesh: bMesh, targetY: ty, delay: bDelay });
            containerGroup.add(bMesh);
          }
        } else if (cargoH > 2) {
          const cmesh = new THREE.Mesh(new THREE.BoxGeometry(b.dX - gap, cargoH - gap, b.dZ - gap), makeBoxMaterials(b.color));
          const ty = b.y + baseH + cargoH/2;
          cmesh.position.set(b.x + b.dX/2, skipAnim ? ty : ty + CH * 1.5, b.z + b.dZ/2);
          cmesh.castShadow = true; cmesh.receiveShadow = true;
          cmesh.userData = { label: b.name, type: b.type, dims: b.dims, pct: b.pct, productId: b.productId, instanceId: iid };
          if (!skipAnim) animItems.push({ mesh: cmesh, targetY: ty, delay });
          containerGroup.add(cmesh);
        }
        continue;
      }

      // Box
      const geo = new THREE.BoxGeometry(b.dX - gap, b.dY - gap, b.dZ - gap);
      const mesh = new THREE.Mesh(geo, makeBoxMaterials(b.color));
      const targetY = b.y + b.dY/2;
      mesh.position.set(b.x + b.dX/2, skipAnim ? targetY : targetY + CH * 1.5, b.z + b.dZ/2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { label: b.name, type: b.type, dims: b.dims, pct: b.pct, productId: b.productId, instanceId: b.instanceId };
      if (!skipAnim) animItems.push({ mesh, targetY, delay });
      containerGroup.add(mesh);
    }

    t._animItems = animItems;
    t._animStartTime = Date.now();
    t._shadowDirty = true;

    // Dimension labels
    function makeLabel(text, pos) {
      const canvas2 = document.createElement('canvas'); canvas2.width = 256; canvas2.height = 64;
      const ctx2 = canvas2.getContext('2d');
      ctx2.font = 'bold 28px Jost, sans-serif';
      ctx2.fillStyle = '#8D7966'; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
      ctx2.fillText(text, 128, 32);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas2), transparent: true, opacity: 0.85 }));
      sprite.scale.set(80, 20, 1); sprite.position.set(...pos);
      containerGroup.add(sprite);
    }
    makeLabel((CL/100).toFixed(2)+' m', [CL/2, -18, -30]);
    makeLabel((CW/100).toFixed(2)+' m', [-40, -18, CW/2]);
    makeLabel((CH/100).toFixed(2)+' m', [-50, CH/2, -20]);

    drawAllPriorityMarkers();

    if (drawOverlay) drawOverlay.style.display = 'none';
    }, 0); // end setTimeout phase 2
  }

  function drawSemiAxles(group, CL, CW, CH) {
    const g = new THREE.Group();
    const mTire    = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 8 });
    const mRim     = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, shininess: 120, specular: 0xffffff });
    const mChrome  = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 60 });
    const mChassis = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 10 });
    const R = 52, TW = 26;

    function addWheel(x, z) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(R*0.78, R*0.22, 10, 24), mTire);
      tire.rotation.x = Math.PI / 2; tire.position.set(x, -R, z); g.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(R*0.55, R*0.55, TW*0.3, 16), mRim);
      rim.rotation.z = Math.PI / 2; rim.position.set(x, -R, z); g.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(R*0.14, R*0.14, TW*0.34, 8), mChrome);
      hub.rotation.z = Math.PI / 2; hub.position.set(x, -R, z); g.add(hub);
    }
    function addDouble(x, zOuter) { addWheel(x, zOuter); addWheel(x, zOuter + TW + 8); }
    const e1 = CL * 0.70, e2 = e1 + 138, e3 = e2 + 138;
    for (const ex of [e1, e2, e3]) { addDouble(ex, -(TW + 6)); addDouble(ex, CW + 6); }
    [-26, CW + 26].forEach(zc => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CL, 22, 14), mChassis);
      m.position.set(CL/2, -11, zc); g.add(m);
    });
    for (let tx = 0; tx <= CL; tx += 170) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(10, 22, CW + 66), mChassis);
      m.position.set(tx, -11, CW/2); g.add(m);
    }
    g.position.y = -R;
    group.add(g);
  }

  function getFloorIntersect(e) {
    const t = threeRef.current;
    if (!t) return null;
    const rect = t.renderer.domElement.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), t.camera);
    const hits = rc.intersectObject(t.floorMesh);
    return hits.length ? hits[0].point : null;
  }

  function selectInstance(instanceId) {
    const t = threeRef.current;
    if (!t) return;
    deselectAll();
    if (instanceId == null) return;
    t._selectedInstanceId = instanceId;
    t.containerGroup.children.forEach(obj => {
      if (obj.userData?.instanceId === instanceId) {
        t._selectedMeshes.push(obj);
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach(m => { if (m?.emissive) m.emissive.setHex(0x2a1e10); });
      }
    });
    if (t._selectedMeshes.length > 0) {
      const mainMesh = t._selectedMeshes.find(m => m.userData?.instanceId === instanceId && m.geometry?.type === 'BoxGeometry');
      if (mainMesh) {
        const bb = new THREE.Box3().setFromObject(mainMesh);
        const size = bb.getSize(new THREE.Vector3());
        const outGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 3, size.y + 3, size.z + 3));
        const outline = new THREE.LineSegments(outGeo, new THREE.LineBasicMaterial({ color: 0xFFCC44 }));
        outline.position.copy(mainMesh.position);
        t._scene?.add(outline) || t.scene.add(outline);
        t._selectedOutlines.push(outline);
      }
    }
  }

  function deselectAll() {
    const t = threeRef.current;
    if (!t) return;
    t._selectedMeshes.forEach(obj => {
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(m => { if (m?.emissive) m.emissive.setHex(0x000000); });
    });
    t._selectedOutlines.forEach(o => { o.geometry?.dispose(); t.scene.remove(o); });
    t._selectedMeshes = [];
    t._selectedOutlines = [];
    t._selectedInstanceId = null;
  }

  const handleMouseDown = useCallback((e) => {
    const t = threeRef.current;
    if (!t) return;
    t._mouseDownTime = Date.now();
    t._mouseDownPos = { x: e.clientX, y: e.clientY };
    t._dragFloorStart = null;
    t._isDragging = false;

    if (e.button === 0 && t._selectedInstanceId != null) {
      const rect = t.renderer.domElement.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(mx, my), t.camera);
      const hits = rc.intersectObjects(t.containerGroup.children, true)
        .filter(h => h.object.userData?.instanceId === t._selectedInstanceId);
      if (hits.length > 0) {
        const pt = getFloorIntersect(e);
        if (pt) {
          t._dragFloorStart = { x: pt.x, z: pt.z };
          const state = useContainerStore.getState();
          const { packed } = runPackingCached(state.loadedProducts);
          const item = packed.find(i => i.instanceId === t._selectedInstanceId);
          if (item) {
            t._dragInstanceStart = { x: item.x, z: item.z };
            t._dragCachedDims = { dX: item.dX, dZ: item.dZ };
          }
          t.controls.enabled = false;
        }
      }
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    const t = threeRef.current;
    if (!t) return;

    if (t._dragFloorStart && t._selectedInstanceId) {
      const moved = Math.hypot(e.clientX - t._mouseDownPos.x, e.clientY - t._mouseDownPos.y);
      if (moved > 4 && !t._isDragging) {
        t._isDragging = true;
        t.renderer.domElement.style.cursor = 'grabbing';
      }
      if (t._isDragging) {
        const pt = getFloorIntersect(e);
        if (pt && t._dragInstanceStart && t._dragCachedDims) {
          const state = useContainerStore.getState();
          const { dX, dZ } = t._dragCachedDims;
          const ddx = pt.x - t._dragFloorStart.x;
          const ddz = pt.z - t._dragFloorStart.z;
          const snap = 5;
          let nx = Math.round((t._dragInstanceStart.x + ddx) / snap) * snap;
          let nz = Math.round((t._dragInstanceStart.z + ddz) / snap) * snap;
          nx = Math.max(0, Math.min(state.CONT_L - dX, nx));
          nz = Math.max(0, Math.min(state.CONT_W - dZ, nz));
          window._instanceManualPos[t._selectedInstanceId] = { x: nx, z: nz };
          const cx = nx + dX / 2, cz = nz + dZ / 2;
          t.containerGroup.children.forEach(m => {
            if (m.userData?.instanceId === t._selectedInstanceId) {
              m.position.x = cx; m.position.z = cz;
            }
          });
          t._selectedOutlines.forEach(o => { o.position.x = cx; o.position.z = cz; });
        }
        return;
      }
    }

    // Hover tooltip
    const rect = t.renderer.domElement.getBoundingClientRect();
    t._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    t._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    t._raycaster.setFromCamera(t._mouse, t.camera);
    const hits = t._raycaster.intersectObjects(t.containerGroup.children, true);
    const hit = hits.find(h => h.object.userData?.label);
    const tooltip = document.getElementById('tooltip3d');
    if (hit && !t._isDragging && tooltip) {
      const ud = hit.object.userData;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      tooltip.style.top  = (e.clientY - rect.top  - 10) + 'px';
      tooltip.innerHTML = `
        <div style="font-weight:600;font-size:13px;margin-bottom:4px">${ud.label}</div>
        <div style="opacity:0.75;font-size:11px">${ud.type === 'pallet' ? '🟫 Pallet' : '📦 Caja'}</div>
        <div style="opacity:0.75;font-size:11px">${ud.dims}</div>
        ${ud.pct ? `<div style="margin-top:4px;color:#c8b89a;font-size:11px">${ud.pct}% del contenedor</div>` : ''}
      `;
      if (t._hoveredMesh !== hit.object && hit.object.userData?.instanceId !== t._selectedInstanceId) {
        if (t._hoveredMesh) {
          const mats = Array.isArray(t._hoveredMesh.material) ? t._hoveredMesh.material : [t._hoveredMesh.material];
          mats.forEach(m => { if (m?.emissive && t._hoveredMesh.userData?.instanceId !== t._selectedInstanceId) m.emissive.setHex(0x000000); });
        }
        t._hoveredMesh = hit.object;
        const mats = Array.isArray(t._hoveredMesh.material) ? t._hoveredMesh.material : [t._hoveredMesh.material];
        mats.forEach(m => { if (m?.emissive) m.emissive.setHex(0x1a1410); });
      }
    } else {
      if (tooltip) tooltip.style.display = 'none';
      if (t._hoveredMesh && t._hoveredMesh.userData?.instanceId !== t._selectedInstanceId) {
        const mats = Array.isArray(t._hoveredMesh.material) ? t._hoveredMesh.material : [t._hoveredMesh.material];
        mats.forEach(m => { if (m?.emissive) m.emissive.setHex(0x000000); });
        t._hoveredMesh = null;
      }
    }
    t.renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
  }, []);

  const handleMouseUp = useCallback((e) => {
    const t = threeRef.current;
    if (!t) return;
    const wasDragging = t._isDragging;
    t._isDragging = false;
    t.controls.enabled = true;
    t.renderer.domElement.style.cursor = 'default';

    if (t._dragFloorStart && wasDragging) {
      t._dragFloorStart = null;
      t._dragInstanceStart = null;
      t._dragCachedDims = null;
      const iid = t._selectedInstanceId;
      invalidatePackingCache();
      useContainerStore.getState()._syncWindowGlobals();
      drawContainer();
      setTimeout(() => { selectInstance(iid); }, 60);
      return;
    }
    t._dragFloorStart = null; t._dragInstanceStart = null; t._dragCachedDims = null;

    if (Date.now() - t._mouseDownTime > 300) return;
    if (Date.now() - t._lastDblClickTime < 400) return;
    const moved = Math.hypot(e.clientX - t._mouseDownPos.x, e.clientY - t._mouseDownPos.y);
    if (moved > 8) return;

    const rect = t.renderer.domElement.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), t.camera);
    const hits = rc.intersectObjects(t.containerGroup.children, true)
      .filter(h => h.object.userData?.instanceId != null);

    if (hits.length > 0) {
      const ud = hits[0].object.userData;
      selectInstance(ud.instanceId);
      setSelectedInstance(ud.instanceId);
      if (onSelectInstance) {
        const state = useContainerStore.getState();
        const p = state.loadedProducts.find(p => p.id == ud.productId);
        const unitIdx = parseInt(ud.instanceId.split('_').pop()) + 1;
        onSelectInstance({ instanceId: ud.instanceId, label: ud.label, unitIdx, type: ud.type, dims: ud.dims, weight: p?.weight || 0 });
      }
    } else {
      deselectAll();
      setSelectedInstance(null);
      if (onSelectInstance) onSelectInstance(null);
    }
  }, [onSelectInstance, setSelectedInstance]);

  const handleMouseLeave = useCallback(() => {
    const t = threeRef.current;
    if (!t) return;
    const tooltip = document.getElementById('tooltip3d');
    if (tooltip) tooltip.style.display = 'none';
    if (t._isDragging) { t._isDragging = false; t.controls.enabled = true; }
  }, []);

  const handleDblClick = useCallback((e) => {
    const t = threeRef.current;
    if (!t) return;
    t._lastDblClickTime = Date.now();
    const rect = t.renderer.domElement.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), t.camera);
    const floorHits = rc.intersectObject(t.floorMesh);
    const boxHits   = rc.intersectObjects(t.containerGroup.children, true).filter(h => h.object.userData?.instanceId);
    let px, pz2;
    if (floorHits.length > 0) {
      const pt = floorHits[0].point;
      const state = useContainerStore.getState();
      px = Math.max(0, Math.min(state.CONT_L, pt.x));
      pz2 = Math.max(0, Math.min(state.CONT_W, pt.z));
    } else if (boxHits.length > 0) {
      const pt = boxHits[0].point;
      const state = useContainerStore.getState();
      px = Math.max(0, Math.min(state.CONT_L, pt.x));
      pz2 = Math.max(0, Math.min(state.CONT_W, pt.z));
    } else return;
    const state = useContainerStore.getState();
    const { hm } = runPackingCached(state.loadedProducts);
    const colH = hm ? hmGetMax(hm, px, pz2, 1, 1) : 0;
    const slot = useContainerStore.getState().selectedZoneSlot;
    if (onSetZone) onSetZone(slot, { x: px, y: colH, z: pz2 });
    showToast(`${ZONE_LABELS[slot]} marcada — asignala a un producto con "→ zona" en la lista`, 'success');
  }, [onSetZone, showToast]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const slot = useContainerStore.getState().selectedZoneSlot;
    const pz = useContainerStore.getState().priorityZones[slot];
    if (pz && onClearZone) {
      onClearZone(slot);
      showToast(`${ZONE_LABELS[slot]} eliminada`);
    }
    if (onSelectInstance) onSelectInstance(null);
  }, [onClearZone, onSetZone, showToast]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={wrapRef}
        id="threeContainer"
        style={{ width: '100%', height: '100%' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDblClick}
        onContextMenu={handleContextMenu}
      />
      <div id="three-loading" style={{
        display: 'none', position: 'absolute', inset: 0,
        background: 'rgba(241,236,228,0.82)', backdropFilter: 'blur(3px)',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5,
        flexDirection: 'column', gap: 16,
      }}>
        <style>{`
          @keyframes _ship-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
          @keyframes _bar-fill { 0%{width:0%} 60%{width:75%} 100%{width:95%} }
          @keyframes _dot-fade { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }
        `}</style>
        <div style={{ fontSize: 32, animation: '_ship-bob 1.4s ease-in-out infinite' }}>🚢</div>
        <div style={{ width: 120, height: 3, background: '#E8E0D5', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#8D7966,#b8906b)', borderRadius: 99, animation: '_bar-fill 1.8s ease-out forwards' }} />
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#8D7966', letterSpacing: 2, display: 'flex', gap: 3 }}>
          {'CALCULANDO'.split('').map((ch, i) => (
            <span key={i} style={{ animation: `_dot-fade 1.4s ${i * 0.08}s ease-in-out infinite` }}>{ch}</span>
          ))}
        </div>
      </div>
      <div
        id="tooltip3d"
        style={{
          display: 'none', position: 'absolute', pointerEvents: 'none',
          background: 'rgba(30,22,14,0.92)', color: '#E8DDD0', padding: '8px 12px',
          borderRadius: 8, fontSize: 12, fontFamily: "'Jost', sans-serif",
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10, maxWidth: 220,
        }}
      />
    </div>
  );
}

export default forwardRef(ThreeCanvas);
