// ── PRECISE HEIGHTMAP PACKING ENGINE ──
const GRID_RES = 5; // 5cm cells — accurate pallet fitting
const FIT_EPS = 0.1;
let _GRID_COLS = Math.ceil(590 / GRID_RES);
let _GRID_ROWS = Math.ceil(235 / GRID_RES);
const SUPPORT_EPS = 0.5;

const DEFAULT_PHYSICAL_CONSTRAINTS = {
  MIN_SUPPORT_PERCENT: 0.8,
  ALLOW_OVERHANG: false,
  ALLOW_AUXILIARY_SUPPORT: false,
  CENTER_OF_GRAVITY_CHECK: true,
};

let PHYSICAL_CONSTRAINTS = { ...DEFAULT_PHYSICAL_CONSTRAINTS };

// Container dimensions — set via setContainerDimensions() when type changes
let CONT_L = 589, CONT_W = 235, CONT_H = 239, CONTAINER_VOL = (589*235*239)/1e6;

export function setContainerDimensions(L, W, H, vol) {
  CONT_L = L; CONT_W = W; CONT_H = H; CONTAINER_VOL = vol;
  _GRID_COLS = Math.ceil(L / GRID_RES);
  _GRID_ROWS = Math.ceil(W / GRID_RES);
  invalidatePackingCache();
}

export function getPackingPhysicalConstraints() {
  return { ...PHYSICAL_CONSTRAINTS };
}

export function setPackingPhysicalConstraints(next = {}) {
  PHYSICAL_CONSTRAINTS = {
    ...PHYSICAL_CONSTRAINTS,
    ...next,
  };
  invalidatePackingCache();
}

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

function overlaps1D(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function getSupportContacts(position, placedItems) {
  if (position.y <= SUPPORT_EPS) {
    return {
      onFloor: true,
      contacts: [{
        x0: position.x,
        x1: position.x + position.dX,
        z0: position.z,
        z1: position.z + position.dZ,
      }],
    };
  }

  const contacts = [];
  for (const item of placedItems) {
    const topY = item.y + item.dY;
    if (Math.abs(topY - position.y) > SUPPORT_EPS) continue;
    const overlapX = overlaps1D(position.x, position.x + position.dX, item.x, item.x + item.dX);
    const overlapZ = overlaps1D(position.z, position.z + position.dZ, item.z, item.z + item.dZ);
    if (overlapX <= FIT_EPS || overlapZ <= FIT_EPS) continue;
    contacts.push({
      x0: Math.max(position.x, item.x),
      x1: Math.min(position.x + position.dX, item.x + item.dX),
      z0: Math.max(position.z, item.z),
      z1: Math.min(position.z + position.dZ, item.z + item.dZ),
    });
  }
  return { onFloor: false, contacts };
}

function summarizeSupportCoverage(position, contacts) {
  if (!contacts.length) {
    return {
      supportArea: 0,
      supportPercent: 0,
      spanRatioX: 0,
      spanRatioZ: 0,
      centerSupported: false,
    };
  }

  const baseArea = Math.max(1, position.dX * position.dZ);
  const centerX = position.x + position.dX / 2;
  const centerZ = position.z + position.dZ / 2;

  let supportArea = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let centerSupported = false;

  for (const contact of contacts) {
    const width = Math.max(0, contact.x1 - contact.x0);
    const depth = Math.max(0, contact.z1 - contact.z0);
    supportArea += width * depth;
    minX = Math.min(minX, contact.x0);
    maxX = Math.max(maxX, contact.x1);
    minZ = Math.min(minZ, contact.z0);
    maxZ = Math.max(maxZ, contact.z1);
    if (
      centerX >= contact.x0 - FIT_EPS &&
      centerX <= contact.x1 + FIT_EPS &&
      centerZ >= contact.z0 - FIT_EPS &&
      centerZ <= contact.z1 + FIT_EPS
    ) {
      centerSupported = true;
    }
  }

  return {
    supportArea,
    supportPercent: Math.min(1, supportArea / baseArea),
    spanRatioX: Math.min(1, Math.max(0, maxX - minX) / Math.max(position.dX, 1)),
    spanRatioZ: Math.min(1, Math.max(0, maxZ - minZ) / Math.max(position.dZ, 1)),
    centerSupported,
  };
}

function describeSupportFailure(supportPercent, centerSupported, spanRatioX, spanRatioZ) {
  if (!centerSupported) return 'El centro de gravedad queda fuera del área apoyada';
  if (supportPercent < PHYSICAL_CONSTRAINTS.MIN_SUPPORT_PERCENT) {
    return `Apoyo insuficiente (${Math.round(supportPercent * 100)}% de base soportada)`;
  }
  if (!PHYSICAL_CONSTRAINTS.ALLOW_OVERHANG && Math.min(spanRatioX, spanRatioZ) < 0.55) {
    return 'Voladizo lateral peligroso o apoyo demasiado angosto';
  }
  return 'Posición inestable con las restricciones actuales';
}

function makeSupportSuggestions(item) {
  return [
    'Rotar pieza',
    'Cambiar orden de carga',
    item.type === 'pallet' ? 'Usar pallet con base más estable' : 'Usar separadores/tacos/pallets',
    'Reducir cantidad',
    'Cargar en otro contenedor',
    'Permitir soporte auxiliar manualmente',
  ];
}

function validatePhysicalSupport(item, position, placedItems) {
  const contactsInfo = getSupportContacts(position, placedItems);
  if (contactsInfo.onFloor) {
    return {
      valid: true,
      status: 'stable',
      supportPercent: 1,
      supportArea: position.dX * position.dZ,
      centerSupported: true,
      spanRatioX: 1,
      spanRatioZ: 1,
      requiresAuxiliarySupport: false,
      reason: '',
      suggestions: [],
    };
  }

  const summary = summarizeSupportCoverage(position, contactsInfo.contacts);
  const meetsSupport = summary.supportPercent + FIT_EPS >= PHYSICAL_CONSTRAINTS.MIN_SUPPORT_PERCENT;
  const centerOk = !PHYSICAL_CONSTRAINTS.CENTER_OF_GRAVITY_CHECK || summary.centerSupported;
  const spanOk = PHYSICAL_CONSTRAINTS.ALLOW_OVERHANG || Math.min(summary.spanRatioX, summary.spanRatioZ) >= 0.55;
  const fullyStable = meetsSupport && centerOk && spanOk;
  const partialAcceptable = meetsSupport && centerOk;

  if (fullyStable) {
    return {
      valid: true,
      status: summary.supportPercent >= 0.95 ? 'stable' : 'partial',
      supportPercent: summary.supportPercent,
      supportArea: summary.supportArea,
      centerSupported: summary.centerSupported,
      spanRatioX: summary.spanRatioX,
      spanRatioZ: summary.spanRatioZ,
      requiresAuxiliarySupport: false,
      reason: '',
      suggestions: [],
    };
  }

  const reason = describeSupportFailure(
    summary.supportPercent,
    summary.centerSupported,
    summary.spanRatioX,
    summary.spanRatioZ
  );

  if (PHYSICAL_CONSTRAINTS.ALLOW_AUXILIARY_SUPPORT && (summary.supportPercent > 0 || partialAcceptable)) {
    return {
      valid: true,
      status: 'auxiliary',
      supportPercent: summary.supportPercent,
      supportArea: summary.supportArea,
      centerSupported: summary.centerSupported,
      spanRatioX: summary.spanRatioX,
      spanRatioZ: summary.spanRatioZ,
      requiresAuxiliarySupport: true,
      reason,
      suggestions: makeSupportSuggestions(item),
    };
  }

  return {
    valid: false,
    status: 'invalid',
    supportPercent: summary.supportPercent,
    supportArea: summary.supportArea,
    centerSupported: summary.centerSupported,
    spanRatioX: summary.spanRatioX,
    spanRatioZ: summary.spanRatioZ,
    requiresAuxiliarySupport: false,
    reason,
    suggestions: makeSupportSuggestions(item),
  };
}


// ── hmSetPallet: registra altura real por columna cuando el pallet tiene packedItems ──
// Si el pallet viene del pallet builder con cajas individuales, registra la altura
// de cada columna de cajas en el heightmap (en vez de un bloque sólido).
// Esto permite que cajas sueltas se apoyen en los huecos reales del pallet.
// eslint-disable-next-line no-unused-vars
function hmSetPallet(hm, px, pz, dX, dZ, baseY, totalDY, packedItems, palletBase) {
  // El pallet se trata como BLOQUE SÓLIDO en el heightmap (toda su huella a la
  // altura total). Antes se marcaban los márgenes/valles internos a la altura de
  // la base (14cm) usando packedItems, lo que dejaba a las cajas sueltas TREPAR
  // por esas columnas casi vacías y quedar clipeadas DENTRO del bloque del pallet
  // (el contenedor lo renderiza/empaqueta como bloque). Con bloque sólido las
  // cajas sueltas se apoyan ARRIBA del pallet, nunca se meten adentro.
  // (packedItems/palletBase siguen en la firma para compatibilidad y render.)
  hmSet(hm, px, pz, dX, dZ, baseY + totalDY);
}

// ── TRUE BEST-FIT DECREASING PACKING ENGINE ──
function runPacking(products) {
  const hm = makeHeightMap();
  const packed = [];
  const placed = {};
  const warnings = [];
  const rejectedSupportByInstance = new Map();
  const instanceManualPos = window._instanceManualPos || {};
  const instanceLockedOri = window._instanceLockedOri || {};

  // Expand products into individual units with instanceId
  const units = [];
  for (const p of products) {
    placed[p.id] = 0;
    // Guard de robustez: ignorar productos con dimensiones inválidas (0, negativas,
    // NaN, Infinity) o cantidad inválida — nunca deben generar items degenerados.
    const { L, W, H } = p.dims || {};
    const dimsOk = [L, W, H].every(d => Number.isFinite(d) && d > 0);
    const qtyN = Number.isFinite(p.qty) ? Math.floor(p.qty) : 0;
    if (!dimsOk || qtyN <= 0) continue;
    for (let i = 0; i < qtyN; i++) {
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

  // Backstop anti-cuelgue: el motor de contenedor no tiene budget de tiempo; un
  // payload patológico (qty enorme, ej. share link malicioso) podría congelar el
  // main thread. Cortamos en un máximo razonable y avisamos. (El form y el loader
  // ya limitan a 500/producto; esto es la última red.)
  const MAX_TOTAL_UNITS = 2500;
  if (units.length > MAX_TOTAL_UNITS) {
    warnings.push({
      kind: 'capacity-cap',
      message: `Se limitó el cálculo a ${MAX_TOTAL_UNITS} unidades (de ${units.length}) para no congelar la app.`,
    });
    units.length = MAX_TOTAL_UNITS;
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
    ].filter(o => o.dX <= CONT_L + FIT_EPS && o.dZ <= CONT_W + FIT_EPS);
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

  function buildPackedItem(u, px, pz, ori, y, support) {
    return {
      x: px, y, z: pz, dX: ori.dX, dY: ori.dY, dZ: ori.dZ,
      color: u.color, name: u.name, type: u.type,
      productId: u.id, instanceId: u.instanceId,
      pct: ((u.vol * u.qty) / CONTAINER_VOL * 100).toFixed(1),
      dims: `${u.dims.L}×${u.dims.W}×${u.dims.H} cm`,
      packedItems: u.packedItems || null,
      palletBase: u.palletBase || null,
      supportPercent: support?.supportPercent ?? 1,
      supportArea: support?.supportArea ?? (ori.dX * ori.dZ),
      supportStatus: support?.status ?? 'stable',
      supportReason: support?.reason || '',
      centerSupported: support?.centerSupported ?? true,
      requiresAuxiliarySupport: !!support?.requiresAuxiliarySupport,
    };
  }

  function registerUnsafePlacement(u, support, context = 'auto') {
    const currentPercent = support?.supportPercent ?? 0;
    const existing = rejectedSupportByInstance.get(u.instanceId);
    if (existing && (existing.supportPercent ?? 0) >= currentPercent) return;
    rejectedSupportByInstance.set(u.instanceId, {
      kind: 'physical-support',
      instanceId: u.instanceId,
      productId: u.id,
      name: u.name,
      type: u.type,
      context,
      message: 'No entra de forma segura con las restricciones actuales',
      detail: support?.reason || 'La base apoyada no alcanza para una carga estable',
      supportPercent: currentPercent,
      requiresAuxiliarySupport: !!support?.requiresAuxiliarySupport,
      suggestions: support?.suggestions || makeSupportSuggestions(u),
    });
  }

  function clearUnsafePlacement(u) {
    rejectedSupportByInstance.delete(u.instanceId);
  }

  function consumeUnsafePlacementWarning(u, context = 'auto') {
    const warning = rejectedSupportByInstance.get(u.instanceId);
    if (!warning) return;
    warnings.push({
      ...warning,
      context: warning.context || context,
    });
    rejectedSupportByInstance.delete(u.instanceId);
  }

  function tryPlaceAt(u, px, pz, ori, h, context = 'auto') {
    if ((u.type === 'pallet' && h > 1) || (h + ori.dY > CONT_H + FIT_EPS)) return null;
    const support = validatePhysicalSupport(u, { x: px, y: h, z: pz, dX: ori.dX, dY: ori.dY, dZ: ori.dZ }, packed);
    if (!support.valid) {
      registerUnsafePlacement(u, support, context);
      return null;
    }
    return { px, pz, ori, y: h, support };
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
          orientations = [dom, alt].filter(o => o.dX <= CONT_L + FIT_EPS && o.dZ <= CONT_W + FIT_EPS);
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
      o.dX <= CONT_L + FIT_EPS && o.dZ <= CONT_W + FIT_EPS && o.dY <= CONT_H + FIT_EPS
    );
    if (!orientations.length) return false;

    if (manualPosOverride) {
      const ori = locked || orientations[0];
      const px = Math.max(0, Math.min(CONT_L - ori.dX, manualPosOverride.x));
      const pz = Math.max(0, Math.min(CONT_W - ori.dZ, manualPosOverride.z));
      const h = hmGetMax(hm, px, pz, ori.dX, ori.dZ);
      const placement = tryPlaceAt(u, px, pz, ori, h, 'manual');
      if (!placement) {
        // Ninguna unidad arrastrada manualmente se reubica sola.
        // Si la posición elegida colisiona o excede altura, se rechaza y el caller
        // puede restaurar la posición anterior.
        return false;
      } else {
        hmSetPallet(hm, placement.px, placement.pz, placement.ori.dX, placement.ori.dZ, placement.y, placement.ori.dY, u.packedItems, u.palletBase);
        packed.push(buildPackedItem(u, placement.px, placement.pz, placement.ori, placement.y, placement.support));
        placed[u.id]++;
        return true;
      }
    }

    // Best-fit scan
    let bestPx = -1, bestPz = -1, bestH = Infinity, bestScore = Infinity, bestOri = orientations[0];
    let bestSupport = null;

    for (const ori of orientations) {
      for (let pz = 0; pz < CONT_W; pz += GRID_RES) {
        for (let px = 0; px < CONT_L; px += GRID_RES) {
          if (px + ori.dX > CONT_L + FIT_EPS) continue;
          if (pz + ori.dZ > CONT_W + FIT_EPS) continue;
          const h = hmGetMax(hm, px, pz, ori.dX, ori.dZ);
          const placement = tryPlaceAt(u, px, pz, ori, h, 'auto');
          if (!placement) continue;
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
              // Floor: fill systematically
              // Semis (largo > 800cm): llenar X primero (de frente a lo largo)
              // Contenedores: llenar Z primero (comportamiento original)
              const isSemi = CONT_L > 800;
              score = isSemi ? (px * 10 + pz + oriPenalty) : (pz * 10000 + px + oriPenalty);
            } else {
              // Stacking: place on top of leftmost/frontmost pallets first (neat stack)
              // Strongly prefer stacking on px=0,pz=0 area before going to later columns
              score = 1000000000 + px * 1000 + pz * 10 + (h + ori.dY) + oriPenalty;
            }
          } else {
            // Boxes: BFD — minimizar la altura resultante SIEMPRE domina (×1e7),
            // así el apilado/soporte queda intacto.
            const heightTerm = (h + ori.dY) * 10000000;
            if (CONT_L > 1300) {
              // Semis: a igual altura, preferir posiciones cercanas al centro X
              // → carga del centro hacia los extremos (balance de ejes), igual que
              // ya hacen los pallets en semis. El coeficiente (×100) es despreciable
              // frente a la altura, así que no compite con el llenado de piso.
              const boxCx = px + ori.dX / 2;
              const distCenterX = Math.abs(boxCx - CONT_L / 2);
              score = heightTerm + distCenterX * 100 + pz;
            } else {
              // 20ft / 40ft / 40HC: original (llena desde x=0, después Z).
              score = heightTerm + px * 100 + pz;
            }
          }
          if (score < bestScore) {
            bestScore = score;
            bestH = h;
            bestPx = px;
            bestPz = pz;
            bestOri = ori;
            bestSupport = placement.support;
          }
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
    packed.push(buildPackedItem(u, bestPx, bestPz, bestOri, bestH, bestSupport));
    clearUnsafePlacement(u);
    placed[u.id]++;
    return true;
  }

  for (const u of pinnedUnits) placeUnit(u, instanceManualPos[u.instanceId]);

  // ── PATRÓN MOLINETE (pinwheel) para pallets rectangulares ──
  // 4 pallets rotados 90° entre sí que SE TOCAN formando un bloque de (L+W)×(L+W)
  // con sólo un huequito cuadrado (L-W)×(L-W) en el centro. Los bloques se tilean
  // a lo largo del contenedor sin dejar espacio entre pallets. (Los semis usan el
  // layout de-punta centro-afuera, más abajo.)

  // Agrupar pallets por FOOTPRINT (L×W), no por id de producto. Así varios pallets
  // DISTINTOS con la misma base (caso típico del Pallet Builder: "Pallet 1..4", todos
  // 120×100) se acomodan juntos en el mismo patrón (molinete / de-punta centro-afuera)
  // en vez de caer al BFD como una pared. La altura se maneja por-unidad más abajo,
  // porque dos pallets del mismo footprint pueden tener distinto alto.
  const palletGroupsMap = {};
  for (const u of freeUnits) {
    if (u.type !== 'pallet' || u.lockedOri || u.priorityZone) continue;
    const key = `${Math.round(u.dims.L)}x${Math.round(u.dims.W)}`;
    if (!palletGroupsMap[key]) palletGroupsMap[key] = [];
    palletGroupsMap[key].push(u);
  }

  const handledByPattern = new Set();

  // ── SEMI LAYOUT: todos "de punta", carga desde el centro hacia los extremos ──
  // Solo para semis (L > 1300cm). 40ft usa interlocking normal.
  const isSemiLayout = CONT_L > 1300;

  if (isSemiLayout) {
    for (const [pid, group] of Object.entries(palletGroupsMap)) {
      if (!group.length) continue;
      const s = group[0];
      // "De punta": lado corto (W) a lo largo del semi, lado largo (L) en profundidad
      const ori = { dX: s.dims.W, dZ: s.dims.L, dY: s.dims.H };
      if (ori.dZ * 2 > CONT_W + FIT_EPS) continue;
      if (ori.dX > CONT_L + FIT_EPS) continue;

      // Generar todas las posiciones posibles y ordenarlas por distancia al centro
      const allSlots = [];
      let px = 0;
      while (px + ori.dX <= CONT_L + FIT_EPS) {
        for (let row = 0; row < 2; row++) {
          const pz = row * ori.dZ;
          if (pz + ori.dZ <= CONT_W + FIT_EPS) allSlots.push({ px, pz, ori });
        }
        px += ori.dX;
      }
      const centerX = CONT_L / 2;
      allSlots.sort((a, b) => {
        const da = Math.abs((a.px + ori.dX / 2) - centerX);
        const db = Math.abs((b.px + ori.dX / 2) - centerX);
        return da - db;
      });

      let idx = 0;
      for (const cp of allSlots) {
        if (idx >= group.length) break;
        const u = group[idx];
        // Altura por-unidad: el grupo comparte footprint (W×L) pero cada pallet puede
        // tener distinto alto, así que armo la orientación con su propio dims.H.
        const uOri = { dX: cp.ori.dX, dZ: cp.ori.dZ, dY: u.dims.H };
        const h = hmGetMax(hm, cp.px, cp.pz, uOri.dX, uOri.dZ);
        const placement = tryPlaceAt(u, cp.px, cp.pz, uOri, h, 'pattern');
        if (!placement) {
          consumeUnsafePlacementWarning(u, 'pattern');
          idx++;
          continue;
        }
        hmSetPallet(hm, placement.px, placement.pz, placement.ori.dX, placement.ori.dZ, placement.y, placement.ori.dY, u.packedItems, u.palletBase);
        packed.push(buildPackedItem(u, placement.px, placement.pz, placement.ori, placement.y, placement.support));
        clearUnsafePlacement(u);
        placed[u.id]++;
        handledByPattern.add(u.instanceId);
        idx++;
      }
    }
  }

  let palletCursorX = 0; // footprints distintos se tilean uno tras otro a lo largo de X
  for (const [, group] of Object.entries(palletGroupsMap)) {
    if (isSemiLayout) continue; // ya manejado arriba
    if (group.length < 2) continue;
    const s = group[0];
    const L = s.dims.L;
    const W = s.dims.W;
    // A = de-costado (L a lo largo de X), B = de-punta (W a lo largo de X). Sólo el
    // footprint (dX,dZ) sale del grupo; la altura (dY) se arma por-unidad al colocar.
    const A = { dX: L, dZ: W };
    const B = { dX: W, dZ: L };
    // Sólo molinete para pallets no-cuadrados donde ambas orientaciones entran y dos
    // en profundidad caben en el ancho del contenedor.
    if (
      A.dX === B.dX ||
      A.dX > CONT_L + FIT_EPS || A.dZ > CONT_W + FIT_EPS ||
      B.dX > CONT_L + FIT_EPS || B.dZ > CONT_W + FIT_EPS ||
      A.dZ + B.dZ > CONT_W + FIT_EPS
    )
      continue;

    // Patrón MOLINETE: bloques de 4 pallets que rotan 90° y SE TOCAN. Cada bloque
    // ocupa (L+W)×(L+W) y deja sólo un huequito cuadrado (L-W)×(L-W) en el centro.
    //   P4 de-punta(B) arriba-izq   P3 de-costado(A) arriba-der
    //   P1 de-costado(A) abajo-izq   P2 de-punta(B) abajo-der
    // Se tilean a lo largo de X sin espacio entre bloques (P2/P3 llegan a px+L+W,
    // el siguiente bloque arranca justo ahí).
    const placements = [];
    const blockSpan = L + W;
    let px = palletCursorX;

    // Bloques completos de 4 (el molinete real)
    while (placements.length + 4 <= group.length && px + blockSpan <= CONT_L + FIT_EPS) {
      placements.push({ px, pz: 0, dX: A.dX, dZ: A.dZ }); // P1 abajo-izq  (de-costado)
      placements.push({ px: px + L, pz: 0, dX: B.dX, dZ: B.dZ }); // P2 abajo-der  (de-punta)
      placements.push({ px: px + W, pz: L, dX: A.dX, dZ: A.dZ }); // P3 arriba-der (de-costado)
      placements.push({ px, pz: W, dX: B.dX, dZ: B.dZ }); // P4 arriba-izq (de-punta)
      px += blockSpan;
    }

    // Sobrantes (1-3 pallets que no completan un molinete): columna al final,
    // de-costado (2 en profundidad) si entra, si no de-punta (más angosta).
    let rem = group.length - placements.length;
    while (rem > 0) {
      const o = px + A.dX <= CONT_L + FIT_EPS ? A : px + B.dX <= CONT_L + FIT_EPS ? B : null;
      if (!o) break;
      let pz = 0;
      while (rem > 0 && pz + o.dZ <= CONT_W + FIT_EPS) {
        placements.push({ px, pz, dX: o.dX, dZ: o.dZ });
        pz += o.dZ;
        rem--;
      }
      px += o.dX;
    }
    palletCursorX = px; // el próximo grupo de footprint arranca donde terminó éste

    // Colocar cada unidad con SU propia altura (mismo footprint, distinto alto posible)
    let idx = 0;
    for (const cp of placements) {
      if (idx >= group.length) break;
      const u = group[idx];
      const ori = { dX: cp.dX, dZ: cp.dZ, dY: u.dims.H };
      const h = hmGetMax(hm, cp.px, cp.pz, ori.dX, ori.dZ);
      const placement = tryPlaceAt(u, cp.px, cp.pz, ori, h, 'pattern');
      if (!placement) {
        consumeUnsafePlacementWarning(u, 'pattern');
        idx++;
        continue;
      }
      hmSetPallet(hm, placement.px, placement.pz, placement.ori.dX, placement.ori.dZ, placement.y, placement.ori.dY, u.packedItems, u.palletBase);
      packed.push(buildPackedItem(u, placement.px, placement.pz, placement.ori, placement.y, placement.support));
      clearUnsafePlacement(u);
      placed[u.id]++;
      handledByPattern.add(u.instanceId);
      idx++;
    }
  }

  // Standard BFD for remaining units
  for (const u of freeUnits) {
    if (handledByPattern.has(u.instanceId)) continue;
    const placedSafely = placeUnit(u, null);
    if (!placedSafely) consumeUnsafePlacementWarning(u, 'auto');
  }

  for (const item of packed) {
    if (!item.requiresAuxiliarySupport) continue;
    warnings.push({
      kind: 'physical-support',
      instanceId: item.instanceId,
      productId: item.productId,
      name: item.name,
      type: item.type,
      context: 'placed-with-auxiliary-support',
      message: 'La pieza requiere soporte fÃ­sico adicional',
      detail: item.supportReason || 'La pieza fue aceptada usando soporte auxiliar',
      supportPercent: item.supportPercent ?? 0,
      requiresAuxiliarySupport: true,
      suggestions: makeSupportSuggestions(item),
    });
  }

  const supportSummary = packed.reduce((acc, item) => {
    if (item.supportStatus === 'stable') acc.stable += 1;
    else if (item.supportStatus === 'partial') acc.partial += 1;
    else if (item.supportStatus === 'auxiliary') acc.auxiliary += 1;
    return acc;
  }, { stable: 0, partial: 0, auxiliary: 0 });

  return { packed, placed, hm, warnings, supportSummary, physicalConstraints: getPackingPhysicalConstraints() };
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
  }))) + JSON.stringify(window._instanceManualPos) + JSON.stringify(PHYSICAL_CONSTRAINTS);
  if (key === _packingCacheKey && _packingCache) return _packingCache;
  _packingCache = runPacking(products);
  _packingCacheKey = key;
  return _packingCache;
}

function invalidatePackingCache() {
  _packingCache = null;
  _packingCacheKey = '';
}

export { runPacking, runPackingCached, invalidatePackingCache, hmGetMax, hmSetPallet, validatePhysicalSupport };
