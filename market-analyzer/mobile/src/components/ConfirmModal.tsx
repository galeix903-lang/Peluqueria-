import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme';

/*
  Modal de confirmación genérico — nunca se envía una acción sensible
  (abrir/cerrar una posición, dejar de seguir una wallet o un trader)
  sin pasar por aquí, mismo criterio que ya usa la web
  (shared/modal.js) para no diverger entre plataformas.
*/
export function ConfirmModal({
  visible, title, message, confirmLabel = 'Confirmar', danger, busy, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, danger && styles.confirmBtnDanger]}
              onPress={onConfirm}
              disabled={busy}
            >
              <Text style={styles.confirmText}>{busy ? 'Un momento…' : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,22,43,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: radius.lg, padding: 20 },
  title: { fontSize: 17, fontFamily: 'Inter_800ExtraBold', color: colors.text, marginBottom: 8 },
  message: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 20, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.text },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center' },
  confirmBtnDanger: { backgroundColor: colors.red },
  confirmText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});
