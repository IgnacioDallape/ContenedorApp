# 02 — ImportaPro (verificado)

Calculadora de costos de importación + simulador + comparador + NCM.

## `calcCostos(inp)` — spec exacta

Función pura exportada en [Calculator.jsx:9-38](../src/components/ImportaPro/Calculator.jsx),
reusada por [Comparator.jsx](../src/components/ImportaPro/Comparator.jsx). Todo por unidad,
USD hasta el último paso.

### Parsing (con fallbacks reales)

```
fob          = parseFloat(inp.fob)         || 0      // USD/u, ya sincronizado
qty          = parseInt(inp.qty)           || 1
fleteMode    = inp.fleteMode               || 'manual'
manualFlete  = parseFloat(inp.flete)       || 0      // USD total del lote
seguroPct    = parseFloat(inp.seguroPct)   || 0
despachante  = parseFloat(inp.despachante) || parseFloat(inp.aduana) || 0  // compat legacy
fleteInterno = parseFloat(inp.fleteInterno)|| 0      // USD total
traderPct    = parseFloat(inp.traderPct)   || 0
di           = parseFloat(inp.di)          || 0
ivaImp       = parseFloat(inp.ivaImp)      || 21     // ← FALLBACK A 21
te           = parseFloat(inp.te)          || 0
tc           = parseFloat(inp.globalTC)    || 1359   // ← FALLBACK A 1359
```

### Cadena de costo

```
fleteUnit = (fleteMode==='fob36') ? fob*0.36 : manualFlete/qty
cif       = fob + fleteUnit + fob*(seguroPct/100)        // seguro SÍ entra al CIF; trader NO
─────────────────────────────────────────────────────────
costoUSD  = cif
          + cif*(di/100)                          // D.I.
          + (cif + cif*(di/100))*(ivaImp/100)     // IVA sobre CIF+DI
          + cif*(te/100)                          // tasa estadística sobre CIF (NO CIF+DI)
          + despachante/qty + fleteInterno/qty    // sumas fijas prorrateadas
          + fob*(traderPct/100)                   // trader sobre FOB
─────────────────────────────────────────────────────────
costoARS  = costoUSD * tc
```

### Quirks (importante)

- **IVA forzado ≥21%**: `parseFloat(inp.ivaImp) || 21`. Pasar `0`/`''`/`null` da 21%.
  La UI sólo ofrece 10.5 o 21 ([Calculator.jsx:553](../src/components/ImportaPro/Calculator.jsx)),
  y 10.5 funciona (es truthy). Intencional — IVA importación en AR no puede ser 0.
- **TC fallback `1359`**: magic number bakeado. Aparece en 3 lugares (Calculator, Comparator, DEFAULT_INPUTS).
- **`fleteMode==='fob36'`**: flete = 36% del FOB/u, ignora `inp.flete` (input pasa a read-only).
- **Trader fuera del CIF**: se suma a `costoUSD` pero no infla DI/IVA/TE (es fee de servicio, no valor aduanero).
- **TE base ≠ IVA base**: TE usa `cif`, IVA usa `cif+diUnit`. Correcto según práctica AR, pero ojo.

### `currencyMode` / `syncFob` (NO dentro de calcCostos)

`calcCostos` sólo lee `fob` ya sincronizado. La conversión la hace el componente
([Calculator.jsx:59-68](../src/components/ImportaPro/Calculator.jsx)) en cada edición:

```
cny: fob = +(fobCny * cny).toFixed(3)     // ⚠️ default cny 0.138 acá
ars: fob = +(fobArs / arsTC).toFixed(3)
usd: fob editable directo
```

⚠️ **Constante CNY triplicada**: `syncFob` usa `0.138`, pero `DEFAULT_INPUTS.cny` es
`0.1466` y el display del equivalente CNY también `0.1466`. Inconsistencia.

- **`tipoUnidad`** (`box`/`pallet`): sólo cambia labels y obliga dims de pallet. **No afecta `calcCostos`.**

## `importaproStore` — estado y persistencia

[importaproStore.js](../src/stores/importaproStore.js)

| key | persistencia |
|---|---|
| `savedProducts` | localStorage `importapro-products` |
| `publicationPlans` | localStorage `importapro-publication-plans` |
| `publicationOrderDraft` | localStorage `importapro-publication-order-draft` |
| `publicationOrderName` | localStorage `importapro-publication-order-name` |
| `apiKey` | localStorage `importapro-apikey` ⚠️ **dead — nadie lo lee** |
| `canales` | en memoria (NO persiste) |
| `inputs` | en memoria (NO persiste — se pierde al refrescar) |
| `tcUpdatedAt` | en memoria, vuelve a `null` cada reload → banner "TC desactualizado" siempre aparece |

`DEFAULT_INPUTS` ([importaproStore.js:9-38](../src/stores/importaproStore.js)): ejemplo
"Alfombra cocina", `fobCny:27.5, fob:3.80, qty:100, cny:0.1466, di:20, ivaImp:21, te:3, globalTC:1359, traderPct:6`.

`DEFAULT_CANALES`: Mercado Libre 13%, Tienda propia 3%, Instagram/WA 0%.

⚠️ **Bug: re-guardar producto huérfana planes.** `saveProduct` dedup por `nombre`
pero asigna `id = Date.now()` nuevo. `publicationPlans`/`orderDraft` referencian el id
viejo → se rompen en silencio al editar+guardar.

⚠️ **Fotos como base64 en localStorage** → riesgo de superar la cuota ~5MB sin manejo de error.

## NcmSearch — **SIN IA** (el doc viejo miente)

[NcmSearch.jsx](../src/components/ImportaPro/NcmSearch.jsx): filtro de substring puro
sobre `NCM_FRECUENTES` (de `lib/constants.js`). No hay `@anthropic-ai/sdk`, no hay
API key, no hay red, no hay modelo. Verificado por grep: `anthropic` no aparece en `src/`.

- `applyDi(di)` escribe `di` en el store y navega a `calc`.
- El `apiKey` guardado es **dead code** (no hay UI para setearlo en Settings, nadie lo lee).
- Clases `*-ai-*` ("ncm-result-card-ai") son leftover de una versión vieja con IA.

## Simulator + `pricing.js`

`simulateChannelPrices(costo, margenT, iva, iibb, iigg, channels)` ([pricing.js:8-23](../src/lib/pricing.js)):

```
iiggF  = min(iigg/100, 0.9999)
denom  = max(1 - comision/100 - iibb/100, 0.0001)
base   = costo * (1 + margenT/100/(1 - iiggF)) / denom
precio = round(base * (1 + iva/100))                       // venta IVA incluido
ganB   = precio - costo - precio*comF - precio*iibbF - precio/ivaF*(iva/100)
ganPost= ganB * (1 - iigg/100)
mgReal = round(ganPost/costo*100)
```

Margen objetivo se grossea por IIGG (`/(1-iiggF)`) para que el margen post-impuesto
quede cerca del target. Canales default: ML 13%, Tienda propia 3%, IG/WA 0%, Otro mkt 8%.
⚠️ Clampea en silencio si comisión+IIBB ≥ 100% (precios absurdos sin warning).

[Simulator.jsx](../src/components/ImportaPro/Simulator.jsx): estado `costo, margen(30),
iva(21), iibb(3), iigg(35)`. Confirma plan → `publicationPlans` (keyed por `productId`) → ruta `prices`.

## `exportPDF.js` — PDF de la calculadora

`exportCotizacionPDF({c, canales, inputs})` ([exportPDF.js:437-602](../src/lib/exportPDF.js)):
header beige + título + tabla de desglose (USD/u, ARS/u, % — filtra filas con val 0) +
box total del lote + tabla de canales (si hay precio>0) + footer. Todo pasa por `ascii()`
(jsPDF helvetica no tiene acentos/ñ). El módulo también exporta `exportShipmentPDF` y
`exportPurchaseOrderPDF`.

## `formatters.js`

```js
fmt = n => n.toLocaleString('es-AR', {min/maxFractionDigits:2})  // ⚠️ tira si n es null
ars = n => '$' + Math.round(n).toLocaleString('es-AR')           // '$1.234' sin espacio
rd  = (n,d) => +n.toFixed(d)
shortenUrl = url => hostname sin www, o slice(0,30)+'...'        // no usado por ImportaPro
```
