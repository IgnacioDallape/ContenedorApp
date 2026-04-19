import { useMemo } from 'react';
import useAuthStore from '../../stores/authStore.js';
import useImportaproStore from '../../stores/importaproStore.js';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { exportPurchaseOrderPDF } from '../../lib/exportPDF.js';
import { ars } from '../../lib/formatters.js';

function formatDate(value) {
  if (!value) return 'Sin fecha';
  try {
    return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function getUnitTypeLabel(type) {
  return type === 'pallet' ? 'Pallet' : 'Caja';
}

function hasProductDims(product) {
  return Boolean(product?.dims?.L && product?.dims?.W && product?.dims?.H);
}

export default function Prices() {
  const {
    savedProducts,
    publicationPlans,
    publicationOrderDraft,
    setPublicationOrderQty,
    removePublicationPlan,
    removePublicationOrderItem,
    clearPublicationOrder,
  } = useImportaproStore();
  const { userPlan } = useAuthStore();
  const { addProduct: addToContainer } = useContainerStore();
  const { setActiveSection, showToast } = useAppStore();

  const productMap = useMemo(
    () => new Map(savedProducts.map(product => [product.id, product])),
    [savedProducts]
  );

  const orderQtyMap = useMemo(
    () => new Map(publicationOrderDraft.map(item => [item.productId, item.qty])),
    [publicationOrderDraft]
  );

  const enrichedPlans = useMemo(() => (
    publicationPlans.map(plan => {
      const product = productMap.get(plan.productId) || null;
      const activeChannels = plan.channels.filter(ch => ch.publicar && ch.precio > 0);
      const suggestedTopChannel = activeChannels.reduce((best, current) => (
        !best || current.precio > best.precio ? current : best
      ), null);
      const orderQty = orderQtyMap.get(plan.productId) || 0;
      return {
        ...plan,
        product,
        activeChannels,
        suggestedTopChannel,
        orderQty,
        hasDims: hasProductDims(product),
      };
    })
  ), [publicationPlans, productMap, orderQtyMap]);

  const orderItems = enrichedPlans.filter(plan => plan.orderQty > 0);
  const totalChannels = enrichedPlans.reduce((acc, plan) => acc + plan.activeChannels.length, 0);
  const totalOrderUnits = orderItems.reduce((acc, item) => acc + item.orderQty, 0);
  const totalOrderUsd = orderItems.reduce((acc, item) => acc + ((item.product?.costoUSD || item.product?.fob || 0) * item.orderQty), 0);
  const totalOrderArs = orderItems.reduce((acc, item) => acc + ((item.product?.costoARS || 0) * item.orderQty), 0);
  const canLoadToContainer = ['pro', 'promax'].includes(userPlan);

  function changeOrderQty(productId, nextQty) {
    setPublicationOrderQty(productId, Math.max(0, parseInt(nextQty, 10) || 0));
  }

  function prepareOrderPdf() {
    if (!orderItems.length) {
      showToast('Agregá al menos un producto al pedido', 'error');
      return;
    }

    exportPurchaseOrderPDF({
      items: orderItems.map(item => ({
        ...item.product,
        productName: item.productName,
        orderQty: item.orderQty,
      })),
      orderTitle: `pedido-${new Date().toLocaleDateString('es-AR')}`,
    });

    showToast('PDF de pedido generado', 'success');
  }

  function loadOrderToContainer() {
    if (!canLoadToContainer) {
      showToast('Esta función está disponible para planes Pro y Pro Max', 'error');
      return;
    }
    if (!orderItems.length) {
      showToast('Primero armá el pedido definitivo con cantidades', 'error');
      return;
    }

    let added = 0;
    let skipped = 0;

    orderItems.forEach(item => {
      const product = item.product;
      if (!hasProductDims(product)) {
        skipped += 1;
        return;
      }
      addToContainer({
        name: product.nombre,
        type: product.tipoUnidad || 'box',
        dims: {
          L: product.dims.L,
          W: product.dims.W,
          H: product.dims.H,
        },
        qty: item.orderQty,
        price: product.costoUSD || product.fob || 0,
        weight: product.pesoUnit || 0,
        notes: `Pedido definitivo${product.link1688 ? ` · 1688: ${product.link1688}` : ''}`,
      });
      added += 1;
    });

    if (!added) {
      showToast('Los productos seleccionados no tienen dimensiones válidas para cargar al contenedor', 'error');
      return;
    }

    setActiveSection('container');
    showToast(
      skipped
        ? `Se cargaron ${added} producto(s) al contenedor. ${skipped} quedaron afuera por falta de medidas.`
        : `Se cargaron ${added} producto(s) al contenedor`,
      skipped ? 'warning' : 'success'
    );
  }

  if (!publicationPlans.length) {
    return (
      <div className="ip-section active" id="section-prices">
        <section className="tab" style={{ display: 'block' }}>
          <div className="page-header">
            <h1>Precios confirmados</h1>
            <p className="page-sub">Acá quedan los precios definidos desde el simulador para revisar antes de publicar</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 16, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 48 }}>🏷</div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Todavía no confirmaste precios para publicar</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', maxWidth: 420 }}>
              Primero simulá un producto, elegí qué canales vas a usar y confirmá esos precios desde la sección de simulador.
            </p>
            <button className="btn-primary" onClick={() => setActiveSection('simulator')} style={{ marginTop: 8 }}>
              Ir al simulador
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ip-section active" id="section-prices">
      <section className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Precios confirmados</h1>
          <p className="page-sub">Confirmá cantidades, armá el pedido definitivo y, si tenés Pro o Pro Max, mandalo al contenedor directo desde acá</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div className="card" style={{ padding: '1rem 1.1rem', background: 'linear-gradient(180deg, rgba(26,79,138,0.05), #fff)' }}>
            <div className="card-title">Productos listos</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 34, color: 'var(--accent)', lineHeight: 1, marginTop: 8 }}>{publicationPlans.length}</div>
          </div>
          <div className="card" style={{ padding: '1rem 1.1rem', background: 'linear-gradient(180deg, rgba(26,122,74,0.05), #fff)' }}>
            <div className="card-title">Canales confirmados</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 34, color: 'var(--green)', lineHeight: 1, marginTop: 8 }}>{totalChannels}</div>
          </div>
          <div className="card" style={{ padding: '1rem 1.1rem', background: 'linear-gradient(180deg, rgba(170,116,28,0.08), #fff)' }}>
            <div className="card-title">Pedido armado</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 34, color: 'var(--amber, #b57a19)', lineHeight: 1, marginTop: 8 }}>{totalOrderUnits}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{orderItems.length} producto{orderItems.length === 1 ? '' : 's'} en carrito</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 0.9fr)', gap: 18, alignItems: 'start', marginBottom: 22 }}>
          <div className="card" style={{ padding: '1rem 1.1rem' }}>
            <div className="card-header" style={{ marginBottom: 0 }}>
              <span className="card-title">Carrito de pedido</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Definí cantidades reales para cerrar la orden</span>
            </div>
            {!orderItems.length ? (
              <div style={{ padding: '20px 4px 4px', color: 'var(--text-3)', fontSize: 13 }}>
                Todavía no agregaste productos al pedido. Usá las tarjetas de abajo para definir cantidades.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orderItems.map(item => (
                  <div key={item.productId} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'linear-gradient(180deg, rgba(26,79,138,0.04), #fff)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.productName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                          {item.product?.tipoUnidad === 'pallet' ? 'Pallet' : 'Caja'} · {item.product?.dims?.L || 0}×{item.product?.dims?.W || 0}×{item.product?.dims?.H || 0} cm
                        </div>
                      </div>
                      <button className="btn-outline" onClick={() => removePublicationOrderItem(item.productId)} style={{ padding: '6px 10px', fontSize: 11 }}>
                        Quitar
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', gap: 8, alignItems: 'center', marginTop: 12 }}>
                      <button className="btn-outline" onClick={() => changeOrderQty(item.productId, item.orderQty - 1)} style={{ width: 34, padding: '8px 0' }}>−</button>
                      <input
                        type="number"
                        min="0"
                        value={item.orderQty}
                        onChange={e => changeOrderQty(item.productId, e.target.value)}
                        style={{ width: 76, textAlign: 'center' }}
                      />
                      <button className="btn-outline" onClick={() => changeOrderQty(item.productId, item.orderQty + 1)} style={{ width: 34, padding: '8px 0' }}>+</button>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        Costo unit. {ars(item.product?.costoARS || 0)}{item.product?.costoUSD ? ` · U$S ${Number(item.product.costoUSD).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{ars((item.product?.costoARS || 0) * item.orderQty)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '1rem 1.1rem', background: 'linear-gradient(180deg, rgba(141,121,102,0.05), #fff)' }}>
            <div className="card-header" style={{ marginBottom: 6 }}>
              <span className="card-title">Cierre del pedido</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Productos</span>
                <strong>{orderItems.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Unidades totales</span>
                <strong>{totalOrderUnits}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Costo estimado ARS</span>
                <strong>{ars(totalOrderArs)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Costo estimado USD</span>
                <strong>U$S {Number(totalOrderUsd).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button className="btn-primary" onClick={prepareOrderPdf}>
                Preparar orden PDF
              </button>
              <button className="btn-outline" onClick={clearPublicationOrder} disabled={!orderItems.length} style={{ opacity: orderItems.length ? 1 : 0.5 }}>
                Vaciar carrito
              </button>
              {canLoadToContainer ? (
                <button className="btn-outline" onClick={loadOrderToContainer} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  Cargar pedido al contenedor
                </button>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, padding: '10px 12px', borderRadius: 10, background: 'rgba(141,121,102,0.05)', border: '1px solid var(--border)' }}>
                  En planes Pro y Pro Max aparece el botón para mandar esta selección directo al Container Loader usando las medidas reales de cada producto.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {enrichedPlans.map(plan => {
            const product = plan.product;
            return (
              <div key={plan.productId} className="card" style={{ overflow: 'hidden' }}>
                <div className="card-header" style={{ alignItems: 'start' }}>
                  <div>
                    <span className="card-title">{plan.productName}</span>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span className="badge badge-blue">Costo {ars(plan.costoARS)}</span>
                      <span className="badge badge-green">Margen objetivo {plan.targetMargin}%</span>
                      <span className="badge badge-amber">{plan.activeChannels.length} canal{plan.activeChannels.length === 1 ? '' : 'es'}</span>
                      {product?.tipoUnidad && <span className="badge badge-blue">{getUnitTypeLabel(product.tipoUnidad)}</span>}
                      {plan.hasDims
                        ? <span className="badge badge-green">{product.dims.L}×{product.dims.W}×{product.dims.H} cm</span>
                        : <span className="badge badge-red">Sin medidas</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Actualizado {formatDate(plan.updatedAt)}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-outline" onClick={() => setActiveSection('simulator')}>Editar</button>
                      <button
                        className="btn-outline"
                        onClick={() => {
                          removePublicationPlan(plan.productId);
                          showToast(`Se quitó "${plan.productName}" de precios confirmados`);
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Canal', 'Precio confirmado', 'Sugerido', 'Comisión', 'Ganancia/u', 'Margen post-IIGG'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.activeChannels.map(ch => {
                        const badge = ch.mgReal >= 30 ? 'green' : ch.mgReal >= 10 ? 'amber' : 'red';
                        return (
                          <tr key={ch.nombre} style={{ borderBottom: '1px solid var(--border-2)' }}>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{ch.nombre}</td>
                            <td style={{ padding: '10px', fontWeight: 800, color: 'var(--accent)' }}>{ars(ch.precio)}</td>
                            <td style={{ padding: '10px', color: 'var(--text-2)' }}>{ars(ch.sugerido)}</td>
                            <td style={{ padding: '10px', color: 'var(--text-2)' }}>{ch.comision}%</td>
                            <td style={{ padding: '10px', fontWeight: 600, color: ch.ganPost >= 0 ? 'var(--green)' : 'var(--red)' }}>{ars(ch.ganPost)}</td>
                            <td style={{ padding: '10px' }}><span className={`badge badge-${badge}`}>{ch.mgReal}%</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto auto', gap: 10, alignItems: 'center', padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(26,79,138,0.03), rgba(26,79,138,0.01))' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Pedido definitivo</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                      {plan.suggestedTopChannel
                        ? `Canal más alto: ${plan.suggestedTopChannel.nombre} · ${ars(plan.suggestedTopChannel.precio)}`
                        : 'Sin canal destacado'}
                    </div>
                  </div>
                  <button className="btn-outline" onClick={() => changeOrderQty(plan.productId, plan.orderQty - 1)} style={{ width: 36, padding: '8px 0' }}>−</button>
                  <input
                    type="number"
                    min="0"
                    value={plan.orderQty}
                    onChange={e => changeOrderQty(plan.productId, e.target.value)}
                    style={{ width: 86, textAlign: 'center' }}
                  />
                  <button className="btn-outline" onClick={() => changeOrderQty(plan.productId, plan.orderQty + 1)} style={{ width: 36, padding: '8px 0' }}>+</button>
                  <button
                    className={plan.orderQty > 0 ? 'btn-primary' : 'btn-outline'}
                    onClick={() => changeOrderQty(plan.productId, plan.orderQty > 0 ? plan.orderQty : 1)}
                    style={{ minWidth: 148 }}
                  >
                    {plan.orderQty > 0 ? 'En pedido' : 'Agregar al pedido'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
