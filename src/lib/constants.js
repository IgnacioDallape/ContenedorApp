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
  // Electrónica y accesorios
  {code:'8517.12.31',desc:'Teléfonos celulares / smartphones',di:0,badge:'green',cat:'Electrónica'},
  {code:'8471.30',desc:'Computadoras portátiles / notebooks',di:0,badge:'green',cat:'Electrónica'},
  {code:'8471.41',desc:'Computadoras de escritorio',di:0,badge:'green',cat:'Electrónica'},
  {code:'8443.32',desc:'Impresoras de inyección de tinta',di:0,badge:'green',cat:'Electrónica'},
  {code:'8528.72',desc:'Monitores y pantallas LCD/LED',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8519.81',desc:'Reproductores de audio MP3/MP4',di:20,badge:'amber',cat:'Electrónica'},
  {code:'8471.60',desc:'Teclados y mouse USB',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8471.70',desc:'Unidades de almacenamiento USB/HDD',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8504.40',desc:'Cargadores y fuentes de alimentación',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8544.42',desc:'Cables USB / cargadores tipo C',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8518.30',desc:'Auriculares y headphones',di:20,badge:'amber',cat:'Electrónica'},
  {code:'8518.21',desc:'Parlantes y altavoces portátiles',di:20,badge:'amber',cat:'Electrónica'},
  {code:'8525.60',desc:'Cámaras de video y action cameras',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8525.80',desc:'Cámaras fotográficas digitales',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8473.30',desc:'Accesorios para computadoras',di:18,badge:'amber',cat:'Electrónica'},
  {code:'8507.60',desc:'Baterías de litio / power banks',di:20,badge:'amber',cat:'Electrónica'},
  {code:'8536.69',desc:'Adaptadores y enchufes eléctricos',di:18,badge:'amber',cat:'Electrónica'},
  // Tablets y wearables
  {code:'8471.30.11',desc:'Tablets y iPads',di:0,badge:'green',cat:'Electrónica'},
  {code:'9102.12',desc:'Relojes inteligentes / smartwatches',di:20,badge:'amber',cat:'Electrónica'},
  {code:'8517.62',desc:'Routers y equipos WiFi',di:18,badge:'amber',cat:'Electrónica'},
  // Ropa y textiles
  {code:'6109.10',desc:'Remeras de algodón',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6110.20',desc:'Sweaters y pulóveres algodón',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6110.30',desc:'Sweaters y camperas sintéticas',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6201.93',desc:'Camperas y parkas sinéticas hombre',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6202.93',desc:'Camperas y parkas sintéticas mujer',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6203.42',desc:'Pantalones de algodón hombre',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6204.62',desc:'Pantalones de algodón mujer',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6115.10',desc:'Medias y calcetines',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6108.22',desc:'Ropa interior femenina sintética',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6107.11',desc:'Ropa interior masculina algodón',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'6302.91',desc:'Ropa de cama algodón',di:18,badge:'amber',cat:'Ropa y textiles'},
  {code:'6302.60',desc:'Ropa de baño / toallas',di:35,badge:'red',cat:'Ropa y textiles'},
  {code:'5407.61',desc:'Telas de poliéster tejido plano',di:20,badge:'amber',cat:'Ropa y textiles'},
  {code:'5208.21',desc:'Telas de algodón blanqueadas',di:20,badge:'amber',cat:'Ropa y textiles'},
  // Calzado
  {code:'6404.19',desc:'Calzado suela goma / exterior cuero',di:35,badge:'red',cat:'Calzado'},
  {code:'6402.99',desc:'Zapatillas deportivas suela goma',di:35,badge:'red',cat:'Calzado'},
  {code:'6403.99',desc:'Calzado cuero suela cuero',di:35,badge:'red',cat:'Calzado'},
  {code:'6405.20',desc:'Calzado con parte superior textil',di:35,badge:'red',cat:'Calzado'},
  {code:'6401.92',desc:'Botas impermeables de goma',di:35,badge:'red',cat:'Calzado'},
  // Juguetes y artículos para bebés
  {code:'9503.00',desc:'Juguetes y juegos de plástico',di:20,badge:'amber',cat:'Juguetes'},
  {code:'9504.50',desc:'Consolas y videojuegos portátiles',di:20,badge:'amber',cat:'Juguetes'},
  {code:'9501.00',desc:'Triciclos y juguetes con ruedas',di:20,badge:'amber',cat:'Juguetes'},
  {code:'9502.10',desc:'Muñecas y accesorios',di:20,badge:'amber',cat:'Juguetes'},
  {code:'6111.20',desc:'Ropa de bebé algodón',di:35,badge:'red',cat:'Juguetes'},
  {code:'3922.10',desc:'Bañeras y asientos para bebés plástico',di:20,badge:'amber',cat:'Juguetes'},
  // Herramientas y ferretería
  {code:'8467.11',desc:'Taladros y atornilladores eléctricos',di:18,badge:'amber',cat:'Herramientas'},
  {code:'8467.22',desc:'Amoladoras y esmeriles',di:18,badge:'amber',cat:'Herramientas'},
  {code:'8205.20',desc:'Martillos y herramientas de golpe',di:18,badge:'amber',cat:'Herramientas'},
  {code:'8206.00',desc:'Juegos de herramientas manuales',di:18,badge:'amber',cat:'Herramientas'},
  {code:'8211.93',desc:'Cuchillos y navajas de trabajo',di:18,badge:'amber',cat:'Herramientas'},
  {code:'7318.15',desc:'Tornillos y bulones de acero',di:12,badge:'green',cat:'Herramientas'},
  // Artículos de cocina y hogar
  {code:'7323.93',desc:'Utensilios de cocina acero inox',di:20,badge:'amber',cat:'Hogar'},
  {code:'3924.10',desc:'Vajilla y utensilios plástico',di:20,badge:'amber',cat:'Hogar'},
  {code:'6911.10',desc:'Vajilla de porcelana',di:20,badge:'amber',cat:'Hogar'},
  {code:'8516.60',desc:'Hornos microondas',di:0,badge:'green',cat:'Hogar'},
  {code:'8516.72',desc:'Tostadoras eléctricas',di:18,badge:'amber',cat:'Hogar'},
  {code:'8516.50',desc:'Hornos eléctricos de sobremesa',di:18,badge:'amber',cat:'Hogar'},
  {code:'8509.40',desc:'Licuadoras y procesadoras',di:18,badge:'amber',cat:'Hogar'},
  {code:'3924.90',desc:'Artículos del hogar de plástico',di:12,badge:'green',cat:'Hogar'},
  {code:'3926.90',desc:'Organizadores y recipientes plástico',di:20,badge:'amber',cat:'Hogar'},
  {code:'4419.90',desc:'Utensilios de cocina de madera',di:20,badge:'amber',cat:'Hogar'},
  // Cosméticos y cuidado personal
  {code:'3304.99',desc:'Cosméticos y maquillaje',di:20,badge:'amber',cat:'Cosméticos'},
  {code:'3305.10',desc:'Champú y acondicionador',di:20,badge:'amber',cat:'Cosméticos'},
  {code:'3401.11',desc:'Jabones de tocador',di:20,badge:'amber',cat:'Cosméticos'},
  {code:'3307.20',desc:'Desodorantes y antitranspirantes',di:20,badge:'amber',cat:'Cosméticos'},
  {code:'8214.20',desc:'Instrumentos de manicura/pedicura',di:20,badge:'amber',cat:'Cosméticos'},
  {code:'8516.31',desc:'Secadores de pelo',di:18,badge:'amber',cat:'Cosméticos'},
  // Deportes y fitness
  {code:'9506.91',desc:'Artículos para gimnasio y fitness',di:20,badge:'amber',cat:'Deportes'},
  {code:'9506.62',desc:'Pelotas de fútbol y deportes',di:20,badge:'amber',cat:'Deportes'},
  {code:'9506.19',desc:'Artículos para natación y buceo',di:20,badge:'amber',cat:'Deportes'},
  {code:'9506.40',desc:'Artículos para tenis y pádel',di:20,badge:'amber',cat:'Deportes'},
  {code:'6211.33',desc:'Ropa deportiva poliéster hombre',di:35,badge:'red',cat:'Deportes'},
  // Muebles y decoración
  {code:'9403.20',desc:'Muebles de metal',di:20,badge:'amber',cat:'Muebles'},
  {code:'9403.60',desc:'Muebles de madera no dormitorio',di:20,badge:'amber',cat:'Muebles'},
  {code:'9401.61',desc:'Sillas y sillones tapizados',di:20,badge:'amber',cat:'Muebles'},
  {code:'6304.93',desc:'Artículos de decoración textil',di:20,badge:'amber',cat:'Muebles'},
  {code:'5703.20',desc:'Alfombras de nylon tufted',di:20,badge:'amber',cat:'Muebles'},
  {code:'5703.90',desc:'Alfombras otras fibras tufted',di:20,badge:'amber',cat:'Muebles'},
  // Automotor
  {code:'8708.99',desc:'Accesorios para autos plástico/metal',di:35,badge:'red',cat:'Automotor'},
  {code:'8708.29',desc:'Parachoques y partes carrocería',di:35,badge:'red',cat:'Automotor'},
  {code:'8512.20',desc:'Luces y faros para vehículos',di:35,badge:'red',cat:'Automotor'},
  {code:'4011.10',desc:'Cubiertas neumáticos de autos',di:35,badge:'red',cat:'Automotor'},
  {code:'3402.20',desc:'Líquidos de limpieza para autos',di:20,badge:'amber',cat:'Automotor'},
  // Iluminación
  {code:'8543.70',desc:'Tiras LED y luminarias decorativas',di:18,badge:'amber',cat:'Iluminación'},
  {code:'8539.50',desc:'Lámparas y focos LED',di:18,badge:'amber',cat:'Iluminación'},
  {code:'8513.10',desc:'Linternas y lámparas portátiles',di:18,badge:'amber',cat:'Iluminación'},
  {code:'9405.40',desc:'Luminarias para interior/exterior',di:20,badge:'amber',cat:'Iluminación'},
  // Maquinaria pequeña
  {code:'8424.20',desc:'Pulverizadores y aspersores',di:12,badge:'green',cat:'Maquinaria'},
  {code:'8479.89',desc:'Máquinas de uso doméstico/industrial',di:12,badge:'green',cat:'Maquinaria'},
  {code:'8422.11',desc:'Lavavajillas domésticos',di:18,badge:'amber',cat:'Maquinaria'},
  {code:'8450.11',desc:'Lavarropas automáticos',di:18,badge:'amber',cat:'Maquinaria'},
  // Papelería y oficina
  {code:'4820.10',desc:'Cuadernos y libretas de papel',di:20,badge:'amber',cat:'Papelería'},
  {code:'9608.10',desc:'Bolígrafos y lapiceras',di:20,badge:'amber',cat:'Papelería'},
  {code:'9609.10',desc:'Lápices de grafito y color',di:20,badge:'amber',cat:'Papelería'},
  {code:'3926.10',desc:'Artículos de oficina plástico',di:20,badge:'amber',cat:'Papelería'},
  // Bolsos y marroquinería
  {code:'4202.92',desc:'Mochilas y bolsos de textil/nylon',di:35,badge:'red',cat:'Bolsos'},
  {code:'4202.22',desc:'Carteras y bolsos de mano',di:35,badge:'red',cat:'Bolsos'},
  {code:'4205.00',desc:'Artículos de cuero y marroquinería',di:35,badge:'red',cat:'Bolsos'},
  {code:'4202.12',desc:'Valijas y maletas rígidas',di:35,badge:'red',cat:'Bolsos'},
  // Productos de limpieza
  {code:'3402.90',desc:'Detergentes y limpiadores',di:20,badge:'amber',cat:'Limpieza'},
  {code:'3808.94',desc:'Desinfectantes y sanitizantes',di:20,badge:'amber',cat:'Limpieza'},
  {code:'3605.00',desc:'Fósforos y encendedores',di:20,badge:'amber',cat:'Limpieza'},
  {code:'9603.21',desc:'Cepillos de dientes',di:20,badge:'amber',cat:'Limpieza'},
];

export const PB_PALLET_TYPES = {
  euro: { L: 120, W: 80,  label: 'Euro Pallet', dims: '120×80 cm' },
  eua:  { L: 120, W: 100, label: 'Pallet EUA',  dims: '120×100 cm' },
};

export const PB_COLORS = [
  '#b07050','#8D7966','#c1704a','#9b7966','#6b8c6b',
  '#b8906b','#a07858','#6b9b8b','#A8906b','#8b6b6b'
];
