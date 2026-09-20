/*
  Pinta el sidebar + la barra superior en cada página protegida, y hace de
  guardia de sesión: si /api/auth/me devuelve 401, redirige a /login antes
  de mostrar nada. Cada página solo necesita:
    <div data-app-shell data-page="dashboard"></div>
  y llamar a mountShell({ title: '...', content: elementoOContenidoHTML }).
*/
// Cada herramienta lleva el mismo color que su tarjeta en el dashboard,
// para que el sidebar funcione como un mini-mapa de "logos" reconocibles
// en vez de iconos grises sin identidad.
const NAV_ITEMS = [
  { page: 'dashboard', href: '/dashboard', label: 'Inicio', icon: 'home', gradient: 'linear-gradient(135deg, #4f46e5, #7c72f0)' },
  { page: 'analyzer', href: '/analyzer', label: 'AI Analyzer', icon: 'wand', gradient: 'linear-gradient(135deg, #4f46e5, #7c72f0)' },
  { page: 'picks', href: '/picks', label: 'Handpicked Bets', icon: 'star', gradient: 'linear-gradient(135deg, #f59e0b, #f97316)' },
  { page: 'trading', href: '/trading', label: 'Paper Trading', icon: 'chartBar', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
];

// El set de iconos vive en shared/icons.js (vantexIcon) — antes había un
// set duplicado aquí, unificado en el rediseño de producto.
function icon(name) {
  return vantexIcon(name, { size: 24 });
}

async function mountShell({ page, title }) {
  const root = document.querySelector('[data-app-shell]');
  let user;
  try {
    ({ user } = await api('/auth/me'));
  } catch (e) {
    window.location.href = '/login';
    return null;
  }

  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <a class="sidebar__logo" href="/dashboard" title="Vantex">${icon('trend')}</a>
        <nav class="sidebar__nav">
          ${NAV_ITEMS.map((item) => `
            <a class="sidebar__link ${item.page === page ? 'is-active' : ''}" href="${item.href}" style="--link-gradient:${item.gradient};" data-label="${item.label}" aria-label="${item.label}">
              ${icon(item.icon)}
            </a>
          `).join('')}
        </nav>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1>${title}</h1>
          <div class="topbar__user">
            ${user.plan === 'pro'
              ? '<span class="badge" style="background:#fef3e0; color:#b45309;" data-plan-badge title="Gestionar suscripción">★ PRO</span>'
              : '<button class="btn-primary" data-upgrade-btn>Upgrade!</button>'}
            <span class="topbar__name">${user.name}</span>
            <span class="avatar" title="${user.name}">${user.name.charAt(0).toUpperCase()}</span>
            <button class="btn-logout" data-logout>Cerrar sesión</button>
          </div>
        </div>
        <div class="content" data-shell-content></div>
      </div>
    </div>
  `;

  root.querySelector('[data-logout]').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  const upgradeBtn = root.querySelector('[data-upgrade-btn]');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', async () => {
      upgradeBtn.disabled = true;
      upgradeBtn.innerHTML = '<span class="spinner"></span> Un momento…';
      try {
        const { url } = await api('/billing/checkout', { method: 'POST' });
        window.location.href = url;
      } catch (e) {
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = 'Upgrade!';
      }
    });
  }
  const planBadge = root.querySelector('[data-plan-badge]');
  if (planBadge) {
    planBadge.style.cursor = 'pointer';
    planBadge.addEventListener('click', async () => {
      const { url } = await api('/billing/portal', { method: 'POST' });
      window.location.href = url;
    });
  }

  return { user, contentEl: root.querySelector('[data-shell-content]') };
}
