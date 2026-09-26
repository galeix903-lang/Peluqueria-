import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

/*
  Estado honesto para lo que todavía no está conectado a datos reales en
  esta fase (Fase 0: solo scaffold + navegación + marca). Nunca se
  simulan números ni se finge una función que aún no existe — eso es lo
  que este mismo proyecto ya aprendió a evitar en la web (ver auditoría:
  "no inventes funcionalidades que no existan").
*/
export function PendingCard({ icon, message }: { icon: keyof typeof Feather.glyphMap; message: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={22} color={colors.accent} />
      </View>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: colors.textDim,
    paddingTop: 8,
  },
});
