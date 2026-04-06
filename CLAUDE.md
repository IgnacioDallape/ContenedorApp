# ImportaPro + Container Loader — Contexto del proyecto

## Descripción
App web vanilla JS (sin framework, sin build tool) para:
- **ImportaPro**: calculadora de costos de importación China → Argentina, gestión de productos, NCM/aranceles, simulador de precios.
- **Container Loader**: cargador 3D de contenedores 20'/40'/40'HC con algoritmo BFD (Best-Fit Decreasing) y visualización Three.js.
- **Pallet Builder**: armador de pallets con motor BFD propio, visualización 3D, opción de productos base obligatoria, y exportación al Container Loader.

## Estructura de archivos
```
contenedorapp/
├── index.html              # Solo shell HTML (login, appshell, templates IP, CL y PB)
├── css/styles.css          # Todo el CSS (~1100 líneas)
├── js/
│   ├── auth.js             # Supabase auth (login, logout, forgot, reset)
│   ├── packing.js          # Algoritmo BFD con heightmap (NO MODIFICAR SIN ANÁLISIS)
│   ├── container-loader.js # Estado CL, UI del form, renderLoader, zonas de prioridad, multi-contenedor, embarques Supabase
│   ├── pallet-builder.js   # Armador de pallets: motor BFD propio, 3D Three.js, exportar al CL
│   ├── importapro-calc.js  # Calculadora IP, canales, calc(), utilidades (v, ars, rd, toast)
│   ├── importapro-products.js # Productos IP (guardar, cargar, eliminar, renderProducts)
│   ├── importapro-ncm.js   # Base NCM local + búsqueda IA (Claude Haiku)
│   ├── importapro-sim.js   # Simulador de precios y exportCSV
│   ├── three-scene.js      # Three.js CDN loader, OrbitControls, initThreeScene
│   ├── three-render.js     # drawContainer, rotaciones, inspector 3D
│   ├── catalog.js          # Catálogo CL, modal, showToast, fmt
│   └── app.js              # Routing (switchSection), DOMContentLoaded setup
└── CLAUDE.md               # Este archivo
```

## Orden de carga de scripts (importante)
`auth.js` → `packing.js` → `container-loader.js` → `importapro-calc.js` → `importapro-products.js` → `importapro-ncm.js` → `importapro-sim.js` → `three-scene.js` → `three-render.js` → `catalog.js` → `pallet-builder.js` → `app.js`

## Globals clave compartidas entre archivos
- `CONT_L`, `CONT_W`, `CONT_H`, `CONTAINER_VOL` — declarados en `container-loader.js`, modificados por `setContainerType()`
- `loadedProducts` — array central del CL, en `container-loader.js`
- `catalog` — array del catálogo CL, en `container-loader.js`
- `_three` — objeto Three.js, declarado en `three-scene.js`, referenciado en todo el código 3D
- `window._priorityZones`, `window._instanceManualPos`, `window._instanceLockedOri` — estado 3D interactivo
- `savedProducts`, `canales` — datos de ImportaPro, en `importapro-calc.js`
- `currentUser`, `_sb` — auth Supabase, en `auth.js`
- `pb_*` — todos los globals del Pallet Builder viven en `pallet-builder.js` (prefijo pb_)

## Reglas para Claude al trabajar en este proyecto

### NO hacer
- **No re-leer archivos que ya leíste en la misma sesión** — usar el contexto ya cargado.
- **No modificar el algoritmo de packing en `packing.js`** sin análisis previo — es un BFD con heightmap de precisión 5cm, priority zones, interlocking pallet patterns y posicionamiento manual. Está bien diseñado.
- **No agregar frameworks o build tools** — todo es vanilla JS con `<script src>`, sin webpack/vite/etc.
- **No separar más los archivos** — la estructura actual es la definitiva (pallet-builder.js fue la excepción acordada).
- **No agregar comentarios ni docstrings** en código que no se modifica.

### SÍ hacer
- Verificar que cambios en globals de un archivo no rompan otros archivos.
- Al agregar funciones nuevas, respetar el archivo correcto según la tabla de estructura.
- Testear siempre en el browser después de cambios en el algoritmo 3D.
- El Pallet Builder tiene su propio motor BFD (`pb_runPacking`) — NO usar `runPacking` de packing.js para pallets.

## Stack técnico
- Vanilla HTML/CSS/JS (sin framework)
- Three.js r128 (CDN)
- Supabase JS v2 (CDN) — auth + embarques
- Claude Haiku API — búsqueda NCM por IA
- localStorage — persistencia de datos

## Supabase
- URL: `https://yxfpkxvrzypueusyueuh.supabase.co`
- Clave pública en `auth.js`
- Tabla `shipments`: id, user_id, name, containers (jsonb), created_at
- RLS activo: select, insert, update, delete — solo own rows.