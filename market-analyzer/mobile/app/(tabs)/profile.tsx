import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';

export default function ProfileScreen() {
  return (
    <Screen title="Perfil" subtitle="Cuenta, plan y ajustes.">
      <PendingCard
        icon="log-in"
        message="Login/signup/logout, sesión persistente y el plan de suscripción se conectan en la Fase 2 (auth por token contra el backend real)."
      />
    </Screen>
  );
}
