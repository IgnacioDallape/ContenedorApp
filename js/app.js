// ══════════════════════════════════════════
// UNIFIED NAVIGATION
// ══════════════════════════════════════════
const SECTIONS = ['calc','products','ncm','simulator','settings','prices','container','catalog','palletbuilder'];
const CL_SECTIONS = ['container','catalog','palletbuilder'];
const IP_SECTIONS = ['calc','products','ncm','simulator','settings','prices'];

function switchSection(id) {
  // Validación de plan
  const plan = window._userPlan || 'none';
  const proSections    = ['container', 'catalog'];
  const promaxSections = ['palletbuilder'];

  if (proSections.includes(id) && !['pro', 'promax'].includes(plan)) {
    showUpgradeModal('Pro'); return;
  }
  if (promaxSections.includes(id) && plan !== 'promax') {
    showUpgradeModal('Pro Max'); return;
  }

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const clicked = [...document.querySelectorAll('.nav-item')].find(b => b.getAttribute('onclick')?.includes(`'${id}'`));
  if (clicked) clicked.classList.add('active');

  document.querySelectorAll('.ip-section, .cl-section').forEach(s => s.classList.remove('active'));

  const target = document.getElementById('section-' + id);
  if (target) target.classList.add('active');

  if (CL_SECTIONS.includes(id)) {
    if (typeof renderLoader === 'function' && id === 'container') setTimeout(renderLoader, 50);
    if (typeof renderCatalog === 'function' && id === 'catalog') setTimeout(renderCatalog, 50);
    if (typeof pb_init === 'function' && id === 'palletbuilder') setTimeout(pb_init, 50);
  }

  if (IP_SECTIONS.includes(id)) {
    if (id === 'products' && typeof renderMisProductos === 'function') renderMisProductos();
    if (id === 'prices' && typeof renderProducts === 'function') renderProducts();
    if (id === 'simulator' && typeof populateSimProductSelect === 'function') populateSimProductSelect();
    if (id === 'ncm' && typeof renderNcmFrecuentes === 'function') renderNcmFrecuentes();
  }

  if (typeof updateAtcBar === 'function') updateAtcBar();
}

function switchTab(tab) {
  switchSection(tab);
}

function showUpgradeModal(planName) {
  const existing = document.getElementById('upgradeModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'upgradeModal';
  modal.className = 'cap-overlay open';
  modal.style.zIndex = '400';
  modal.innerHTML = `
    <div class="cap-modal" style="max-width:420px;text-align:center;padding:32px">
      <div style="font-size:40px;margin-bottom:16px">🚀</div>
      <div class="cap-title">Plan ${planName} requerido</div>
      <p style="color:var(--muted);font-size:14px;margin:12px 0 24px">
        Esta función está disponible en el plan ${planName} o superior.
      </p>
      <a href="https://ignaciodallape.github.io/containerloader-landing/#precios"
         target="_blank"
         style="display:inline-block;padding:12px 28px;background:var(--c1);
                color:var(--c5);border-radius:8px;font-weight:700;
                text-decoration:none;font-size:14px">
        Ver planes →
      </a><br><br>
      <button onclick="document.getElementById('upgradeModal').remove()"
              style="background:none;border:none;color:var(--muted);cursor:pointer">
        Cerrar
      </button>
    </div>`;
  document.body.appendChild(modal);
}

// ══════════════════════════════════════════
// DOM INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Sync existing ImportaPro products (with dims) into cl_catalog on startup
  const saved = JSON.parse(localStorage.getItem('importapro-products') || '[]');
  if (saved.length) {
    const clCatalog = JSON.parse(localStorage.getItem('cl_catalog') || '[]');
    let changed = false;
    saved.forEach(p => {
      if (!p.dims || !p.dims.L || !p.dims.W || !p.dims.H) return;
      if (!clCatalog.find(c => c.name === p.nombre)) {
        clCatalog.push({
          id: p.id || Date.now(),
          name: p.nombre,
          type: p.tipoUnidad || 'box',
          dims: p.dims,
          weight: p.pesoUnit || 0,
          price: p.costoUSD || 0,
          qty: 1,
          source: 'importapro',
          imgUrl: p.photos && p.photos[0] ? p.photos[0] : null,
        });
        changed = true;
      }
    });
    if (changed) localStorage.setItem('cl_catalog', JSON.stringify(clCatalog));
  }

  if (typeof calc === 'function') calc();
  if (typeof updateApiKeyStatus === 'function') updateApiKeyStatus();
  if (typeof renderLoader === 'function') renderLoader();
  if (typeof renderCatalog === 'function') renderCatalog();
});