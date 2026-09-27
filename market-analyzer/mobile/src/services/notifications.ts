import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api, ApiError } from './api';

// Mientras la app está abierta, muestra la notificación igual que si
// llegara con la app cerrada (banner + sonido) en vez de tragársela en
// silencio, que es el comportamiento por defecto de expo-notifications.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushSetupResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'no_device' | 'permission_denied' | 'no_project_id' | 'error'; message: string };

// Registra este dispositivo para notificaciones push reales. Nunca
// finge un éxito: si falta el projectId de EAS (solo existe tras
// `eas init` con la cuenta de Expo del propio usuario) o el dispositivo
// es un simulador/emulador sin Google Play Services, se devuelve un
// motivo claro para que la pantalla de Perfil pueda explicarlo en vez
// de mostrar un simple "activado" que no sería cierto.
export async function setupPushNotifications(): Promise<PushSetupResult> {
  if (!Device.isDevice) {
    return { ok: false, reason: 'no_device', message: 'Las notificaciones push solo funcionan en un dispositivo físico, no en un simulador.' };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'permission_denied', message: 'No has dado permiso de notificaciones. Actívalo desde los ajustes del sistema.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#6366f1',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return {
      ok: false,
      reason: 'no_project_id',
      message: 'Esta build todavía no tiene un proyecto de EAS configurado (falta ejecutar "eas init"), así que no se puede obtener un token de notificaciones push real.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/api/notifications/register-token', { token, platform: Platform.OS });
    return { ok: true, token };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'No se pudo registrar el dispositivo para notificaciones.';
    return { ok: false, reason: 'error', message };
  }
}

export async function disablePushNotifications(token: string): Promise<void> {
  try {
    await api.del('/api/notifications/register-token', { token });
  } catch {
    // Best-effort: si falla, el token simplemente queda registrado en el
    // backend hasta que Expo lo marque como no válido tras un envío.
  }
}

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  try {
    await api.post('/api/notifications/test');
    return { ok: true, message: 'Notificación de prueba enviada. Debería llegarte en unos segundos.' };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'No se pudo enviar la notificación de prueba.';
    return { ok: false, message };
  }
}
