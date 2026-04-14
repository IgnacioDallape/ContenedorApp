export const CONTAINER_TYPES = {
  '20ft':   { L:589,  W:235, H:239, vol:(589*235*239)/1e6,   label:"20'",     fullLabel:"20' Dry",       dims:"5.89 × 2.35 × 2.39 m" },
  '40ft':   { L:1200, W:235, H:239, vol:(1200*235*239)/1e6,  label:"40'",     fullLabel:"40' Dry",       dims:"12.00 × 2.35 × 2.39 m" },
  '40hc':   { L:1200, W:235, H:269, vol:(1200*235*269)/1e6,  label:"40' HC",  fullLabel:"40' High Cube", dims:"12.00 × 2.35 × 2.69 m" },
  'semi145': { L:1450, W:244, H:270, vol:(1450*244*270)/1e6, label:"Semi 14.5m", fullLabel:"Semi 14.5 m",  dims:"14.50 × 2.44 × 2.70 m" },
  'semi155': { L:1550, W:244, H:270, vol:(1550*244*270)/1e6, label:"Semi 15.5m", fullLabel:"Semi 15.5 m",  dims:"15.50 × 2.44 × 2.70 m" },
};

export const PALLET_SIZES = {
  euro: { L:120, W:80  },
  eua:  { L:120, W:100 },
};

export const COLORS = [
  '#8D7966','#A8906b','#b07050','#9b7966','#6b8c6b',
  '#b8906b','#a07858','#6b9b8b','#9b8b6b','#8b6b6b'
];

export const ZONE_COLORS     = [0xc1704a, 0x4a7dc1, 0x4ac16b];
export const ZONE_COLORS_HEX = ['#c1704a', '#4a7dc1', '#4ac16b'];
export const ZONE_LABELS     = ['Zona 1', 'Zona 2', 'Zona 3'];

export const WEIGHT_LIMITS = { '20ft': 28000, '40ft': 26500, '40hc': 26500 };

export const NCM_FRECUENTES = [
  {code:'5703.20',desc:'Alfombras de nylon tufted',di:20,badge:'amber'},
  {code:'5703.90',desc:'Alfombras otras fibras tufted',di:20,badge:'amber'},
  {code:'6302.91',desc:'Ropa de cama algodón',di:18,badge:'amber'},
  {code:'3924.90',desc:'Artículos del hogar plástico',di:12,badge:'green'},
  {code:'8516.60',desc:'Hornos microondas',di:0,badge:'green'},
  {code:'6404.19',desc:'Calzado suela goma / cuero',di:35,badge:'red'},
  {code:'8471.30',desc:'Computadoras portátiles',di:0,badge:'green'},
  {code:'9503.00',desc:'Juguetes y juegos',di:20,badge:'amber'},
  {code:'6110.20',desc:'Sweaters y pulóveres algodón',di:35,badge:'red'},
  {code:'8518.30',desc:'Auriculares y headphones',di:20,badge:'amber'},
  {code:'4202.92',desc:'Mochilas y bolsos textil',di:35,badge:'red'},
  {code:'6911.10',desc:'Vajilla de porcelana',di:20,badge:'amber'},
];

export const PB_PALLET_TYPES = {
  euro: { L: 120, W: 80,  label: 'Euro Pallet', dims: '120×80 cm' },
  eua:  { L: 120, W: 100, label: 'Pallet EUA',  dims: '120×100 cm' },
};

export const PB_COLORS = [
  '#b07050','#8D7966','#c1704a','#9b7966','#6b8c6b',
  '#b8906b','#a07858','#6b9b8b','#A8906b','#8b6b6b'
];
