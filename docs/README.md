# docs/ — Referencia verificada de ContenedorApp

Esta carpeta es **documentación auditada contra el código real** (no contra el
`CLAUDE.md` viejo, que tiene afirmaciones desactualizadas — ver
[`07-audit-findings.md`](07-audit-findings.md)).

Cada archivo cita `archivo:línea` para que puedas saltar al código. Cuando el
código y el `CLAUDE.md` se contradicen, **gana el código** y acá queda anotado.

## Índice

| Doc | Cubre |
|-----|-------|
| [`00-overview.md`](00-overview.md) | Stack real, comandos, mapa de archivos con LOC, qué es cada cosa |
| [`01-auth-billing.md`](01-auth-billing.md) | Auth Supabase + **pagos Lemon Squeezy** (sí existen) + lock de planes |
| [`02-importapro.md`](02-importapro.md) | `calcCostos` spec exacta, stores, Simulator, NcmSearch (**sin IA**) |
| [`03-container-loader.md`](03-container-loader.md) | Motor `packing.js` (BFD), `containerStore`, vista 3D, share |
| [`04-pallet-builder.md`](04-pallet-builder.md) | Motor `palletStore` (`pb_*`), persistencia, PDF, 3D, share |
| [`05-shell-infra.md`](05-shell-infra.md) | Boot, routing, AppShell, tema/CSS, SW, Vercel cron, build |
| [`06-data-model.md`](06-data-model.md) | Tablas Supabase, stores Zustand, claves localStorage, globals `window` |
| [`07-audit-findings.md`](07-audit-findings.md) | ⚠️ Discrepancias con docs viejos + bugs + tech debt priorizado |
| [`08-engineering.md`](08-engineering.md) | Tooling, calidad, CI, code-splitting, convenciones |
| [`09-i18n.md`](09-i18n.md) | Internacionalización (es/en/pt), cómo migrar y agregar idiomas |

## Cómo usar esto

1. Para una vista rápida del proyecto → `00-overview.md`.
2. Para tocar un subsistema → su doc dedicado (01–05).
3. Para saber dónde vive un dato (tabla / store / localStorage) → `06-data-model.md`.
4. **Antes de creer cualquier cosa del `CLAUDE.md` raíz** → chequeá `07-audit-findings.md`.

## Reglas que NO cambian (confirmadas en código)

- `preserveDrawingBuffer: true` en ambos canvas Three.js — sin eso los PDF salen negros.
- Toda la UI en **español argentino** (vos, "cargá", "querés", "acá").
- Fuente **Inter** para todo (hay 1 violación viva: `Cormorant Garamond` en `styles.css:795`).
- No tocar `pb_runPacking` ni `runPacking` sin correr `npm test` (148 tests).
- Globals `window._instanceManualPos` / `window._instanceLockedOri` deben stubearse en tests del container.
