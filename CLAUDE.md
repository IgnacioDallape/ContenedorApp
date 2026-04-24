# ContenedorApp v2 - Estado actual del proyecto

## Resumen corto
App web en React + Vite + Zustand con tres bloques principales:
- ImportaPro: calculadora de importacion, productos, NCM, simulador y precios confirmados.
- Container Loader: carga 3D de contenedores y semis con Three.js + motor de packing por heightmap.
- Pallet Builder: armado de pallets y exportacion al Container Loader.

Este archivo refleja el estado real del repo al 2026-04-20. No asumir que sigue la version vieja ni el CLAUDE anterior.

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
    Auth/
      LoginPage.jsx
    Billing/
      PlanHub.jsx
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
  - El formulario diferencia entre datos por unidad individual y por unidad logistica.
  - `Equivalente USD` y `Cantidad` siguen siendo por unidad individual.
  - Peso y dimensiones cambian segun `Caja` o `Pallet`.
  - Tiene modo de flete internacional:
    - `Carga manual`
    - `Contenedor completo (36% FOB)`
  - En modo `Contenedor completo (36% FOB)`:
    - `fleteUnit = fob * 0.36`
    - `flete total = fleteUnit * qty`
    - el input de flete total queda read-only y pasa a ser estimado.
  - El resumen y el donut central ya contemplan este cambio de naming cuando corresponde.
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
  - Ahora es una pagina centrada y mas limpia.
  - Agrupa `Tipo de cambio` y `Mi plan`.
  - Mantiene el acceso para volver a la calculadora.
  - Se elimino el bloque visible de API Key Anthropic.

### Auth + onboarding + planes
- `src/components/Auth/LoginPage.jsx`
  - Login y registro por email/password.
  - Login con Google via Supabase OAuth.
  - El boton de Google ya no requiere doble click.
  - Se usa iconografia propia del producto (barco) y no texto roto/emoji mal codificado.
- `src/components/Layout/AppShell.jsx`
  - El usuario autenticado entra a una pantalla `home` de bienvenida.
  - La home muestra saludo, nombre del usuario, barco y plan actual.
  - `Configuracion` ya no vive como item principal en la sidebar.
  - Se accede desde el bloque del usuario con icono de settings.
  - Desde el panel del usuario hay accesos rapidos a:
    - `Tipo de cambio`
    - `Mi plan`
- `src/components/Billing/PlanHub.jsx`
  - Vive embebido dentro de `Settings.jsx`.
  - Muestra plan actual y opciones de upgrade.
- `src/components/Layout/UpgradeModal.jsx`
  - El checkout de Lemon Squeezy sale identificado con:
    - `checkout[custom][user_id]`
    - `checkout[custom][target_plan]`
    - email / nombre prefill cuando existen
- Regla de gating actual:
  - usuario `none`:
    - modulos de importacion -> requieren `Basic`
    - `Cargar contenedor` -> requiere `Pro`
    - `Armador de pallets` -> requiere `Pro Max`
  - usuario `basic`:
    - puede usar ImportaPro
  - usuario `pro`:
    - destraba contenedor 3D
  - usuario `promax`:
    - destraba todo, incluido pallets

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

### Cotizacion de importacion (Calculator)
- Sale desde `Calculator.jsx` con boton "Exportar PDF".
- Usa `exportCotizacionPDF()` en `src/lib/exportPDF.js`.
- Incluye: desglose de costos por unidad (USD/ARS/%), costo total del lote, tabla de canales con ganancia coloreada.
- Filtra filas con valor cero para no mostrar componentes no configurados.

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
- El `heavy mode` ya NO fusiona cajas por color en una sola geometria.
- Aunque haya muchas unidades, cada caja debe seguir viendose y seleccionandose individualmente.
- Los pallets quedan anclados una vez colocados.
- Si cualquier unidad se mueve manualmente y el drop es invalido, debe volver a su posicion anterior.
- Ninguna unidad movida manualmente debe reubicarse sola para "acomodarse".

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
- `fleteMode` existe en `inputs` y default es `manual`
- todavia puede haber rastros de `apiKey`/`setApiKey` en store por compatibilidad vieja, pero la UI actual no los usa

### `authStore.js`
Responsabilidades:
- usuario autenticado de Supabase
- sesion
- plan del usuario (`none`, `basic`, `pro`, `promax`)
- cierre de sesion y estado de carga inicial

### `appStore.js`
Detalle importante:
- `activeSection` default ahora es `home`
- la home inicial no debe quedar en blanco para usuarios con plan

---

## Supabase

Sigue habiendo auth real y tabla de `shipments`.

Ademas:
- Auth con email/password sigue activa.
- Auth con Google funciona via provider de Supabase.
- La callback OAuth correcta depende del project ref real de Supabase; no escribirla a mano si se vuelve a tocar la configuracion.
- El login con Google requiere Google Cloud + test users mientras la app OAuth este en modo prueba.

## Lemon Squeezy / billing

- La landing de marketing puede llevar directo al checkout.
- Dentro de la app, el upgrade debe salir identificado con el usuario logueado.
- Pagar en Lemon Squeezy NO crea usuarios en Supabase Auth por si solo.
- La activacion del plan depende del webhook y de que ese webhook escriba correctamente en la tabla de suscripciones/plan.
- El payout de Lemon no es instantaneo; no esperar acreditacion bancaria inmediata al ver una orden `Paid`.
- El webhook real vive en `supabase/functions/lemon-webhook/index.ts`.
- El deploy real se hace con:
  - `npx supabase@latest functions deploy lemon-webhook --no-verify-jwt`
- `supabase/config.toml` ya contempla este flujo.
- Secret obligatorio:
  - `LEMON_WEBHOOK_SECRET`
- La funcion primero intenta vincular por `meta.custom_data.user_id`.
- Si no viene `custom_data.user_id`, hace fallback por `user_email`.
- El fallback por email funciona, pero lo ideal sigue siendo abrir el checkout desde la app logueada.
- El webhook ya fue validado end-to-end con una suscripcion real y hace `upsert` en `public.subscriptions`.
- `authStore.js` ya trata `active`, `on_trial` y `trialing` como planes activos.

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
- Si se toca `Settings.jsx`, mantenerlo simple, centrado y sin headers colgados.
- Si se toca `Calculator.jsx`, revisar que no se rompan:
  - el naming por unidad vs caja/pallet
  - el modo de flete manual
  - el modo `Contenedor completo (36% FOB)`
  - el resumen visual y el donut central

---

## Pendientes y zonas sensibles

Pendientes reales:
- El highlight/seleccion del 3D mejoro mucho, pero hubo reportes de casos intermitentes. Si reaparece, capturar caso exacto.
- Falta testeo profundo de mobile en algunas pantallas del Container Loader y Pallet Builder.
- El repo tiene algunos textos con encoding viejo en partes historicas; si se reescriben componentes conviene normalizar a ASCII limpio o UTF-8 consistente.
- El webhook de Lemon/Supabase sigue siendo una zona sensible y debe verificarse end-to-end cuando se toquen pagos.
- Hay un bug pendiente de identidad duplicada:
  - un mismo usuario puede terminar con dos auth users si mezcla email/password y Google.
  - en ese caso, la suscripcion puede quedar asociada a un `user_id` y la sesion usar otro.
  - si reaparece, revisar primero `auth.users`, despues `public.subscriptions` y despues el metodo de login usado.
- Hay un pendiente de cantidades al mandar productos desde `Prices/Simulator` al Container Loader:
  - si un producto aparece con menos unidades de las esperadas, revisar si `orderQty` representa unidades comerciales o unidades logisticas reales.
  - el bug visual de "bloque unico" ya no deberia ser de render; ahora la sospecha principal seria semantica de cantidad.

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
- Exportacion PDF de cotizacion desde Calculator (boton "Exportar PDF").
- Comparator mobile fix: slots colapsan a 1 columna, tabla resumen con scroll horizontal.
- Login/registro renovado con Google OAuth.
- Pantalla de bienvenida `home` para usuarios logueados.
- Configuracion movida al bloque del usuario en vez de sidebar principal.
- `Mi plan` integrado dentro de `Settings`.
- Ajustes de copy en calculadora para distinguir unidad individual vs caja/pallet.
- Nuevo modo de flete `Contenedor completo (36% FOB)`.
- Webhook de Lemon funcionando con upsert real en `public.subscriptions`.
- `authStore` reconoce `on_trial` / `trialing` como plan activo.
- Fix de `heavy mode` del Container Loader para no fusionar cajas en un solo bloque visual.
- Pallets anclados y estabilizacion de drops/manual placement en el 3D.

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
