# 06 — Modelo de datos (verificado)

Dónde vive cada dato: Supabase, stores Zustand, localStorage, globals `window`.

## Tablas Supabase

| Tabla | Migración en repo | Usada por | Columnas relevantes |
|---|---|---|---|
| `subscriptions` | ❌ **no committeada** | authStore, lemon-webhook | `user_id, plan, status, lemon_customer_id, lemon_subscription_id` |
| `pallets` | ✅ `20260517_pallets.sql` | PalletBuilder, SharePalletPage | `id, user_id, name, payload(jsonb), status, tracking_url, notes, is_public, created_at, updated_at` |
| `shipments` | ❌ no en repo | ContainerLoader, SharePage, api/ping | `id, ..., is_public` (+ payload de containers) |
| `user_catalog` | ❌ no en repo | containerStore | `user_id, items(jsonb)` |
| `auth.users` | (Supabase) | auth | — |

`pallets` tiene RLS: owner-all + public-read donde `is_public=true`, trigger `updated_at`
([20260517_pallets.sql](../supabase/migrations/20260517_pallets.sql)).
⚠️ Las RLS de `subscriptions`, `shipments` y `user_catalog` **no son visibles en el repo** —
la confidencialidad y el anti-fraude de planes dependen de ellas. Verificar en el dashboard.

### `pallets.payload` (jsonb) — formato

```jsonc
{
  "v": 1,
  "palletType": "eua",
  "maxHeight": 180,
  "products": [ { /* dims, qty, weight, color, mustBeBase, noRotate, imgUrl, price */ } ],
  "results": [ {
    "idx": 0, "type": "eua", "palL": 120, "palW": 100, "maxHeight": 180,
    "boxes": [ { "uid": "...", "x":0,"y":0,"z":0, "dX":0,"dY":0,"dZ":0, "..." } ],
    "reserveBoxes": [ ... ],
    "products": [ ... ]
  } ]
}
```
**No cambiar este formato** sin actualizar `applyJobPayload` (PalletBuilder) y `SharePalletPage`.

## Stores Zustand (5)

| Store | Estado | Persistencia |
|---|---|---|
| `appStore` | `activeSection, toasts` | ninguna |
| `authStore` | `user, userPlan, loading, recoveryFlow` | sesión vive en Supabase |
| `containerStore` | catálogo, multi-shipment, undo/redo | localStorage `cl_catalog` + Supabase `user_catalog` + `shipments` |
| `importaproStore` | inputs calc, savedProducts, canales, apiKey | varias claves localStorage (abajo) |
| `palletStore` | motor `pb_*` + buildMode, results, products | ninguna directa (persistencia en PalletBuilder.jsx → `pallets`) |

⚠️ Undo/redo de `containerStore` vive a **nivel de módulo** (`let _undoHistory`/`_redoStack`),
sólo `canUndo`/`canRedo` son reactivos, y **sólo snapshotea `loadedProducts`**.

## Claves localStorage

| Clave | Store | Contenido |
|---|---|---|
| `importapro-products` | importaproStore | array de productos guardados (con fotos base64) |
| `importapro-publication-plans` | importaproStore | planes de publicación por `productId` |
| `importapro-publication-order-draft` | importaproStore | borrador de orden de compra |
| `importapro-publication-order-name` | importaproStore | nombre de la orden |
| `importapro-apikey` | importaproStore | ⚠️ **dead — nadie lo lee, sin UI para setearlo** |
| `cl_catalog` | containerStore | catálogo compartido (source/fallback de `user_catalog`) |

⚠️ `importaproStore.inputs`, `.canales` y `.tcUpdatedAt` **no se persisten** — el estado de
la calculadora y el TC se pierden al refrescar.

## Globals `window` (motor de packing impuro)

| Global | Quién lee/escribe | Forma |
|---|---|---|
| `window._instanceManualPos` | `packing.js` lee; containerStore/ThreeCanvas escriben | `{ [instanceId]: {x,z} }` pin |
| `window._instanceLockedOri` | `packing.js` lee | `{ [instanceId]: {dX,dZ,dY} }` lock orientación |
| `window._palletsWithNoSpace` | `packing.js` escribe; nadie lo lee en UI | array de ids de pallet que no entraron |

`instanceId = `${product.id}_${idx}``. ⚠️ **En tests del container hay que stubear** los dos
primeros o el motor crashea (`beforeAll` de `containerLoader.test.js`). El Pallet Builder
**no** usa estos globals (su motor recibe todo por argumento).

## Constantes magic-number a centralizar (tech debt)

- TC dólar `1359` hardcodeado en 3 archivos (Calculator, Comparator, importaproStore).
- Constante CNY: `0.138` (syncFob) vs `0.1466` (DEFAULT_INPUTS + display).
- Umbrales de "es semi" dispersos (`CONT_L>800`, `>1300`).
