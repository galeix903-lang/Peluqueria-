import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';
import { VantexMark } from '../../src/components/VantexMark';
import { useAuth } from '../../src/state/AuthContext';
import { colors, gradients, radius } from '../../src/theme';

export default function HomeScreen() {
  const { user } = useAuth();
  return (
    <Screen title="Vantex.AI" subtitle="Analiza. Practica. Sigue.">
      <LinearGradient colors={gradients.brand} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <VantexMark size={44} />
        <Text style={styles.heroTitle}>{user ? `Hola, ${user.name}` : 'Bienvenido a Vantex'}</Text>
        <Text style={styles.heroBody}>
          El resumen de tu cuenta (saldo, P&L, posiciones abiertas) se conecta en la
          siguiente fase, cuando las pantallas de Trading/Analyzer lean datos reales
          — el login ya es real (ver la pestaña Perfil), no se muestran cifras de
          ejemplo aquí.
        </Text>
      </LinearGradient>

      <Text style={styles.sectionLabel}>Herramientas</Text>
      <View style={styles.grid}>
        <ToolCard icon="cpu" label="AI Analyzer" />
        <ToolCard icon="trending-up" label="Paper Trading" />
        <ToolCard icon="star" label="Handpicked Bets" />
        <ToolCard icon="search" label="Wallet Tracker" />
        <ToolCard icon="users" label="Copy Trading" />
      </View>

      <Text style={styles.sectionLabel}>Estado de esta fase</Text>
      <PendingCard
        icon="server"
        message="Fase 2: login, sesión persistente y perfil ya son reales (backend en Postgres, mismo que la web). Analyzer/Trading/Picks/Wallet/Copy se conectan en las fases siguientes."
      />
    </Screen>
  );
}

function ToolCard({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={styles.toolCard}>
      <View style={styles.toolIconWrap}>
        <Feather name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 24,
    gap: 10,
  },
  heroTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#fff', marginTop: 6 },
  heroBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.88)' },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  toolCard: {
    width: '47%',
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
  },
  toolIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.text },
});
