/**
 * Модалка деталей брони: гость, контакты, даты, статус, сумма, комментарий, объект.
 * Кнопки «Подтвердить» / «Отменить» обновляют статус через Supabase.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, type Booking } from '../lib/supabase';
import { useTheme } from '../contexts/useTheme';

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
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  if (!booking) return null;

  const checkIn = formatDate(booking.check_in);
  const checkOut = formatDate(booking.check_out);
  const statusBg =
    booking.status === 'confirmed'
      ? colors.success
      : booking.status === 'cancelled'
        ? colors.error
        : colors.warning;

  const updateStatus = async (newStatus: 'confirmed' | 'cancelled') => {
    if (!supabase) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: newStatus })
        .eq('id', booking.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['bookings'] });

      Toast.show({
        type: 'success',
        text1: newStatus === 'confirmed' ? 'Бронирование подтверждено' : 'Бронирование отменено',
        visibilityTime: 2500,
      });
      onClose();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: err instanceof Error ? err.message : 'Не удалось обновить статус',
        visibilityTime: 3000,
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirm = () => updateStatus('confirmed');
  const handleCancel = () => updateStatus('cancelled');

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
              <TouchableOpacity
                style={[styles.buttonPrimary, { backgroundColor: colors.primary }]}
                onPress={handleConfirm}
                disabled={updating || booking.status === 'confirmed'}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Подтвердить</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleCancel}
                disabled={updating || booking.status === 'cancelled'}
              >
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
