# 04 — Pallet Builder (verificado)

Lo más complejo del repo. Motor + store en `palletStore.js` (4152 LOC).

> ⚠️ **Corrección clave vs doc viejo**: `saveJob`/`loadJob`/`togglePublic`/
> `currentJobId`/`isPublic`/`applyJobPayload` **NO están en `palletStore.js`**.
> Viven como estado/funciones locales en [PalletBuilder.jsx](../src/components/PalletBuilder/PalletBuilder.jsx).
> El store no tiene código Supabase.

## Motor — `palletStore.js`

### Constantes exportadas

```js
PB_GRID_RES = 2          // cm (línea 5)
PB_PALLET_BASE_H = 14    // alto pallet madera (línea 8)
PB_EDGE_OVERHANG = 5     // cm overhang en bordes +X/+Z (línea 12)
```

Internas: `PB_MIN_SUPPORT_PERCENT=0.97`, `PB_MIN_SUPPORT_AXIS_COVERAGE=0.92`,
`PB_MAX_SUPPORT_GAP_RATIO=0.08`, `PB_MIN_LAYER_SUPPORT_COVERAGE=0.72`.
Time budgets: `SMALL=7000ms` (≤24 u), `MEDIUM=5500ms` (≤48), `LARGE=4000ms` (else).

Tiers de soporte en `pb_supportForRect` (`:1736`): strict 0.99/0.96/0.05,
**lenient (manual) 0.6/0.5/0.4**, default 0.97/0.92/0.08.

### `pb_runPacking(products, palL, palW, maxH)` (`:3343`)

Devuelve **array de cajas de UN pallet** `{x,y,z,dX,dY,dZ,color,name,id,uid,score,weight,mustBeBase,noRotate,sourceDims}`. El store loopea esto por pallet en `build()`.

⚠️ **Lo que realmente corre** (no son "5 variantes" como dice el doc viejo):
1. `pb_runLayerPacking` (`:3364`)
2. variantes container-like `['auto','grid','low-height','layers','size-grouped']` (`:3367`)
3. fallback motor viejo `runPalletPacking` (`:3375`)

Cada candidato pasa por `normalize()` antes de comparar:
`pb_compactPackedLayout → pb_gravitySettle → pb_dropFloaters`.

Post-proceso final:
`pb_compactLaterally → pb_centerPackedLayout → pb_gravitySettle → pb_dropFloaters → pb_alignLoneApex`.

Comparación `pb_isBetterLayout`: más cajas gana; empate por `top + layers*25 + void*0.1`.

⚠️ **Código posiblemente muerto**: `pb_runPackingCore`, `pb_runPackingFast`,
`pb_runPackingGreedy`, `pb_runPackingLayered` y helpers (`pb_chooseBestCandidate`,
`pb_optimizePackedLayout`, etc.) **no son referenciados por `pb_runPacking`**. Es buena
parte de los 4152 LOC. Hacer un pase de dead-code antes de confiar en el doc viejo.

### Funciones públicas `pb_*`

```js
pb_validatePlacement(boxes, movingBox, palL, palW, maxH, nextX, nextZ, nextDims, opts)
pb_validateSingleBoxMove(boxes, rootUid, palL, palW, maxH, nextX, nextZ, opts)
pb_validateGroupPlacement(boxes, rootUid, palL, palW, maxH, nextX, nextZ, opts)
pb_getSupportedStack(boxes, rootUid)          // uids de la pila que se apoya en root
pb_findAllValidPlacements(unit, packed, hm, palL, palW, maxH, variant, deadline)
pb_diversePlacements(candidates, maxN=12, minDist=8)
```
`opts`: `strict` (~full support), `lenient` (60%, modo auto/manual), default balanceado.
Nota: `pb_validatePlacement` pasa `lenient: !opts.strict` por default → la validación
default es **lenient**, strict sólo si el caller lo pide.

### Motor viejo — `palletPacking.js`

`runPalletPacking(products, {palL, palW, maxH, variant})` → cajas. Umbrales **más
flojos** (0.8/0.68/0.38). Usado como candidato fallback en `pb_runPacking` y en
`pb_runReorderVariant`.

## Store Zustand

Estado inicial: `palletType:'eua', maxHeight:180, products:[], results:[], activeResult:0,
selectedBoxUid:null, buildMode:'auto'`.

**`results[]` por pallet**: `{idx, type, palL, palW, maxHeight, boxes, reserveBoxes,
totalHeight, totalWeight, products}`. `pb_finalizeResultMeta` recalcula
`totalHeight = max(top de cajas) + PB_PALLET_BASE_H`.

Box `uid` formato `${id}::${i}` (variantes `::leftover-`, `::grid::`, `::layer::`, `::fill::`, `reserve::`).

Acciones clave:
- `setBuildMode(mode)`, `startManualEmpty()`, `startManualPrebuilt()` (corre `build()` y queda manual).
- **`setMaxHeight(h)`** propaga a TODOS los results: `results.map(r => ({...r, maxHeight:next}))` (`:3803`). Es el fix documentado del slider. ⚠️ **No re-valida ni dropea cajas que quedan sobre el nuevo límite.**
- `build()` (`:3826`): loopea `pb_runPacking` por pallet (cap 50) → finalize → polish → mergeRepack → stuffLeftovers → mergeRepack → safety net gravitySettle+dropFloaters.
- `cyclePlacement(uid, dir)`: cursor sobre `pb_diversePlacements(all, 16, 8)`.
- `suggestRelocate(uid)`: saca la caja, busca mejor placement, la re-agrega.
- CRUD: `addOrUpdateProduct` (asigna color + `id: Date.now()+random`), `removeProduct`, `setProducts`/`setResults`.

## Persistencia — en `PalletBuilder.jsx` (no en el store)

Estado local (`useState`). `buildJobPayload()` (`:482`) pasa por `jsonSafe`:

```js
payload = {
  v: 1, palletType, maxHeight,
  products: [{...p}],                    // dims, qty, weight, color, mustBeBase, noRotate, imgUrl, price
  results: [{ idx, type, palL, palW, maxHeight,
              boxes:[{...b}], reserveBoxes:[{...b}], products:[{...p}] }]
}
```
Guardado en columna `payload` (jsonb) de la tabla `pallets`. Fila también: `name, status,
tracking_url, is_public, user_id`.

⚠️ **`applyJobPayload(payload)`** (`:501`) — **sanitización defensiva** (el fix del crash):
fuerza `id`/`color`/`dims` en products; filtra results sin `boxes` array; **filtra cajas
que no tengan `uid` y `dX/dY/dZ` numéricos** (`:526`). Todo en try/catch con toast.

**No cambiar el formato del payload** sin actualizar `applyJobPayload` y `SharePalletPage`.

`handleSharePallet` (`:639`): auto-inserta con `is_public:true` si no estaba guardado.
Share origin hardcodeado `https://fleetloader.vercel.app`, ruta `/share/pallet/:id`.

## Vista 3D — `PalletThreeCanvas.jsx`

Props: `result, selectedBoxUid, onSelectBox, onUpdateBoxes, onDropReserveBox, strictMode=false, readOnly=false`.

- **`preserveDrawingBuffer: true`** (`:119`) — crítico para `toDataURL`. **No tocar.**
- `readOnly` → early-return en `handleMouseDown`/`DragOver`/`Drop` (drag off, orbit sigue).
- `strictMode` → `moveOpts = {strict:true}` a los validadores.
- Drag: **Shift = mover el stack** (`pb_validateGroupPlacement`); sin Shift = `pb_validateSingleBoxMove`. Preview válido amarillo `0xFFCC44`, inválido rojo `0xE36D5B`.
- Boxes con dims inválidas (NaN/<0.5) se saltean con `console.warn`. Y offset `PB_PALLET_BASE_H`.

## Share — `SharePalletPage.jsx`

[SharePalletPage.jsx](../src/components/Share/SharePalletPage.jsx): tabla `pallets`,
`.eq('id',id).eq('is_public',true).maybeSingle()`, **reintenta 6× cada 650ms**. Lazy-load
de `PalletThreeCanvas` con `readOnly={true}` + handlers no-op.

## PDF — `exportPalletPDF.js`

`exportPalletPDF({palletName, palletId, palletType, maxHeight, products, results, snapshots, tracking})`
([exportPalletPDF.js](../src/lib/exportPalletPDF.js)). Async, jsPDF + autotable + qrcode, todo por `ascii()`.

Secciones: 1) Portada (header + stats + snapshot[0] + QR del share). 2) Resumen general
(tabla productos + totales). 3) Una página por pallet (foto + stats + tabla). 4) **Guía de
armado**: agrupa por capa (Y redondeado), pasos numerados "Paso N: Colocar X cajas de ...
en {posición}". 5) Diagrama cardinal (TRASERA/DELANTERA/IZQUIERDA/DERECHA). 6) Recomendaciones.

Helpers (pinneados por tests, no cambiar thresholds 0.33/0.67 ni las frases):
- `posDescription(box, palL, palW)` → "la esquina trasera izquierda", "el centro del pallet", etc.
- `orientationDescription(box)` → "parada"/"acostada"/"de costado"; cubo → `null`.

**Snapshot timing** (en `PalletBuilder.handleExportPDF`): **doble `requestAnimationFrame` +
`setTimeout(400ms)`** antes de `toDataURL('image/jpeg', 0.92)`. Loopea por result.

## Invariantes que cubren los tests (no romper)

[palletBuilder.test.js](../src/__tests__/palletBuilder.test.js) (46) +
[palletAdvanced.test.js](../src/__tests__/palletAdvanced.test.js) (40):
sin flotantes, sin solapamiento, dentro de pallet+overhang, `y+dY ≤ maxH+0.5`, uids únicos,
constantes pinneadas (`PB_GRID_RES===2`, `PB_PALLET_BASE_H===14`, `PB_EDGE_OVERHANG===5`),
performance (50 cajas <10s, 2×30 <15s), y las frases de `posDescription`/`orientationDescription`.
