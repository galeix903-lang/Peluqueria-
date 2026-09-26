import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';

export default function TradingScreen() {
  return (
    <Screen title="Paper Trading" subtitle="Practica con saldo virtual y precios reales.">
      <PendingCard
        icon="bar-chart-2"
        message="El ticket de orden, el gráfico táctil con gestos/zoom y los datos de precio reales se conectan en la Fase 4 del roadmap."
      />
    </Screen>
  );
}
