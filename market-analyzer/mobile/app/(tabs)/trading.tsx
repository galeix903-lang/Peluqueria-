import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen';
import { ConfirmModal } from '../../src/components/ConfirmModal';
import { Sparkline } from '../../src/components/Sparkline';
import { api, ApiError } from '../../src/services/api';
import { preferences } from '../../src/services/preferences';
import { colors, radius } from '../../src/theme';
import { fmtUsd, fmtPct } from '../../src/utils/format';

type Position = {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: 'open' | 'closed';
  currentPrice?: number | null;
  unrealizedPnl?: number | null;
  closePrice?: number | null;
  realizedPnl?: number | null;
  closeReason?: string | null;
  pnlPercent?: number | null;
};

const REFRESH_MS = 15000;

export default function TradingScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [supportedSymbols, setSupportedSymbols] = useState<string[]>([]);
  const [isSimulatedPricing, setIsSimulatedPricing] = useState(false);
  const [symbol, setSymbol] = useState('BTC');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [size, setSize] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [sparkline, setSparkline] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadTrading = useCallback(async () => {
    try {
      const data = await api.get('/api/trading');
      setBalance(data.balance);
      setPositions(data.positions);
      setSupportedSymbols(data.supportedSymbols);
      setIsSimulatedPricing(data.isSimulatedPricing);
    } catch {
      // fallo puntual de red: se reintenta solo en el próximo ciclo de 15s
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrading();
    const id = setInterval(loadTrading, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadTrading]);

  // Recuerda el último símbolo usado (solo una preferencia de comodidad,
  // no un dato sensible) para no tener que reelegirlo cada vez que se
  // abre la pestaña.
  useEffect(() => {
    preferences.getLastSymbol().then((saved) => {
      if (saved) setSymbol(saved);
    });
  }, []);

  useEffect(() => {
    preferences.setLastSymbol(symbol);
    api.get(`/api/trading/chart/${symbol}`)
      .then((d) => setSparkline((d.history || []).map((h: any) => h.price)))
      .catch(() => setSparkline([]));
  }, [symbol]);

  const openPositions = positions.filter((p) => p.status === 'open');
  const closedPositions = positions.filter((p) => p.status === 'closed').slice(0, 8);
  const currentSymbolPrice = sparkline.length ? sparkline[sparkline.length - 1] : null;

  function onOpenPress() {
    setError(null);
    if (!(Number(size) > 0)) {
      setError('Introduce un tamaño válido (mayor que 0).');
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmOpenPosition() {
    setSubmitting(true);
    try {
      await api.post('/api/trading', {
        symbol,
        side,
        size: Number(size),
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        takeProfit: takeProfit ? Number(takeProfit) : undefined,
      });
      setSize('');
      setStopLoss('');
      setTakeProfit('');
      setConfirmOpen(false);
      await loadTrading();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir la posición.');
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmClosePosition() {
    if (!closeTarget) return;
    setSubmitting(true);
    try {
      await api.post(`/api/trading/${closeTarget.id}/close`);
      setCloseTarget(null);
      await loadTrading();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cerrar la posición.');
      setCloseTarget(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Screen title="Paper Trading" subtitle="Practica con saldo virtual y precios reales.">
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Paper Trading" subtitle="Practica con saldo virtual y precios reales.">
      <Text style={styles.balanceLabel}>Saldo virtual</Text>
      <Text style={styles.balanceValue}>{balance != null ? fmtUsd(balance) : '—'}</Text>

      {isSimulatedPricing && (
        <View style={styles.warnBanner}>
          <Feather name="alert-triangle" size={16} color={colors.amber} />
          <Text style={styles.warnText}>
            Precios simulados: no se pudo conectar con la fuente de precios en vivo; estos son una aproximación, no
            cotizaciones reales.
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Símbolo</Text>
      <View style={styles.chipRow}>
        {supportedSymbols.map((s) => (
          <TouchableOpacity key={s} style={[styles.chip, symbol === s && styles.chipActive]} onPress={() => setSymbol(s)}>
            <Text style={[styles.chipText, symbol === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sparklineCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.sparklineSymbol}>{symbol}</Text>
          <Text style={styles.sparklinePrice}>{currentSymbolPrice != null ? fmtUsd(currentSymbolPrice) : '—'}</Text>
        </View>
        <Sparkline points={sparkline} width={320} height={50} />
      </View>

      <View style={styles.sideRow}>
        <TouchableOpacity style={[styles.sideBtn, side === 'long' && styles.sideBtnBuy]} onPress={() => setSide('long')}>
          <Text style={[styles.sideBtnText, side === 'long' && styles.sideBtnTextActive]}>Comprar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sideBtn, side === 'short' && styles.sideBtnSell]} onPress={() => setSide('short')}>
          <Text style={[styles.sideBtnText, side === 'short' && styles.sideBtnTextActive]}>Vender</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Tamaño</Text>
      <TextInput
        style={styles.input}
        value={size}
        onChangeText={setSize}
        placeholder="0.00"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
      />

      <View style={styles.slTpRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Stop-loss (opcional)</Text>
          <TextInput
            style={styles.input}
            value={stopLoss}
            onChangeText={setStopLoss}
            placeholder="—"
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Take-profit (opcional)</Text>
          <TextInput
            style={styles.input}
            value={takeProfit}
            onChangeText={setTakeProfit}
            placeholder="—"
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.submitBtn} onPress={onOpenPress}>
        <Text style={styles.submitBtnText}>Abrir posición</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Posiciones abiertas</Text>
      {openPositions.length === 0 ? (
        <Text style={styles.emptyText}>No tienes posiciones abiertas.</Text>
      ) : (
        openPositions.map((p) => {
          const pnl = p.unrealizedPnl ?? 0;
          const positive = pnl >= 0;
          return (
            <View key={p.id} style={styles.posCard}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.posSymbol}>{p.symbol}</Text>
                  <View style={[styles.badge, p.side === 'long' ? styles.badgeBuy : styles.badgeSell]}>
                    <Text style={[styles.badgeText, { color: p.side === 'long' ? colors.green : colors.red }]}>
                      {p.side === 'long' ? 'Compra' : 'Venta'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.posDetail}>
                  {p.size} @ {fmtUsd(p.entryPrice)}
                  {p.stopLoss ? ` · SL ${fmtUsd(p.stopLoss)}` : ''}
                  {p.takeProfit ? ` · TP ${fmtUsd(p.takeProfit)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.pnlText, { color: positive ? colors.green : colors.red }]}>
                  {positive ? '+' : ''}{fmtUsd(pnl)}
                </Text>
                {p.pnlPercent != null && (
                  <Text style={[styles.pnlPercent, { color: positive ? colors.green : colors.red }]}>{fmtPct(p.pnlPercent)}</Text>
                )}
                <TouchableOpacity style={styles.closeBtn} onPress={() => setCloseTarget(p)}>
                  <Text style={styles.closeBtnText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {closedPositions.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Historial reciente</Text>
          {closedPositions.map((p) => {
            const pnl = p.realizedPnl ?? 0;
            const positive = pnl >= 0;
            return (
              <View key={p.id} style={styles.posCard}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.posSymbol}>{p.symbol}</Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {p.closeReason === 'sl' ? 'Stop-loss' : p.closeReason === 'tp' ? 'Take-profit' : 'Manual'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.posDetail}>{p.size} @ {fmtUsd(p.entryPrice)} → {p.closePrice != null ? fmtUsd(p.closePrice) : '—'}</Text>
                </View>
                <Text style={[styles.pnlText, { color: positive ? colors.green : colors.red }]}>
                  {positive ? '+' : ''}{fmtUsd(pnl)}
                </Text>
              </View>
            );
          })}
        </>
      )}

      <ConfirmModal
        visible={confirmOpen}
        title="Confirmar operación"
        message={`${side === 'long' ? 'Comprar' : 'Vender'} ${size || '0'} ${symbol} a mercado${stopLoss ? `, SL ${stopLoss}` : ''}${takeProfit ? `, TP ${takeProfit}` : ''}.`}
        confirmLabel="Abrir posición"
        busy={submitting}
        onConfirm={confirmOpenPosition}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmModal
        visible={!!closeTarget}
        title="Cerrar posición"
        message={closeTarget ? `Vas a cerrar ${closeTarget.size} ${closeTarget.symbol} al precio de mercado actual.` : ''}
        confirmLabel="Cerrar posición"
        danger
        busy={submitting}
        onConfirm={confirmClosePosition}
        onCancel={() => setCloseTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim },
  balanceValue: { fontSize: 30, fontFamily: 'Inter_800ExtraBold', color: colors.text, marginBottom: 14 },
  warnBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.amberBg,
    borderRadius: radius.md, padding: 12, marginBottom: 16,
  },
  warnText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 17 },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim },
  chipTextActive: { color: '#fff' },
  sparklineCard: { marginTop: 14, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sparklineSymbol: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.text },
  sparklinePrice: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.text },
  sideRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 14 },
  sideBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  sideBtnBuy: { backgroundColor: colors.greenBg, borderColor: colors.green },
  sideBtnSell: { backgroundColor: colors.redBg, borderColor: colors.red },
  sideBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.textDim },
  sideBtnTextActive: { color: colors.text },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, marginBottom: 14,
  },
  slTpRow: { flexDirection: 'row', gap: 12 },
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  submitBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim },
  posCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10,
  },
  posSymbol: { fontSize: 14, fontFamily: 'Inter_800ExtraBold', color: colors.text },
  posDetail: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 4 },
  badge: { backgroundColor: colors.fieldBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeBuy: { backgroundColor: colors.greenBg },
  badgeSell: { backgroundColor: colors.redBg },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textDim },
  pnlText: { fontSize: 14, fontFamily: 'Inter_800ExtraBold' },
  pnlPercent: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 1 },
  closeBtn: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.redBg },
  closeBtnText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.red },
});
