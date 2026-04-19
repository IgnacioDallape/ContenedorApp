# ContenedorApp v2 - Estado actual del proyecto

## Resumen corto
App web en React + Vite + Zustand con tres bloques principales:
- ImportaPro: calculadora de importacion, productos, NCM, simulador y precios confirmados.
- Container Loader: carga 3D de contenedores y semis con Three.js + motor de packing por heightmap.
- Pallet Builder: armado de pallets y exportacion al Container Loader.

Este archivo refleja el estado real del repo al 2026-04-19. No asumir que sigue la version vieja ni el CLAUDE anterior.

---

## Stack real
- React 18
- Vite 6
- Zustand 5
- Three.js 0.175
- Supabase JS v2
- jsPDF + jspdf-autotable
- qrcode
- localStorage

## Stack que ya no debe guiar decisiones de UI
- La UI ya no expone dependencias visibles con Anthropic.
- NCM hoy funciona sobre data cargada localmente para el flujo principal visible.

---

## Estructura importante

```text
src/
  App.jsx
  lib/
    constants.js
    packing.js
    exportPDF.js
    formatters.js
    pricing.js
    supabase.js
  stores/
    appStore.js
    authStore.js
    containerStore.js
    importaproStore.js
    palletStore.js
  components/
    Layout/
      AppShell.jsx
      UpgradeModal.jsx
    ImportaPro/
      Calculator.jsx
      Products.jsx
      NcmSearch.jsx
      Simulator.jsx
      Prices.jsx
      Comparator.jsx
      Settings.jsx
    ContainerLoader/
      ContainerLoader.jsx
      ThreeCanvas.jsx
      ThreeErrorBoundary.jsx
    PalletBuilder/
      PalletBuilder.jsx
      PalletThreeCanvas.jsx
    Share/
      SharePage.jsx
```

---

## Estado funcional actual

### ImportaPro
- `Calculator.jsx`
  - La moneda por defecto ahora es USD.
  - Guarda productos con dimensiones, peso, links y fotos.
  - Alimenta catalogo del Container Loader si el producto tiene dims validas.
- `Products.jsx`
  - CRUD sobre productos guardados.
- `NcmSearch.jsx`
  - Rediseñada visualmente.
  - Ya no muestra referencias visibles a IA.
  - Busca sobre los NCM cargados localmente.
  - Tiene advertencia de posible desactualizacion y recomendacion de validar con despachante.
- `Simulator.jsx`
  - Simula precios por canal.
  - Permite confirmar precio final por canal.
- `Prices.jsx`
  - Ya no duplica al simulador.
  - Es la pantalla de precios confirmados/publicables.
  - Tiene carrito/pedido definitivo.
  - Permite nombrar el pedido.
  - Exporta PDF del pedido.
  - Para Pro y Pro Max puede mandar el pedido al Container Loader como cajas o pallets usando dims/peso del producto.
- `Settings.jsx`
  - Solo deja tipo de cambio y preferencias generales.
  - Se elimino el bloque visible de API Key Anthropic.

### Container Loader
- Multi-contenedor activo.
- Motor de packing por heightmap en `src/lib/packing.js`.
- Vista 3D con drag manual de unidades.
- Si el usuario reordena al inicio o toca `Reordenar carga optimizada`, manda el motor.
- Si el usuario mueve una unidad manualmente, el layout actual se conserva y solo se mueve esa unidad.
- Se corrigio que al guardar embarque no desaparezca el contenedor activo.
- La cabecera de metricas fue rediseñada como cards, no barra plana.

### SharePage
- Vista compartida de embarque en solo lectura real.
- Permite ver, orbitar, cambiar de contenedor y abrir 3D.
- No permite editar, mover, borrar ni reordenar desde el link.

### Pallet Builder
- Sigue con su motor propio.
- Puede exportar pallets al Container Loader.
- No mezclar su packing con el del contenedor.

---

## Estados de embarque actuales

Orden actual:
1. `preparacion`
2. `en_transito_puerto`
3. `en_puerto_partida`
4. `embarcado`
5. `en_puerto_destino`
6. `en_transito_destino`
7. `entregado`

Compatibilidad legacy:
- `en_transito` -> `en_transito_puerto`
- `en_puerto` -> `en_puerto_destino`

Reglas activas:
- Solo se puede editar el embarque cuando esta en `preparacion`.
- Si no esta en `preparacion`, el contenedor queda en modo visual/read-only.
- Cuando un embarque esta en `entregado`, aparece accion para finalizarlo.
- Al finalizarlo, sale de activos y pasa a `Embarques finalizados`.

---

## Share + embarques finalizados

Persistencia actual del payload de embarque:
- La info de finalizacion se guarda en el JSON de `containers`.
- Se usan campos tipo:
  - `v`
  - `notes`
  - `items`
  - `isFinalized`
  - `finalizedAt`

No asumir schema extra en Supabase para esto. Hoy el comportamiento vive en el payload serializado.

---

## PDFs y exportaciones

### Pedido definitivo
- Sale desde `Prices.jsx` + `src/lib/exportPDF.js`.
- Ya no muestra la columna `Referencia`.
- Usa el nombre del pedido si el usuario lo definio.

### PDF de embarque
- Limpia links de ML / 1688 de la columna Notas.
- Tambien limpia textos genericos tipo `Pedido definitivo`.
- Si no queda una nota real, la celda debe quedar vacia.

### CSV / QR / share
- Siguen activos para embarques.

---

## Notas importantes del motor 3D

### `src/lib/packing.js`
Es el archivo mas sensible del repo.

Hace:
- packing con grid de 5 cm
- manual positions
- locked orientations
- support stacking con heightmap
- pallets con `hmSetPallet` para respetar huecos reales cuando el pallet trae packedItems

Reglas:
- No permitir sobresalir del contenedor.
- No reintroducir tolerancias fisicas de +5 cm ni similares.
- Pallets no deben stackearse en pisos superiores.
- Las cajas si pueden apoyarse en superficies reales detectadas por heightmap.

### `src/components/ContainerLoader/ThreeCanvas.jsx`
Tema delicado.

Cambios recientes importantes:
- El outline amarillo ya no debe depender solo de datos logicos aislados.
- Se estabilizo para seguir la geometria visible real del objeto seleccionado.
- Durante drag, se recalcula el outline desde los meshes seleccionados.
- Se intento evitar que el borde amarillo quede flotando/corrido despues de mover, reordenar o animar.

Importante:
- Si vuelve a aparecer un caso intermitente de highlight mal ubicado, no asumir que el packing esta mal.
- Primero verificar si el problema es de:
  - mesh temporal/animacion
  - outline recalculado antes de terminar el render
  - instancia seleccionada con varios submeshes

---

## Stores reales

### `containerStore.js`
Responsabilidades:
- `loadedProducts`
- multi-contenedor
- prioridad por zonas
- `instanceManualPos`
- `instanceLockedOri`
- snapshot/layout manual
- seleccion de instancia
- guardado/carga de embarques
- finalizacion de embarques
- catalogo

Cuando se toque:
- cuidar sincronizacion con `packing.js`
- cuidar cambio de contenedor activo
- no romper limpieza de publicaciones/pedidos mandados al contenedor

### `importaproStore.js`
Responsabilidades:
- `inputs`
- `savedProducts`
- `publicationPlans`
- `publicationOrderDraft`
- `publicationOrderName`
- canales

Detalle actual:
- `currencyMode` default es `usd`
- todavia puede haber rastros de `apiKey`/`setApiKey` en store por compatibilidad vieja, pero la UI actual no los usa

---

## Supabase

Sigue habiendo auth real y tabla de `shipments`.

Tambien se verifico en testing:
- login correcto para `nacho.dallape@gmail.com` con `101010`
- `1010` no funciona
- plan del usuario: `promax`

No exponer estas credenciales en UI ni dejarlas en codigo.

---

## Reglas para no romper cosas

### No hacer
- No volver a meter UI visible de Anthropic/API key salvo pedido explicito.
- No tratar `Prices` y `Simulator` como pantallas gemelas otra vez.
- No permitir editar contenedores desde share.
- No permitir editar contenedores fuera de `preparacion`.
- No reintroducir tolerancias de overflow fisico.
- No tocar `packing.js` sin entender impacto en drag, pallets y heightmap.
- No romper la separacion entre embarques activos y finalizados.

### Si hacer
- Si se modifica `ThreeCanvas.jsx`, probar seleccion, drag, reorden y render post-animacion.
- Si se toca `ContainerLoader.jsx`, revisar:
  - save shipment
  - load shipment
  - status changes
  - finalize shipment
  - modal de mis embarques
- Si se toca `Prices.jsx`, revisar:
  - carrito
  - PDF pedido
  - carga al contenedor
- Si se toca `Settings.jsx`, mantenerlo simple.

---

## Pendientes y zonas sensibles

Pendientes reales:
- El highlight/seleccion del 3D mejoro mucho, pero hubo reportes de casos intermitentes. Si reaparece, capturar caso exacto.
- Falta testeo profundo de mobile en algunas pantallas del Container Loader y Pallet Builder.
- El repo tiene algunos textos con encoding viejo en partes historicas; si se reescriben componentes conviene normalizar a ASCII limpio o UTF-8 consistente.

Zonas donde conviene ir con cuidado:
- `ThreeCanvas.jsx`
- `packing.js`
- `containerStore.js`
- `exportPDF.js`

---

## Ultimos cambios relevantes ya integrados

- NCM rediseñado y pasado a busqueda local.
- Advertencia de desactualizacion NCM.
- Simulador y Precios confirmados separados por rol.
- Pedido definitivo con PDF y nombre de pedido.
- Carga de pedido al contenedor para planes Pro/Pro Max.
- Share en solo lectura.
- Nuevos estados de embarque.
- Finalizacion de embarques y seccion de finalizados.
- Fix de guardado de embarques.
- Fix de notas en PDF de contenedor.
- Rediseño del inspector lateral 3D.
- Bloqueo de edicion fuera de preparacion.
- Fixes sucesivos del outline amarillo/seleccion.
- Moneda default en calculadora: USD.
- Configuracion sin bloque de API key Anthropic.

---

## Si Claude retoma desde aca

Orden recomendado para entender contexto:
1. `src/components/ContainerLoader/ContainerLoader.jsx`
2. `src/components/ContainerLoader/ThreeCanvas.jsx`
3. `src/lib/packing.js`
4. `src/stores/containerStore.js`
5. `src/components/ImportaPro/Prices.jsx`
6. `src/components/ImportaPro/Simulator.jsx`
7. `src/stores/importaproStore.js`
8. `src/lib/exportPDF.js`

Si el pedido del usuario es visual:
- mirar primero `ContainerLoader.jsx` o el componente de pantalla puntual

Si el pedido es de logica de packing:
- mirar primero `packing.js` y despues `ThreeCanvas.jsx`

Si el pedido es de importacion/precios:
- mirar `Calculator.jsx`, `Simulator.jsx`, `Prices.jsx`, `importaproStore.js`
