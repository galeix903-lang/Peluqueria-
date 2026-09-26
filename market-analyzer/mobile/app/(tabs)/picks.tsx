import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';

export default function PicksScreen() {
  return (
    <Screen title="Handpicked Bets" subtitle="Picks diarios generados por IA.">
      <PendingCard
        icon="list"
        message="El listado de picks (misma fuente que la web, con su aviso de que no está basado en precio en vivo) se conecta en la Fase 4 del roadmap."
      />
    </Screen>
  );
}
