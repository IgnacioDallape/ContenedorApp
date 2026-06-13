# 05 — App Shell, Tema e Infra (verificado)

## Boot y routing

[main.jsx](../src/main.jsx): registra `/sw.js` en `window.load`, monta `<App/>`, importa
`css/styles.css`.

[App.jsx](../src/App.jsx): **routing por `window.location.pathname` con regex** (sin router):
- `/^\/share\/([a-f0-9-]{36})$/i` → `<SharePage/>` (shipment).
- `/^\/share\/pallet\/([a-f0-9-]{36})$/i` → `<SharePalletPage/>` (pallet).
- En rutas share **no llama `init()`** (sin auth). Si no, `init()` y branchea recovery/forgot.
- Si no es share: `loading` → spinner; `!user` → `<LoginPage/>`; `user` → `<AppShell/>` + `<PWAInstallPrompt/>`.
- `<Toast/>` se renderiza en las 3 ramas (funciona también en páginas públicas).

`vercel.json` rewrites `/share/:id` y `/share/pallet/:id` → `/index.html` para que la SPA lea el path.

## AppShell — dispatch de secciones

[AppShell.jsx:448-463](../src/components/Layout/AppShell.jsx) — cadena
`activeSection === X && <Component/>` (no es lookup table). `ContainerLoader` y
`PalletBuilder` son **`React.lazy`** en un `<Suspense>`; el resto eager. Todo dentro de un
`<ErrorBoundary resetKey={activeSection}>`.

| `activeSection` | Componente | Lazy | Plan |
|---|---|---|---|
| `home` | `WelcomePanel` (local) | no | none+ |
| `calc` | Calculator | no | basic+ |
| `products` | Products | no | basic+ |
| `comparator` | Comparator | no | basic+ |
| `ncm` | NcmSearch | no | basic+ |
| `simulator` | Simulator | no | basic+ |
| `prices` | Prices | no | basic+ |
| `settings` | Settings | no | siempre |
| `container` | ContainerLoader | **sí** | pro/promax |
| `palletbuilder` | PalletBuilder | **sí** | promax |

**Lock sólo en `navigate()`** (`:185-207`), no en render. Regla duplicada 3× (navigate +
`navItem` `:223` + `mobileNavButton` `:242`). Ver `01-auth-billing.md`.

Sidebar desktop fijo 240px, grupos "Importacion"/"Pallet"/"Contenedor". Móvil: topbar +
drawer + bottom-nav de 5 atajos. ⚠️ **El sidebar desktop no tiene botón "Inicio"** aunque
`home` es el default (sólo reachable en el drawer móvil).

## appStore + Toast

[appStore.js](../src/stores/appStore.js): `{activeSection:'home', toasts:[], setActiveSection,
showToast(msg,type=''), removeToast}`. `showToast` auto-remueve a los **3200ms**, sin cap.

[Toast.jsx](../src/components/Toast.jsx): fixed bottom-center, z 9999. Color por type:
`error`→`var(--danger)`, `success`→`var(--green)`, else oscuro. ⚠️ El doc viejo dice que
acepta `'info'` pero **no hay caso `'info'`** (cae al neutro).

## Catálogo

⚠️ [Catalog/Catalog.jsx](../src/components/Catalog/Catalog.jsx) (~480 LOC) es **huérfano —
nunca se importa**. El catálogo realmente compartido es el slice `catalog` de
`containerStore` (ver `03-container-loader.md`). PalletBuilder reimplementa su propio picker
en vez de reusar `Catalog.jsx`.

## Tema (CSS)

[styles.css:5-48](../css/styles.css) `:root`:

```
--bg:#f5f4f1  --bg-2:#fff  --bg-3:#f0eff0  --bg-4:#e8e7e4
--text:#1a1a1a  --text-2:#5c5c5c  --text-3:#9a9a9a
--accent:#1a4f8a  --accent-dim:rgba(26,79,138,0.07)  --accent-light:#2563b0
--red:#c0392b  --green:#1a7a4a  --amber:#b35a00
--sidebar-w:240px  --radius:6px  --radius-lg:10px
/* paleta legacy del container loader: */
--c1..--c5, --surface, --surface2, --muted, --accent2, --danger:#b85c5c, --success:#6b8c6b
```

Fuentes: **`--font` / `--font-head` / `--font-ui` / `--font-mono` = todas Inter**.
[index.html:23](../index.html) carga sólo Inter de Google Fonts.

⚠️ **Violación viva**: [styles.css:795](../css/styles.css) `.cap-title { font-family:'Cormorant
Garamond',serif; }` sobrevivió a la unificación a Inter. Contradice la regla del proyecto y
la tabla "bug arreglado" del doc viejo.

⚠️ **CSS con bloques duplicados** verbatim (`.sidebar`/`.brand`/`.nav-*`/`.main`/`.tab` en
`:56-72` y otra vez `:96-112`) en un archivo de 3480 líneas. Peso muerto.

## Infra

- **Build** ([vite.config.js](../vite.config.js)): plugin-react, `base:'/'`, `outDir:'dist'`. Vitest `environment:'jsdom'`, `globals:true`. **Sin `manualChunks`** → esperá el warning "chunks > 500 kB" (Three + jspdf + supabase). El lazy-load de los loaders mitiga parcialmente.
- **Cron keepalive** ([api/ping.js](../api/ping.js)): cron `0 12 */5 * *` → GET a `shipments?limit=1` con `SUPABASE_ANON_KEY` (env var en Vercel). ⚠️ Sin try/catch, sin guard de env, reporta `ok:true` aun en 401.
- **Service worker** ([sw.js](../public/sw.js)): cache `importapro-shell-v2`. Navegaciones network-first→cache `/index.html`; resto stale-while-revalidate. ⚠️ **No precachea los `/assets/*` hasheados** → offline best-effort.
- **Manifest** ([manifest.webmanifest](../public/manifest.webmanifest)): "ImportaPro", standalone, `theme_color:#8D7966` (no matchea `--bg #f5f4f1`).

## Items del repo no obvios

- **`arquitectura.html`** (335 LOC, tracked): doc dev hecho a mano, **no entra al build**, drifteará.
- **`.vscode/settings.json`** tracked (`.gitignore` no lo excluye).
- `dist/` y `assets/` (root) **no tracked**. `tmp_*.mjs` gitignoreado.
- `supabase/` parcialmente tracked: `config.toml`, `functions/lemon-webhook/`, `migrations/20260517_pallets.sql`.
