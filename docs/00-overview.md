# 00 — Overview (verificado)

App **React 18 + Vite 6 + Zustand 5 + Three.js 0.175 + Supabase** (sin TypeScript).
Un solo deploy en Vercel desde `main`. Tres herramientas detrás de auth con planes:

1. **ImportaPro** — calculadora de costos de importación China → Argentina (`calcCostos`), NCM, simulador de precios por canal, comparador.
2. **Container Loader** — empaqueta cajas+pallets en 20ft/40ft/40HC/Semi con vista 3D (motor BFD).
3. **Pallet Builder** — arma pallets individuales (Euro/EUA) con motor propio + share link público + PDF con guía de armado.

## Comandos

```bash
npm install
npm run dev         # vite dev en localhost:5173
npm run build       # genera dist/
npm run preview     # serve dist/
npm test            # vitest run — 148 tests
npm run test:watch  # vitest watch
```

Push a `main` → Vercel auto-deploya. Cron en `vercel.json` (`0 12 */5 * *`) pega a
`/api/ping` cada 5 días para que Supabase no se pause.

## Stack real (package.json)

| Dependencia | Versión | Uso |
|---|---|---|
| react / react-dom | ^18.3.1 | UI |
| zustand | ^5.0.3 | 5 stores |
| three | ^0.175.0 | vistas 3D (container + pallet) |
| @supabase/supabase-js | ^2.49.4 | auth + DB + share |
| jspdf + jspdf-autotable | ^4.2.1 / ^5.0.7 | PDFs |
| qrcode | ^1.5.4 | QR del share link en el PDF de pallet |
| **@anthropic-ai/sdk** | ^0.82.0 | ⚠️ **dependencia muerta** — no se importa en `src/` |
| vite / vitest / jsdom | 6 / 4.1.6 / 29 | build + tests |
| playwright / png-to-ico | dev | tooling (íconos), no en runtime |

## Mapa de archivos (LOC reales)

```
src/
├── main.jsx (15)            monta <App/>, registra SW en window.load
├── App.jsx (71)             routing por pathname: /share/:id, /share/pallet/:id, o app
│
├── components/
│   ├── Auth/LoginPage.jsx (480)        login/signup/recovery/reset + Google OAuth
│   ├── Billing/PlanHub.jsx (100)       selección de plan (basic/pro/promax)
│   ├── Brand/BrandMark.jsx (42)        logo SVG
│   ├── Catalog/Catalog.jsx (481)       ⚠️ CÓDIGO MUERTO — nunca se importa
│   ├── ContainerLoader/
│   │   ├── ContainerLoader.jsx (1910)  ⭐ UI principal, multi-shipment, distribuir
│   │   ├── ThreeCanvas.jsx (1068)      3D + drag + captura PDF (2º cache LRU)
│   │   └── ThreeErrorBoundary.jsx (46)
│   ├── ImportaPro/
│   │   ├── Calculator.jsx (882)        ⭐ calcCostos() exportada
│   │   ├── Products.jsx (187)          productos guardados + catálogo
│   │   ├── Comparator.jsx (384)        compara 2 productos
│   │   ├── NcmSearch.jsx (233)         ⚠️ filtro estático, SIN IA
│   │   ├── Simulator.jsx (248)         precios por canal (ML/propia/IG)
│   │   ├── Prices.jsx (401)            precios confirmados + orden de compra
│   │   └── Settings.jsx (96)           TC dólar + PlanHub (NO hay campo API key)
│   ├── Layout/
│   │   ├── AppShell.jsx (699)          ⭐ sidebar + routing + lock de planes
│   │   ├── ErrorBoundary.jsx (69)
│   │   └── UpgradeModal.jsx (65)       ⚠️ abre checkout de Lemon Squeezy
│   ├── PalletBuilder/
│   │   ├── PalletBuilder.jsx (1828)    ⭐ UI + persistencia Supabase + PDF
│   │   └── PalletThreeCanvas.jsx (686) 3D con drag (readOnly / strictMode)
│   ├── Share/
│   │   ├── SharePage.jsx (249)         vista pública shipment (tabla shipments)
│   │   └── SharePalletPage.jsx (214)   vista pública pallet (tabla pallets)
│   ├── PWAInstallPrompt.jsx (153)
│   └── Toast.jsx (33)
│
├── stores/
│   ├── appStore.js (22)         { activeSection, toasts, showToast }
│   ├── authStore.js (72)        { user, userPlan, init, enterApp }
│   ├── containerStore.js (502)  catálogo + multi-shipment + undo/redo (módulo)
│   ├── importaproStore.js (199) inputs calc + savedProducts + canales
│   └── palletStore.js (4152)    ⭐ motor pb_* + Zustand store
│
└── lib/
    ├── packing.js (717)         ⭐ motor BFD container (runPacking, validatePhysicalSupport)
    ├── palletPacking.js (543)   motor "viejo" del pallet (runPalletPacking, fallback)
    ├── constants.js (163)       CONTAINER_TYPES, PALLET_SIZES, COLORS, NCM_FRECUENTES
    ├── formatters.js (7)        fmt, ars, rd, shortenUrl
    ├── pricing.js (23)          simulateChannelPrices
    ├── exportPDF.js (686)       PDF calculadora + shipment + orden de compra
    ├── exportPalletPDF.js (452) ⭐ PDF pallet con guía de armado + QR
    ├── supabase.js (6)          export const _sb (anon key pública)
    └── appUrl.js (31)           parseAuthHash (recovery), getAppUrl

api/ping.js (13)                 serverless del cron Vercel
supabase/
├── config.toml
├── functions/lemon-webhook/index.ts (242)  ⭐ webhook de pagos Lemon Squeezy
└── migrations/20260517_pallets.sql (48)     tabla pallets (NO hay migración de subscriptions)
css/styles.css (3480)            ⚠️ tiene bloques duplicados + 1 Cormorant vivo (:795)
arquitectura.html (335)          doc dev hecho a mano, NO entra al build, drifteará
```

## Lo más importante a recordar

- **Pagos SÍ existen** (Lemon Squeezy, no Stripe/MP). Ver `01-auth-billing.md`.
- **NcmSearch no tiene IA.** Es un filtro de texto sobre `NCM_FRECUENTES`. El
  `apiKey`/`importapro-apikey` está pero nadie lo lee y no hay UI para setearlo.
- **`palletStore` tiene el motor Y el store**, pero `saveJob/loadJob/togglePublic`
  **NO** están en el store — viven en `PalletBuilder.jsx`.
- El sidebar desktop **no tiene botón "Inicio"** aunque `home` es la sección default.

Ver detalle completo en [`07-audit-findings.md`](07-audit-findings.md).
