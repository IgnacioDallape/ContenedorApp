/**
 * Tests de lógica del containerStore: alta de productos, undo/redo, multi-container
 * y saneamiento (clamp de qty) al cargar un shipment.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import useStore from '../stores/containerStore.js';

beforeAll(() => {
  global.window._instanceManualPos = global.window._instanceManualPos || {};
  global.window._instanceLockedOri = global.window._instanceLockedOri || {};
});

beforeEach(() => {
  useStore.setState({
    shipmentContainers: [{ id: 1, type: '20ft', products: [], priorityZones: [null, null, null], instanceManualPos: {}, instanceLockedOri: {} }],
    activeContainerIdx: 0,
    loadedProducts: [],
    priorityZones: [null, null, null],
    instanceManualPos: {},
    instanceLockedOri: {},
    canUndo: false,
    canRedo: false,
  });
});

const st = () => useStore.getState();
const box = (o = {}) => ({ name: 'Caja', type: 'box', dims: { L: 40, W: 40, H: 40 }, qty: 2, ...o });

describe('containerStore — alta y baja de productos', () => {
  it('addProduct normaliza (vol, color, id) y agrega', () => {
    st().addProduct(box());
    const p = st().loadedProducts[0];
    expect(p.id).toBeDefined();
    expect(p.color).toBeTruthy();
    expect(p.vol).toBeCloseTo((40 * 40 * 40) / 1e6, 5);
  });

  it('los pallets se ordenan antes que las cajas', () => {
    st().addProduct(box({ name: 'Caja1' }));
    st().addProduct(box({ name: 'Pal1', type: 'pallet', dims: { L: 120, W: 100, H: 120 } }));
    expect(st().loadedProducts[0].type).toBe('pallet');
  });

  it('removeProduct elimina por id', () => {
    st().addProduct(box());
    const id = st().loadedProducts[0].id;
    st().removeProduct(id);
    expect(st().loadedProducts).toHaveLength(0);
  });
});

describe('containerStore — undo / redo', () => {
  it('addProduct habilita undo; undo revierte; redo reaplica', () => {
    expect(st().loadedProducts).toHaveLength(0);
    st().addProduct(box());
    expect(st().loadedProducts).toHaveLength(1);
    expect(st().canUndo).toBe(true);
    st().undo();
    expect(st().loadedProducts).toHaveLength(0);
    st().redo();
    expect(st().loadedProducts).toHaveLength(1);
  });
});

describe('containerStore — multi-container', () => {
  it('no se puede quitar el único contenedor', () => {
    expect(st().removeContainer(0)).toBe(false);
    expect(st().shipmentContainers).toHaveLength(1);
  });

  it('addNewContainer agrega y removeContainer vuelve a 1', () => {
    st().addNewContainer();
    expect(st().shipmentContainers.length).toBe(2);
    st().removeContainer(1);
    expect(st().shipmentContainers.length).toBe(1);
    expect(st().shipmentContainers[0].id).toBe(1); // re-indexado
  });
});

describe('containerStore — loadShipmentData clampea qty', () => {
  it('qty patológica de un payload se limita a 500', () => {
    st().loadShipmentData({
      containers: [{ type: '40ft', products: [{ id: 1, name: 'X', type: 'box', dims: { L: 40, W: 40, H: 40 }, qty: 9999 }] }],
    });
    expect(st().loadedProducts[0].qty).toBe(500);
  });

  it('respeta options.activeContainerIdx (el overflow salta al contenedor destino)', () => {
    st().loadShipmentData(
      { containers: [{ type: '20ft', products: [] }, { type: '40ft', products: [] }] },
      { activeContainerIdx: 1 }
    );
    expect(st().activeContainerIdx).toBe(1);
  });
});
