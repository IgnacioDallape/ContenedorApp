# 10 — Endurecimiento de motores + estrategia de testing

Pase de robustez sobre los motores de **contenedor** y **pallet** para que ninguna
combinación de variables de usuario produzca un error. Enfoque test-driven: se
escribió la red de tests (incluido fuzz), se corrió para destapar los bugs reales,
y se arreglaron usando los tests como red. **169 → 202 tests.**

## Suites nuevas

| Archivo | Qué cubre |
|---|---|
| `src/__tests__/engineHelpers.js` | RNG sembrado (reproducible) + invariantes compartidos (finito, sin overlap, sin flotantes, dentro de límites) |
| `containerEngine.test.js` | 5 tipos de contenedor, apilado multinivel, pins manuales, lock de orientación, zonas de prioridad, constraints físicos reales, cache, regresión palletBase=0 |
| `containerFuzz.test.js` | 100 corridas aleatorias (válidas y hostiles) sobre invariantes duros |
| `palletEngine.test.js` | group placement, strict/lenient, dims no-grid, dims corruptas, store en modo manual, setMaxHeight, palletType, color al editar |
| `palletFuzz.test.js` | 100 corridas aleatorias sobre invariantes duros |

## Bugs encontrados por los tests y arreglados

| Bug | Capa | Fix |
|---|---|---|
| Items con dim 0/negativa/NaN se colocaban (cajas degeneradas, ej. `11x22x0`) | motor contenedor + pallet | Guard de saneamiento en `runPacking` y `pb_runPacking`; `pb_getOrientations` coerce strings y filtra NaN en el branch `noRotate` |
| `setMaxHeight` dejaba cajas por encima del nuevo límite | store pallet | Las cajas que exceden pasan a `reserveBoxes` (no se pierden) |
| `palletType` inválido → crash `pt.L` | store pallet | Fallback a `'eua'` en `build`/`startManualEmpty`/`setPalletType` |
| Color se perdía al editar producto (cajas grises) | store pallet | `addOrUpdateProduct` mergea sobre el producto existente |
| Botones del inspector usaban soporte lenient (60%) en modo manual | UI pallet | Pasan `{ strict: buildMode==='manual' }` (consistente con el drag) |
| Dims negativas pasaban la validación del form (`!(-5)` es false) | UI pallet | Chequeo `> 0` + "entra en alguna orientación" |
| `tracking_url` sin validar → href con esquema arbitrario | UI pallet | Exige `http(s)://` |
| Share link con qty enorme podía colgar el motor (sin budget) | store contenedor | `loadShipmentData` clampea qty ≤ 500 |
| 6 tests pasaban por la razón equivocada | tests | Corregidos (ver commit) + helpers del PDF extraídos a `lib/palletGuide.js` |

## Decisiones de diseño

- **Guards defensivos, no cambios de algoritmo**: los fixes de motor descartan
  input inválido en el borde; con input válido el comportamiento es idéntico. No
  se tocó la lógica de empaquetado.
- **Overlap por cuantización de grilla**: el motor de pallet trabaja en grilla de
  2cm (`PB_GRID_RES`). Cajas con dims que no son múltiplo de 2 pueden solaparse
  hasta ~1cm (medio grid) — es la precisión del motor, no un bug de lógica. Los
  invariantes toleran ≤1.1cm y siguen detectando overlaps **reales** (>1.1cm).
  Eliminar ese 1cm residual requeriría trabajo más profundo de geometría (candidato
  para una fase dedicada de mejora de motor).
- **Datos preservados**: ningún fix borra datos en silencio (las cajas afectadas
  van a reserva; los payloads se clampean, no se truncan productos).

## Mejoras de motor aplicadas (2ª fase)

- ✅ **Overlap de cuantización eliminado**: `pb_runPacking` redondea las dims de
  caja hacia arriba al grid (2cm) en la entrada. Con dims grilladas el motor no
  produce overlaps (reserva un pelín más → gaps mínimos en lugar de solapar).
  Costo: una caja se trata como ≤1cm más grande (conservador). Verificado con el
  fuzz a tolerancia estricta 0.5cm.
- ✅ **Backstop anti-cuelgue en el contenedor**: `runPacking` corta en 2500 unidades
  y emite un warning `capacity-cap` (el motor no tiene budget de tiempo; esto evita
  que un payload patológico congele el main thread).

## Cobertura total de la app

Además de los motores, se agregó cobertura de stores y componentes:
`importaproStore` (productos, planes, orden, canales, TC), `containerStore`
(alta, undo/redo, multi-container, clamp de carga), y **smoke tests de render** de
todos los componentes salvo los 3D (que usan WebGL). Total: **234 tests**.
