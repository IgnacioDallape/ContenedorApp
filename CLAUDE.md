# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repo.

## Visión general

App React de un único deploy que combina **tres herramientas** para importación + logística desde China a Argentina. Hay un sidebar único que navega entre las tres secciones, sin iframes.

1. **ImportaPro** (`/`) — Calculadora de costos de importación (FOB → CIF → DI → IVA → costo unitario en ARS), comparador de productos, simulador de precios por canal de venta, búsqueda NCM, ajustes.
2. **Container Loader** — Carga de contenedores 20ft / 40ft / 40HC / Semi 14.5m / 15.5m con motor BFD 3D, vista Three.js, soporte para pallets + cajas mezclados, zonas de prioridad, locks de orientación e instancias.
3. **Pallet Builder** — Armado de pallets individuales (Euro 120×80 o EUA 120×100) con motor de packing propio, modo auto/manual, share link público, export PDF con guía de armado paso a paso.

Deploy: **Vercel** auto desde `main` → `https://fleetloader.vercel.app/` (también `https://contenedor-app.vercel.app`).

Repo: `https://github.com/IgnacioDallape/ContenedorApp.git`

## Stack

- **React 18** + **Vite 6** (sin SSR, sin framework)
- **Zustand 5** para todo el state global (5 stores)
- **Three.js 0.175** + OrbitControls para vistas 3D (Container y Pallet)
- **Supabase JS 2.49** para auth + storage de productos compartidos
- **jsPDF 4** + jspdf-autotable + qrcode para exports PDF
- **@anthropic-ai/sdk** para una feature de IA (búsqueda NCM)
- **Vitest 4** + jsdom para tests (148 tests al día de hoy)
- **No TypeScript**, todo JS/JSX

## Estructura del repo

```
ContenedorApp/
├── index.html                  Único entry HTML, importa Google Fonts (Inter)
├── package.json                npm run dev / build / preview / test
├── vite.config.js              Vite + vitest config (env: jsdom)
├── vercel.json                 Rewrites para /share/:id y /share/pallet/:id, cron keepalive
├── css/styles.css              CSS global, vars de tema, todas las reglas no-inline
├── src/
│   ├── main.jsx                Entry: monta <App/>, registra service worker
│   ├── App.jsx                 Layout principal: sidebar + main, route dispatch por section
│   ├── components/
│   │   ├── ImportaPro/         Calculator, Comparator, Prices, Products, NcmSearch,
│   │   │                       Simulator, Settings
│   │   ├── ContainerLoader/    ContainerLoader.jsx (main + sidebar), ThreeCanvas.jsx (3D),
│   │   │                       ThreeErrorBoundary.jsx
│   │   ├── PalletBuilder/      PalletBuilder.jsx (main + sidebar), PalletThreeCanvas.jsx (3D)
│   │   ├── Catalog/            Catálogo compartido entre ImportaPro y los loaders
│   │   ├── Share/              SharePalletPage.jsx (vista pública read-only)
│   │   ├── Auth/               Login + sign up
│   │   ├── Billing/            Pricing / planes
│   │   ├── Brand/              Logo y elementos visuales
│   │   ├── Layout/             ErrorBoundary.jsx (global de cada sección)
│   │   ├── PWAInstallPrompt.jsx
│   │   └── Toast.jsx           Toast global
│   ├── stores/                 Zustand
│   │   ├── appStore.js         Active section, toasts, navegación
│   │   ├── authStore.js        Usuario logueado, sesión Supabase
│   │   ├── containerStore.js   Catálogo de productos, locks, zones, packed results
│   │   ├── importaproStore.js  Inputs de la calculadora, productos guardados, canales
│   │   └── palletStore.js      ⭐ Motor de packing del Pallet Builder (~4100 líneas)
│   ├── lib/
│   │   ├── packing.js          Motor del Container Loader (BFD + heightmap)
│   │   ├── palletPacking.js    Motor "viejo" del pallet (fallback dentro de pb_runPacking)
│   │   ├── constants.js        CONTAINER_TYPES, PALLET_SIZES, PB_PALLET_TYPES, NCM_FRECUENTES
│   │   ├── formatters.js       fmt, ars, rd, shortenUrl
│   │   ├── pricing.js          simulateChannelPrices, SIMULATOR_CHANNELS
│   │   ├── exportPDF.js        PDF de cotización ImportaPro
│   │   ├── exportPalletPDF.js  ⭐ PDF del Pallet Builder con guía de armado
│   │   ├── supabase.js         Cliente _sb
│   │   └── appUrl.js           Helpers de URL
│   └── __tests__/              Vitest — 148 tests
│       ├── palletBuilder.test.js     46 tests (motor pallet básico)
│       ├── palletAdvanced.test.js    40 tests (escenarios reales, invariantes)
│       ├── containerLoader.test.js   30 tests (motor contenedor)
│       └── utilities.test.js         32 tests (formatters, pricing, calcCostos)
└── public/                     SW, manifest, íconos
```

## Convención de fuentes (importante)

La app usa **una sola fuente para todo**: `'Inter', system-ui, -apple-system, sans-serif`.

- Definida en `css/styles.css` como `--font`, `--font-head`, `--font-ui`, `--font-mono` (todas el mismo valor)
- Cualquier `fontFamily` inline en JSX debe usar `'Inter', system-ui, -apple-system, sans-serif` o `'var(--font)'`
- NO usar Cormorant Garamond, DM Mono, Jost, DM Serif Display, Playfair (fueron quitadas en una pasada global)

## Auth y multi-tenancy

Auth vía Supabase. El usuario logueado se persiste en `authStore`. La mayoría de stores leen el `user.id` para namespacing de localStorage.

## Sección 1 — ImportaPro (calculadora)

### Calculadora — flujo de cálculo (`calcCostos` en `Calculator.jsx`)

Cadena de costos por unidad (todo USD salvo el final):

```
FOB                                                 ← precio compra (1688)
+ Flete unitario  = manual ? flete/qty : FOB×36%
+ Seguro          = FOB × seguroPct/100
─────────────────────────────────────────────
= CIF
+ D.I.            = CIF × di/100             (0/6/12/18/20/25/35%)
+ IVA imp.        = (CIF + DI) × ivaImp/100  (10.5 o 21%)
+ Tasa estadís.   = CIF × te/100             (0 o 3%)
+ Despachante/u   = despachante / qty
+ Flete interno/u = fleteInterno / qty
+ Trader/u        = FOB × traderPct/100
─────────────────────────────────────────────
= costoUSD
× TC                                                = costoARS
```

**Quirk:** `parseFloat(inp.ivaImp) || 21` fuerza 21% si se pasa 0/vacío — intencional, en Argentina IVA importación no puede ser 0%.

### Layout del resultado (refactored)

Dos columnas (no tres):
1. **Izquierda**: desglose grande del costo + barra de composición + grupos por categoría
2. **Derecha**: donut interactivo grande (280×280) + tabla "Desglose U$S" con % y monto por categoría

El donut tiene prop `large` que duplica radio (R=92), stroke (32), y centro escalado. Hover sobre los slices destaca y muestra detalles. Click sobre slice scrollea a la sección del form.

**No** se muestran cards de canales (Mercado Libre / Tienda Propia / Instagram) en esta vista — se quitaron junto con los controles Reinversión/Retiro. La simulación de canales vive en una pantalla aparte (`Simulator.jsx`).

### Sección "Logística e importación" (compacta)

Grid 2×2:
- Fila 1: [Flete internacional] | [Despacho y flete interno]
- Fila 2: [Comisión trader China] | [Aranceles Argentina]

Cada celda es un `CalcSection` con borde lateral colorido. Texto de ayuda en 1 línea.

## Sección 2 — Container Loader

`src/lib/packing.js` — motor BFD con heightmap (`Float32Array` flat grid).

### Funciones públicas

```js
setContainerDimensions(L, W, H, vol)
getPackingPhysicalConstraints()
setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT, ALLOW_OVERHANG, ... })
runPacking(products)        // → { packed: [...], placed: { id: count } }
runPackingCached(products)  // mismo, con cache
invalidatePackingCache()
validatePhysicalSupport(item, position, placedItems)
  // → { valid, status: 'stable'|'partial'|'auxiliary', supportPercent, ... }
hmGetMax(hm, px, pz, dX, dZ)
hmSetPallet(hm, px, pz, dX, dZ, baseY, totalDY, packedItems, palletBase)
```

### Manual overrides

El motor lee `window._instanceManualPos` (pinea instancias en posición específica) y `window._instanceLockedOri` (lock de orientación por instancia). En tests hay que stub estos en `beforeAll`.

### BFD sort

1. Pallets antes que cajas
2. Zonas de prioridad antes (con `priorityZoneSlot` ordenando por slot)
3. Mayor volumen primero dentro de cada grupo

### Vista 3D

`ThreeCanvas.jsx` — Three.js con OrbitControls. Cajas son `BoxGeometry` con color por producto.

## Sección 3 — Pallet Builder ⭐

### Motor: `src/stores/palletStore.js`

~4100 líneas. Implementa BFD multi-variante con:

- **5 variantes** ejecutadas en `pb_runPacking`: `layer`, `auto`, `grid`, `low-height`, `layers`, `size-grouped`
- Cada candidato pasa por `normalize`: `pb_compactPackedLayout` → `pb_gravitySettle` → `pb_dropFloaters`
- `pb_isBetterLayout` elige el mejor
- Post-procesado: `pb_compactLaterally` → `pb_centerPackedLayout` → `pb_alignLoneApex`

### Funciones públicas

```js
pb_runPacking(products, palL, palW, maxH)  // → array de boxes empacadas
pb_validatePlacement(boxes, movingBox, palL, palW, maxH, nextX, nextZ, nextDims?, opts)
pb_validateSingleBoxMove(boxes, rootUid, palL, palW, maxH, nextX, nextZ, opts)
pb_validateGroupPlacement(boxes, rootUid, palL, palW, maxH, nextX, nextZ, opts)
pb_getSupportedStack(boxes, rootUid)
pb_findAllValidPlacements(unit, packed, hm, palL, palW, maxH, variant, deadline)
pb_diversePlacements(candidates, maxN)
```

Las `validate*` aceptan `opts.strict` (97% soporte, modo manual) o `opts.lenient` (60%, motor auto).

### Constantes

- `PB_GRID_RES = 2` cm — resolución del heightmap
- `PB_PALLET_BASE_H = 14` cm — alto del pallet de madera
- `PB_EDGE_OVERHANG = 5` cm — tolerancia de overhang en bordes (real en logística)
- `PB_MIN_SUPPORT_PERCENT = 0.97` para el motor (lenient queda en 0.6 vía opts)

### Helpers internos importantes

- `pb_roundToGrid(value)` — round al múltiplo de 2 más cercano
- `pb_ceilToGrid(value)` — ceil al múltiplo de 2 (usado en `pb_collectAnchors` para right-edges, evita overlaps de 1cm con dims no-grid)
- `pb_supportForRect(rect, supportRects)` — % de soporte de una caja sobre las de abajo
- `pb_compactLaterally` — desliza cajas hacia el centro de su capa para cerrar canales

### Modo manual

`buildMode: 'auto' | 'manual'` en el store. Modo manual:
- `startManualEmpty()` / `startManualPrebuilt()` — modo de arranque
- `cyclePlacement(uid, direction)` — el usuario tiene un cursor de hasta 16 placements diversos (`pb_diversePlacements`) y cicla entre ellos
- `suggestRelocate(uid)` — motor sugiere nueva posición para una caja
- Botón "+Acá" por producto para placement asistido

### Vista 3D

`PalletThreeCanvas.jsx` — Three.js, OrbitControls, drag de cajas con validación. Prop `readOnly` desactiva interacción (usado en `SharePalletPage`). `WebGLRenderer({ preserveDrawingBuffer: true })` necesario para que `toDataURL()` funcione (evita imágenes negras en PDF).

### Share link

`/share/pallet/:id` (rewrite en `vercel.json`) → `SharePalletPage.jsx`:
- Lee `pallets` table en Supabase con `is_public=true`
- Auto-guarda + setea `is_public=true` al tocar "🔗 Compartir"
- Vista solo lectura: stats, status bar, tabs por pallet, 3D canvas en readOnly, tabla por producto

### Export PDF

`src/lib/exportPalletPDF.js`. Genera:
1. **Portada**: nombre + stats + snapshot del pallet activo + QR del share link
2. **Resumen**: tabla de productos con dims, cantidad, peso, precio, subtotal
3. **Una página por pallet**: foto + breakdown
4. **Guía de armado**: pasos numerados agrupados por capa, posición en lenguaje humano ("la esquina trasera izquierda"), orientación natural ("paradas"/"acostadas"), sin medidas en el texto. Diagrama de orientación al final. Tips generales.

Snapshot del canvas requiere doble RAF + 400ms wait antes de `toDataURL()` (por `preserveDrawingBuffer`).

## Layout

### App shell (`App.jsx`)

- Sidebar fijo a la izquierda (240px) con secciones agrupadas
- Main area con `<ErrorBoundary resetKey={section}/>` envolviendo el contenido
- Route detection por path: `/share/:id` → SharePage, `/share/pallet/:id` → SharePalletPage, resto → app normal
- Cada sección renderea su propio componente principal

### ErrorBoundary

`components/Layout/ErrorBoundary.jsx`. Cuando React crashea en cualquier sección:
- Muestra fallback amigable en español con botón Reintentar / Recargar
- `<details open>` muestra el stack trace (primeras 6 líneas)
- Se resetea automáticamente cuando cambia `resetKey` (cambio de sección)

## Tests

```bash
npm test           # vitest run — 148 tests, ~12s
npm run test:watch # modo watch
```

Config: `vite.config.js` → `test.environment = 'jsdom'` (necesario porque `importaproStore.js` toca `localStorage` al cargar).

Archivos:
- `palletBuilder.test.js` (46) — motor pallet básico, helpers PDF, performance
- `palletAdvanced.test.js` (40) — escenarios reales, invariantes (no flotantes, no solapamiento, dentro del pallet)
- `containerLoader.test.js` (30) — motor contenedor 20ft/40ft, validatePhysicalSupport
- `utilities.test.js` (32) — formatters, pricing, calcCostos

Para tests del Container Loader hay que stubear `window._instanceManualPos`, `window._instanceLockedOri` y `localStorage` en `beforeAll`.

## Build y deploy

```bash
npm run dev      # vite dev server en :5173
npm run build    # genera dist/, ~5s
npm run preview  # serve dist/
```

Push a `main` → Vercel auto-deploya. Hay un cron de Vercel a `/api/ping` cada 5 días para keepalive.

## Convenciones de UI

- **Tema**: cream/beige (`--bg: #f5f4f1`, `--accent: #1a4f8a` azul logística)
- **Inputs numéricos**: siempre con `unit` label en `<span class="unit">`
- **Botones primarios**: clase `.btn-primary` (accent solid)
- **Spanish UI**: todo el texto user-facing en español argentino ("Cargá", "Ingresá")
- **Toasts**: `useAppStore().showToast(msg, 'error'|'success'|'info')`

## Workflow de cambios

1. Trabajar en `main` directamente (proyecto solo de un dev)
2. Build local: `npm run build` para verificar
3. Tests: `npm test` antes de pushear cambios al motor
4. Commits: estilo conciso, primera línea ≤72 chars, body explicativo si toca lógica
5. Push → Vercel auto-deploy (~1-3 min)

## Memoria de problemas conocidos / arreglos recientes

- **Imágenes PDF negras**: arreglado con `preserveDrawingBuffer: true` en WebGLRenderer + doble RAF + 400ms wait antes de `toDataURL`
- **Solapamiento 1cm con dims no-grid** (ej. caja 25cm en grid 2cm): arreglado con `pb_ceilToGrid` aplicado a right-edges en `pb_collectAnchors`
- **Crash al cargar pallet guardado**: arreglado con sanitización defensiva en `applyJobPayload` del PalletBuilder
- **Drag posible en share view**: arreglado con prop `readOnly` propagado a handlers de drag/drop en `PalletThreeCanvas`
- **Slider de altura no propagaba**: arreglado haciendo que `setMaxHeight` también actualice los `results` existentes

## Cosas para NO hacer

- No agregar dependencias TypeScript — el repo es JS puro
- No volver a meter Cormorant / DM Mono / Jost — todo es Inter ahora
- No mockear Supabase en tests, mejor stubear `localStorage` y `window` solamente
- No tocar `pb_runPacking` sin correr `npm test` — los invariantes están bien cubiertos pero pueden romperse fácil
- No mover lógica de cálculo de `calcCostos` sin actualizar también el test
- No commitear archivos temporales (.tmp, debug-*.test.js) — agregar a `.gitignore` si aparecen
- No usar el `Agent` tool para tareas simples — leer/editar archivos directamente cuando se sabe qué tocar

## Datos del proyecto

- **Owner**: Ignacio Dallape (ignaciodallape@gmail.com)
- **Plataforma destino**: Argentina (importación 1688 → AR)
- **Idioma**: español argentino en toda la UI
- **Branch principal**: `main`
- **Hosting**: Vercel
- **Database**: Supabase (auth + tabla `pallets` con `is_public` para share links)
