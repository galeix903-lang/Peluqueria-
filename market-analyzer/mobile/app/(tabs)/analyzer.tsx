import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';

export default function AnalyzerScreen() {
  return (
    <Screen title="AI Analyzer" subtitle="Sube la captura de un gráfico y recibe una lectura técnica.">
      <PendingCard
        icon="camera"
        message="La cámara/galería para subir capturas y la llamada real al analizador (mismo servicio que la web) se conectan en la Fase 3 del roadmap."
      />
    </Screen>
  );
}
