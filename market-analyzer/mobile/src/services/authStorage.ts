import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/*
  Guarda los tokens de sesión (access + refresh) cifrados en el
  keychain/keystore del dispositivo (expo-secure-store) — nunca en
  AsyncStorage, que no está pensado para credenciales. SecureStore no
  existe en el target web (solo iOS/Android nativo); ahí se cae a
  localStorage únicamente para poder previsualizar la app en el
  navegador durante el desarrollo — un build real para App Store/Play
  Store siempre usa SecureStore.
*/
const ACCESS_KEY = 'cryptolyzer_access_token';
const REFRESH_KEY = 'cryptolyzer_refresh_token';

const isWeb = Platform.OS === 'web';

async function setItem(key: string, value: string) {
  if (isWeb) {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (isWeb) {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Promise.all([setItem(ACCESS_KEY, accessToken), setItem(REFRESH_KEY, refreshToken)]);
}

export async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([getItem(ACCESS_KEY), getItem(REFRESH_KEY)]);
  return { accessToken, refreshToken };
}

export async function clearTokens() {
  await Promise.all([deleteItem(ACCESS_KEY), deleteItem(REFRESH_KEY)]);
}
