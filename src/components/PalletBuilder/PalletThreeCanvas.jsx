import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const PALLET_H = 14; // cm — pallet structure height

export default function PalletThreeCanvas({ result }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);

  // Init Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 400, 200);
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    let rafId;
    function animate() {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
      if (!container) return;
      const W2 = container.clientWidth;
      const H2 = container.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener('resize', handleResize);

    threeRef.current = { renderer, scene, camera, controls };

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
    };
  }, []);

  // Draw when result changes
  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, controls } = threeRef.current;

    // Clear scene (keep lights)
    while (scene.children.length > 0) scene.remove(scene.children[0]);

    // Restore lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(200, 400, 200);
    scene.add(dl);

    if (!result) return;

    const { palL, palW, boxes = [], heightUsed = 0 } = result;

    // Pallet base
    const palletMat = new THREE.MeshLambertMaterial({ color: 0xc8a96e });
    const palletGeo = new THREE.BoxGeometry(palL, PALLET_H, palW);
    const palletMesh = new THREE.Mesh(palletGeo, palletMat);
    palletMesh.position.set(palL / 2, PALLET_H / 2, palW / 2);
    scene.add(palletMesh);

    // Pallet board lines
    const boardMat = new THREE.MeshLambertMaterial({ color: 0xb89050 });
    for (let i = 0; i < 3; i++) {
      const bx = i === 0 ? 10 : i === 1 ? palL / 2 - 5 : palL - 20;
      const bg = new THREE.BoxGeometry(10, PALLET_H * 0.5, palW);
      const bm = new THREE.Mesh(bg, boardMat);
      bm.position.set(bx + 5, PALLET_H * 0.25, palW / 2);
      scene.add(bm);
    }

    // Grid
    const gridHelper = new THREE.GridHelper(Math.max(palL, palW) * 1.5, 10, 0xddccbb, 0xddccbb);
    gridHelper.position.set(palL / 2, 0, palW / 2);
    scene.add(gridHelper);

    // Boxes
    for (const box of boxes) {
      const color = new THREE.Color(box.color || '#6b7d9b');
      const mat = new THREE.MeshLambertMaterial({ color });
      const geo = new THREE.BoxGeometry(
        Math.max(0.1, box.dX - 0.5),
        Math.max(0.1, box.dY - 0.5),
        Math.max(0.1, box.dZ - 0.5)
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        box.x + box.dX / 2,
        PALLET_H + box.y + box.dY / 2,
        box.z + box.dZ / 2
      );
      scene.add(mesh);

      // Wireframe edges
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(
        Math.max(0.1, box.dX - 0.5),
        Math.max(0.1, box.dY - 0.5),
        Math.max(0.1, box.dZ - 0.5)
      ));
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
      );
      line.position.copy(mesh.position);
      scene.add(line);
    }

    // Adjust camera
    const maxDim = Math.max(palL, palW, (heightUsed || 0) + PALLET_H);
    camera.position.set(palL * 1.5, maxDim * 1.8, palW * 2);
    camera.lookAt(palL / 2, (heightUsed + PALLET_H) / 2, palW / 2);
    controls.target.set(palL / 2, (heightUsed + PALLET_H) / 2, palW / 2);
    controls.update();
  }, [result]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', minHeight: 300, borderRadius: 8, overflow: 'hidden' }}
    />
  );
}
