import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { api } from '../../src/services/api';
import { colors, radius } from '../../src/theme';

const TREND_LABEL: Record<string, string> = { alcista: 'Alcista', bajista: 'Bajista', lateral: 'Lateral' };
const BIAS_LABEL: Record<string, string> = { compra: 'Compra', venta: 'Venta', esperar: 'Esperar' };
const BIAS_COLOR: Record<string, string> = { compra: colors.green, venta: colors.red, esperar: colors.amber };

type Pick = {
  id: string;
  symbol: string;
  trend: string;
  bias: string;
  confidence: number;
  summary: string;
  disclaimer: string;
  mock?: boolean;
  createdAt: string;
};

export default function PicksScreen() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/picks')
      .then((data) => setPicks(data.picks))
      .catch(() => setError('No se pudieron cargar los picks.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Screen title="Handpicked Bets" subtitle="Picks diarios generados por IA.">
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : picks.length === 0 ? (
        <Text style={styles.emptyText}>Todavía no hay picks generados.</Text>
      ) : (
        picks.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.symbol}>{p.symbol}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}><Text style={styles.badgeText}>{TREND_LABEL[p.trend] || p.trend}</Text></View>
                <View style={[styles.badge, { backgroundColor: `${BIAS_COLOR[p.bias]}22` }]}>
                  <Text style={[styles.badgeText, { color: BIAS_COLOR[p.bias] }]}>{BIAS_LABEL[p.bias] || p.bias}</Text>
                </View>
                {p.mock && <View style={styles.badge}><Text style={styles.badgeText}>Modo de ejemplo</Text></View>}
              </View>
            </View>
            <Text style={styles.confidenceLabel}>Confianza: {p.confidence}%</Text>
            <View style={styles.confidenceBar}>
              <View style={[styles.confidenceFill, { width: `${p.confidence}%` }]} />
            </View>
            <Text style={styles.summary}>{p.summary}</Text>
            <Text style={styles.disclaimer}>{p.disclaimer}</Text>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim },
  card: {
    padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 14,
  },
  head: { marginBottom: 10 },
  symbol: { fontSize: 16, fontFamily: 'Inter_800ExtraBold', color: colors.text, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { backgroundColor: colors.fieldBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textDim },
  confidenceLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 6 },
  confidenceBar: { height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 12 },
  confidenceFill: { height: '100%', backgroundColor: colors.accent },
  summary: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 19, marginBottom: 8 },
  disclaimer: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 15 },
});
