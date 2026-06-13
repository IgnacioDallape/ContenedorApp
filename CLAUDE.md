# CLAUDE.md — ContenedorApp v2

Guía exhaustiva del proyecto para Claude Code (claude.ai/code).
**Leer este archivo entero antes de tocar código.** Cubre todo lo que necesitás
para entender el proyecto sin tener que explorarlo.

---

> ## ⚠️ Fuente de verdad: `docs/` (auditada 2026-06-13)
>
> Este archivo tiene afirmaciones **desactualizadas/incorrectas**. Antes de confiar
> en algo de acá, chequeá [`docs/`](docs/) — documentación verificada contra el
> código real, con refs `archivo:línea`. Empezá por [`docs/README.md`](docs/README.md)
> y [`docs/07-audit-findings.md`](docs/07-audit-findings.md).
>
> **Correcciones críticas** (detalle en `docs/07-audit-findings.md`):
> 1. **SÍ hay pagos** — Lemon Squeezy (checkout + webhook), no "sin integración". → `docs/01-auth-billing.md`
> 2. **NcmSearch NO usa IA** — filtro estático; `@anthropic-ai/sdk` es dependencia muerta. → `docs/02-importapro.md`
> 3. **`saveJob/loadJob/togglePublic` están en `PalletBuilder.jsx`**, no en `palletStore`. → `docs/04-pallet-builder.md`
> 4. **Container**: `MIN_SUPPORT_PERCENT=0.8`, `ALLOW_OVERHANG=false` (no 0.75/true). → `docs/03-container-loader.md`
> 5. **`Cormorant Garamond` sigue vivo** en `styles.css:795` (la unificación a Inter no fue total).
> 6. **`Catalog/Catalog.jsx` es código muerto** (nunca se importa).
>
> El resto del archivo queda como referencia histórica/contextual.

---

## TL;DR (30 segundos)

App React + Vite + Zustand + Three.js + Supabase. Sin TS. Un único deploy en
Vercel desde `main` que muestra **3 herramientas** detrás de auth con planes:

1. **ImportaPro** — Calculadora de costos de importación China → Argentina, NCM, simulador, comparador.
2. **Container Loader** — Empaqueta cajas+pallets en 20ft/40ft/40HC/Semi 14.5m/15.5m con vista 3D.
3. **Pallet Builder** — Arma pallets individuales (Euro/EUA) con motor propio (~4100 líneas) + share link público + PDF con guía de armado.

Stack: React 18, Vite 6, Zustand 5, Three.js 0.175, Supabase JS 2.49, jsPDF 4,
Vitest 4 + jsdom. Fuente única: **Inter**. Tema cream/beige con accent azul
`#1a4f8a`. Todo el UI text en español argentino. **148 tests** en `__tests__/`.

URLs:
- Repo: `https://github.com/IgnacioDallape/ContenedorApp.git`
- Deploy: `https://fleetloader.vercel.app` y `https://contenedor-app.vercel.app`
- Supabase: `https://yxfpkxvrzypueusyueuh.supabase.co` (key pública en `src/lib/supabase.js`)

---

## Comandos

```bash
npm install         # primera vez
npm run dev         # vite dev server en localhost:5173
npm run build       # genera dist/, ~5s
npm run preview     # serve dist/
npm test            # vitest run — 148 tests, ~12s
npm run test:watch  # vitest en modo watch
```

Push a `main` → Vercel auto-deploya en 1-3 min. Hay un cron en
`vercel.json` que pega a `/api/ping` cada 5 días para mantener Supabase activo.

---

## Estructura completa del repo

```
ContenedorApp/
├── CLAUDE.md                   ← este archivo
├── index.html                  Único entry, importa Google Fonts (solo Inter)
├── package.json                Scripts y deps (sin TS)
├── vite.config.js              Vite + vitest (test.environment = 'jsdom')
├── vercel.json                 Rewrites /share/:id, /share/pallet/:id + cron keepalive
├── .gitignore                  node_modules/, dist/, .claude/, supabase/.temp/, tmp_*.mjs
├── api/
│   └── ping.js                 Serverless function llamada por cron Vercel
├── css/
│   └── styles.css              ✦ CSS global. Vars de tema (--bg, --accent, --font, …).
│                                 Todas las reglas no-inline viven acá.
├── public/
│   ├── manifest.webmanifest    PWA manifest
│   ├── sw.js                   Service worker (registrado en main.jsx)
│   ├── favicon-*.png           Íconos
│   └── apple-touch-icon.png
└── src/
    ├── main.jsx                Entry: monta <App/>, registra SW
    ├── App.jsx                 Layout root: detecta /share/:id, routea SharePage o AppShell
    │
    ├── components/
    │   ├── Auth/
    │   │   └── LoginPage.jsx           Login + signup + recovery flow Supabase
    │   ├── Billing/
    │   │   ├── PlanHub.jsx             Pantalla de selección de plan (Basic/Pro/ProMax)
    │   │   └── UpgradeModal.jsx        Modal de upgrade cuando una feature está bloqueada
    │   ├── Brand/
    │   │   └── BrandMark.jsx           Logo SVG
    │   ├── Catalog/
    │   │   └── Catalog.jsx             Catálogo de productos compartido (ImportaPro ↔ loaders)
    │   ├── Layout/
    │   │   ├── AppShell.jsx            ⭐ Sidebar + main. Routea por activeSection. Bloquea por plan.
    │   │   ├── ErrorBoundary.jsx       Cae sobre cada sección, muestra fallback en español.
    │   │   └── UpgradeModal.jsx        (también acá)
    │   ├── Share/
    │   │   ├── SharePage.jsx           Vista pública de shipment (contenedor)
    │   │   └── SharePalletPage.jsx     Vista pública de pallet armado (read-only)
    │   ├── ImportaPro/
    │   │   ├── Calculator.jsx          ⭐ Calculadora principal. Contiene calcCostos() export
    │   │   ├── Products.jsx            Lista de productos guardados, carga uno a la calculadora
    │   │   ├── Comparator.jsx          Compara dos productos lado a lado
    │   │   ├── NcmSearch.jsx           Buscador NCM con IA (usa @anthropic-ai/sdk)
    │   │   ├── Simulator.jsx           Simulador de precios por canal (ML / propia / IG)
    │   │   ├── Prices.jsx              Precios confirmados publicados
    │   │   └── Settings.jsx            Configuración: TC, API key, perfil, suscripción
    │   ├── ContainerLoader/
    │   │   ├── ContainerLoader.jsx     ⭐ Componente principal (~1900 LOC), sidebar de productos + 3D
    │   │   ├── ThreeCanvas.jsx         Vista 3D Three.js con OrbitControls
    │   │   └── ThreeErrorBoundary.jsx  ErrorBoundary específico del canvas
    │   ├── PalletBuilder/
    │   │   ├── PalletBuilder.jsx       ⭐ Componente principal (~1800 LOC)
    │   │   └── PalletThreeCanvas.jsx   3D del pallet con drag de cajas (prop readOnly)
    │   ├── PWAInstallPrompt.jsx        Banner "Instalar app"
    │   └── Toast.jsx                   Toast global (lee de useAppStore)
    │
    ├── stores/                  Zustand — 5 stores
    │   ├── appStore.js          { activeSection, toasts, setActiveSection, showToast }
    │   ├── authStore.js         { user, userPlan, loading, recoveryFlow, init, enterApp }
    │   ├── containerStore.js    Catálogo + multi-shipment + undo/redo (50 niveles)
    │   ├── importaproStore.js   Inputs calculadora + savedProducts + canales + apiKey
    │   └── palletStore.js       ⭐ Motor packing pallet (~4100 LOC) + buildMode + cycle
    │
    ├── lib/
    │   ├── packing.js           ⭐ Motor BFD container. Exporta runPacking, validatePhysicalSupport
    │   ├── palletPacking.js     Motor "viejo" del pallet (runPalletPacking, fallback en pb_runPacking)
    │   ├── constants.js         CONTAINER_TYPES, PALLET_SIZES, PB_PALLET_TYPES, NCM_FRECUENTES, COLORS
    │   ├── formatters.js        fmt (es-AR 2 dec), ars ($1.234), rd(n,d), shortenUrl
    │   ├── pricing.js           simulateChannelPrices(costo, margen, iva, iibb, iigg, channels?)
    │   ├── exportPDF.js         exportCotizacionPDF — PDF de la calculadora
    │   ├── exportPalletPDF.js   ⭐ PDF del pallet con guía de armado
    │   ├── supabase.js          export const _sb = createClient(URL, ANON_KEY)
    │   └── appUrl.js            parseAuthHash (recovery flow), helpers de URL
    │
    └── __tests__/               Vitest — 148 tests pasan ✅
        ├── palletBuilder.test.js     46 — motor pallet básico, helpers PDF, performance
        ├── palletAdvanced.test.js    40 — escenarios reales, invariantes en 5 mixes
        ├── containerLoader.test.js   30 — motor contenedor 20ft/40ft, validatePhysicalSupport
        └── utilities.test.js         32 — formatters, pricing, calcCostos
```

---

## Auth y planes

### Stack de auth

Supabase Auth en `src/lib/supabase.js`. El cliente `_sb` se exporta para usar
en cualquier lugar. Auth flow:

1. `authStore.init()` se llama en `App.jsx` useEffect
2. Lee hash de URL — si es `#recovery` o `#forgot` cambia `authMode`
3. Llama `_sb.auth.getSession()` — si hay sesión, ejecuta `enterApp(user)`
4. `enterApp` consulta `subscriptions` table, setea `userPlan` si está activa

Si no hay user → `<LoginPage>`. Si hay user → `<AppShell>`.

### Tabla `subscriptions` (Supabase)

```sql
user_id      uuid     -- ref auth.users
plan         text     -- 'basic' | 'pro' | 'promax'
status       text     -- 'active' | 'on_trial' | 'trialing' | otros (= bloqueado)
```

### Planes (`PlanHub.jsx`)

| Plan       | Precio       | Acceso                                       |
|------------|--------------|----------------------------------------------|
| `none`     | —            | Sólo `/settings` (PlanHub). Resto bloqueado. |
| `basic`    | ARS 24.999   | Importación + NCM + Simulador + Productos    |
| `pro`      | ARS 49.999   | Lo de basic + Cargador 3D de contenedores    |
| `promax`   | ARS 69.999   | Todo lo anterior + Armador de pallets        |

Lógica de lock en `AppShell.jsx` líneas 191-225:

```js
const locked =
  (id !== 'settings' && userPlan === 'none')
  || (id === 'container' && !['pro', 'promax'].includes(userPlan))
  || (id === 'palletbuilder' && userPlan !== 'promax');
```

Si tocás un item bloqueado → abre `UpgradeModal` con el plan requerido.

### Sin payment integration

**No hay integración de pagos.** Los planes se asignan manualmente en Supabase
o vía `UpgradeModal` que abre un link externo. Falta integrar Mercado Pago /
Stripe acá (ver "Cosas para mejorar").

---

## Sidebar / navegación (`AppShell.jsx`)

Secciones que dispatcha (líneas 450-461):

| ID                | Componente         | Plan requerido |
|-------------------|--------------------|----------------|
| `home`            | `WelcomePanel`     | none+          |
| `calc`            | `<Calculator/>`    | basic+         |
| `products`        | `<Products/>`      | basic+         |
| `comparator`      | `<Comparator/>`    | basic+         |
| `ncm`             | `<NcmSearch/>`     | basic+         |
| `simulator`       | `<Simulator/>`     | basic+         |
| `prices`          | `<Prices/>`        | basic+         |
| `settings`        | `<Settings/>`      | none (siempre) |
| `container`       | `<ContainerLoader/>` | pro / promax |
| `palletbuilder`   | `<PalletBuilder/>` | promax         |

El sidebar tiene su versión móvil (drawer) y desktop (fixed 240px). Ver
`AppShell.jsx` ~líneas 220-430.

---

## Sección 1 — ImportaPro (calculadora)

### Calculator.jsx — flujo de cálculo

Función pura `calcCostos(inp)` exportada (línea 9 de `Calculator.jsx`).
Cadena de costos por unidad (todo en USD salvo el final):

```
FOB                                                  ← precio compra (1688)
+ Flete unitario  = fleteMode === 'fob36' ? FOB×0.36 : flete/qty
+ Seguro          = FOB × seguroPct / 100
────────────────────────────────────────────────────
= CIF
+ D.I.            = CIF × di / 100               (toggles: 0/6/12/18/20/25/35%)
+ IVA imp.        = (CIF + DI) × ivaImp / 100    (toggles: 10.5 o 21%)
+ Tasa estadística= CIF × te / 100               (toggles: 0 o 3%)
+ Despachante/u   = despachante / qty
+ Flete interno/u = fleteInterno / qty
+ Trader/u        = FOB × traderPct / 100
────────────────────────────────────────────────────
= costoUSD
× globalTC                                            = costoARS (precio venta base)
```

### Quirks importantes

- **IVA fallback a 21%**: `parseFloat(inp.ivaImp) || 21` fuerza 21% si se pasa
  0/vacío/null. Intencional — en Argentina IVA importación no puede ser 0%.
- **`fleteMode='fob36'`**: cuando el contenedor es completo del usuario, se
  estima flete = 36% del FOB en lugar de prorratear el `flete` ingresado.
- **`tipoUnidad`**: `'box'` o `'pallet'`. Cambia labels en toda la UI y obliga
  a definir altura del pallet si es pallet.
- **`currencyMode`**: `'cny'` / `'usd'` / `'ars'`. Sincroniza `fob` (USD)
  automáticamente desde `fobCny` o `fobArs` cuando cambia. Ver `syncFob()`.

### Layout del resultado (refactored)

Después de varios refactors, hoy es **2 columnas** (no 3):

1. **Izquierda**: desglose grande del costo (número grande $XX.XXX) + barra
   de composición + grupos `ResultGroup` por categoría (Precio compra /
   Logística / Impuestos) + bar final "COSTO UNITARIO TOTAL".
2. **Derecha**: `InteractiveDonut` con prop `large` (radio 92, stroke 32,
   280×280 SVG) + tabla "Desglose U$S" con % y monto por categoría. Click
   sobre un slice scrollea a la sección del form que lo originó.

**Ya NO se muestran** las cards de canales (Mercado Libre / Tienda Propia /
Instagram) en esta vista — vivían en la columna derecha y se quitaron junto
con los controles de Reinversión/Retiro. Esa simulación ahora vive en
`Simulator.jsx` (sección aparte).

### Sección "Logística e importación" (compacta)

Grid 2×2 — antes era 4 stacked, ahora aprovecha el ancho:

```
┌──────────────────────────────┬──────────────────────────────┐
│ Flete internacional          │ Despacho y flete interno     │
│ [Carga manual][36% FOB]      │ Despachante │ Flete interno  │
│ Flete total │ Seguro %       │                              │
├──────────────────────────────┼──────────────────────────────┤
│ Comisión trader China        │ Aranceles Argentina          │
│ Comisión %  │ Total trader   │ D.I. toggles + [🔍 NCM]      │
│                              │ IVA toggles │ Tasa toggles   │
└──────────────────────────────┴──────────────────────────────┘
```

Cada celda es un `CalcSection` con borde lateral colorido. Texto de ayuda
en 1 línea (antes ocupaba 2-3).

### Componentes internos de Calculator.jsx

- `CalcSection({ id, color, label, children, style })` — wrapper con borde lateral
- `TaxToggle({ options, value, onChange })` — botoncitos toggle 0%/6%/...
- `ResultGroup({ color, label, rows, subtotal })` — bloque del desglose
- `InteractiveDonut({ slices, centerLabel, centerValue, large? })` — el donut
- `exportCSV(c, canales, nombre)` — al final del archivo

### Datos por defecto (`importaproStore.js`)

```js
DEFAULT_INPUTS = {
  nombre: 'Alfombra cocina',  // ejemplo precargado
  fobCny: 27.5, fob: 3.80, qty: 100,
  cny: 0.1466, arsTC: 1359, globalTC: 1359,
  flete: 500, fleteMode: 'manual', seguroPct: 1,
  despachante: 2000, fleteInterno: 1000, traderPct: 6,
  di: 20, ivaImp: 21, te: 3,
  // ...
}
```

### Persistencia

`importaproStore` guarda en `localStorage`:
- `importapro-products` — array de productos guardados
- `importapro-publication-plans`, `importapro-publication-order-draft`
- `importapro-apikey` — API key de Anthropic para NcmSearch

---

## Sección 2 — Container Loader

### `src/lib/packing.js` — motor

BFD (Best Fit Decreasing) con heightmap (`Float32Array` flat grid, GRID_RES=5cm).

**Funciones públicas:**

```js
setContainerDimensions(L, W, H, vol)
  // Actualiza dims y reinvalida cache
getPackingPhysicalConstraints()
setPackingPhysicalConstraints({
  MIN_SUPPORT_PERCENT,        // default ~0.75
  ALLOW_OVERHANG,             // default true
  ALLOW_AUXILIARY_SUPPORT,    // permite cajas con apoyo parcial visible
  CENTER_OF_GRAVITY_CHECK,    // verifica que el centro caiga sobre algo
  ...
})

runPacking(products)            // → { packed: [...], placed: { id: count }, warnings: [...] }
runPackingCached(products)      // mismo, cachea resultado
invalidatePackingCache()

validatePhysicalSupport(item, position, placedItems)
  // → { valid: bool, status: 'stable'|'partial'|'auxiliary',
  //     supportPercent, supportArea, centerSupported,
  //     spanRatioX, spanRatioZ, requiresAuxiliarySupport,
  //     reason, suggestions }
```

### Manual overrides (window-scoped)

El motor lee dos globals para overrides UI:

- `window._instanceManualPos` — `{ [instanceId]: { x, y, z } }` — pin de instancia
- `window._instanceLockedOri` — `{ [instanceId]: { dX, dZ, dY } }` — lock de orientación

`instanceId = '${product.id}_${idx}'`. En tests hay que stub estas globals.

### BFD sort (función `runPacking`)

1. Pallets antes que cajas (`type === 'pallet'` primero)
2. Zonas de prioridad (`priorityZone`) primero (con `priorityZoneSlot` ordenando por slot)
3. Mayor volumen primero dentro de cada grupo

### Vista 3D — `ThreeCanvas.jsx`

Three.js + OrbitControls. Cajas son `BoxGeometry` con color por producto
(de `COLORS` en `lib/constants.js`). Pallets se dibujan como caja madera
con altura `palletBase`.

Drag de cajas: cuando arrastrás una caja se llama a `validatePhysicalSupport`
para previsualizar si el spot es válido (verde/rojo).

### Multi-shipment (containerStore)

El store maneja **varios containers en un mismo "shipment"**:

```js
shipmentContainers: [
  { id: 1, type: '20ft', products: [...], priorityZones: [null,null,null],
    instanceManualPos: {}, instanceLockedOri: {} },
  { id: 2, type: '40ft', ... },
  ...
]
```

Cada uno tiene su propio catálogo de productos, zonas de prioridad
(hasta 3 por contenedor), pins manuales y locks de orientación.

### Undo/redo

50 niveles, implementado a nivel de módulo (no reactive):

```js
let _undoHistory = [];  // últimos 50 snapshots
let _redoStack = [];
```

`canUndo` / `canRedo` sí están en el store reactivo para habilitar/deshabilitar
botones.

---

## Sección 3 — Pallet Builder ⭐ (lo más complejo del repo)

### Motor: `src/stores/palletStore.js` (~4100 LOC)

#### Constantes exportadas

```js
PB_GRID_RES = 2      // resolución heightmap en cm
PB_PALLET_BASE_H = 14 // alto del pallet de madera (Euro/EUA)
PB_EDGE_OVERHANG = 5  // cm de overhang permitido en bordes (logística real)
```

#### Constantes internas (no exportadas)

```js
PB_HEIGHT_EPS = 0.1
PB_MIN_SUPPORT_PERCENT = 0.97   // requerido para considerar caja estable
PB_MIN_SUPPORT_AXIS_COVERAGE = 0.92
PB_MAX_SUPPORT_GAP_RATIO = 0.08
PB_CORE_BUDGET_SMALL_MS = 7000  // budget de tiempo por variante
PB_CORE_BUDGET_MEDIUM_MS = 5500
PB_CORE_BUDGET_LARGE_MS = 4000
```

#### Funciones públicas (motor)

```js
pb_runPacking(products, palL, palW, maxH)
  // → array de boxes empacadas [{ uid, id, name, x, y, z, dX, dY, dZ, weight, sourceDims, color }]

pb_validatePlacement(boxes, movingBox, palL, palW, maxH, nextX, nextZ, nextDims?, opts)
pb_validateSingleBoxMove(boxes, rootUid, palL, palW, maxH, nextX, nextZ, opts)
pb_validateGroupPlacement(boxes, rootUid, palL, palW, maxH, nextX, nextZ, opts)
  // opts: { strict: bool, lenient: bool }
  //   strict=true → 97% soporte requerido (modo manual estricto)
  //   lenient=true → 60% soporte (modo auto)
  // Default: balanceado (~85%)

pb_getSupportedStack(boxes, rootUid)
  // → array de uids de toda la pila que se apoya en rootUid (para mover en grupo)

pb_findAllValidPlacements(unit, packed, hm, palL, palW, maxH, variant, deadline)
  // Para una unidad y un layout actual, encuentra todos los placements válidos
  // ordenados por score (mejor primero). Usado por modo manual para ciclar.
pb_diversePlacements(candidates, maxN)
  // Filtra candidates a top-16 con suficiente diversidad espacial
```

#### Estrategia de packing (función `pb_runPacking`)

Ejecuta **5 variantes** y se queda con el mejor layout (`pb_isBetterLayout`):

1. `layer` — empieza con `pb_runLayerPacking` (típicamente la mejor)
2. `auto` — `pb_runPackingContainerLike` variante auto
3. `grid` — alineada a grilla
4. `low-height` — optimiza para minimizar altura
5. `layers` — busca capas planas perfectas
6. `size-grouped` — agrupa cajas idénticas (mejor para mix)

Cada candidato pasa por `normalize()`:

```js
const normalize = (packed) => {
  let r = pb_compactPackedLayout(packed, palL, palW, maxH);  // saca huecos
  r = pb_gravitySettle(r, palL, palW, maxH);                 // baja hasta apoyo
  r = pb_dropFloaters(r, palL, palW);                        // borra flotantes
  return r;
};
```

Post-procesado final:

```js
best = pb_compactLaterally(best, palL, palW, maxH);  // desliza hacia centro de capa
best = pb_centerPackedLayout(best, palL, palW, maxH); // centra el cluster
best = pb_gravitySettle(best, palL, palW, maxH);     // safety net
best = pb_dropFloaters(best, palL, palW);            // safety net
best = pb_alignLoneApex(best, palL, palW, maxH);     // alinea apex solitarios
```

#### Helpers internos clave

| Función | Qué hace |
|---|---|
| `pb_roundToGrid(value)` | Round al múltiplo de 2 más cercano |
| `pb_ceilToGrid(value)` | Ceil al múltiplo de 2 — usar en right-edges para evitar overlap |
| `pb_collectAnchors(packed, ...)` | Genera candidatos de posición desde bordes de cajas existentes |
| `pb_supportForRect(rect, supportRects)` | % de soporte de una caja sobre las de abajo |
| `pb_getOrientations(unit, palL, palW)` | Devuelve hasta 6 orientaciones válidas |
| `pb_compactLaterally(packed, ...)` | Desliza cajas hacia el centro de su capa para cerrar canales |
| `pb_gravitySettle(packed, ...)` | Baja cada caja hasta encontrar apoyo |
| `pb_dropFloaters(packed, ...)` | Elimina cajas sin soporte (red de seguridad) |
| `pb_alignLoneApex(packed, ...)` | Si una caja arriba está sola sobre 4 cajas → la pone exactamente sobre 1 |

### Store state (palletStore)

```js
{
  buildMode: 'auto' | 'manual',    // qué modo está activo
  setBuildMode(mode),
  startManualEmpty(),               // arrancar pallet vacío en modo manual
  startManualPrebuilt(),            // arrancar con el resultado del motor auto

  cyclePlacementCursor: Map(),      // { uid: cursorIdx } para ciclar placements
  cyclePlacement(uid, direction),   // mueve cursor +1/-1 entre 16 placements diversos
  suggestRelocate(uid),             // motor sugiere nueva pos para una caja

  // Estado de la UI / job
  products: [],                     // productos del job actual
  results: [{ palL, palW, maxHeight, boxes: [...] }],  // un result por pallet
  maxHeight, palletType, palletL, palletW,
  setMaxHeight(h),                  // propaga a TODOS los results existentes
  selectedBoxUid,

  // CRUD
  addProduct(p), updateProduct(id, p), deleteProduct(id),

  // Persistencia (Supabase)
  currentJobId, isPublic,
  saveJob(name), loadJob(id), togglePublic(),
}
```

### Modo manual — UX

1. Botón **Auto/Manual** en topbar cambia `buildMode`
2. En modo manual, dos opciones de arranque:
   - **Empezar vacío** (`startManualEmpty`) — limpia el pallet
   - **Pre-armado** (`startManualPrebuilt`) — corre el motor y queda como base
3. Por cada producto en sidebar, botón **+Acá** que llama a `handlePlaceUnit(productId)` que:
   - Encuentra el primer placement válido con `pb_findAllValidPlacements`
   - Agrega la caja al `result` activo
4. Click sobre una caja → inspector con:
   - **🤖 Sugerir mejor lugar** — `suggestRelocate(uid)` mueve la caja
   - **⬆ Parar / ⬇ Acostar** — `toggleStandLay(uid)` para cajas rectangulares
   - **◀ Anterior / 🔄 Otra posición** — `cyclePlacement(uid, ±1)` cicla entre 16 candidatos

### Vista 3D — `PalletThreeCanvas.jsx`

- Three.js + OrbitControls
- Drag de cajas con validación en vivo (usa `pb_validateSingleBoxMove` o
  `pb_validateGroupPlacement` si la caja tiene cosas encima)
- Prop `readOnly` desactiva drag (usado en `SharePalletPage`)
- Prop `strictMode` pasa `opts.strict` al validador
- `WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })`
  — **el `preserveDrawingBuffer` es crítico**: sin él `canvas.toDataURL()`
  devuelve imagen negra (Three limpia el buffer post-render)

### Share link

Ruta `/share/pallet/:id` (rewrite en `vercel.json`) → `SharePalletPage.jsx`:

- Lee tabla `pallets` en Supabase con `is_public = true` y `id = palletId`
- Reintenta 6 veces (650ms) por si la tabla acaba de sincronizar
- Render: header + stats + status bar + tabs por pallet + 3D `readOnly` + tabla por producto
- Botón **🔗 Compartir** en PalletBuilder:
  - Auto-guarda si el job no estaba guardado
  - Setea `is_public = true` en Supabase
  - `navigator.share()` o copia al clipboard

### Export PDF — `src/lib/exportPalletPDF.js`

`exportPalletPDF({ palletName, palletId, palletType, maxHeight, products, results, snapshots, tracking })`

Genera:

1. **Portada** — nombre + fecha + stats (N pallets, M cajas, kg) + snapshot 3D del pallet activo + QR del share link
2. **Resumen general** — tabla de productos con peso, precio, subtotal + totales
3. **Una página por pallet** — foto + stats (cajas, altura, peso, base) + tabla por producto
4. **Guía de armado** — pasos numerados, agrupados por capa. Cada paso:
   ```
   Paso N: Colocar 4 cajas de "X" paradas en la esquina trasera izquierda.
   ```
   - SIN medidas (no más "40x40x40cm, cubo")
   - Posiciones naturales (`posDescription`): "esquina trasera izquierda", "zona central derecha", "el centro del pallet"
   - Orientación (`orientationDescription`): "paradas" / "acostadas" / "de costado"
   - Cubos no mencionan orientación (irrelevante)
5. **Diagrama** de orientación cardinal (TRASERA / DELANTERA / IZQUIERDA / DERECHA)
6. **Recomendaciones generales** — tips de armado

Snapshot del canvas: doble RAF + 400ms wait antes de `toDataURL()`.

### Tabla Supabase `pallets`

```sql
id            uuid primary key
user_id       uuid
name          text
payload       jsonb         -- { products, results, palletType, maxHeight, palL, palW }
status        text          -- 'preparacion' | 'en_transito_puerto' | ... | 'entregado'
tracking_url  text
is_public     bool          -- true para share link
created_at    timestamptz
updated_at    timestamptz
```

---

## Convenciones de UI

### Fuente única

**Toda la app usa Inter.** En `css/styles.css`:

```css
:root {
  --font:      'Inter', system-ui, -apple-system, sans-serif;
  --font-head: 'Inter', system-ui, -apple-system, sans-serif;
  --font-ui:   'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Inter', system-ui, -apple-system, sans-serif;
}
```

Cualquier `fontFamily` inline en JSX debe usar literalmente
`'Inter', system-ui, -apple-system, sans-serif` o `'var(--font)'`.

**NO USAR**: Cormorant Garamond, DM Mono, Jost, DM Serif Display, Playfair.
Se quitaron en una pasada global con `sed`.

### Paleta y tema

```css
--bg:        #f5f4f1   (cream warm)
--bg-2:      #ffffff
--bg-3:      #f0eff0
--text:      #1a1a1a
--text-2:    #5c5c5c
--text-3:    #9a9a9a
--accent:    #1a4f8a   (azul logística)
--accent-dim: rgba(26,79,138,0.07)
--red:       #c0392b
--green:     #1a7a4a
--amber:     #b35a00
--border:    rgba(0,0,0,0.08)
--radius:    6px
--radius-lg: 10px
```

Cada sección de UI tiene su propio color de acento (azul = flete, verde =
despacho, rojo = aranceles, etc.), pero el accent base es siempre el azul.

### Inputs numéricos

Siempre llevan label con `<span class="unit">`:

```jsx
<label>Flete total <span className="unit">USD</span></label>
<input type="number" value={...} onChange={...} />
```

### Botones primarios

Clase `.btn-primary` (accent solid). Botones secundarios: `.btn-outline`.
Text links: `.btn-text`.

### Toasts

```js
useAppStore.getState().showToast('mensaje', 'success' | 'error' | 'info');
```

Auto-dismiss a los 3.2s.

### Spanish UI

Toda interacción visible es en **español argentino**:
- "Cargá", "Ingresá" (vos), no "Carga", "Ingresa"
- "Acá", no "Aquí"
- "Querés", "Tenés"
- Errores deben ser amigables, no técnicos

---

## Tests

```bash
npm test            # 148 tests, ~12s
npm run test:watch  # vitest watch mode
```

Config en `vite.config.js`:

```js
test: {
  environment: 'jsdom',   // necesario para importaproStore (toca localStorage)
  globals: true,
}
```

### Estructura de cada archivo

#### `palletBuilder.test.js` (46 tests)

- Motor `pb_runPacking`: 13 tests (vacío, 1 caja, UIDs, no overflow, no overlap, no flotantes, tipos de pallet, mix sizes, etc.)
- Gravedad: 1 test (cajas altas sin flotantes)
- `pb_validatePlacement` / `pb_validateSingleBoxMove`: 5 tests
- `pb_getSupportedStack`: 3 tests
- `pb_findAllValidPlacements` + `pb_diversePlacements`: 4 tests
- Constantes: 3 tests
- Orientaciones: 2 tests
- Edge cases: 5 tests
- Helpers PDF (`posDescription`, `orientationDescription`): 9 tests
- Performance: 2 tests (50 cajas <10s, 60 cajas mixtas <15s)

#### `palletAdvanced.test.js` (40 tests)

- Escenarios reales (importación): 4 tests
- Estabilidad: 3 tests
- Densidad: 3 tests
- Overhang: 2 tests
- Altura: 3 tests
- **Invariantes** en 5 escenarios × 5 invariantes = 25 tests:
  - todas las cajas tienen dims positivas
  - posiciones finitas
  - sin flotantes
  - sin solapamiento
  - dentro de pallet+overhang

#### `containerLoader.test.js` (30 tests)

Necesita stub de window globals en `beforeAll`:

```js
beforeAll(() => {
  global.window = global.window || {};
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  global.localStorage = global.localStorage || { /* stub */ };
});
```

- Config (setContainerDimensions, getPackingPhysicalConstraints): 3 tests
- Escenarios básicos 40ft: 8 tests
- Pallets + cajas mezcladas: 3 tests
- Container 20ft: 2 tests
- validatePhysicalSupport: 4 tests
- Cache: 2 tests
- Edge cases: 3 tests
- Result shape: 3 tests

#### `utilities.test.js` (32 tests)

- `fmt`: 3 tests
- `ars`: 4 tests
- `rd`: 4 tests
- `shortenUrl`: 4 tests
- `simulateChannelPrices`: 5 tests
- `calcCostos`: 12 tests (cada paso de la fórmula)

### Cómo agregar tests nuevos

1. Archivo `.test.js` en `src/__tests__/`
2. Import desde `../stores/...` o `../lib/...` o `../components/...`
3. Si el módulo importado toca `localStorage`, `window`, Supabase — el env
   jsdom ya cubre window/localStorage. Para Supabase mejor no mockear, evitar
   importar módulos que toquen `_sb` al cargar.

---

## Memoria de bugs arreglados (no reintroducir)

| Bug | Causa | Fix |
|---|---|---|
| Imágenes negras en PDF | Three limpia el drawingBuffer post-render | `preserveDrawingBuffer: true` en WebGLRenderer + doble RAF + 400ms wait antes de `toDataURL` |
| Overlap de 1cm con dims no-grid (caja 25cm en grid 2cm) | `pb_collectAnchors` usaba `Math.round` en right-edges | Nueva fn `pb_ceilToGrid` aplicada a right-edges |
| Crash al cargar pallet guardado (ErrorBoundary) | Payload con boxes inválidas o dims numéricas faltantes | Sanitización defensiva en `applyJobPayload` del PalletBuilder |
| Drag posible en `SharePalletPage` | Faltaba prop `readOnly` propagado a handlers | `readOnly` en `PalletThreeCanvas` con early-return en `handleMouseDown/DragOver/Drop` |
| Slider de altura no actualizaba pallets ya armados | `setMaxHeight` sólo seteaba el store, no los `results` | Propagar a `results.map(r => ({...r, maxHeight: next}))` |
| Botones de fuente inconsistentes | Había mezcla de Cormorant/Jost/DM Mono | Unificación a Inter en CSS + sed global en JSX |
| Sección "Logística" desperdiciaba espacio | 4 CalcSection stacked | Grid 2×2 con textos cortos |
| Panel "MERCADO LIBRE / TIENDA PROPIA / INSTAGRAM" en Calculator | Resultaba en pérdidas visibles con datos por defecto | Eliminado; donut grande tomó su lugar |

---

## Cosas para mejorar (tech debt y oportunidades)

### Alta prioridad

1. **Integrar pagos reales** (Mercado Pago / Stripe). Hoy `UpgradeModal` linkea
   afuera y los planes se asignan a mano en Supabase. Falta:
   - Endpoint `/api/checkout` que cree preferencia MP
   - Webhook que actualice `subscriptions` table
   - Manejo de cancelaciones y renovaciones

2. **Code splitting**. El bundle `index-*.js` pesa **>1MB** sin gzip (300KB con).
   Vite warning sale en cada build. Considerar:
   - `manualChunks` separando Three.js, jsPDF, html2canvas
   - Lazy load de `<ContainerLoader/>`, `<PalletBuilder/>` con `React.lazy` y `Suspense`

3. **`palletStore.js` monolítico (4100 LOC)**. Es JS puro sin tipos y mezcla:
   - Motor de packing (funciones `pb_*`)
   - Zustand store (UI state)
   - Validadores
   - Helpers de orientación / soporte

   Idealmente splitar en:
   - `lib/palletEngine.js` — todo lo `pb_*`
   - `stores/palletStore.js` — solo el Zustand store (la mitad del tamaño)

4. **No hay tests de componentes React**. Solo testeamos funciones puras del
   motor. Falta:
   - Render tests con React Testing Library
   - Tests de integración de Calculator (con valores → snapshot del cálculo)
   - Tests del SharePalletPage (mock Supabase)

### Media prioridad

5. **Service worker básico**. `public/sw.js` no cachea nada inteligentemente.
   Si querés PWA real, agregar caché de `index.html`, JS chunks, imágenes.

6. **TypeScript progresivo**. El motor (`palletStore.js`, `packing.js`)
   se beneficiaría mucho de tipos en las estructuras `box`, `result`, `unit`,
   `placement`. Migrar de a poco con `// @ts-check` y JSDoc primero.

7. **Catálogo compartido inconsistente**. `Catalog.jsx` lo usan tanto
   ImportaPro como los loaders, pero el sync entre stores es manual
   (`containerStore.addToCatalog`). Centralizar en un solo store/source of truth.

8. **NCM search con IA** usa API key del usuario en `localStorage`. Es OK
   para MVP pero:
   - No hay rate limiting
   - No hay validación de la key antes de guardarla
   - El error si la key es inválida sale crudo al usuario

9. **i18n inexistente**. Todo hardcoded en español. Si en algún momento se
   quiere expandir a otros mercados (Chile, México) hay que extraer strings.

10. **El motor del pallet es lento con muchas cajas (>100)**. Los presupuestos
    `PB_CORE_BUDGET_*_MS` son razonables pero no hay UI de "thinking..." real.
    Considerar Web Worker para no bloquear el main thread.

### Baja prioridad / mejoras UX

11. **Botón "Duplicar pallet"** en PalletBuilder — útil cuando un cliente
    pide N pallets idénticos.

12. **Plantillas de productos comunes** — pre-cargar dims/peso de productos
    típicos (alfombras, lámparas, sets de mate) para no tener que cargar todo.

13. **Histórico de pallets** — lista de pallets guardados con búsqueda y
    filtros (hoy hay carga pero no listing UI).

14. **Multi-language en el PDF de guía** — útil si el armado lo hace un
    operario no hispano-hablante (hay china operarios en algunos depósitos).

15. **Comparar con costos históricos** en la calculadora — guardar
    `tcUpdatedAt` y mostrar diff con el último guardado.

16. **`window._instanceManualPos` y `window._instanceLockedOri`** son una
    abominación de diseño. Deberían vivir en el store de Zustand. Existe así
    para no romper el motor que es puro (sin imports de store), pero podría
    pasarse como argumento al `runPacking`.

17. **No hay analytics**. Si querés saber qué features se usan, falta
    PostHog / Plausible / Umami.

18. **Error reporting**. ErrorBoundary muestra el error al usuario pero no
    lo manda a ningún lado. Falta Sentry o similar para errores en producción.

---

## Workflow de cambios

1. **Trabajar en `main` directamente** (proyecto de un dev). No worktrees ni branches.
2. **Antes de commitear**: `npm run build` para verificar
3. **Si tocás motor o lib pura**: `npm test` antes de pushear
4. **Commits** con mensaje conciso (≤72 chars en primera línea), body explicativo
5. **Push** → Vercel auto-deploy (~1-3 min)
6. **No hacer force-push a main**, no hacer hard reset a commits ya pusheados

### Estilo de commits

```
Breve descripción del cambio en 72 chars

Body opcional explicando el por qué del cambio. Mencionar:
- Qué fórmula / función cambió
- Si rompe compatibilidad

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Cosas para NO hacer

- ❌ Agregar TypeScript "todo de una". Si lo migrás, hacerlo archivo por archivo con `// @ts-check`.
- ❌ Volver a meter Cormorant / DM Mono / Jost / DM Serif / Playfair. Inter para todo.
- ❌ Mockear Supabase en tests. Mejor stubear `localStorage` y `window` solamente.
- ❌ Tocar `pb_runPacking` sin correr `npm test`. Los invariantes están bien cubiertos pero rompen fácil.
- ❌ Mover lógica de `calcCostos` sin actualizar el test correspondiente en `utilities.test.js`.
- ❌ Commitear archivos temporales (`.tmp`, `debug-*.test.js`). Agregar a `.gitignore` si aparecen.
- ❌ Usar el `Agent` tool para tareas simples. Leer/editar archivos directamente cuando se sabe qué tocar.
- ❌ Reintroducir `'Cormorant Garamond, serif'`, `'DM Mono, monospace'`, etc. en `fontFamily` inline.
- ❌ Cambiar el formato del payload de pallet (`payload.results`, `payload.products`) sin actualizar `applyJobPayload` y `SharePalletPage`.
- ❌ Tocar `preserveDrawingBuffer: true` en `PalletThreeCanvas` — sin eso, las imágenes del PDF salen negras.
- ❌ Quitar los stubs de `window._instanceManualPos` / `window._instanceLockedOri` del `beforeAll` de `containerLoader.test.js` — el motor crashea sin ellos.

---

## Datos del proyecto

- **Owner**: Ignacio Dallape (ignaciodallape@gmail.com)
- **Mercado**: Argentina (importación 1688 → AR)
- **Idioma de UI**: español argentino (vos, "cargá", "querés")
- **Branch principal**: `main` (sin develop / staging)
- **Hosting**: Vercel
- **Database**: Supabase
  - Tabla `subscriptions` (planes)
  - Tabla `pallets` (con `is_public` para share)
  - Tabla `shipments` (containers compartidos)
- **API keys**: la pública de Supabase está hardcodeada en `src/lib/supabase.js`
  (es la `sb_publishable_*`, segura para exponer); la ANTHROPIC_API_KEY se
  guarda en `localStorage` del cliente.

---

## Cómo arrancar en una cuenta nueva de Claude

1. Clonar el repo:
   ```bash
   git clone https://github.com/IgnacioDallape/ContenedorApp.git
   cd ContenedorApp
   npm install
   ```
2. Abrí Claude Code apuntando al directorio raíz del repo.
3. Claude leerá automáticamente este `CLAUDE.md` al arrancar.
4. Verificá que todo corre:
   ```bash
   npm test    # debe dar 148 passed
   npm run build  # debe terminar sin errores
   npm run dev    # abre en localhost:5173
   ```
5. Si vas a deployar, configurá Vercel para apuntar al repo (auto-deploy desde `main`).
6. Variables de entorno en Vercel (sólo necesario para el cron de `/api/ping`):
   - `SUPABASE_ANON_KEY` — la clave pública anon de Supabase

No hay `.env.local` ni `.env.example` — todas las claves públicas que usa
el frontend están hardcodeadas en `src/lib/supabase.js`.
