<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ContainerLoader — Software de logística para importadores argentinos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Jost:wght@300;400;500;600&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --c1: #3a2a1e; --c2: #8D7966; --c3: #c8a96e; --c4: #f8f1e9; --c5: #fff9f3;
    --dark: #1a1208; --text: #2c1f12; --muted: #8D7966;
    --border: rgba(141,121,102,0.2); --danger: #b85c5c;
    --font-serif: 'Cormorant Garamond', Georgia, serif;
    --font: 'Jost', sans-serif; --font-mono: 'DM Mono', monospace; --radius: 10px;
  }
  html { scroll-behavior: smooth; }
  body { font-family: var(--font); background: var(--c4); color: var(--text); line-height: 1.6; overflow-x: hidden; }
  nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 18px 60px; background: rgba(248,241,233,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
  .nav-brand { display: flex; align-items: center; gap: 10px; font-family: var(--font-serif); font-size: 20px; font-weight: 600; color: var(--c1); text-decoration: none; letter-spacing: -0.3px; }
  .nav-brand-icon { width: 34px; height: 34px; background: var(--c1); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .nav-links { display: flex; align-items: center; gap: 32px; }
  .nav-links a { font-size: 13px; color: var(--muted); text-decoration: none; letter-spacing: 0.5px; transition: color 0.2s; }
  .nav-links a:hover { color: var(--c1); }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px; border-radius: var(--radius); font-family: var(--font); font-size: 13px; font-weight: 500; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s; text-decoration: none; border: none; }
  .btn-primary { background: var(--c1); color: var(--c5); }
  .btn-primary:hover { background: #2a1c10; transform: translateY(-1px); }
  .btn-outline { background: transparent; color: var(--c1); border: 1.5px solid var(--c1); }
  .btn-outline:hover { background: var(--c1); color: var(--c5); }
  .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 120px 40px 80px; position: relative; overflow: hidden; }
  .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200,169,110,0.12) 0%, transparent 70%); pointer-events: none; }
  .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 100px; border: 1px solid var(--border); background: rgba(200,169,110,0.1); font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 40px; }
  .hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c3); animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .hero h1 { font-family: var(--font-serif); font-size: clamp(48px, 7vw, 88px); font-weight: 300; line-height: 1.05; letter-spacing: -2px; color: var(--c1); margin-bottom: 28px; max-width: 900px; }
  .hero h1 em { font-style: italic; color: var(--c2); }
  .hero-sub { font-size: 17px; color: var(--muted); font-weight: 300; max-width: 560px; line-height: 1.7; margin-bottom: 48px; }
  .hero-cta { display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .hero-scroll { margin-top: 80px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; font-family: var(--font-mono); letter-spacing: 2px; text-transform: uppercase; animation: bounce 2s infinite; }
  .hero-scroll-line { width: 1px; height: 40px; background: linear-gradient(to bottom, var(--c3), transparent); }
  @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
  .proof-bar { background: var(--c1); color: var(--c5); padding: 18px 60px; display: flex; align-items: center; justify-content: center; gap: 60px; flex-wrap: wrap; }
  .proof-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .proof-num { font-family: var(--font-serif); font-size: 28px; font-weight: 500; color: var(--c3); }
  .proof-label { font-size: 11px; color: rgba(255,249,243,0.5); font-family: var(--font-mono); letter-spacing: 1px; text-transform: uppercase; }
  .proof-sep { width: 1px; height: 40px; background: rgba(255,249,243,0.1); }
  section { padding: 100px 60px; }
  .section-label { font-family: var(--font-mono); font-size: 11px; color: var(--c3); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; }
  .section-title { font-family: var(--font-serif); font-size: clamp(32px, 4vw, 52px); font-weight: 400; line-height: 1.1; color: var(--c1); letter-spacing: -1px; margin-bottom: 60px; }
  .section-title em { font-style: italic; color: var(--c2); }
  .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; background: var(--border); border-radius: var(--radius); overflow: hidden; }
  .feature-card { background: var(--c5); padding: 40px 36px; transition: background 0.2s; }
  .feature-card:hover { background: var(--c4); }
  .feature-icon { width: 44px; height: 44px; border-radius: 10px; background: rgba(141,121,102,0.12); display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 20px; }
  .feature-title { font-family: var(--font-serif); font-size: 22px; font-weight: 500; color: var(--c1); margin-bottom: 10px; letter-spacing: -0.3px; }
  .feature-desc { font-size: 14px; color: var(--muted); line-height: 1.7; font-weight: 300; }
  .how-section { background: var(--c1); color: var(--c5); }
  .how-section .section-title { color: var(--c5); }
  .how-section .section-label { color: var(--c3); }
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 40px; }
  .step { position: relative; }
  .step::after { content: '→'; position: absolute; top: 20px; right: -24px; color: rgba(200,169,110,0.4); font-size: 20px; }
  .step:last-child::after { display: none; }
  .step-num { font-family: var(--font-mono); font-size: 11px; color: var(--c3); letter-spacing: 2px; margin-bottom: 16px; }
  .step-title { font-family: var(--font-serif); font-size: 20px; font-weight: 500; color: var(--c5); margin-bottom: 10px; }
  .step-desc { font-size: 14px; color: rgba(255,249,243,0.5); line-height: 1.7; font-weight: 300; }
  .pricing-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; max-width: 1100px; margin: 0 auto; }
  .pricing-card { background: var(--c5); border: 1.5px solid var(--border); border-radius: 16px; padding: 40px 36px; position: relative; transition: transform 0.2s; display: flex; flex-direction: column; }
  .pricing-card:hover { transform: translateY(-4px); }
  .pricing-card.featured { background: var(--c1); border-color: var(--c1); }
  .pricing-badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: var(--c3); color: var(--c1); font-family: var(--font-mono); font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; padding: 5px 18px; border-radius: 100px; white-space: nowrap; }
  .pricing-plan { font-family: var(--font-mono); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 20px; }
  .pricing-card.featured .pricing-plan { color: rgba(255,249,243,0.5); }
  .pricing-price { font-family: var(--font-serif); font-size: 38px; font-weight: 300; color: var(--c1); line-height: 1; margin-bottom: 4px; }
  .pricing-card.featured .pricing-price { color: var(--c3); }
  .pricing-period { font-size: 13px; color: var(--muted); margin-bottom: 32px; }
  .pricing-card.featured .pricing-period { color: rgba(255,249,243,0.4); }
  .pricing-divider { height: 1px; background: var(--border); margin-bottom: 28px; }
  .pricing-card.featured .pricing-divider { background: rgba(255,249,243,0.1); }
  .pricing-features { list-style: none; margin-bottom: 36px; flex: 1; }
  .pricing-features li { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: var(--text); padding: 8px 0; border-bottom: 1px solid var(--border); font-weight: 300; }
  .pricing-card.featured .pricing-features li { color: rgba(255,249,243,0.8); border-bottom-color: rgba(255,249,243,0.08); }
  .pricing-features li:last-child { border-bottom: none; }
  .check { width: 16px; height: 16px; border-radius: 50%; background: rgba(141,121,102,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; font-size: 9px; color: var(--c2); }
  .pricing-card.featured .check { background: rgba(200,169,110,0.2); color: var(--c3); }
  .btn-pricing-outline { width: 100%; padding: 14px; border-radius: var(--radius); font-family: var(--font); font-size: 13px; font-weight: 500; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s; text-align: center; text-decoration: none; display: block; border: 1.5px solid var(--c1); color: var(--c1); background: transparent; }
  .btn-pricing-outline:hover { background: var(--c1); color: var(--c5); }
  .btn-pricing-solid { width: 100%; padding: 14px; border-radius: var(--radius); font-family: var(--font); font-size: 13px; font-weight: 500; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s; text-align: center; text-decoration: none; display: block; background: var(--c3); color: var(--c1); border: none; }
  .btn-pricing-solid:hover { background: #d4b070; }
  .pricing-toast { display: none; position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: var(--c1); color: var(--c5); padding: 14px 28px; border-radius: var(--radius); font-size: 14px; z-index: 999; box-shadow: 0 8px 32px rgba(0,0,0,0.25); white-space: nowrap; }
  .pricing-toast a { color: var(--c3); text-decoration: underline; }
  .pricing-toast.visible { display: block; animation: fadeInUp 0.3s ease; }
  @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  .pricing-note { text-align: center; margin-top: 40px; font-size: 14px; color: var(--muted); font-style: italic; font-family: var(--font-serif); }
  .contact-section { background: var(--c1); padding: 100px 60px; }
  .contact-inner { max-width: 560px; margin: 0 auto; }
  .contact-section .section-label { color: var(--c3); }
  .contact-section .section-title { color: var(--c5); margin-bottom: 40px; }
  .form-field { margin-bottom: 16px; }
  .form-field label { display: block; font-size: 11px; font-family: var(--font-mono); letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,249,243,0.4); margin-bottom: 8px; }
  .form-field input, .form-field select, .form-field textarea { width: 100%; padding: 14px 16px; background: rgba(255,249,243,0.06); border: 1px solid rgba(255,249,243,0.12); border-radius: var(--radius); font-family: var(--font); font-size: 14px; font-weight: 300; color: var(--c5); outline: none; transition: border-color 0.2s; }
  .form-field input::placeholder, .form-field textarea::placeholder { color: rgba(255,249,243,0.25); }
  .form-field input:focus, .form-field select:focus, .form-field textarea:focus { border-color: var(--c3); }
  .form-field select option { background: var(--c1); color: var(--c5); }
  .form-field textarea { resize: vertical; min-height: 100px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .btn-form { width: 100%; padding: 16px; background: var(--c3); color: var(--c1); border: none; border-radius: var(--radius); font-family: var(--font); font-size: 14px; font-weight: 500; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s; margin-top: 8px; }
  .btn-form:hover { background: #d4b070; }
  .btn-form:disabled { opacity: 0.6; cursor: not-allowed; }
  .form-success { display: none; text-align: center; padding: 40px 20px; color: var(--c5); }
  .form-success-icon { font-size: 40px; margin-bottom: 16px; }
  .form-success h3 { font-family: var(--font-serif); font-size: 28px; font-weight: 400; color: var(--c3); margin-bottom: 10px; }
  .form-success p { font-size: 14px; color: rgba(255,249,243,0.5); font-weight: 300; }
  footer { background: var(--dark); color: rgba(255,249,243,0.4); padding: 40px 60px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
  footer a { color: rgba(255,249,243,0.4); text-decoration: none; }
  footer a:hover { color: var(--c3); }
  @media (max-width: 900px) {
    nav { padding: 16px 24px; } section { padding: 60px 24px; }
    .proof-bar { padding: 20px 24px; gap: 30px; }
    .features-grid { grid-template-columns: 1fr; }
    .steps { grid-template-columns: 1fr 1fr; } .step::after { display: none; }
    .pricing-grid { grid-template-columns: 1fr; }
    .hero { padding: 100px 24px 60px; }
    footer { flex-direction: column; gap: 16px; text-align: center; }
    .contact-section { padding: 60px 24px; } .form-row { grid-template-columns: 1fr; }
    .pricing-toast { white-space: normal; text-align: center; width: 90%; }
  }
</style>
</head>
<body>

<nav>
  <a class="nav-brand" href="#"><div class="nav-brand-icon">🚢</div>ContainerLoader</a>
  <div class="nav-links">
    <a href="#features">Funciones</a>
    <a href="#como-funciona">Cómo funciona</a>
    <a href="#precios">Precios</a>
    <a href="#contacto" class="btn btn-primary">Contacto</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-badge"><div class="hero-badge-dot"></div>Software de logística · Argentina</div>
  <h1>Optimizá tu contenedor.<br><em>Importá mejor.</em></h1>
  <p class="hero-sub">La única herramienta argentina que combina cargador 3D de contenedores, calculadora de costos de importación desde China y armador de pallets en un solo lugar.</p>
  <div class="hero-cta">
    <a href="#precios" class="btn btn-primary">Ver planes →</a>
    <a href="#features" class="btn btn-outline">Ver funciones</a>
  </div>
  <div class="hero-scroll"><div class="hero-scroll-line"></div>Scroll</div>
</section>

<div class="proof-bar">
  <div class="proof-item"><div class="proof-num">3</div><div class="proof-label">Tipos de contenedor</div></div>
  <div class="proof-sep"></div>
  <div class="proof-item"><div class="proof-num">3D</div><div class="proof-label">Visualización en tiempo real</div></div>
  <div class="proof-sep"></div>
  <div class="proof-item"><div class="proof-num">BFD</div><div class="proof-label">Algoritmo de optimización</div></div>
  <div class="proof-sep"></div>
  <div class="proof-item"><div class="proof-num">100%</div><div class="proof-label">En español · Sin instalación</div></div>
</div>

<section id="features">
  <div class="section-label">Funcionalidades</div>
  <div class="section-title">Todo lo que necesitás<br><em>en un solo lugar</em></div>
  <div class="features-grid">
    <div class="feature-card"><div class="feature-icon">🚢</div><div class="feature-title">Cargador 3D de contenedores</div><div class="feature-desc">Visualizá en tiempo real cómo se distribuye tu mercadería en contenedores de 20', 40' y 40' HC. Algoritmo BFD con heightmap de precisión 5cm.</div></div>
    <div class="feature-card"><div class="feature-icon">📦</div><div class="feature-title">Armador de pallets</div><div class="feature-desc">Armá tus pallets automáticamente con múltiples productos. Definí qué cajas van en la base y exportá el resultado directo al contenedor.</div></div>
    <div class="feature-card"><div class="feature-icon">🧮</div><div class="feature-title">Calculadora de importación</div><div class="feature-desc">Calculá el costo real de importar desde China con IVA, derechos de importación, comisión de trader, flete y aduana incluidos.</div></div>
    <div class="feature-card"><div class="feature-icon">💾</div><div class="feature-title">Embarques guardados</div><div class="feature-desc">Guardá tus embarques en la nube y compartílos con tu agente de carga. Multi-contenedor por embarque, acceso desde cualquier dispositivo.</div></div>
    <div class="feature-card"><div class="feature-icon">📊</div><div class="feature-title">Simulador de precios</div><div class="feature-desc">Simulá precios de venta en pesos considerando el costo de importación, tu margen deseado y el tipo de cambio actualizable.</div></div>
    <div class="feature-card"><div class="feature-icon">🔍</div><div class="feature-title">Búsqueda NCM con IA</div><div class="feature-desc">Encontrá el código NCM correcto para tu producto usando inteligencia artificial. Incluye base local con los aranceles vigentes en Argentina.</div></div>
  </div>
</section>

<section id="como-funciona" class="how-section">
  <div class="section-label">Cómo funciona</div>
  <div class="section-title">De la orden al contenedor<br><em>en minutos</em></div>
  <div class="steps">
    <div class="step"><div class="step-num">01</div><div class="step-title">Ingresás tus productos</div><div class="step-desc">Cargá nombre, dimensiones, peso y cantidad. O importá desde tu catálogo guardado.</div></div>
    <div class="step"><div class="step-num">02</div><div class="step-title">El algoritmo optimiza</div><div class="step-desc">BFD con heightmap calcula la mejor distribución respetando peso, volumen y zonas prioritarias.</div></div>
    <div class="step"><div class="step-num">03</div><div class="step-title">Visualizás en 3D</div><div class="step-desc">Rotá, zoomá e inspeccioná cada bulto. Mové productos manualmente si necesitás ajustes.</div></div>
    <div class="step"><div class="step-num">04</div><div class="step-title">Compartís con el agente</div><div class="step-desc">Guardás el embarque en la nube. Tu agente de carga lo ve desde su propio acceso.</div></div>
  </div>
</section>

<section id="precios">
  <div style="text-align:center;margin-bottom:60px">
    <div class="section-label" style="text-align:center">Planes</div>
    <div class="section-title" style="text-align:center">Precios simples,<br><em>sin sorpresas</em></div>
  </div>
  <div class="pricing-grid">
    <!-- BÁSICO -->
    <div class="pricing-card">
      <div class="pricing-plan">Básico</div>
      <div class="pricing-price">ARS 24.999</div>
      <div class="pricing-period">/ mes · 1 usuario</div>
      <div class="pricing-divider"></div>
      <ul class="pricing-features">
        <li><span class="check">✓</span> Calculadora de importación completa</li>
        <li><span class="check">✓</span> Búsqueda NCM con IA</li>
        <li><span class="check">✓</span> Simulador de precios de venta</li>
        <li><span class="check">✓</span> Hasta 10 embarques guardados</li>
        <li><span class="check">✓</span> Soporte por email</li>
      </ul>
      <a href="#" class="btn-pricing-outline" onclick="handleCheckout(event, '1502891')">Suscribirme →</a>
    </div>
    <!-- PRO -->
    <div class="pricing-card featured">
      <div class="pricing-badge">Más popular</div>
      <div class="pricing-plan">Pro</div>
      <div class="pricing-price">ARS 49.999</div>
      <div class="pricing-period">/ mes · hasta 3 usuarios</div>
      <div class="pricing-divider"></div>
      <ul class="pricing-features">
        <li><span class="check">✓</span> Todo lo del plan Básico</li>
        <li><span class="check">✓</span> Cargador 3D completo (20', 40', 40' HC)</li>
        <li><span class="check">✓</span> Embarques ilimitados</li>
        <li><span class="check">✓</span> Acceso para agente de carga</li>
        <li><span class="check">✓</span> Multi-contenedor por embarque</li>
        <li><span class="check">✓</span> Soporte prioritario por WhatsApp</li>
      </ul>
      <a href="#" class="btn-pricing-solid" onclick="handleCheckout(event, '1502904')">Suscribirme →</a>
    </div>
    <!-- PRO MAX -->
    <div class="pricing-card">
      <div class="pricing-plan">Pro Max</div>
      <div class="pricing-price">ARS 69.999</div>
      <div class="pricing-period">/ mes · hasta 5 usuarios</div>
      <div class="pricing-divider"></div>
      <ul class="pricing-features">
        <li><span class="check">✓</span> Todo lo del plan Pro</li>
        <li><span class="check">✓</span> Armador de pallets avanzado</li>
        <li><span class="check">✓</span> Exportar pallet al contenedor</li>
        <li><span class="check">✓</span> Usuarios ilimitados</li>
        <li><span class="check">✓</span> Soporte prioritario por WhatsApp</li>
      </ul>
      <a href="#" class="btn-pricing-outline" onclick="handleCheckout(event, '1502913')">Suscribirme →</a>
    </div>
  </div>
  <p class="pricing-note">¿Querés una demo antes de decidir? <a href="#contacto" style="color:var(--c2);text-decoration:underline">Escribinos</a> y coordinamos una llamada sin compromiso.</p>
</section>

<div class="pricing-toast" id="pricingToast">
  Necesitás estar logueado para suscribirte.
  <a href="https://ignaciodallape.github.io/ContenedorApp/" target="_blank">Ir a la app →</a>
</div>

<section class="contact-section" id="contacto">
  <div class="contact-inner">
    <div class="section-label">Contacto</div>
    <div class="section-title">¿Tenés dudas?<br><em>Escribinos</em></div>
    <div id="formWrap">
      <form id="contactForm">
        <div class="form-row">
          <div class="form-field"><label>Nombre</label><input type="text" name="nombre" placeholder="Tu nombre" required></div>
          <div class="form-field"><label>Empresa</label><input type="text" name="empresa" placeholder="Nombre de tu empresa"></div>
        </div>
        <div class="form-field"><label>E-mail</label><input type="email" name="email" placeholder="correo@empresa.com" required></div>
        <div class="form-field">
          <label>Plan de interés</label>
          <select name="plan" required>
            <option value="" disabled selected>Seleccioná un plan</option>
            <option value="basico">Básico — ARS 24.999/mes</option>
            <option value="pro">Pro — ARS 49.999/mes</option>
            <option value="promax">Pro Max — ARS 69.999/mes</option>
            <option value="demo">Solo quiero una demo</option>
          </select>
        </div>
        <div class="form-field"><label>Mensaje (opcional)</label><textarea name="mensaje" placeholder="Contanos qué importás o en qué podemos ayudarte..."></textarea></div>
        <button type="submit" class="btn-form" id="submitBtn">Enviar mensaje →</button>
      </form>
    </div>
    <div class="form-success" id="formSuccess">
      <div class="form-success-icon">✓</div>
      <h3>¡Mensaje enviado!</h3>
      <p>Te vamos a contactar en menos de 24 horas.</p>
    </div>
  </div>
</section>

<footer>
  <div>© 2026 ContainerLoader · Software de logística argentino</div>
  <div style="display:flex;gap:24px">
    <a href="mailto:nachodallape2@gmail.com">Contacto</a>
    <a href="https://ignaciodallape.github.io/ContenedorApp/" target="_blank">Ingresar a la app</a>
  </div>
</footer>

<script>
// Variant IDs — live mode
const VARIANTS = {
  '1502891': 'basico',
  '1502904': 'pro',
  '1502913': 'promax'
};

function getSupabaseUserId() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.user?.id || null;
        }
      }
    }
  } catch(e) {}
  return null;
}

function handleCheckout(e, variantId) {
  e.preventDefault();
  const userId = getSupabaseUserId();
  if (!userId) {
    const toast = document.getElementById('pricingToast');
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 4000);
    sessionStorage.setItem('cl_pending_variant', variantId);
    setTimeout(() => { window.open('https://ignaciodallape.github.io/ContenedorApp/', '_blank'); }, 1200);
    return;
  }
  const checkoutUrl = `https://containerloader.lemonsqueezy.com/checkout/buy/${variantId}?checkout[custom][user_id]=${encodeURIComponent(userId)}`;
  window.location.href = checkoutUrl;
}

(function resumePendingCheckout() {
  const pending = sessionStorage.getItem('cl_pending_variant');
  if (!pending) return;
  const userId = getSupabaseUserId();
  if (!userId) return;
  sessionStorage.removeItem('cl_pending_variant');
  window.location.href = `https://containerloader.lemonsqueezy.com/checkout/buy/${pending}?checkout[custom][user_id]=${encodeURIComponent(userId)}`;
})();

document.getElementById('contactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const nombre  = this.querySelector('[name=nombre]').value.trim();
  const empresa = this.querySelector('[name=empresa]').value.trim();
  const email   = this.querySelector('[name=email]').value.trim();
  const plan    = this.querySelector('[name=plan]').value;
  const mensaje = this.querySelector('[name=mensaje]').value.trim();
  const subject = encodeURIComponent(`ContainerLoader — Consulta de ${nombre}`);
  const body = encodeURIComponent(`Nombre: ${nombre}\nEmpresa: ${empresa||'—'}\nE-mail: ${email}\nPlan: ${plan}\n\n${mensaje||'—'}`);
  btn.textContent = 'Abriendo cliente de correo...';
  btn.disabled = true;
  window.location.href = `mailto:nachodallape2@gmail.com?subject=${subject}&body=${body}`;
  setTimeout(() => {
    document.getElementById('formWrap').style.display = 'none';
    document.getElementById('formSuccess').style.display = 'block';
  }, 1500);
});
</script>
</body>
</html>
