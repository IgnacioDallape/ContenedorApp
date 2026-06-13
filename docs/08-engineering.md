# 08 — Ingeniería: tooling, calidad y convenciones

Base profesional agregada para que el proyecto sea mantenible y escalable a largo
plazo (sin tocar los motores de packing, que se mejoran en otra fase).

## Tooling

| Herramienta | Archivo | Para qué |
|---|---|---|
| **ESLint 9** (flat config) | `eslint.config.js` | Detecta bugs reales (hooks, undef, redeclare). Estilo/legacy = warnings |
| **Prettier** | `.prettierrc.json` / `.prettierignore` | Formato consistente (opt-in, no se corrió sobre el legacy) |
| **EditorConfig** | `.editorconfig` | LF, UTF-8, 2 espacios |
| **jsconfig** | `jsconfig.json` | IntelliSense + alias `@/*` → `src/*` |
| **GitHub Actions** | `.github/workflows/ci.yml` | lint + test + build en cada push/PR a `main` |

### Postura de ESLint

La base tenía ~23k LOC sin lint. Para no bloquear con ruido legacy, los problemas de
estilo son `warn` y sólo se marcan como `error` los bugs reales (`react-hooks/rules-of-hooks`,
`no-undef`, `no-const-assign`, `no-dupe-keys`). `npm run lint` pasa (exit 0) con warnings.
A medida que se limpie el legacy, subir reglas a `error`. Los motores y la Edge Function
Deno (`supabase/functions/**`) quedan fuera del lint por ahora.

## Code-splitting

`vite.config.js` define `manualChunks` que aísla vendors pesados (`three`, `pdf`,
`supabase`, `qrcode`, `react-vendor`) en chunks cacheables. `ContainerLoader` y
`PalletBuilder` ya son `React.lazy`. Esto baja el chunk principal y mejora el cache
entre deploys.

## Manejo de entorno

`src/lib/supabase.js` y `api/ping.js` leen de variables de entorno con **fallback** a los
valores públicos actuales → el deploy existente sigue andando sin configurar nada, pero
se puede apuntar a otro proyecto Supabase. Ver `.env.example`. Las claves del cliente son
públicas (anon/publishable, protegidas por RLS); los secretos reales sólo en Edge Functions.

## Testing

- Vitest + jsdom. `test.setupFiles` = `src/__tests__/setup.js` (jest-dom + cleanup de RTL).
- Cobertura: motores de packing (invariantes), `calcCostos`, pricing, formatters (+ guards),
  `parseAuthHash`, y un smoke test de componente (`Toast.test.jsx`) que establece el patrón
  con React Testing Library.
- `npm run test:coverage` reporta sobre `src/lib` + `src/stores`.

## Limpieza aplicada (sin tocar motores)

- ❌ Eliminado `src/components/Catalog/Catalog.jsx` (componente huérfano, nunca importado).
- ❌ Removido el estado/método `apiKey` muerto de `importaproStore` (NcmSearch no usa IA).
- ❌ Removida la dependencia `@anthropic-ai/sdk` (no se importaba en ningún lado).
- ✅ `Cormorant Garamond` → Inter en `styles.css` (regla de fuente única).
- ✅ Guards en `formatters.js` (no tira con nullish/NaN).
- ✅ `api/ping.js` endurecido (guard de env, timeout, try/catch).
- ✅ Toast soporta el tipo `'info'`.
- ✅ `package.json`: `private: true`, licencia `UNLICENSED` (producto comercial).

## Lo que queda explícitamente para después

- Mejorar/splitear los motores de packing (`packing.js`, `palletPacking.js`, `pb_*`).
- Migración progresiva a TypeScript (`// @ts-check` archivo por archivo).
- Resolver hallazgos de seguridad/datos de `07-audit-findings.md` (RLS de `subscriptions`,
  idempotencia del webhook, migraciones faltantes).
- Deduplicar `css/styles.css` (bloques repetidos).
