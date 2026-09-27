import Svg, { Polyline } from 'react-native-svg';
import { colors } from '../theme';

/*
  Mini gráfico de línea a partir del histórico corto real que ya expone
  el backend (GET /api/trading/chart/:symbol — hasta 40 muestras reales,
  nunca inventadas). Mismo nivel de detalle que el sparkline de la web
  (SVG propio, sin librería de gráficos de terceros).
*/
export function Sparkline({ points, width = 320, height = 56 }: { points: number[]; width?: number; height?: number }) {
  if (!points || points.length < 2) {
    return <Svg width={width} height={height} />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={coords} fill="none" stroke={colors.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
