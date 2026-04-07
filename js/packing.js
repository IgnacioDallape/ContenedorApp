// ── PRECISE HEIGHTMAP PACKING ENGINE ──
const GRID_RES = 5; // 5cm cells — accurate pallet fitting
let _GRID_COLS = Math.ceil((590 + 5) / GRID_RES);
let _GRID_ROWS = Math.ceil((235 + 5) / GRID_RES);

function makeHeightMap() {
  return new Float32Array(_GRID_COLS * _GRID_ROWS);
}
function hmIdx(gx, gz) { return gz * _GRID_COLS + gx; }

function hmGetMax(hm, px, pz, dX, dZ) {
  const gx0 = Math.max(0, Math.floor(px / GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / GRID_RES));
  const gx1 = Math.min(_GRID_COLS, Math.ceil((px + dX) / GRID_RES));
  const gz1 = Math.min(_GRID_ROWS, Math.ceil((pz + dZ) / GRID_RES));
  let max = 0;
  for (let gz = gz0; gz < gz1; gz++)
    for (let gx = gx0; gx < gx1; gx++)
      max = Math.max(max, hm[hmIdx(gx, gz)]);
  return Math.round(max * 100) / 100; // redondear a 2 decimales para evitar float drift
}

function hmSet(hm, px, pz, dX, dZ, h) {
  const gx0 = Math.max(0, Math.floor(px / GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / GRID_RES));
  const gx1 = Math.min(_GRID_COLS, Math.ceil((px + dX) / GRID_RES));
  const gz1 = Math.min(_GRID_ROWS, Math.ceil((pz + dZ) / GRID_RES));
  for (let gz = gz0; gz < gz1; gz++)
    for (let gx = gx0; gx < gx1; gx++)
      hm[hmIdx(gx, gz)] = h;
}


// ── hmSetPallet: registra altura real por columna cuando el pallet tiene packedItems ──
// Si el pallet viene del pallet builder con cajas individuales, registra la altura
// de cada columna de cajas en el heightmap (en vez de un bloque sólido).
// Esto permite que cajas sueltas se apoyen en los huecos reales del pallet.
function hmSetPallet(hm, px, pz, dX, dZ, baseY, totalDY, packedItems, palletBase) {
  const PALLET_BASE_H = 14; // altura estructura del pallet en cm
  if (!packedItems || !packedItems.length || !palletBase) {
    // Sin info de cajas individuales — bloque sólido
    hmSet(hm, px, pz, dX, dZ, baseY + totalDY);
    return;
  }
  // Primero marcar toda la huella con la altura de la base del pallet
  hmSet(hm, px, pz, dX, dZ, baseY + PALLET_BASE_H);
  // Luego registrar cada caja individual con su altura real
  const palL = palletBase.L;
  const palW = palletBase.W;
  const scaleX = dX / palL;
  const scaleZ = dZ / palW;
  for (const box of packedItems) {
    const bpx = px + box.x * scaleX;
    const bpz = pz + box.z * scaleZ;
    const bdX = box.dX * scaleX;
    const bdZ = box.dZ * scaleZ;
    const topH = Math.round((baseY + PALLET_BASE_H + box.y + box.dY) * 100) / 100;
    hmSet(hm, bpx, bpz, bdX, bdZ, topH);
  }
}

// ── TRUE BEST-FIT DECREASING PACKING ENGINE ──
function runPacking(products) {
  const hm = makeHeightMap();
  const packed = [];
  const placed = {};
  const instanceManualPos = window._instanceManualPos || {};
  const instanceLockedOri = window._instanceLockedOri || {};

  // Expand products into individual units with instanceId
  const units = [];
  for (const p of products) {
    placed[p.id] = 0;
    for (let i = 0; i < p.qty; i++) {
      const iid = `${p.id}_${i}`;
      // Instance-level locked orientation takes priority over product-level
      const oriSource = instanceLockedOri[iid] || p.lockedOri || null;
      let lockedOri = null;
      if (oriSource) {
        lockedOri = {
          dX: oriSource.dX || p.dims.L,
          dZ: oriSource.dZ || p.dims.W,
          dY: oriSource.dY || p.dims.H
        };
      }
      units.push({ ...p, lockedOri, _unitIdx: i, instanceId: iid });
    }
  }

  // BFD sort: pallets first, then boxes, larger volume first within type
  // Priority zone units go first — sorted by zone slot so same-zone units cluster
  units.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'pallet' ? -1 : 1;
    const pa = a.priorityZone ? 0 : 1, pb = b.priorityZone ? 0 : 1;
    if (pa !== pb) return pa - pb;
    // Same priority status: sort by zone slot so all units of zone 1 go before zone 2
    const sa = a.priorityZoneSlot != null ? a.priorityZoneSlot : 99;
    const sb = b.priorityZoneSlot != null ? b.priorityZoneSlot : 99;
    if (sa !== sb) return sa - sb;
    return (b.dims.L*b.dims.W*b.dims.H) - (a.dims.L*a.dims.W*a.dims.H);
  });

  const pinnedUnits = units.filter(u => instanceManualPos[u.instanceId]);
  const freeUnits   = units.filter(u => !instanceManualPos[u.instanceId]);

  // Pre-calculate dominant orientation for each pallet product (orientation that fits most on floor)
  const dominantPalletOri = {};
  const palletProducts = [...new Set(freeUnits.filter(u => u.type === 'pallet' && !u.lockedOri).map(u => u.id))];
  for (const pid of palletProducts) {
    const u = freeUnits.find(u => u.id === pid);
    if (!u) continue;
    const oris = [
      { dX: u.dims.L, dZ: u.dims.W, dY: u.dims.H },
      { dX: u.dims.W, dZ: u.dims.L, dY: u.dims.H }
    ].filter(o => o.dX <= CONT_L + 5 && o.dZ <= CONT_W + 5);
    // Pick orientation that fits most floor positions (lowest dZ preferred for multi-row layouts)
    let bestOri = oris[0];
    let bestRows = 0;
    for (const ori of oris) {
      const cols = Math.floor(CONT_L / ori.dX);
      const rows = Math.floor(CONT_W / ori.dZ);
      if (cols * rows > bestRows) { bestRows = cols * rows; bestOri = ori; }
    }
    dominantPalletOri[pid] = bestOri;
  }

  function placeUnit(u, manualPosOverride) {
    const prio = u.priorityZone || null;
    const locked = u.lockedOri || null;

    let orientations;
    if (u.type === 'pallet') {
      if (locked) {
        orientations = [{ dX: locked.dX, dZ: locked.dZ, dY: locked.dY }];
      } else {
        const dom = dominantPalletOri[u.id];
        if (dom) {
          const alt = { dX: dom.dZ, dZ: dom.dX, dY: dom.dY };
          orientations = [dom, alt].filter(o => o.dX <= CONT_L + 5 && o.dZ <= CONT_W + 5);
        } else {
          orientations = [
            { dX: u.dims.L, dZ: u.dims.W, dY: u.dims.H },
            { dX: u.dims.W, dZ: u.dims.L, dY: u.dims.H }
          ];
        }
      }
    } else {
      // Boxes try all 6 orientations
      orientations = locked
        ? [{ dX: locked.dX, dZ: locked.dZ, dY: locked.dY }]
        : [
            { dX: u.dims.L, dZ: u.dims.W, dY: u.dims.H },
            { dX: u.dims.W, dZ: u.dims.L, dY: u.dims.H },
            { dX: u.dims.L, dZ: u.dims.H, dY: u.dims.W },
            { dX: u.dims.H, dZ: u.dims.L, dY: u.dims.W },
            { dX: u.dims.W, dZ: u.dims.H, dY: u.dims.L },
            { dX: u.dims.H, dZ: u.dims.W, dY: u.dims.L },
          ];
    }

    // Filter out orientations that exceed container in any axis
    orientations = orientations.filter(o =>
      o.dX > 0 && o.dZ > 0 && o.dY > 0 &&
      o.dX <= CONT_L + 5 && o.dZ <= CONT_W + 5 && o.dY <= CONT_H + 0.1
    );
    if (!orientations.length) return false;

    if (manualPosOverride) {
      const ori = locked || orientations[0];
      const px = Math.max(0, Math.min(CONT_L - ori.dX, manualPosOverride.x));
      const pz = Math.max(0, Math.min(CONT_W - ori.dZ, manualPosOverride.z));
      const h = hmGetMax(hm, px, pz, ori.dX, ori.dZ);
      const posBlocked = (u.type === 'pallet' && h > 1) || (h + ori.dY > CONT_H + 0.1);
      if (posBlocked) {
        // Posición bloqueada — limpiar pin y dejar que el BFD lo ubique automáticamente
        // El pallet NUNCA desaparece — si no hay lugar en el BFD, se muestra en la primera
        // posición libre aunque sea, con un toast de aviso al usuario
        delete instanceManualPos[u.instanceId];
        if (window._instanceManualPos) delete window._instanceManualPos[u.instanceId];
        // Fall through to auto-placement below
      } else {
        hmSetPallet(hm, px, pz, ori.dX, ori.dZ, h, ori.dY, u.packedItems, u.palletBase);
        packed.push({ x: px, y: h, z: pz, dX: ori.dX, dY: ori.dY, dZ: ori.dZ,
          color: u.color, name: u.name, type: u.type,
          productId: u.id, instanceId: u.instanceId,
          pct: ((u.vol * u.qty) / CONTAINER_VOL * 100).toFixed(1),
          dims: `${u.dims.L}×${u.dims.W}×${u.dims.H} cm`,
          packedItems: u.packedItems || null,
          palletBase: u.palletBase || null });
        placed[u.id]++;
        return true;
      }
    }

    // Best-fit scan
    let bestPx = -1, bestPz = -1, bestH = Infinity, bestScore = Infinity, bestOri = orientations[0];

    for (const ori of orientations) {
      for (let pz = 0; pz < CONT_W; pz += GRID_RES) {
        for (let px = 0; px < CONT_L; px += GRID_RES) {
          if (px + ori.dX > CONT_L + 5) continue;
          if (pz + ori.dZ > CONT_W + 5) continue;
          const h = hmGetMax(hm, px, pz, ori.dX, ori.dZ);
          if (h + ori.dY > CONT_H + 0.1) continue;
          // PALLETS NEVER STACK — physical constraint, period
          // Excepción: si el pallet tenía un pin que fue liberado (se estaba moviendo),
          // permitir colocarlo en la primera posición libre de piso que encuentre
          if (u.type === 'pallet' && h > 1) continue;
          let score;
          if (prio) {
            const cx = px + ori.dX / 2;
            const cz = pz + ori.dZ / 2;
            const dist = Math.sqrt((cx - prio.x) ** 2 + (cz - prio.z) ** 2);
            score = dist * 10000 + (h + ori.dY);
          } else if (u.type === 'pallet') {
            const dom = dominantPalletOri[u.id];
            const isDominant = !dom || (ori.dX === dom.dX && ori.dZ === dom.dZ);
            const oriPenalty = isDominant ? 0 : 500000;
            if (h < 1) {
              // Floor: fill systematically left→right, front→back, dominant orientation first
              score = pz * 10000 + px + oriPenalty;
            } else {
              // Stacking: place on top of leftmost/frontmost pallets first (neat stack)
              // Strongly prefer stacking on px=0,pz=0 area before going to later columns
              score = 1000000000 + px * 1000 + pz * 10 + (h + ori.dY) + oriPenalty;
            }
          } else {
            // Boxes: BFD — minimize resulting height, fill X before Z
            score = (h + ori.dY) * 10000000 + px * 100 + pz;
          }
          if (score < bestScore) { bestScore = score; bestH = h; bestPx = px; bestPz = pz; bestOri = ori; }
        }
      }
    }

    if (bestPx === -1) {
      // Pallet sin lugar — registrarlo para avisar al usuario después del render
      if (u.type === 'pallet') {
        window._palletsWithNoSpace = window._palletsWithNoSpace || [];
        window._palletsWithNoSpace.push(u.id);
      }
      return false;
    }
    hmSetPallet(hm, bestPx, bestPz, bestOri.dX, bestOri.dZ, bestH, bestOri.dY, u.packedItems, u.palletBase);
    packed.push({ x: bestPx, y: bestH, z: bestPz, dX: bestOri.dX, dY: bestOri.dY, dZ: bestOri.dZ,
      color: u.color, name: u.name, type: u.type,
      productId: u.id, instanceId: u.instanceId,
      pct: ((u.vol * u.qty) / CONTAINER_VOL * 100).toFixed(1),
      dims: `${u.dims.L}×${u.dims.W}×${u.dims.H} cm`,
      packedItems: u.packedItems || null,
      palletBase: u.palletBase || null });
    placed[u.id]++;
    return true;
  }

  for (const u of pinnedUnits) placeUnit(u, instanceManualPos[u.instanceId]);

  // ── INTERLOCKING COLUMN LAYOUT for rectangular pallets ──
  // Pattern: each column has 2 pallets in depth (Z), alternating orientation order per column
  // Col type A: pallet_frente(dX=L,dZ=W) then pallet_costado(dX=W,dZ=L)
  // Col type B: pallet_costado(dX=W,dZ=L) then pallet_frente(dX=L,dZ=W) — reversed
  // This creates an interlocking pattern that fills space optimally

  const palletGroupsMap = {};
  for (const u of freeUnits) {
    if (u.type !== 'pallet' || u.lockedOri || u.priorityZone) continue;
    if (!palletGroupsMap[u.id]) palletGroupsMap[u.id] = [];
    palletGroupsMap[u.id].push(u);
  }

  const handledByPattern = new Set();

  for (const [pid, group] of Object.entries(palletGroupsMap)) {
    if (group.length < 2) continue;
    const s = group[0];
    const A = { dX: s.dims.L, dZ: s.dims.W, dY: s.dims.H };
    const B = { dX: s.dims.W, dZ: s.dims.L, dY: s.dims.H };
    // Only use interlocking for non-square pallets where both orientations fit
    if (A.dX === B.dX || A.dX > CONT_L + 5 || A.dZ > CONT_W + 5 || B.dX > CONT_L + 5 || B.dZ > CONT_W + 5) continue;
    // Check that 2 pallets in depth fit: A.dZ + B.dZ <= CONT_W + 5
    if (A.dZ + B.dZ > CONT_W + 5) continue;

    // Build placement list: columns alternating (B,A) and (A,B) along X
    // For odd qty: fill complete pairs first, then add 1 single at the end
    const placements = [];
    let px = 0, colIdx = 0;
    const pairsNeeded = Math.floor(group.length / 2);
    const hasExtra = group.length % 2 === 1;

    // Fill complete pairs
    while (colIdx < pairsNeeded && px + Math.min(A.dX, B.dX) <= CONT_L + 5) {
      const pair = colIdx % 2 === 0 ? [B, A] : [A, B];
      const colWidth = pair[0].dX;
      if (px + colWidth > CONT_L + 5) break;
      let pz = 0;
      for (const ori of pair) {
        if (pz + ori.dZ <= CONT_W + 5) {
          placements.push({ px, pz, ori });
          pz += ori.dZ;
        }
      }
      px += colWidth;
      colIdx++;
    }

    // Add single extra pallet at the end (use B orientation — narrower, fits easier)
    if (hasExtra && placements.length < group.length) {
      const extraOri = B; // narrow orientation for the last single
      if (px + extraOri.dX <= CONT_L + 5 && extraOri.dZ <= CONT_W + 5) {
        placements.push({ px, pz: 0, ori: extraOri });
      } else if (px + A.dX <= CONT_L + 5 && A.dZ <= CONT_W + 5) {
        placements.push({ px, pz: 0, ori: A });
      }
    }

    // Place units at these positions
    let idx = 0;
    for (const cp of placements) {
      if (idx >= group.length) break;
      const u = group[idx];
      const h = hmGetMax(hm, cp.px, cp.pz, cp.ori.dX, cp.ori.dZ);
      if (h > 1) { idx++; continue; }
      if (h + cp.ori.dY > CONT_H + 0.1) { idx++; continue; }
      hmSetPallet(hm, cp.px, cp.pz, cp.ori.dX, cp.ori.dZ, h, cp.ori.dY, u.packedItems, u.palletBase);
      packed.push({ x: cp.px, y: h, z: cp.pz, dX: cp.ori.dX, dY: cp.ori.dY, dZ: cp.ori.dZ,
        color: u.color, name: u.name, type: u.type,
        productId: u.id, instanceId: u.instanceId,
        pct: ((u.vol * u.qty) / CONTAINER_VOL * 100).toFixed(1),
        dims: `${u.dims.L}×${u.dims.W}×${u.dims.H} cm`,
        packedItems: u.packedItems || null,
        palletBase: u.palletBase || null });
      placed[u.id]++;
      handledByPattern.add(u.instanceId);
      idx++;
    }
  }

  // Standard BFD for remaining units
  for (const u of freeUnits) {
    if (handledByPattern.has(u.instanceId)) continue;
    placeUnit(u, null);
  }

  return { packed, placed, hm };
}


// ── PACKING CACHE ──
// Cache the last result to avoid re-running full packing for read-only queries
let _packingCache = null;
let _packingCacheKey = '';

function runPackingCached(products) {
  // Simple key: product ids+qtys+lockedOri+manualPos
  const key = JSON.stringify(products.map(p => ({
    id: p.id, qty: p.qty, dims: p.dims,
    lockedOri: p.lockedOri, priorityZone: p.priorityZone, priorityZoneSlot: p.priorityZoneSlot
  }))) + JSON.stringify(window._instanceManualPos);
  if (key === _packingCacheKey && _packingCache) return _packingCache;
  _packingCache = runPacking(products);
  _packingCacheKey = key;
  return _packingCache;
}

function invalidatePackingCache() {
  _packingCache = null;
  _packingCacheKey = '';
}