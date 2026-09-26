import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';
import { useAuth } from '../../src/state/AuthContext';
import { colors, radius } from '../../src/theme';

const PLAN_LABEL: Record<string, string> = { free: 'Gratis', plus: 'Pro', pro: 'Business' };

function fmtUsd(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  if (!user) return null; // RootLayoutNav redirige a /login antes de que esto se pinte

  return (
    <Screen title="Perfil" subtitle="Cuenta, plan y ajustes.">
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{PLAN_LABEL[user.plan] || user.plan}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Saldo (paper trading)</Text>
          <Text style={styles.statValue}>{fmtUsd(user.balance)}</Text>
        </View>
      </View>

      <PendingCard
        icon="settings"
        message="Editar nombre/bio/foto y gestionar la suscripción se conectan en la siguiente fase (ya existen en la web: PATCH /api/auth/me y el portal de Stripe)."
      />

      <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()}>
        <Feather name="log-out" size={16} color={colors.red} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 16,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text },
  email: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 },
  planBadge: { backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  planBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.accent },
  row: { marginBottom: 16 },
  stat: {
    padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg,
  },
  statLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 4 },
  statValue: { fontSize: 20, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.redBg, backgroundColor: colors.redBg,
  },
  logoutText: { color: colors.red, fontSize: 14, fontFamily: 'Inter_700Bold' },
});
