import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/state/AuthContext';
import { ApiError } from '../../src/services/api';
import { VantexMark } from '../../src/components/VantexMark';
import { colors, radius } from '../../src/theme';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email || !password) {
      setError('Rellena email y contraseña.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signup(email.trim(), password, name.trim() || undefined);
      } else {
        await login(email.trim(), password);
      }
      // La redirección a las tabs la hace RootLayoutNav en cuanto detecta `user`.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ha ocurrido un error inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <VantexMark size={40} />
            <Text style={styles.brandName}>
              Vantex<Text style={{ opacity: 0.55 }}>.Ai</Text>
            </Text>
          </View>
          <Text style={styles.tagline}>Analiza. Practica. Sigue.</Text>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => { setMode('login'); setError(null); }}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Iniciar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => { setMode('signup'); setError(null); }}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heading}>{mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</Text>
          <Text style={styles.subheading}>
            {mode === 'login' ? 'Introduce tus datos para continuar.' : 'Empieza en menos de un minuto.'}
          </Text>

          {mode === 'signup' && (
            <View style={styles.field}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@email.com"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={submitting}>
            <Text style={styles.submitBtnText}>
              {submitting ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 48, flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 },
  brandName: { fontSize: 22, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  tagline: { textAlign: 'center', fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 28 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.fieldBg, borderRadius: radius.pill, padding: 4, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textDim },
  tabTextActive: { color: colors.text },
  heading: { fontSize: 22, fontFamily: 'Inter_800ExtraBold', color: colors.text, textAlign: 'center' },
  subheading: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.text,
  },
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 12, textAlign: 'center' },
  submitBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
});
