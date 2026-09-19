/*
  Pinta el sidebar + la barra superior en cada página protegida, y hace de
  guardia de sesión: si /api/auth/me devuelve 401, redirige a /login antes
  de mostrar nada. Cada página solo necesita:
    <div data-app-shell data-page="dashboard"></div>
  y llamar a mountShell({ title: '...', content: elementoOContenidoHTML }).
*/
const NAV_ITEMS = [
  { page: 'dashboard', href: '/dashboard', label: 'Inicio', icon: 'home' },
  { page: 'analyzer', href: '/analyzer', label: 'AI Analyzer', icon: 'wand' },
  { page: 'picks', href: '/picks', label: 'Handpicked Bets', icon: 'star' },
  { page: 'trading', href: '/trading', label: 'Paper Trading', icon: 'chart' },
];

const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9h12v-9" />',
  wand: '<path d="M15 4l5 5" /><path d="M4 20l9.5-9.5" /><path d="M14 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />',
  star: '<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6L12 3z" />',
  chart: '<path d="M4 20V10" /><path d="M11 20V4" /><path d="M18 20v-7" />',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
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
        <a class="sidebar__logo" href="/dashboard">V</a>
        <nav class="sidebar__nav">
          ${NAV_ITEMS.map((item) => `
            <a class="sidebar__link ${item.page === page ? 'is-active' : ''}" href="${item.href}" title="${item.label}">
              ${icon(item.icon)}
            </a>
          `).join('')}
        </nav>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1>${title}</h1>
          <div class="topbar__user">
            <span>${user.name}</span>
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

  return { user, contentEl: root.querySelector('[data-shell-content]') };
}
