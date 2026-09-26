import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

/*
  Envoltorio común a las 5 pantallas de las tabs: respeta las safe areas
  (notch/Dynamic Island/barra de gestos) y da la misma cabecera (título +
  subtítulo opcional) que ya usa cada página en la web, para que la
  jerarquía visual no diverja entre plataformas.
*/
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontFamily: 'Inter_800ExtraBold', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 4 },
});
