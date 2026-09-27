import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';
import { VantexMark } from '../../src/components/VantexMark';
import { useAuth } from '../../src/state/AuthContext';
import { colors, gradients, radius } from '../../src/theme';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <Screen title="Vantex.AI" subtitle="Analiza. Practica. Sigue.">
      <LinearGradient colors={gradients.brand} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <VantexMark size={44} />
        <Text style={styles.heroTitle}>{user ? `Hola, ${user.name}` : 'Bienvenido a Vantex'}</Text>
        <Text style={styles.heroBody}>
          El saldo y el P&L en vivo se ven en la pestaña Trading — aquí solo el acceso rápido a cada herramienta.
        </Text>
      </LinearGradient>

      <Text style={styles.sectionLabel}>Herramientas</Text>
      <View style={styles.grid}>
        <ToolCard icon="cpu" label="AI Analyzer" onPress={() => router.push('/analyzer')} />
        <ToolCard icon="trending-up" label="Paper Trading" onPress={() => router.push('/trading')} />
        <ToolCard icon="star" label="Handpicked Bets" onPress={() => router.push('/picks')} />
        <ToolCard icon="search" label="Wallet Tracker" onPress={() => router.push('/wallet')} />
        <ToolCard icon="users" label="Copy Trading" onPress={() => router.push('/copy')} />
      </View>

      <Text style={styles.sectionLabel}>Estado de esta fase</Text>
      <PendingCard
        icon="check-circle"
        message="Fase 6: ya puedes editar tu nombre, bio y foto de perfil de verdad. Solo quedan recuperar contraseña y las compras dentro de la app, que requieren un servicio de email y cuentas propias de Apple/Google respectivamente."
      />
    </Screen>
  );
}

function ToolCard({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.toolCard} onPress={onPress}>
      <View style={styles.toolIconWrap}>
        <Feather name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
    </TouchableOpacity>
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
