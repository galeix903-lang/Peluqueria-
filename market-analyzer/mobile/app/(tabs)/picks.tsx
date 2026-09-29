import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { api } from '../../src/services/api';
import { colors, radius } from '../../src/theme';
import { fmtUsd } from '../../src/utils/format';

// Antes "Handpicked Bets" (un LLM inventaba una lectura "genérica pero
// plausible" de BTC/ETH sin ningún dato de precio real). Ahora es un
// Market Scanner real: escanea en vivo los activos con datos de mercado
// reales, con el mismo motor determinista del AI Analyzer — cero LLM,
// cero invención. Ver server/services/marketScanner.js.
const SIGNAL_META: Record<string, { icon: any; label: string; color: string }> = {
  BUY: { icon: 'arrow-up-right', label: 'Sesgo alcista', color: colors.green },
  SELL: { icon: 'arrow-down-right', label: 'Sesgo bajista', color: colors.red },
  WAIT: { icon: 'arrow-right', label: 'Neutral', color: colors.amber },
};
const TREND_LABEL: Record<string, string> = { BULLISH: 'Alcista', BEARISH: 'Bajista', SIDEWAYS: 'Lateral' };
const RISK_LABEL: Record<string, string> = { LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto' };
const RISK_COLOR: Record<string, string> = { LOW: colors.green, MEDIUM: colors.amber, HIGH: colors.red };

type ScanResult = {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  risk: string;
  price?: number;
  trend: string;
  mainReason: string;
};

export default function ScannerScreen() {
  const router = useRouter();
  const [results, setResults] = useState<ScanResult[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/picks')
      .then((data) => {
        setResults(data.results || []);
        setUnavailable(!!data.unavailable);
        setUpdatedAt(data.updatedAt || null);
      })
      .catch(() => setError('No se pudo escanear el mercado.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Screen title="Market Scanner" subtitle="Escaneo en vivo con datos de mercado reales.">
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : unavailable || results.length === 0 ? (
        <View style={styles.emptyCard}>
          <Feather name="alert-triangle" size={20} color={colors.amber} />
          <Text style={styles.emptyText}>
            No se han podido obtener datos de mercado en tiempo real en este momento. El escáner nunca muestra una
            lectura inventada — inténtalo de nuevo en unos minutos.
          </Text>
        </View>
      ) : (
        <>
          {updatedAt ? <Text style={styles.updatedText}>Actualizado {new Date(updatedAt).toLocaleTimeString('es-ES')}</Text> : null}
          {results.map((r) => {
            const sig = SIGNAL_META[r.signal] || SIGNAL_META.WAIT;
            return (
              <TouchableOpacity key={r.symbol} style={styles.card} onPress={() => router.push('/analyzer')}>
                <View style={styles.head}>
                  <Text style={styles.symbol}>{r.symbol}</Text>
                  <View style={[styles.signalBadge, { backgroundColor: `${sig.color}22` }]}>
                    <Feather name={sig.icon} size={12} color={sig.color} />
                    <Text style={[styles.signalBadgeText, { color: sig.color }]}>{sig.label}</Text>
                  </View>
                </View>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}><Text style={styles.badgeText}>{TREND_LABEL[r.trend] || r.trend}</Text></View>
                  <View style={styles.badge}><Text style={styles.badgeText}>Confianza {r.confidence}%</Text></View>
                  <View style={[styles.badge, { backgroundColor: `${RISK_COLOR[r.risk] || colors.textDim}22` }]}>
                    <Text style={[styles.badgeText, { color: RISK_COLOR[r.risk] || colors.textDim }]}>Riesgo {RISK_LABEL[r.risk] || r.risk}</Text>
                  </View>
                  {r.price ? <View style={styles.badge}><Text style={styles.badgeText}>{fmtUsd(r.price)}</Text></View> : null}
                </View>
                <Text style={styles.reason}>{r.mainReason}</Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular' },
  updatedText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 12 },
  emptyCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.md,
    backgroundColor: colors.amberBg, marginTop: 12,
  },
  emptyText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 19 },
  card: {
    padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 12,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  symbol: { fontSize: 16, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  signalBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  signalBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: { backgroundColor: colors.fieldBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textDim },
  reason: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 19 },
});
