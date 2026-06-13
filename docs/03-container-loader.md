# 03 — Container Loader (verificado)

Empaqueta cajas + pallets en contenedores con motor BFD y vista 3D.

## `packing.js` — motor BFD

[packing.js](../src/lib/packing.js). Heightmap `Float32Array` flat, `GRID_RES = 5` cm.

### Constantes reales

```js
GRID_RES = 5             // cm (línea 2)
DEFAULT_PHYSICAL_CONSTRAINTS = {       // línea 8-13
  MIN_SUPPORT_PERCENT: 0.8,            // ⚠️ doc viejo dice ~0.75
  ALLOW_OVERHANG: false,              // ⚠️ doc viejo dice true
  ALLOW_AUXILIARY_SUPPORT: false,
  CENTER_OF_GRAVITY_CHECK: true,
}
CONT_L/W/H default = 589 / 235 / 239
```

### API pública (export en `:717`)

```js
setContainerDimensions(L, W, H, vol)          // recalcula grid, invalida cache
getPackingPhysicalConstraints() → {...}
setPackingPhysicalConstraints(next) → void    // ⚠️ shallow-merge SIN validar keys
runPacking(products) → { packed, placed, hm, warnings, supportSummary, physicalConstraints }
runPackingCached(products) → idem (cache de 1 entrada)
invalidatePackingCache()
validatePhysicalSupport(item, position, placedItems) → {...}
```

**`runPacking` return** (`:691`):
- `packed[]`: objetos con `{x,y,z,dX,dY,dZ,color,name,type,productId,instanceId,pct,dims,packedItems,palletBase,supportPercent,supportArea,supportStatus,supportReason,centerSupported,requiresAuxiliarySupport}`. **Clave es `productId`, no `id`.**
- `placed`: `{ [productId]: count }`.
- `warnings[]`: `{kind:'physical-support', instanceId, productId, name, message, supportPercent, suggestions, ...}`.
- `supportSummary`: `{stable, partial, auxiliary}`.

**`validatePhysicalSupport` return**: `{valid, status:'stable'|'partial'|'auxiliary'|'invalid', supportPercent, supportArea, centerSupported, spanRatioX, spanRatioZ, requiresAuxiliarySupport, reason, suggestions}`. Piso (y≤0.5) siempre estable. Gate: `meetsSupport && centerOk && spanOk` (spanOk requiere `min(spanRatioX,Z) ≥ 0.55` salvo overhang).

### BFD sort (`:307-316`)

1. Pallets antes que cajas.
2. Unidades con `priorityZone` primero, ordenadas por `priorityZoneSlot` asc.
3. Mayor volumen primero.

### Globals `window` (el motor las lee/escribe)

- `window._instanceManualPos` — `{ [instanceId]: {x,z} }`, pin de instancia (leído `:282`).
- `window._instanceLockedOri` — `{ [instanceId]: {dX,dZ,dY} }`, lock de orientación (`:283`).
- `window._palletsWithNoSpace` — **escrito** por el motor (`:515`) cuando un pallet no entra. ⚠️ Ningún UI lo lee → señal perdida en el path auto.
- **`instanceId = `${p.id}_${i}`** (`:290`), i = 0…qty-1.

⚠️ En tests **hay que stubear** `_instanceManualPos` y `_instanceLockedOri` o el motor crashea.

## `containerStore.js` — multi-shipment

[containerStore.js](../src/stores/containerStore.js)

```js
shipmentContainers: [{ id, type, products:[], priorityZones:[null,null,null],
                       instanceManualPos:{}, instanceLockedOri:{} }]
activeContainerIdx, currentShipmentId, currentShipmentName
loadedProducts          // copia de trabajo del container activo
priorityZones, instanceManualPos, instanceLockedOri, selectedZoneSlot
catalog                 // de localStorage 'cl_catalog' + Supabase user_catalog
```

`switchToContainer`/`removeContainer`/`syncActiveContainer` guardan el estado vivo en
`shipmentContainers[idx]` antes de cambiar. Máx 3 zonas de prioridad por container.

**Undo/redo a nivel módulo (NO reactivo)** (`:26-37`):
```js
let _undoHistory = []; let _redoStack = []; const MAX_HISTORY = 50;
```
Sólo `canUndo`/`canRedo` están en el store reactivo. ⚠️ **El historial sólo clona
`loadedProducts`** — zonas, pins manuales y locks de orientación NO se snapshotean, así
que undo tras un drag/rotación no los restaura.

**Catálogo**: tabla Supabase `user_catalog` (columna `items` jsonb) + localStorage
`cl_catalog` como source/fallback. `saveCatalog` escribe localStorage sync y hace
**fire-and-forget upsert** a Supabase (sólo `console.warn` en error). `addToCatalog`
dedup por `name`. Es el catálogo **realmente compartido** entre ImportaPro y los loaders.

## `constants.js`

`CONTAINER_TYPES` (cm):

| key | L | W | H | label |
|---|---|---|---|---|
| `20ft` | 589 | 235 | 239 | 20' Dry |
| `40ft` | 1200 | 235 | 239 | 40' Dry |
| `40hc` | 1200 | 235 | 269 | 40' High Cube |
| `semi145` | 1450 | 244 | 270 | Semi 14.5 m |
| `semi155` | 1550 | 244 | 270 | Semi 15.5 m |

(⚠️ la key es `40hc` minúscula, el doc viejo escribe `40HC`.)

`WEIGHT_LIMITS` kg: 20ft 24000, 40ft/40hc 26500, semis 28000.
`PALLET_SIZES`: euro `{L:120,W:80}`, eua `{L:120,W:100}`. `COLORS`: 10 hex tierra.

## Vista 3D — `ThreeCanvas.jsx`

[ThreeCanvas.jsx](../src/components/ContainerLoader/ThreeCanvas.jsx), `forwardRef` con `captureViews()`.

- Renderer `WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true})` (`:114`) — **`preserveDrawingBuffer` crítico** para `toDataURL`. Pixel ratio cap 1.5.
- On-demand render loop (sólo cuando `_needsRender`). Drop-in animation 320ms.
- Cajas `BoxGeometry` con gap 0.08, material cacheado por hex. Pallets = tablones + slats de madera; si tiene `packedItems` dibuja cada caja hija.
- **Segundo cache LRU** (max 8) por dims+products+pins+physics, separado del cache de 1 entrada de `packing.js`.
- Drag (`:765-987`): mousedown snapshotea layout a globals, mousemove snapea a grid 5cm + clampea, **mouseup re-corre `runPacking` para validar el drop**; si no entra restaura posición previa y toast "No hay espacio ahí".
- `captureViews` (`:266`): 4 cámaras, `toDataURL('image/jpeg',0.85)`. Render síncrono (no usa el doble-RAF que sí usa PalletThreeCanvas).

## Share — `SharePage.jsx`

[SharePage.jsx](../src/components/Share/SharePage.jsx): tabla **`shipments`**,
`.eq('id',id).eq('is_public',true).maybeSingle()`, **reintenta 6× cada 650ms** (lag de
replicación). `ThreeCanvas` lazy + `readOnly`. Container payload puede ser array o `{items,notes}`.

## Tests — gotchas

[containerLoader.test.js](../src/__tests__/containerLoader.test.js): `beforeAll`/`beforeEach`
stubean `window._instanceManualPos`, `window._instanceLockedOri`, `localStorage`.
⚠️ Dos tests son vacíos: `:83` usa key camelCase `minSupportPercent` (el motor usa
`MIN_SUPPORT_PERCENT`, pasa por el shallow-merge sin efecto) y `:122` filtra `p.id==='a'`
cuando los items usan `productId` → cuenta trivialmente 0. Pasan por la razón equivocada.
