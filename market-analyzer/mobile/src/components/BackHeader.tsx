import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';

// Cabecera con botón de volver, para las pantallas fuera de las tabs
// (Wallet Tracker / Copy Trading) a las que se llega desde las
// tarjetas de Inicio, no desde la barra inferior.
export function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <Feather name="arrow-left" size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.fieldBg, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  title: { fontSize: 24, fontFamily: 'Inter_800ExtraBold', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 },
});
