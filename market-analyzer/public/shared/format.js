/*
  Helpers de formato numérico compartidos — antes vivían duplicados
  dentro de trading/index.html. animateNumber() hace que un balance/P&L
  cambie con una pequeña transición en vez de un salto seco, sin
  necesitar ninguna librería.
*/
// Los nombres de usuario son texto libre que en varios sitios se inserta
// vía innerHTML (para poder combinarlo con iconos/markup) — hay que
// escaparlo primero para que un nombre malicioso no pueda inyectar HTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtUsd(n) {
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

// Precio POR UNIDAD de un activo — a diferencia de fmtUsd() (pensado para
// totales: saldo, P&L, valor de una posición, donde 2 decimales siempre
// tiene sentido), el precio unitario de una memecoin puede ser una
// fracción de centavo (p.ej. 0,0000129$). Forzar 2 decimales ahí lo
// redondearía a "0,00", borrando el dato — aquí se amplían los decimales
// solo cuando de verdad hace falta, dejando el resto de precios exactamente
// igual que con fmtUsd().
function fmtPrice(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && Math.abs(value) < 0.005) {
    const decimals = Math.min(10, Math.max(4, -Math.floor(Math.log10(Math.abs(value))) + 3));
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function fmtPct(n, { signed = true } = {}) {
  const value = Number(n);
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}

function animateNumber(el, from, to, { duration = 550, format = (n) => n.toFixed(2), onDone } = {}) {
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(to - from) < 1e-9) {
    el.textContent = format(to);
    if (onDone) onDone();
    return;
  }
  const start = performance.now();
  const diff = to - from;
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = format(from + diff * eased);
    if (t < 1) requestAnimationFrame(tick);
    else if (onDone) onDone();
  }
  requestAnimationFrame(tick);
}
