export function fmtUsd(n: number, decimals = 2) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals });
}

export function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
