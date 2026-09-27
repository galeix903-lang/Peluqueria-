import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';
import { useAuth } from '../../src/state/AuthContext';
import { colors, radius } from '../../src/theme';
import { fmtUsd } from '../../src/utils/format';
import { preferences } from '../../src/services/preferences';
import { disablePushNotifications, sendTestNotification, setupPushNotifications } from '../../src/services/notifications';

const PLAN_LABEL: Record<string, string> = { free: 'Gratis', plus: 'Pro', pro: 'Business' };

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  // Si ya estaban activadas en una sesión anterior, se vuelve a pedir el
  // token (idempotente en el backend, ver ON CONFLICT en store.js) para
  // tener el valor del token a mano y poder darlo de baja si el usuario
  // lo desactiva ahora; nunca se marca "activado" sin comprobarlo de verdad.
  useEffect(() => {
    preferences.getNotificationsEnabled().then(async (wasEnabled) => {
      if (!wasEnabled) return;
      const result = await setupPushNotifications();
      if (result.ok) {
        setNotifEnabled(true);
        setPushToken(result.token);
      } else {
        setNotifEnabled(false);
        await preferences.setNotificationsEnabled(false);
      }
    });
  }, []);

  async function onToggleNotifications(next: boolean) {
    setNotifStatus(null);
    setTestStatus(null);
    if (!next) {
      setNotifEnabled(false);
      await preferences.setNotificationsEnabled(false);
      if (pushToken) await disablePushNotifications(pushToken);
      setPushToken(null);
      return;
    }
    setNotifBusy(true);
    const result = await setupPushNotifications();
    setNotifBusy(false);
    if (result.ok) {
      setNotifEnabled(true);
      setPushToken(result.token);
      await preferences.setNotificationsEnabled(true);
    } else {
      setNotifEnabled(false);
      setNotifStatus(result.message);
      await preferences.setNotificationsEnabled(false);
    }
  }

  async function onTestNotification() {
    setTestBusy(true);
    setTestStatus(null);
    const result = await sendTestNotification();
    setTestBusy(false);
    setTestStatus(result.message);
  }

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

      <Text style={styles.sectionLabel}>Notificaciones</Text>
      <View style={styles.notifCard}>
        <View style={styles.notifRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifTitle}>Alertas de stop-loss / take-profit</Text>
            <Text style={styles.notifBody}>Avisa cuando una posición se cierra sola en Paper Trading.</Text>
          </View>
          {notifBusy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Switch
              value={notifEnabled}
              onValueChange={onToggleNotifications}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          )}
        </View>
        {notifStatus ? <Text style={styles.notifStatus}>{notifStatus}</Text> : null}

        <TouchableOpacity
          style={[styles.testBtn, !notifEnabled && styles.testBtnDisabled]}
          disabled={!notifEnabled || testBusy}
          onPress={onTestNotification}
        >
          {testBusy ? <ActivityIndicator color={colors.accent} /> : (
            <>
              <Feather name="bell" size={14} color={notifEnabled ? colors.accent : colors.textDim} />
              <Text style={[styles.testBtnText, !notifEnabled && { color: colors.textDim }]}>Enviarme una notificación de prueba</Text>
            </>
          )}
        </TouchableOpacity>
        {testStatus ? <Text style={styles.notifStatus}>{testStatus}</Text> : null}
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
  sectionLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  notifCard: {
    padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 16, gap: 10,
  },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text },
  notifBody: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2, lineHeight: 17 },
  notifStatus: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 17 },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg,
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.accent },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.redBg, backgroundColor: colors.redBg,
  },
  logoutText: { color: colors.red, fontSize: 14, fontFamily: 'Inter_700Bold' },
});
