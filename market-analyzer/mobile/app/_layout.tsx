import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { colors } from '../src/theme';
import { AuthProvider, useAuth } from '../src/state/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Protección de rutas: si no hay sesión, cualquier pantalla fuera de
// (auth) redirige al login; si ya hay sesión, (auth) redirige a las
// tabs. Patrón estándar de Expo Router (basado en useSegments), no una
// comprobación manual repetida en cada pantalla.
function useProtectedRoute(user: unknown, isLoading: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);
}

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  useProtectedRoute(user, isLoading);

  if (isLoading) return null; // el splash nativo sigue visible hasta que se sepa la sesión

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontsError) setFontsReady(true);
  }, [fontsLoaded, fontsError]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootLayoutNavWithSplash />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNavWithSplash() {
  const { isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync().catch(() => {});
  }, [isLoading]);
  return <RootLayoutNav />;
}
