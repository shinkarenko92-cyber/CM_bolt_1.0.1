/**
 * Модалка деталей брони: гость, контакты, даты, статус, сумма, комментарий, объект.
 * Кнопки «Подтвердить» / «Отменить» — заглушки.
 */
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { type Booking } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export type DetailsBookingModalProps = {
  visible: boolean;
  booking: Booking | null;
  propertyName?: string | null;
  onClose: () => void;
};

function formatDate(iso: string): string {
  return iso.split('T')[0];
}

export function DetailsBookingModal({
  visible,
  booking,
  propertyName,
  onClose,
}: DetailsBookingModalProps) {
  const { colors } = useTheme();
  if (!booking) return null;

  const checkIn = formatDate(booking.check_in);
  const checkOut = formatDate(booking.check_out);
  const statusBg =
    booking.status === 'confirmed'
      ? colors.success
      : booking.status === 'cancelled'
        ? colors.error
        : colors.warning;

  const handleConfirm = () => {
    // Заглушка: позже — обновление status через Supabase
  };
  const handleCancel = () => {
    // Заглушка: позже — обновление status на cancelled
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.content, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Бронирование</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Text style={[styles.closeText, { color: colors.primary }]}>Закрыть</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Гость</Text>
            <Text style={[styles.value, { color: colors.text }]}>{booking.guest_name}</Text>

            {booking.guest_email ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
                <Text style={[styles.value, { color: colors.text }]}>{booking.guest_email}</Text>
              </>
            ) : null}
            {booking.guest_phone ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Телефон</Text>
                <Text style={[styles.value, { color: colors.text }]}>{booking.guest_phone}</Text>
              </>
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>Объект</Text>
            <Text style={[styles.value, { color: colors.text }]}>{propertyName ?? '—'}</Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Даты</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {checkIn} — {checkOut}
            </Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Статус</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
              <Text style={styles.statusBadgeText}>{booking.status}</Text>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Сумма</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {booking.total_price} {booking.currency}
            </Text>

            {booking.notes ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Комментарий</Text>
                <Text style={[styles.value, { color: colors.text }]}>{booking.notes}</Text>
              </>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
                <Text style={styles.buttonPrimaryText}>Подтвердить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.buttonSecondary, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={handleCancel}>
                <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>Отменить</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    borderRadius: 16,
    padding: 20,
    maxWidth: 400,
    width: '100%',
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeText: {
    fontSize: 16,
  },
  label: {
    fontSize: 12,
    marginTop: 12,
    marginBottom: 2,
  },
  value: {
    fontSize: 16,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 8,
  },
  buttonPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
