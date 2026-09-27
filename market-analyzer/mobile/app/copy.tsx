import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BackHeader } from '../src/components/BackHeader';
import { api, ApiError } from '../src/services/api';
import { colors, radius } from '../src/theme';
import { fmtUsd } from '../src/utils/format';

type Trader = {
  id: string;
  name: string;
  winRate: number;
  pnl30d: number;
  followers: number;
  symbols: string[];
  strategy: string;
  following: boolean;
};

type CopiedPosition = { id: string; symbol: string; side: string; size: number; entryPrice: number; status: string };

export default function CopyScreen() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [copiedPositions, setCopiedPositions] = useState<CopiedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  async function loadCopy() {
    try {
      const data = await api.get('/api/copy');
      setTraders(data.traders);
      setCopiedPositions(data.copiedPositions);
    } catch {
      setError('No se pudo cargar Copy Trading.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCopy();
  }, []);

  async function toggleFollow(trader: Trader) {
    setError(null);
    setUpgradeRequired(false);
    setBusyId(trader.id);
    try {
      if (trader.following) {
        await api.post(`/api/copy/${trader.id}/unfollow`);
      } else {
        await api.post(`/api/copy/${trader.id}/follow`);
      }
      await loadCopy();
    } catch (err) {
      if (err instanceof ApiError && (err as any).status === 402) {
        setUpgradeRequired(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo completar la acción.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BackHeader title="Copy Trading" subtitle="Sigue a traders modelo dentro del simulador." />

        <View style={styles.simBanner}>
          <Feather name="info" size={16} color={colors.amber} />
          <Text style={styles.simBannerText}>Simulado — sin fondos reales. Las posiciones copiadas se abren dentro de tu saldo virtual de Paper Trading.</Text>
        </View>

        {upgradeRequired && (
          <View style={styles.upsellCard}>
            <Text style={styles.upsellText}>
              Copy Trading es una función de los planes Pro y Business. Mejora tu plan desde la web mientras se
              preparan las compras dentro de la app.
            </Text>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : (
          traders.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.traderName}>{t.name}</Text>
                <TouchableOpacity
                  style={[styles.followBtn, t.following && styles.followBtnActive]}
                  onPress={() => toggleFollow(t)}
                  disabled={busyId === t.id}
                >
                  <Text style={[styles.followBtnText, t.following && styles.followBtnTextActive]}>
                    {busyId === t.id ? '…' : t.following ? 'Siguiendo' : 'Seguir'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Win rate</Text>
                  <Text style={styles.statValue}>{t.winRate}%</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>P&L 30d</Text>
                  <Text style={[styles.statValue, { color: t.pnl30d >= 0 ? colors.green : colors.red }]}>
                    {t.pnl30d >= 0 ? '+' : ''}{t.pnl30d}%
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Seguidores</Text>
                  <Text style={styles.statValue}>{t.followers}</Text>
                </View>
              </View>
              <Text style={styles.strategy}>{t.strategy}</Text>
              <View style={styles.symbolRow}>
                {t.symbols.map((s) => (
                  <View key={s} style={styles.symbolChip}><Text style={styles.symbolChipText}>{s}</Text></View>
                ))}
              </View>
            </View>
          ))
        )}

        {copiedPositions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Posiciones copiadas</Text>
            {copiedPositions.map((p) => (
              <View key={p.id} style={styles.posRow}>
                <Text style={styles.posSymbol}>{p.symbol}</Text>
                <Text style={styles.posDetail}>{p.side === 'long' ? 'Compra' : 'Venta'} · {p.size} @ {fmtUsd(p.entryPrice)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 },
  simBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.amberBg,
    borderRadius: radius.md, padding: 12, marginBottom: 16,
  },
  simBannerText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 17 },
  upsellCard: { backgroundColor: colors.accentDim, borderRadius: radius.md, padding: 14, marginBottom: 14 },
  upsellText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 19 },
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  card: {
    padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 14,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  traderName: { fontSize: 15, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  followBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent },
  followBtnActive: { backgroundColor: colors.accent },
  followBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.accent },
  followBtnTextActive: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 10 },
  stat: {},
  statLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 2 },
  statValue: { fontSize: 14, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  strategy: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 17, marginBottom: 10 },
  symbolRow: { flexDirection: 'row', gap: 6 },
  symbolChip: { backgroundColor: colors.fieldBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  symbolChipText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textDim },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 10,
  },
  posRow: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
  posSymbol: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.text },
  posDetail: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim },
});
