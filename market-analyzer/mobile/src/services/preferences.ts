import AsyncStorage from '@react-native-async-storage/async-storage';

/*
  Solo preferencias no sensibles (nunca tokens ni credenciales, eso vive
  en authStorage.ts sobre SecureStore): último símbolo usado en Trading
  y si el usuario ha activado las notificaciones. Se pierden si el
  usuario borra los datos de la app, y eso está bien — no son datos
  críticos.
*/
const KEYS = {
  lastSymbol: 'vantex:prefs:lastSymbol',
  notificationsEnabled: 'vantex:prefs:notificationsEnabled',
};

async function getLastSymbol(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.lastSymbol);
  } catch {
    return null;
  }
}

async function setLastSymbol(symbol: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.lastSymbol, symbol);
  } catch {
    // Preferencia no crítica: si falla el almacenamiento, se ignora.
  }
}

async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.notificationsEnabled);
    return v === 'true';
  } catch {
    return false;
  }
}

async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.notificationsEnabled, enabled ? 'true' : 'false');
  } catch {
    // Preferencia no crítica: si falla el almacenamiento, se ignora.
  }
}

export const preferences = {
  getLastSymbol,
  setLastSymbol,
  getNotificationsEnabled,
  setNotificationsEnabled,
};
