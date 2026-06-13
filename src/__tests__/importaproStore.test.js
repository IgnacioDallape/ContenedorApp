/**
 * Tests de lógica del importaproStore (sin red): productos guardados, planes de
 * publicación, orden de compra, carga a la calculadora, canales, TC.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/importaproStore.js';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    savedProducts: [],
    publicationPlans: [],
    publicationOrderDraft: [],
    publicationOrderName: '',
    loadedProductName: null,
    tcUpdatedAt: null,
    canales: [{ nombre: 'ML', comision: 13, cuotas: 0, precio: 1000 }],
  });
});

const s = () => useStore.getState();

describe('importaproStore — inputs y TC', () => {
  it('setInputs hace merge parcial', () => {
    s().setInputs({ fob: 9.99 });
    expect(s().inputs.fob).toBe(9.99);
  });

  it('updateGlobalTC setea globalTC y tcUpdatedAt', () => {
    expect(s().tcUpdatedAt).toBeNull();
    s().updateGlobalTC(1500);
    expect(s().inputs.globalTC).toBe(1500);
    expect(typeof s().tcUpdatedAt).toBe('number');
  });
});

describe('importaproStore — productos guardados', () => {
  it('saveProduct agrega uno nuevo', () => {
    s().saveProduct({ id: 1, nombre: 'Lámpara', fob: 5 });
    expect(s().savedProducts).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('importapro-products'))).toHaveLength(1);
  });

  it('saveProduct con nombre existente sobreescribe (dedup por nombre)', () => {
    s().saveProduct({ id: 1, nombre: 'Lámpara', fob: 5 });
    s().saveProduct({ id: 2, nombre: 'Lámpara', fob: 8 });
    expect(s().savedProducts).toHaveLength(1);
    expect(s().savedProducts[0].fob).toBe(8);
  });

  it('deleteProduct elimina y limpia planes/orden que lo referencian', () => {
    s().saveProduct({ id: 7, nombre: 'X', fob: 5 });
    s().savePublicationPlan({ productId: 7, channels: [] });
    s().setPublicationOrderQty(7, 3);
    s().deleteProduct(0);
    expect(s().savedProducts).toHaveLength(0);
    expect(s().publicationPlans.some(p => p.productId === 7)).toBe(false);
    expect(s().publicationOrderDraft.some(i => i.productId === 7)).toBe(false);
  });
});

describe('importaproStore — planes de publicación y orden', () => {
  it('savePublicationPlan dedup por productId', () => {
    s().savePublicationPlan({ productId: 1, v: 'a' });
    s().savePublicationPlan({ productId: 1, v: 'b' });
    expect(s().publicationPlans).toHaveLength(1);
    expect(s().publicationPlans[0].v).toBe('b');
  });

  it('setPublicationOrderQty agrega, actualiza y elimina al llegar a 0', () => {
    s().setPublicationOrderQty(1, 5);
    expect(s().publicationOrderDraft).toHaveLength(1);
    s().setPublicationOrderQty(1, 9);
    expect(s().publicationOrderDraft[0].qty).toBe(9);
    s().setPublicationOrderQty(1, 0);
    expect(s().publicationOrderDraft).toHaveLength(0);
  });

  it('setPublicationOrderQty clampea negativos a 0 (elimina)', () => {
    s().setPublicationOrderQty(2, 4);
    s().setPublicationOrderQty(2, -3);
    expect(s().publicationOrderDraft.some(i => i.productId === 2)).toBe(false);
  });

  it('clearPublicationOrder vacía draft y nombre', () => {
    s().setPublicationOrderQty(1, 2);
    s().setPublicationOrderName('Pedido 1');
    s().clearPublicationOrder();
    expect(s().publicationOrderDraft).toHaveLength(0);
    expect(s().publicationOrderName).toBe('');
  });
});

describe('importaproStore — canales', () => {
  it('addCanal / updateCanal / removeCanal', () => {
    s().addCanal();
    expect(s().canales).toHaveLength(2);
    s().updateCanal(1, { comision: 7 });
    expect(s().canales[1].comision).toBe(7);
    s().removeCanal(0);
    expect(s().canales).toHaveLength(1);
    expect(s().canales[0].comision).toBe(7);
  });
});

describe('importaproStore — loadProductToCalc', () => {
  it('carga campos del producto a inputs y marca loadedProductName', () => {
    s().loadProductToCalc({ nombre: 'Mate', fob: 4.5, qty: 50, di: 12, dims: { L: 10, W: 10, H: 12 } });
    expect(s().inputs.nombre).toBe('Mate');
    expect(s().inputs.fob).toBe(4.5);
    expect(s().inputs.qty).toBe(50);
    expect(s().inputs.di).toBe(12);
    expect(s().inputs.dimL).toBe(10);
    expect(s().loadedProductName).toBe('Mate');
  });
});
