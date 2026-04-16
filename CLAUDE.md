# ContenedorApp v2 — Contexto del proyecto

## Descripción
App web en **React + Vite + Zustand** para:
- **ImportaPro**: calculadora de costos de importación China → Argentina, gestión de productos, NCM/aranceles (con IA Claude Haiku), simulador de precios.
- **Container Loader**: cargador 3D de contenedores 20'/40'/40'HC/semis con algoritmo BFD heightmap y visualización Three.js.
- **Pallet Builder**: armador de pallets con motor BFD propio (2cm grid), visualización 3D, producto base obligatorio, exportación al Container Loader.

> ⚠️ El CLAUDE.md anterior documentaba la versión vanilla JS (v1). Esta es la v2, completamente reescrita en React. No aplicar reglas de la v1.

---

## Stack técnico
- **React 18** + **Vite 6** (JSX, ESModules, HMR)
- **Zustand 5** — manejo de estado global (sin Redux, sin Context de React)
- **Three.js 0.175** (npm, no CDN)
- **Supabase JS v2** — auth + tabla `shipments` + tabla `user_catalog`
- **@anthropic-ai/sdk** — búsqueda NCM por IA (Claude Haiku)
- **jsPDF + jspdf-autotable** — exportación PDF
- **qrcode** — QR para links de embarques compartidos
- **localStorage** — persistencia de catálogo e ImportaPro

---

## Estructura de archivos

```
src/
├── App.jsx                         # Root: auth check, routing /share/:id, Toast
├── main.jsx                        # ReactDOM.render
├── lib/
│   ├── constants.js                # CONTAINER_TYPES, COLORS, NCM_FRECUENTES, PB_PALLET_TYPES
│   ├── packing.js                  # Motor BFD heightmap (5cm grid) — NO TOCAR sin análisis
│   ├── supabase.js                 # _sb (cliente Supabase), config
│   ├── formatters.js               # ars(), rd(), fmt() y utilitarios de formato
│   └── exportPDF.js                # Generación de PDF con jsPDF
├── stores/
│   ├── authStore.js                # Zustand: user, loading, init(), login, logout
│   ├── appStore.js                 # Zustand: sección activa (switchSection)
│   ├── containerStore.js           # Zustand: todo el estado del Container Loader (ver abajo)
│   ├── importaproStore.js          # Zustand: inputs, savedProducts, canales, cálculos IP
│   └── palletStore.js              # Zustand: motor BFD de pallets + estado 3D PB
└── components/
    ├── Auth/LoginPage.jsx           # Login, registro, forgot, reset
    ├── Layout/
    │   ├── AppShell.jsx             # Nav lateral, sección activa, lazy render
    │   └── UpgradeModal.jsx
    ├── ContainerLoader/
    │   ├── ContainerLoader.jsx      # UI principal del CL (form, lista, tabs multi-contenedor)
    │   ├── ThreeCanvas.jsx          # Canvas Three.js, OrbitControls, renderizado 3D CL
    │   └── ThreeErrorBoundary.jsx
    ├── PalletBuilder/
    │   ├── PalletBuilder.jsx        # UI del PB (form, lista de cajas, exportar al CL)
    │   └── PalletThreeCanvas.jsx    # Canvas Three.js del PB
    ├── ImportaPro/
    │   ├── Calculator.jsx           # Calculadora principal IP
    │   ├── Products.jsx             # CRUD de productos guardados
    │   ├── NcmSearch.jsx            # Búsqueda NCM (manual + IA)
    │   ├── Simulator.jsx            # Simulador de precios y exportCSV
    │   ├── Prices.jsx               # Vista de precios por canal
    │   └── Settings.jsx             # Configuración global IP
    ├── Catalog/                     # Modal de catálogo del CL
    ├── Share/SharePage.jsx          # Vista pública de embarque compartido (sin auth)
    └── Toast.jsx                    # Notificaciones globales
```

---

## Stores de Zustand — resumen de responsabilidades

### `containerStore.js` — el más complejo
- Dimensiones del contenedor activo (`CONT_L`, `CONT_W`, `CONT_H`)
- `loadedProducts` — array central de productos del CL
- `shipmentContainers[]` — multi-contenedor: cada contenedor guarda sus propios products/priorityZones/etc
- `activeContainerIdx` — índice del contenedor activo
- `priorityZones[3]` — zonas de prioridad (frente/medio/fondo)
- `instanceManualPos` / `instanceLockedOri` — posicionamiento manual 3D por instancia
- `catalog` — catálogo de productos (Supabase + localStorage fallback)
- Undo/redo con stacks module-level (`_undoHistory`, `_redoStack`)
- `_syncWindowGlobals()` — expone state crítico en `window.*` para compatibilidad con packing.js

### `importaproStore.js`
- `inputs` — todos los campos del formulario de la calculadora
- `savedProducts[]` — productos guardados (localStorage)
- `canales[]` — canales de venta con comisión/cuotas/precio

### `palletStore.js`
- Motor BFD propio con grid de 2cm (`pb_runPacking`)
- `pb_products[]` — cajas a apilar en el pallet
- Estado 3D del Pallet Builder

### `authStore.js`
- `user` — usuario actual de Supabase
- `init()` — detecta sesión existente + modo recovery (reset password)

### `appStore.js`
- `section` — sección activa: `'container-loader'`, `'importapro'`, `'pallet-builder'`

---

## Algoritmo de packing — reglas críticas

- **`src/lib/packing.js`** — Motor BFD heightmap con resolución 5cm. NO modificar sin análisis previo.
  - Maneja: priority zones, posicionamiento manual, orientación bloqueada, packing de pallets con `hmSetPallet` (considera huecos reales entre cajas).
  - `runPacking(products, options)` devuelve `{ placed, overflow, heightmapDebug }`.
  - `invalidatePackingCache()` debe llamarse siempre que cambie `loadedProducts` o los globals 3D.

- **`palletStore.js` `pb_runPacking`** — Motor BFD separado para pallets, grid 2cm. NO usar `runPacking` de packing.js para pallets.

- El engine usa globals expuestos en `window` (`CONT_L`, `CONT_W`, etc.) vía `_syncWindowGlobals()`. Siempre llamar `_syncWindowGlobals()` después de cambiar dimensiones o estado 3D.

---

## Supabase

- URL: `https://yxfpkxvrzypueusyueuh.supabase.co`
- Clave pública en `src/lib/supabase.js`
- Tabla `shipments`: `id`, `user_id`, `name`, `containers` (jsonb), `created_at`
- Tabla `user_catalog`: `user_id`, `items` (jsonb), `updated_at`
- RLS activo: solo el dueño puede leer/escribir sus filas.
- El catálogo usa localStorage como fallback si Supabase falla.

---

## Reglas para Claude

### NO hacer
- **No volver a vanilla JS** — todo es React/Zustand/Vite.
- **No modificar `src/lib/packing.js`** sin análisis previo — el algoritmo es correcto y estable.
- **No usar el motor de packing del CL para pallets** — PB tiene su propio `pb_runPacking`.
- **No separar más los archivos** — la estructura actual es la definitiva.
- **No agregar comentarios en código que no se modifica**.
- **No agregar frameworks adicionales** (Redux, React Query, etc.) — Zustand es suficiente.
- **No re-leer archivos ya leídos en la misma sesión**.

### SÍ hacer
- Verificar que cambios en un store no rompan los componentes que lo consumen.
- Llamar `invalidatePackingCache()` + `_syncWindowGlobals()` después de toda mutación de `loadedProducts`.
- Respetar el archivo correcto según la tabla de estructura al agregar funciones.
- Al modificar Three.js, testear en el browser — los errores de WebGL son silenciosos en consola.
- El multi-contenedor guarda/restaura estado completo en `switchToContainer()` — tener esto en cuenta al modificar el store.

---

## Datos de negocio importantes
- Dimensiones en **centímetros**, pesos en **kg**, precios en **USD** o **CNY** según modo.
- Tipo de cambio CNY/USD: campo `cny` en ImportaPro (ej: 0.138 USD por CNY).
- DI (Derechos de Importación) varía por NCM: 0%, 12%, 18%, 20%, 35%.
- IVA importación: 21% estándar.
- Tasa Estadística: 3%.
- Límite de peso semi: configurable (default 28.000 kg).
