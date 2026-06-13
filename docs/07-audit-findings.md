# 07 — Hallazgos de auditoría (verificado contra código)

Auditoría completa del 2026-06-13. **Cuando el código y `CLAUDE.md` se contradicen,
gana el código.** Esta es la lista priorizada de discrepancias, bugs y tech debt.

---

## A. Discrepancias `CLAUDE.md` ↔ código (el doc viejo está desactualizado)

| # | El doc viejo dice | Realidad | Ref |
|---|---|---|---|
| A1 | "No hay integración de pagos" | **Hay Lemon Squeezy completo**: checkout cliente + webhook que provisiona la suscripción | `UpgradeModal.jsx`, `lemon-webhook/index.ts` |
| A2 | "NcmSearch usa @anthropic-ai/sdk con IA y API key" | **Sin IA.** Filtro de texto estático sobre `NCM_FRECUENTES`. `anthropic` no aparece en `src/` | `NcmSearch.jsx` |
| A3 | "`importapro-apikey` = API key de Anthropic" | Se guarda pero **nadie la lee** y no hay UI para setearla. Dead code | `importaproStore.js` |
| A4 | "`saveJob/loadJob/togglePublic/currentJobId/isPublic` en palletStore" | Viven en `PalletBuilder.jsx` (estado local). El store no tiene Supabase | `PalletBuilder.jsx:482+` |
| A5 | "pb_runPacking corre 5/6 variantes (layer/auto/grid/low-height/layers/size-grouped)" | Corre Layer + container-like + fallback viejo. Varios `pb_runPacking*` parecen **dead code** | `palletStore.js:3343` |
| A6 | "MIN_SUPPORT_PERCENT ~0.75, ALLOW_OVERHANG default true" (container) | `0.8` y `false` | `packing.js:8-13` |
| A7 | "Fuentes unificadas a Inter (bug arreglado)" | **`Cormorant Garamond` vive** en `styles.css:795` | `styles.css:795` |
| A8 | "Toast acepta 'success'\|'error'\|'info'" | No hay caso `'info'` (cae al neutro) | `Toast.jsx:14` |
| A9 | "@anthropic-ai/sdk 2.49" (implícito) | Es `^0.82.0` y además **no se usa** | `package.json` |
| A10 | `Catalog.jsx` como catálogo compartido | **Huérfano, nunca importado** (~480 LOC muertas). El catálogo real es el slice de containerStore | — |

---

## B. Bugs / correctness (orden por impacto)

1. **RLS de `subscriptions` sin verificar.** Si el cliente puede escribir esa tabla, un
   usuario se auto-asigna `promax`. El lock del cliente es cosmético; la autorización real
   es 100% RLS. **Control crítico no auditable desde el repo** → revisar dashboard Supabase.
2. **Re-guardar producto huérfana planes/órdenes.** `saveProduct` dedup por `nombre` pero
   asigna `id = Date.now()` nuevo; `publicationPlans`/`orderDraft` referencian el id viejo →
   se rompen en silencio al editar+guardar. `Calculator.jsx:87`, `importaproStore.js:73`.
3. **`setMaxHeight` no re-valida** (pallet): bajar la altura sólo reescribe `result.maxHeight`,
   no dropea cajas que ahora exceden el límite → un pallet puede mostrar cajas sobre el tope.
4. **Webhook sin idempotencia/orden.** Upsert manual sin `onConflict` (carrera) + un
   `subscription_updated` tardío puede reactivar un plan cancelado. `lemon-webhook:182,205`.
5. **Firma HMAC no constant-time** (`expected === signature`) → side-channel. `lemon-webhook:84`.
6. **`fmt` crashea con input nullish** (sin guard). `formatters.js:1`.
7. **Fotos base64 en localStorage** sin try/catch → puede superar cuota ~5MB en silencio.
8. **`window._palletsWithNoSpace`** se escribe pero ningún UI lo lee → "pallet no entró" se
   pierde en el path auto del container.
9. **2 tests vacíos** en `containerLoader.test.js`: key `minSupportPercent` (camelCase, sin
   efecto) y filtro `p.id` (los items usan `productId`) → pasan por la razón equivocada.
10. **Mojibake** en strings: `packing.js:676` ("fÃ­sico"), `ContainerLoader.jsx:1350/1391`
    ("â–¾") — UTF-8 leído como Latin-1.
11. **`api/ping.js`** sin try/catch ni guard de env → puede 500 y reporta `ok:true` en 401.

---

## C. Tech debt (prioridad media)

- **`palletStore.js` monolítico (4152 LOC)** mezcla motor + store + validadores. Splittear en
  `lib/palletEngine.js` (todo `pb_*`) + `stores/palletStore.js` (sólo Zustand). Confirmar y
  borrar el dead code (`pb_runPackingCore/Fast/Greedy/Layered` + helpers).
- **CSS 3480 LOC con bloques duplicados verbatim.** Deduplicar; sacar `Cormorant`.
- **Bundle > 1MB sin `manualChunks`.** Separar Three/jspdf/qrcode; los loaders ya son lazy.
- **Globals `window._instance*`** rompen la pureza del motor del container. Pasarlos como
  argumento a `runPacking` (el motor del pallet ya lo hace bien).
- **Regla de lock triplicada** (navigate + navItem + mobileNavButton) → un solo helper.
- **Catálogo Supabase fire-and-forget** (`saveCatalog`) → riesgo de pérdida silenciosa.
- **Magic numbers**: TC `1359` (3 archivos), CNY `0.138`/`0.1466`, umbrales "es semi".
- **Migraciones faltantes**: `subscriptions`, `shipments`, `user_catalog` no están en
  `supabase/migrations/` (sólo `pallets`). Commitearlas para reproducibilidad.
- **Sidebar desktop sin "Inicio"** aunque `home` es default.
- **Dead code**: `Catalog.jsx`, `importapro-apikey`, `shortenUrl` (no usado), clases `*-ai-*`.

---

## D. Cosas que están BIEN y no hay que romper

- `preserveDrawingBuffer: true` en ambos canvas → sin esto los PDF salen negros.
- `pb_ceilToGrid` en right-edges (`pb_collectAnchors`) → evita overlap de 1cm con dims no-grid.
- `applyJobPayload` sanitiza cajas (uid + dims numéricas) → evita crash al cargar pallet.
- `readOnly` con early-return en `PalletThreeCanvas` → no drag en share.
- `setMaxHeight` propaga a todos los `results` (aunque no re-valida, ver B3).
- Doble-RAF + 400ms antes de `toDataURL` en el snapshot del pallet.
- Drop-validation con rollback en el drag del container (re-corre `runPacking`).
- Anti-XSS: el modal de capacidad arma `bodyParts` estructurado (no `dangerouslySetInnerHTML`).

---

## E. Verificación

```bash
npm test       # debe dar 148 passed
npm run build  # debe terminar sin errores (con warning de chunk size esperado)
```

Antes de tocar `pb_runPacking` o `runPacking` → `npm test` (los invariantes rompen fácil).
Antes de tocar `calcCostos` → actualizar `utilities.test.js`.
