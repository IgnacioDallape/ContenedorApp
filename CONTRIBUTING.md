# Cómo contribuir

## Workflow

1. Trabajá en `main` (proyecto de un dev) o en un branch corto para cambios grandes.
2. **Antes de pushear**, corré la verificación local completa:
   ```bash
   npm run lint
   npm test
   npm run build
   ```
   El CI (GitHub Actions) corre exactamente eso en cada push/PR a `main`.
3. Commits concisos (≤ 72 chars en la primera línea), body explicando el *por qué*.

## Reglas que NO se rompen

- ❌ **No tocar los motores de packing todavía**: `src/lib/packing.js`,
  `src/lib/palletPacking.js` y las funciones `pb_*` de `src/stores/palletStore.js`,
  ni la lógica de `calcCostos`. Están cubiertos por invariantes en los tests y se
  mejorarán en una fase aparte.
- ❌ No agregar TypeScript "todo de una". Si se migra, archivo por archivo con `// @ts-check`.
- ❌ Fuente **Inter** para todo. No reintroducir Cormorant / DM Mono / Jost / Playfair.
- ❌ No tocar `preserveDrawingBuffer: true` en los canvas Three.js (sin eso los PDF salen negros).
- ❌ No cambiar el formato del `payload` de pallet sin actualizar `applyJobPayload` y `SharePalletPage`.

## Estilo

- ESLint + Prettier configurados (`npm run lint:fix`, `npm run format`).
- UI visible en **español argentino** (vos, "cargá", "querés", "acá").
- Errores al usuario: amigables, no técnicos.

## i18n

- Texto nuevo de UI → usar `t('namespace.key')` (`useTranslation`) y agregar la
  clave en los **3** locales (`src/i18n/locales/{es,en,pt}.json`). El test de
  paridad falla si falta una clave o un `{{placeholder}}`. Ver [`docs/09-i18n.md`](docs/09-i18n.md).

## Tests

- Lógica nueva en `src/lib` o `src/stores` → agregar test en `src/__tests__/`.
- Componentes → React Testing Library (ver `Toast.test.jsx` como patrón).
- No mockear Supabase; stubear `localStorage` / `window` cuando haga falta.

## Documentación

La fuente de verdad técnica vive en [`docs/`](docs/). Si cambiás comportamiento
documentado ahí, actualizá el doc correspondiente en el mismo commit.
