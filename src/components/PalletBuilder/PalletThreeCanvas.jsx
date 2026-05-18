import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { pb_validateGroupPlacement, pb_validateSingleBoxMove, PB_PALLET_BASE_H, PB_EDGE_OVERHANG } from '../../stores/palletStore.js';

function fitCameraToObject(camera, controls, size, center) {
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const fitHeightDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.1);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.35;
  const direction = new THREE.Vector3(1, 0.82, 1.15).normalize();

  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(0.1, distance / 100);
  camera.far = Math.max(5000, distance * 10);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = distance * 0.45;
  controls.maxDistance = distance * 3;
  controls.update();
}

function makeSelectionOutlineFromMeshes(meshes, targetScene, existingOutline, color = 0xFFCC44) {
  if (!meshes?.length || !targetScene) return existingOutline || null;
  const bb = new THREE.Box3();
  meshes.forEach(mesh => {
    mesh.updateWorldMatrix(true, false);
    bb.expandByObject(mesh);
  });
  if (bb.isEmpty()) return existingOutline || null;

  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const nextGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(
    Math.max(0.1, size.x + 2),
    Math.max(0.1, size.y + 2),
    Math.max(0.1, size.z + 2)
  ));

  const outline = existingOutline || new THREE.LineSegments(
    nextGeo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
  );

  if (existingOutline) {
    existingOutline.geometry?.dispose();
    existingOutline.geometry = nextGeo;
    existingOutline.material.color.setHex(color);
  } else {
    targetScene.add(outline);
  }

  outline.position.copy(center);
  outline.renderOrder = 999;
  outline.frustumCulled = false;
  outline.updateMatrixWorld(true);
  return outline;
}

function getHorizontalPlaneIntersect(e, renderer, camera, planeY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(mx, my), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const point = new THREE.Vector3();
  return rc.ray.intersectPlane(plane, point) ? point : null;
}

function getPointerHit(renderer, camera, raycaster, boxGroup, clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
  const hits = raycaster.intersectObjects(boxGroup.children, true);
  return hits.find(item => item.object.userData?.uid) || null;
}

function resetBoxMeshPositions(t, boxes = []) {
  for (const box of boxes) {
    const meshes = t.boxMeshMap.get(box.uid) || [];
    const x = box.x + box.dX / 2;
    const y = PB_PALLET_BASE_H + box.y + box.dY / 2;
    const z = box.z + box.dZ / 2;
    meshes.forEach(mesh => {
      mesh.position.set(x, y, z);
    });
  }
}

export default function PalletThreeCanvas({ result, selectedBoxUid, onSelectBox, onUpdateBoxes, onDropReserveBox, strictMode = false }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const selectedBoxUidRef = useRef(selectedBoxUid);

  useEffect(() => {
    selectedBoxUidRef.current = selectedBoxUid;
  }, [selectedBoxUid]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || threeRef.current) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xEDE6DA, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xEDE6DA, 400, 2400);

    const camera = new THREE.PerspectiveCamera(42, width / height, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;

    scene.add(new THREE.AmbientLight(0xFFF1DF, 0.72));
    const sun = new THREE.DirectionalLight(0xFFF8EA, 1.05);
    sun.position.set(220, 420, 240);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xDCE8F6, 0.28);
    fill.position.set(-200, 260, -120);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);
    const boxGroup = new THREE.Group();
    root.add(boxGroup);

    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (!nextWidth || !nextHeight) return;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      if (threeRef.current?.bounds && !threeRef.current.userAdjustedCamera) {
        fitCameraToObject(camera, controls, threeRef.current.bounds.size, threeRef.current.bounds.center);
      }
    };

    window.addEventListener('resize', handleResize);
    threeRef.current = {
      renderer, scene, camera, controls, root, boxGroup,
      bounds: null,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      selectedMeshes: [],
      selectedOutline: null,
      hoveredMesh: null,
      boxMeshMap: new Map(),
      lastFitKey: null,
      userAdjustedCamera: false,
      isDragging: false,
      dragStart: null,
      dragPlaneY: null,
      dragOffsets: null,
      dragBoxUid: null,
      dragPreviewPlacement: null,
      dragPreviewPlacements: null,
      dragInvalid: false,
      mouseDownPos: { x: 0, y: 0 },
      mouseDownTime: 0,
    };
    controls.addEventListener('start', () => {
      if (threeRef.current) threeRef.current.userAdjustedCamera = true;
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  }, []);

  const applySelectedStyle = useCallback((invalid = false) => {
    const t = threeRef.current;
    if (!t) return;
    t.selectedMeshes.forEach(mesh => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => {
        if (material?.emissive) material.emissive.setHex(invalid ? 0x552222 : 0x2a1e10);
      });
    });
    t.selectedOutline = makeSelectionOutlineFromMeshes(
      t.selectedMeshes,
      t.scene,
      t.selectedOutline,
      invalid ? 0xE36D5B : 0xFFCC44
    );
  }, []);

  const clearSelectionStyles = useCallback(() => {
    const t = threeRef.current;
    if (!t) return;
    t.selectedMeshes.forEach(mesh => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => {
        if (material?.emissive) material.emissive.setHex(0x000000);
      });
    });
    t.selectedMeshes = [];
    if (t.selectedOutline) {
      t.selectedOutline.geometry?.dispose();
      t.scene.remove(t.selectedOutline);
      t.selectedOutline = null;
    }
  }, []);

  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    const { root, boxGroup, scene, camera, controls } = t;

    clearSelectionStyles();
    t.boxMeshMap.clear();
    while (root.children.length) {
      const child = root.children[0];
      root.remove(child);
    }
    root.add(boxGroup);
    while (boxGroup.children.length) {
      const child = boxGroup.children[0];
      child.geometry?.dispose?.();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => material?.dispose?.());
      }
      boxGroup.remove(child);
    }

    scene.background = new THREE.Color(0xf8f1e9);

    if (!result) {
      t.bounds = null;
      return;
    }

    const { palL, palW, boxes = [], totalHeight = PB_PALLET_BASE_H, maxHeight = totalHeight } = result;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(palL, palW) * 1.6, Math.max(palL, palW) * 1.6),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(palL / 2, PB_PALLET_BASE_H, palW / 2);
    root.add(floor);
    t.floorMesh = floor;

    const palletMat = new THREE.MeshPhongMaterial({ color: 0x9D8450, shininess: 12, specular: 0x1a1208 });
    const palletMesh = new THREE.Mesh(new THREE.BoxGeometry(palL, PB_PALLET_BASE_H, palW), palletMat);
    palletMesh.position.set(palL / 2, PB_PALLET_BASE_H / 2, palW / 2);
    palletMesh.receiveShadow = true;
    root.add(palletMesh);

    const plankMat = new THREE.MeshPhongMaterial({ color: 0xB78F56, shininess: 10 });
    for (let i = 0; i < 3; i++) {
      const plankWidth = (palL - 4) / 3;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(plankWidth, PB_PALLET_BASE_H * 0.52, palW - 2), plankMat.clone());
      plank.position.set(plankWidth / 2 + i * plankWidth + 1, PB_PALLET_BASE_H * 0.26, palW / 2);
      plank.castShadow = true;
      plank.receiveShadow = true;
      root.add(plank);
    }

    const shellGeo = new THREE.BoxGeometry(palL, Math.max(maxHeight, totalHeight), palW);
    const shell = new THREE.Mesh(
      shellGeo,
      new THREE.MeshPhongMaterial({ color: 0xA89880, transparent: true, opacity: 0.045, side: THREE.BackSide, shininess: 4 })
    );
    shell.position.set(palL / 2, Math.max(maxHeight, totalHeight) / 2 + PB_PALLET_BASE_H, palW / 2);
    root.add(shell);

    const shellEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(shellGeo),
      new THREE.LineBasicMaterial({ color: 0x7E6953, transparent: true, opacity: 0.42 })
    );
    shellEdges.position.copy(shell.position);
    root.add(shellEdges);

    const grid = new THREE.GridHelper(Math.max(palL, palW) * 1.35, 12, 0xD7C9B7, 0xE2D7C8);
    grid.position.set(palL / 2, 0, palW / 2);
    grid.material.transparent = true;
    grid.material.opacity = 0.72;
    root.add(grid);

    for (const box of boxes) {
      // Defensiva: cajas con dims inválidas (NaN, 0, negativas) producen
      // geometría degenerada que no se renderiza pero deja el outline en
      // el aire. Las saltamos y avisamos por consola.
      const dx = Number(box.dX), dy = Number(box.dY), dz = Number(box.dZ);
      const x = Number(box.x), y = Number(box.y), z = Number(box.z);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) ||
          !Number.isFinite(x)  || !Number.isFinite(y)  || !Number.isFinite(z)  ||
          dx < 0.5 || dy < 0.5 || dz < 0.5) {
        console.warn('[PalletThreeCanvas] caja con dims inválidas, salteada:', box);
        continue;
      }
      const width = Math.max(0.1, dx - 0.35);
      const height = Math.max(0.1, dy - 0.35);
      const depth = Math.max(0.1, dz - 0.35);

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshPhongMaterial({ color: new THREE.Color(box.color || '#8D7966'), shininess: 14, specular: 0x111111 })
      );
      mesh.position.set(
        box.x + box.dX / 2,
        PB_PALLET_BASE_H + box.y + box.dY / 2,
        box.z + box.dZ / 2
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        uid: box.uid,
        name: box.name,
        dims: `${box.dX}×${box.dZ}×${box.dY} cm`,
      };
      boxGroup.add(mesh);

      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.14 })
      );
      line.position.copy(mesh.position);
      line.userData = mesh.userData;
      boxGroup.add(line);

      t.boxMeshMap.set(box.uid, t.boxMeshMap.get(box.uid) || []);
      t.boxMeshMap.get(box.uid).push(mesh, line);
    }

    const bounds = {
      size: new THREE.Vector3(palL, Math.max(totalHeight, maxHeight + PB_PALLET_BASE_H), palW),
      center: new THREE.Vector3(
        palL / 2,
        Math.max(totalHeight, maxHeight + PB_PALLET_BASE_H) / 2,
        palW / 2
      ),
    };
    t.bounds = bounds;
    const fitKey = `${result.idx ?? 'pallet'}:${palL}:${palW}:${maxHeight}`;
    if (t.lastFitKey !== fitKey) {
      fitCameraToObject(camera, controls, bounds.size, bounds.center);
      t.lastFitKey = fitKey;
      t.userAdjustedCamera = false;
    }

    const selectedUid = selectedBoxUidRef.current;
    if (selectedUid && t.boxMeshMap.has(selectedUid)) {
      t.selectedMeshes = t.boxMeshMap.get(selectedUid).filter(mesh => mesh.isMesh);
      applySelectedStyle(false);
    }
  }, [result, applySelectedStyle, clearSelectionStyles]);

  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    clearSelectionStyles();
    if (selectedBoxUid && t.boxMeshMap.has(selectedBoxUid)) {
      t.selectedMeshes = t.boxMeshMap.get(selectedBoxUid).filter(mesh => mesh.isMesh);
      applySelectedStyle(false);
    }
  }, [selectedBoxUid, applySelectedStyle, clearSelectionStyles]);

  const hitSelected = useCallback((e) => {
    const t = threeRef.current;
    if (!t || !selectedBoxUid) return null;
    // Incluir TODAS las geometrías asociadas (mesh + edges) para que el usuario
    // pueda agarrar la caja seleccionada desde el wireframe también, no solo
    // desde el centro relleno. Coincide con el comportamiento del Container.
    const items = t.boxMeshMap.get(selectedBoxUid) || [];
    return getPointerHit(t.renderer, t.camera, t.raycaster, { children: items }, e.clientX, e.clientY);
  }, [selectedBoxUid]);

  const handleMouseDown = useCallback((e) => {
    const t = threeRef.current;
    if (!t || !result) return;
    t.mouseDownTime = Date.now();
    t.mouseDownPos = { x: e.clientX, y: e.clientY };
    t.isDragging = false;
    t.dragStart = null;
    t.dragPreviewPlacement = null;
    t.dragPreviewPlacements = null;
    t.dragInvalid = false;

    if (e.button !== 0) return;

    let hit = hitSelected(e);
    if (!hit) {
      hit = getPointerHit(t.renderer, t.camera, t.raycaster, t.boxGroup, e.clientX, e.clientY);
      if (hit?.object?.userData?.uid) onSelectBox(hit.object.userData.uid);
    }

    const boxUid = hit?.object?.userData?.uid || selectedBoxUid;
    const box = result.boxes.find(item => item.uid === boxUid);
    if (!hit || !box) return;

    const stablePlaneY = PB_PALLET_BASE_H + box.y + box.dY / 2;
    const dragPoint = getHorizontalPlaneIntersect(e, t.renderer, t.camera, stablePlaneY) || hit.point;
    t.dragStart = { x: box.x, z: box.z };
    t.dragPlaneY = stablePlaneY;
    t.dragBoxUid = box.uid;
    t.dragOffsets = {
      x: dragPoint.x - box.x,
      z: dragPoint.z - box.z,
    };
    t.controls.enabled = false;
  }, [hitSelected, onSelectBox, result, selectedBoxUid]);

  const handleMouseMove = useCallback((e) => {
    const t = threeRef.current;
    if (!t || !result) return;

    if (t.dragStart && t.dragBoxUid) {
      const moved = Math.hypot(e.clientX - t.mouseDownPos.x, e.clientY - t.mouseDownPos.y);
      if (moved > 4 && !t.isDragging) {
        t.isDragging = true;
        t.renderer.domElement.style.cursor = 'grabbing';
      }

      if (t.isDragging) {
        const box = result.boxes.find(item => item.uid === t.dragBoxUid);
        if (!box) return;

        const snap = 2;
        const stackMode = e.shiftKey;
        const moveOpts = { strict: !!strictMode };
        const validateMove = (nextX, nextZ) => stackMode
          ? pb_validateGroupPlacement(
              result.boxes,
              box.uid,
              result.palL,
              result.palW,
              result.maxHeight,
              nextX,
              nextZ,
              moveOpts
            )
          : pb_validateSingleBoxMove(
              result.boxes,
              box.uid,
              result.palL,
              result.palW,
              result.maxHeight,
              nextX,
              nextZ,
              moveOpts
            );

        const readCandidate = (planeY) => {
          const point = getHorizontalPlaneIntersect(e, t.renderer, t.camera, planeY);
          if (!point) return null;
          // Preservar el punto de grab: usamos el offset capturado en mouseDown
          // para que la caja no salte al centro del cursor al empezar a
          // arrastrar. Igual que el Container Loader.
          const grabOffsetX = t.dragOffsets?.x ?? box.dX / 2;
          const grabOffsetZ = t.dragOffsets?.z ?? box.dZ / 2;
          let nextX = Math.round((point.x - grabOffsetX) / snap) * snap;
          let nextZ = Math.round((point.z - grabOffsetZ) / snap) * snap;
          // Permitir overhang en el drag: la caja puede sobresalir hasta
          // PB_EDGE_OVERHANG (5cm) del borde del pallet (práctica real).
          nextX = Math.max(-PB_EDGE_OVERHANG, Math.min(result.palL + PB_EDGE_OVERHANG - box.dX, nextX));
          nextZ = Math.max(-PB_EDGE_OVERHANG, Math.min(result.palW + PB_EDGE_OVERHANG - box.dZ, nextZ));
          return { nextX, nextZ, placement: validateMove(nextX, nextZ) };
        };

        let candidate = readCandidate(t.dragPlaneY ?? (PB_PALLET_BASE_H + box.y + box.dY / 2));
        if (!candidate) return;
        let placement = candidate.placement;
        const rootPlacement = placement.rootPlacement || placement.placements?.find(item => item.uid === box.uid);
        if (rootPlacement) {
          const actualPlaneY = PB_PALLET_BASE_H + rootPlacement.y + rootPlacement.dY / 2;
          const refined = readCandidate(actualPlaneY);
          if (refined) placement = refined.placement;
        }

        t.dragPreviewPlacement = null;
        t.dragPreviewPlacements = placement.valid ? placement.placements : null;
        t.dragInvalid = !placement.valid;

        const fallbackPlacement = {
          uid: box.uid,
          x: candidate.nextX,
          y: box.y,
          z: candidate.nextZ,
          dX: box.dX,
          dY: box.dY,
          dZ: box.dZ,
        };
        resetBoxMeshPositions(t, result.boxes);
        const previewPlacements = placement.placements?.length ? placement.placements : [fallbackPlacement];
        previewPlacements.forEach(previewPlacement => {
          const previewY = PB_PALLET_BASE_H + previewPlacement.y + previewPlacement.dY / 2;
          const previewX = previewPlacement.x + previewPlacement.dX / 2;
          const previewZ = previewPlacement.z + previewPlacement.dZ / 2;
          const meshes = t.boxMeshMap.get(previewPlacement.uid) || [];
          meshes.forEach(mesh => {
            mesh.position.set(previewX, previewY, previewZ);
          });
        });

        applySelectedStyle(t.dragInvalid);
        return;
      }
    }

    const rect = t.renderer.domElement.getBoundingClientRect();
    const hit = getPointerHit(t.renderer, t.camera, t.raycaster, t.boxGroup, e.clientX, e.clientY);
    const tooltip = document.getElementById('tooltip3d-pallet');

    if (hit && tooltip) {
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - rect.left + 14}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
      tooltip.innerHTML = `
        <div style="font-weight:600;font-size:13px;margin-bottom:4px">${hit.object.userData.name}</div>
        <div style="opacity:0.75;font-size:11px">📦 Caja</div>
        <div style="opacity:0.75;font-size:11px">${hit.object.userData.dims}</div>
      `;
    } else if (tooltip) {
      tooltip.style.display = 'none';
    }

    t.renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
  }, [applySelectedStyle, result, strictMode]);

  const handleMouseUp = useCallback((e) => {
    const t = threeRef.current;
    if (!t) return;

    const wasDragging = t.isDragging;
    t.isDragging = false;
    t.controls.enabled = true;
    t.renderer.domElement.style.cursor = 'default';

    if (t.dragStart && t.dragBoxUid && wasDragging) {
      const nextPlacements = t.dragPreviewPlacements;
      t.dragStart = null;
      t.dragBoxUid = null;
      t.dragOffsets = null;
      t.dragPlaneY = null;
      t.dragPreviewPlacement = null;
      t.dragPreviewPlacements = null;
      t.dragInvalid = false;

      if (nextPlacements?.length) {
        const placementMap = new Map(nextPlacements.map(placement => [placement.uid, placement]));
        onUpdateBoxes(result.boxes.map(box =>
          placementMap.has(box.uid)
            ? { ...box, ...placementMap.get(box.uid) }
            : box
        ));
      } else {
        onUpdateBoxes(result.boxes.map(box => ({ ...box })));
      }
      return;
    }

    t.dragStart = null;
    t.dragBoxUid = null;
    t.dragOffsets = null;
    t.dragPlaneY = null;
    t.dragPreviewPlacement = null;
    t.dragPreviewPlacements = null;
    t.dragInvalid = false;

    if (Date.now() - t.mouseDownTime > 300) return;
    const moved = Math.hypot(e.clientX - t.mouseDownPos.x, e.clientY - t.mouseDownPos.y);
    if (moved > 8) return;

    const hit = getPointerHit(t.renderer, t.camera, t.raycaster, t.boxGroup, e.clientX, e.clientY);
    onSelectBox(hit ? hit.object.userData.uid : null);
  }, [onSelectBox, onUpdateBoxes, result]);

  const handleMouseLeave = useCallback(() => {
    const t = threeRef.current;
    if (!t) return;
    const tooltip = document.getElementById('tooltip3d-pallet');
    if (tooltip) tooltip.style.display = 'none';
    if (t.isDragging) {
      t.isDragging = false;
      t.controls.enabled = true;
      t.dragStart = null;
      t.dragBoxUid = null;
      t.dragOffsets = null;
      t.dragPlaneY = null;
      t.dragPreviewPlacement = null;
      t.dragPreviewPlacements = null;
      t.dragInvalid = false;
      onUpdateBoxes(result?.boxes?.map(box => ({ ...box })) || []);
    }
  }, [onUpdateBoxes, result]);

  const handleDragOver = useCallback((e) => {
    if (!e.dataTransfer?.types?.includes('application/x-pallet-reserve-box')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e) => {
    if (!result || !onDropReserveBox) return;
    const reserveUid = e.dataTransfer?.getData('application/x-pallet-reserve-box');
    if (!reserveUid) return;
    e.preventDefault();

    const t = threeRef.current;
    if (!t) return;
    const point = getHorizontalPlaneIntersect(e, t.renderer, t.camera, PB_PALLET_BASE_H);
    if (!point) return;

    onDropReserveBox(reserveUid, point.x, point.z);
  }, [onDropReserveBox, result]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%', minHeight: 300, borderRadius: 8, overflow: 'hidden' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
      <div
        id="tooltip3d-pallet"
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          background: 'rgba(30,22,14,0.92)',
          color: '#E8DDD0',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "'Jost', sans-serif",
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          zIndex: 10,
          maxWidth: 220,
        }}
      />
      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(141,121,102,0.6)', letterSpacing: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        🖱 DRAG PARA MOVER · SCROLL ZOOM · CLIC = SELECCIONAR
      </div>
    </div>
  );
}
