/*
  Renderizado del detalle de un análisis (quick summary + detalle completo
  con escenarios/niveles/riesgo) — antes vivía solo dentro de
  analyzer/index.html; se extrae aquí para que la página de Historial
  (primer nivel de navegación, no solo una lista dentro del Analyzer)
  pueda mostrar exactamente el mismo detalle al reabrir un análisis
  pasado, sin duplicar el HTML/lógica.
*/
// Lenguaje de sesgo, no de orden de compra/venta: Vantex presenta
// escenarios y probabilidades, nunca una certeza sobre el futuro.
const REAL_DATA_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
const SIGNAL_META = {
  BUY: { icon: 'arrowUp', label: 'Sesgo alcista', cls: 'buy' },
  SELL: { icon: 'arrowDown', label: 'Sesgo bajista', cls: 'sell' },
  WAIT: { icon: 'arrowRight', label: 'Neutral', cls: 'wait' },
};
const TREND_LABEL = { BULLISH: 'Alcista', BEARISH: 'Bajista', SIDEWAYS: 'Lateral' };
const MOMENTUM_LABEL = { POSITIVE: 'Positivo', NEGATIVE: 'Negativo', NEUTRAL: 'Neutral', UNAVAILABLE: 'No disponible' };
const VOLUME_LABEL = { CONFIRMING: 'Confirmando', WEAK: 'Débil', UNAVAILABLE: 'No disponible' };
const STRUCTURE_LABEL = { BULLISH: 'Alcista', BEARISH: 'Bajista', MIXED: 'Mixta', UNAVAILABLE: 'No disponible' };
const RISK_LABEL = { LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto' };

function levelsScale(support, resistance) {
  const levels = [
    ...(support || []).map((v) => ({ v, type: 'support' })),
    ...(resistance || []).map((v) => ({ v, type: 'resistance' })),
  ];
  if (!levels.length) return '';
  const values = levels.map((l) => l.v);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const marks = levels.map((l) => {
    const pct = ((l.v - min) / span) * 100;
    return `
      <div class="levels-scale__mark levels-scale__mark--${l.type}" style="left:${pct}%;">
        <div class="levels-scale__mark-dot"></div>
        <div class="levels-scale__mark-label">${l.v.toLocaleString('es-ES')}</div>
      </div>
    `;
  }).join('');
  return `<div class="levels-scale">${marks}<div class="levels-scale__track"></div></div>`;
}

function fmtLevel(v) { return v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: v >= 100 ? 0 : 4 }); }

function keySignalLine(a) {
  // Las 3 señales clave de la tarjeta rápida: solo se listan las que de
  // verdad se evaluaron (nunca "Volumen: no disponible" ocupando un
  // hueco en la lectura de 5 segundos si no aporta nada).
  const lines = [];
  if (a.momentum && a.momentum !== 'UNAVAILABLE') lines.push(`Momentum ${MOMENTUM_LABEL[a.momentum]?.toLowerCase() || a.momentum.toLowerCase()}`);
  if (a.trend) lines.push(`Tendencia ${(TREND_LABEL[a.trend] || a.trend).toLowerCase()}`);
  if (a.volume && a.volume !== 'UNAVAILABLE') lines.push(`Volumen ${VOLUME_LABEL[a.volume]?.toLowerCase() || a.volume.toLowerCase()}`);
  return lines;
}

function analysisDetailHtml(a) {
  const sig = SIGNAL_META[a.signal] || SIGNAL_META.WAIT;
  const isReal = a.source === 'REAL_DATA';
  const scenarios = a.scenarios || {};
  const keyLevels = scenarios.keyLevels || {};
  const canSimulate = isReal && REAL_DATA_SYMBOLS.includes(a.asset);

  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
      <div>
        <div style="font-weight:800; font-size:1.1rem;">${a.asset}</div>
        <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
          ${a.timeframe ? `<span class="badge" style="background:var(--field-bg); color:var(--text-dim);">${a.timeframe}</span>` : ''}
          ${a.mock ? '<span class="badge badge--mock">Modo de ejemplo</span>' : ''}
        </div>
      </div>
    </div>

    <!-- QUICK SUMMARY: se entiende en 5 segundos -->
    <div class="signal-hero signal-hero--${sig.cls}">
      <div class="signal-hero__label">${vantexIcon(sig.icon, { size: 26 })} ${sig.label}</div>
      <div class="signal-hero__confidence">${a.confidence}% de confianza</div>
      ${keySignalLine(a).length ? `
        <div class="signal-hero__keysignals">
          ${keySignalLine(a).map((l) => `<span>${vantexIcon('check', { size: 12 })}${l}</span>`).join('')}
        </div>
      ` : ''}
    </div>

    <div class="source-note ${isReal ? '' : 'source-note--visual'}">
      ${vantexIcon(isReal ? 'check' : 'alertTriangle', { size: 15 })}
      <span>${isReal
        ? 'Calculado con datos de mercado reales (velas OHLCV, RSI, MACD, EMA, estructura de precio) — sin intervención de un modelo de lenguaje en la decisión.'
        : 'Lectura visual de la imagen: no verificada con datos de mercado en tiempo real. Trátala como una aproximación, no como un hecho.'}</span>
    </div>

    ${canSimulate ? `
      <button type="button" class="btn-secondary" data-simulate-btn style="margin-bottom:18px; width:100%; justify-content:center;">
        ${vantexIcon('windowLayout', { size: 15 })} Simular este escenario en Paper Trading
      </button>
    ` : ''}

    <div class="detail-divider"><span>Análisis detallado</span></div>

    ${a.isChart === false ? '' : `
    <div class="signal-facts">
      <div class="signal-fact"><div class="label">Tendencia</div><div class="value">${TREND_LABEL[a.trend] || a.trend}</div></div>
      <div class="signal-fact"><div class="label">Momentum</div><div class="value">${MOMENTUM_LABEL[a.momentum] || a.momentum}</div></div>
      <div class="signal-fact"><div class="label">Volumen</div><div class="value">${VOLUME_LABEL[a.volume] || a.volume}</div></div>
      <div class="signal-fact"><div class="label">Estructura</div><div class="value">${STRUCTURE_LABEL[a.structure] || a.structure}</div></div>
    </div>
    `}

    ${(a.reasons || []).length ? `
      <div class="detail-block">
        <div class="detail-block__title">Por qué</div>
        <ul style="margin:0; padding-left:20px; line-height:1.6;">
          ${a.reasons.map((r) => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    ${a.isChart === false ? '' : `
    <div class="detail-block">
      <div class="detail-block__title">Niveles clave</div>
      ${levelsScale(a.support, a.resistance)}
      <div class="result-grid">
        <div><div class="label">Soportes</div><div class="value">${(a.support || []).map(fmtLevel).join(' · ') || '—'}</div></div>
        <div><div class="label">Resistencias</div><div class="value">${(a.resistance || []).map(fmtLevel).join(' · ') || '—'}</div></div>
        <div><div class="label">Zona de entrada</div><div class="value">${keyLevels.entryArea ? `$${fmtLevel(keyLevels.entryArea[0])} – $${fmtLevel(keyLevels.entryArea[1])}` : 'No disponible'}</div></div>
        <div><div class="label">Objetivos</div><div class="value">${(keyLevels.targets || []).map(fmtLevel).join(' · ') || '—'}</div></div>
      </div>
      ${a.price ? `<p class="text-meta" style="margin-top:8px;">Precio de referencia: $${fmtLevel(a.price)}</p>` : ''}
    </div>
    `}

    <div class="detail-block">
      <div class="detail-block__title">Escenarios</div>
      <div class="scenario-row"><span class="scenario-row__tag scenario-row__tag--primary">Principal</span><span>${scenarios.primary || 'No disponible.'}</span></div>
      ${scenarios.alternative ? `<div class="scenario-row"><span class="scenario-row__tag scenario-row__tag--alt">Alternativo</span><span>${scenarios.alternative}</span></div>` : ''}
      ${scenarios.invalidation ? `<div class="scenario-row"><span class="scenario-row__tag scenario-row__tag--invalid">Invalidación</span><span>${scenarios.invalidation}</span></div>` : ''}
    </div>

    <div class="detail-block">
      <div class="detail-block__title">Riesgo</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <span class="badge badge--${(a.risk || 'medium').toLowerCase()}">${RISK_LABEL[a.risk] || a.risk}</span>
        ${keyLevels.riskContext ? `<span style="font-size:.8125rem; color:var(--text-dim);">${keyLevels.riskContext}</span>` : ''}
      </div>
    </div>

    ${a.summary && a.summary !== a.mainReason ? `
      <div class="detail-block">
        <div class="detail-block__title">${isReal ? 'Nota' : 'Explicación de la IA'}</div>
        <p style="line-height:1.5; color:var(--text-dim); margin:0;">${a.summary}</p>
      </div>
    ` : ''}
    <p class="disclaimer">${a.disclaimer}</p>
  `;
}

// Pinta el detalle dentro de `container` y cablea el botón de "Simular"
// (si aplica). Se comparte entre analyzer/index.html e history/index.html
// para que reabrir un análisis pasado se vea exactamente igual que verlo
// recién generado.
function renderAnalysisDetail(container, a) {
  container.innerHTML = analysisDetailHtml(a);
  const scenarios = a.scenarios || {};
  const keyLevels = scenarios.keyLevels || {};
  const simulateBtn = container.querySelector('[data-simulate-btn]');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', () => {
      const params = new URLSearchParams({
        symbol: a.asset, side: a.signal === 'SELL' ? 'short' : 'long',
      });
      if (keyLevels.invalidation != null) params.set('stopLoss', keyLevels.invalidation);
      if (keyLevels.targets && keyLevels.targets[0] != null) params.set('takeProfit', keyLevels.targets[0]);
      location.href = `/trading?${params.toString()}`;
    });
  }
}

// Lista de tarjetas clicables (mismo look en el mini-historial del
// Analyzer y en la página de Historial completa) — `onSelect(analysis)`
// decide qué hacer al pulsar una.
function renderAnalysisList(container, analyses, onSelect) {
  if (!analyses.length) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${analyses.map((a, i) => `
        <button type="button" class="data-card" data-history-item="${a.id}" style="animation-delay:${Math.min(i, 12) * 0.04}s;">
          <div class="history-item">
            <div>
              <strong>${a.asset}</strong>
              <span class="badge badge--${(a.signal || 'wait').toLowerCase()}" style="margin-left:8px;">${(SIGNAL_META[a.signal] || SIGNAL_META.WAIT).label}</span>
              <div class="history-item__meta">${new Date(a.createdAt).toLocaleString('es-ES')}${a.timeframe ? ' · ' + a.timeframe : ''}</div>
            </div>
            ${vantexIcon('chevronRight', { size: 16 })}
          </div>
        </button>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('[data-history-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = analyses.find((x) => x.id === btn.dataset.historyItem);
      if (a) onSelect(a);
    });
  });
}
