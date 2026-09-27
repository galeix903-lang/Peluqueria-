import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BackHeader } from '../src/components/BackHeader';
import { ConfirmModal } from '../src/components/ConfirmModal';
import { api, ApiError } from '../src/services/api';
import { colors, radius } from '../src/theme';
import { fmtUsd } from '../src/utils/format';

type Wallet = {
  id: string;
  address: string;
  label: string | null;
  snapshot: {
    totalValue: number;
    holdings: { symbol: string; amount: number; value: number; share: number }[];
    activity: { symbol: string; verb: string; amount: number; at: string }[];
    simulated: boolean;
  };
};

export default function WalletScreen() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Wallet | null>(null);

  async function loadWallets() {
    try {
      const data = await api.get('/api/wallet');
      setWallets(data.wallets);
    } catch {
      setError('No se pudieron cargar tus wallets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWallets();
  }, []);

  async function onFollow() {
    setError(null);
    if (!address.trim()) {
      setError('Introduce una dirección de wallet.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/wallet', { address: address.trim(), label: label.trim() || undefined });
      setAddress('');
      setLabel('');
      await loadWallets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo seguir esta wallet.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setSubmitting(true);
    try {
      await api.del(`/api/wallet/${removeTarget.id}`);
      setRemoveTarget(null);
      await loadWallets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo dejar de seguir esta wallet.');
      setRemoveTarget(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BackHeader title="Wallet Tracker" subtitle="Sigue cualquier dirección y su actividad (simulada)." />

        <Text style={styles.label}>Dirección</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="0x… o cualquier dirección"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Etiqueta (opcional)</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Ej. Ballena BTC"
          placeholderTextColor={colors.textDim}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.submitBtn} onPress={onFollow} disabled={submitting}>
          <Text style={styles.submitBtnText}>{submitting ? 'Un momento…' : 'Seguir wallet'}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Wallets seguidas</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : wallets.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no sigues ninguna wallet.</Text>
        ) : (
          wallets.map((w) => (
            <View key={w.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletLabel}>{w.label || 'Wallet'}</Text>
                  <Text style={styles.walletAddress} numberOfLines={1}>{w.address}</Text>
                </View>
                <View style={styles.simBadge}><Text style={styles.simBadgeText}>Modo simulado</Text></View>
              </View>

              <Text style={styles.totalValue}>{fmtUsd(w.snapshot.totalValue)}</Text>

              {w.snapshot.holdings.map((h) => (
                <View key={h.symbol} style={styles.holdingRow}>
                  <Text style={styles.holdingSymbol}>{h.symbol}</Text>
                  <Text style={styles.holdingAmount}>{h.amount}</Text>
                  <Text style={styles.holdingValue}>{fmtUsd(h.value)} · {h.share}%</Text>
                </View>
              ))}

              {w.snapshot.activity.slice(0, 3).map((a, i) => (
                <Text key={i} style={styles.activityLine}>
                  {a.verb} {a.amount} {a.symbol} · {new Date(a.at).toLocaleDateString('es-ES')}
                </Text>
              ))}

              <TouchableOpacity style={styles.removeBtn} onPress={() => setRemoveTarget(w)}>
                <Feather name="user-x" size={13} color={colors.red} />
                <Text style={styles.removeBtnText}>Dejar de seguir</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <ConfirmModal
        visible={!!removeTarget}
        title="Dejar de seguir"
        message={removeTarget ? `Dejarás de ver la actividad de "${removeTarget.label || removeTarget.address}".` : ''}
        confirmLabel="Dejar de seguir"
        danger
        busy={submitting}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, marginBottom: 14,
  },
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  submitBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 10,
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim },
  card: {
    padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginBottom: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  walletLabel: { fontSize: 14, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  walletAddress: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 },
  simBadge: { backgroundColor: colors.amberBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  simBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.amber },
  totalValue: { fontSize: 22, fontFamily: 'Inter_800ExtraBold', color: colors.text, marginBottom: 10 },
  holdingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  holdingSymbol: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.text, width: 50 },
  holdingAmount: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, flex: 1, textAlign: 'right' },
  holdingValue: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.text, marginLeft: 10 },
  activityLine: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 4 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  removeBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.red },
});
