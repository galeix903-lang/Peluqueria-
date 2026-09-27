import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ActivityIndicator, Image, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { PendingCard } from '../../src/components/PendingCard';
import { useAuth } from '../../src/state/AuthContext';
import { ApiError } from '../../src/services/api';
import { colors, radius } from '../../src/theme';
import { fmtUsd } from '../../src/utils/format';
import { preferences } from '../../src/services/preferences';
import { disablePushNotifications, sendTestNotification, setupPushNotifications } from '../../src/services/notifications';

const PLAN_LABEL: Record<string, string> = { free: 'Gratis', plus: 'Pro', pro: 'Business' };
const BIO_MAX = 160;
// Límite del backend (server/routes/auth.js): 400.000 caracteres de data
// URL en base64. Se deja margen de sobra reduciendo la foto a 400px de
// ancho antes de codificarla — un avatar nunca necesita más resolución.
const AVATAR_MAX_WIDTH = 400;

export default function ProfileScreen() {
  const { user, logout, updateProfile } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | null | undefined>(undefined); // undefined = sin cambios
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  function startEditing() {
    if (!user) return;
    setDraftName(user.name);
    setDraftBio(user.bio || '');
    setDraftAvatar(undefined);
    setEditError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditError(null);
  }

  async function pickAvatar(source: 'camera' | 'library') {
    setEditError(null);
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setEditError('Necesitas dar permiso de ' + (source === 'camera' ? 'cámara' : 'galería') + ' para cambiar la foto.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]) return;

    setAvatarBusy(true);
    try {
      const manipulated = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: AVATAR_MAX_WIDTH } }],
        { compress: 0.7, format: SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) throw new Error('No se pudo procesar la imagen.');
      setDraftAvatar(`data:image/jpeg;base64,${manipulated.base64}`);
    } catch {
      setEditError('No se pudo procesar la foto. Prueba con otra.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveProfile() {
    if (!user) return;
    const name = draftName.trim();
    if (!name) {
      setEditError('El nombre no puede estar vacío.');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const patch: { name?: string; bio?: string | null; avatar?: string | null } = {};
      if (name !== user.name) patch.name = name;
      const bio = draftBio.trim();
      if (bio !== (user.bio || '')) patch.bio = bio || null;
      if (draftAvatar !== undefined) patch.avatar = draftAvatar;
      if (Object.keys(patch).length > 0) {
        await updateProfile(patch);
      }
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null; // RootLayoutNav redirige a /login antes de que esto se pinte

  const avatarPreview = draftAvatar !== undefined ? draftAvatar : user.avatar;

  return (
    <Screen title="Perfil" subtitle="Cuenta, plan y ajustes.">
      {!editing ? (
        <View style={styles.card}>
          {user.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            {user.bio ? <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text> : null}
          </View>
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{PLAN_LABEL[user.plan] || user.plan}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.editCard}>
          <View style={styles.avatarEditRow}>
            {avatarBusy ? (
              <View style={styles.avatar}><ActivityIndicator color="#fff" /></View>
            ) : avatarPreview ? (
              <Image source={{ uri: avatarPreview }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{draftName.charAt(0).toUpperCase() || '?'}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.avatarBtn} onPress={() => pickAvatar('library')} disabled={avatarBusy}>
                  <Feather name="image" size={13} color={colors.accent} />
                  <Text style={styles.avatarBtnText}>Galería</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.avatarBtn} onPress={() => pickAvatar('camera')} disabled={avatarBusy}>
                  <Feather name="camera" size={13} color={colors.accent} />
                  <Text style={styles.avatarBtnText}>Cámara</Text>
                </TouchableOpacity>
              </View>
              {(user.avatar || draftAvatar) && draftAvatar !== null && (
                <TouchableOpacity onPress={() => setDraftAvatar(null)} disabled={avatarBusy}>
                  <Text style={styles.removeAvatarText}>Quitar foto</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Tu nombre"
            placeholderTextColor={colors.textDim}
            maxLength={60}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.label}>Bio (opcional)</Text>
            <Text style={styles.charCount}>{draftBio.length}/{BIO_MAX}</Text>
          </View>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={draftBio}
            onChangeText={(t) => setDraftBio(t.slice(0, BIO_MAX))}
            placeholder="Una frase corta sobre ti"
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={BIO_MAX}
          />

          {editError ? <Text style={styles.error}>{editError}</Text> : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEditing} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving || avatarBusy}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!editing && (
        <TouchableOpacity style={styles.editProfileBtn} onPress={startEditing}>
          <Feather name="edit-2" size={13} color={colors.accent} />
          <Text style={styles.editProfileBtnText}>Editar perfil</Text>
        </TouchableOpacity>
      )}

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
        message="Gestionar la suscripción se conecta más adelante (ya existe en la web: el portal de Stripe). Las compras dentro de la app requieren StoreKit/Play Billing — ver mobile/SUBSCRIPTIONS.md."
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
    backgroundColor: colors.surface, marginBottom: 12,
  },
  editCard: {
    padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 12, gap: 10,
  },
  avatarEditRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarInitial: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
  avatarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg,
  },
  avatarBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.accent },
  removeAvatarText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.red },
  name: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text },
  email: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 },
  bio: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 4, lineHeight: 16 },
  planBadge: { backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  planBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.accent },
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.fieldBg, marginBottom: 16,
  },
  editProfileBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.accent },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 6 },
  charCount: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text,
  },
  bioInput: { minHeight: 60, textAlignVertical: 'top', fontFamily: 'Inter_400Regular' },
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular' },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.fieldBg,
  },
  cancelBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.textDim },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', backgroundColor: colors.accent },
  saveBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
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
