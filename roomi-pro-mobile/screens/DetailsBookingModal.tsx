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
import { colors } from '../constants/colors';

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
  if (!booking) return null;

  const checkIn = formatDate(booking.check_in);
  const checkOut = formatDate(booking.check_out);

  const handleConfirm = () => {
    // Заглушка: позже — обновление status через Supabase
  };
  const handleCancel = () => {
    // Заглушка: позже — обновление status на cancelled
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.title}>Бронирование</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Text style={styles.closeText}>Закрыть</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Гость</Text>
            <Text style={styles.value}>{booking.guest_name}</Text>

            {booking.guest_email ? (
              <>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{booking.guest_email}</Text>
              </>
            ) : null}
            {booking.guest_phone ? (
              <>
                <Text style={styles.label}>Телефон</Text>
                <Text style={styles.value}>{booking.guest_phone}</Text>
              </>
            ) : null}

            <Text style={styles.label}>Объект</Text>
            <Text style={styles.value}>{propertyName ?? '—'}</Text>

            <Text style={styles.label}>Даты</Text>
            <Text style={styles.value}>
              {checkIn} — {checkOut}
            </Text>

            <Text style={styles.label}>Статус</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    booking.status === 'confirmed'
                      ? colors.successCalendar
                      : booking.status === 'cancelled'
                        ? colors.cancelled
                        : colors.warningCalendar,
                },
              ]}
            >
              <Text style={styles.statusBadgeText}>{booking.status}</Text>
            </View>

            <Text style={styles.label}>Сумма</Text>
            <Text style={styles.value}>
              {booking.total_price} {booking.currency}
            </Text>

            {booking.notes ? (
              <>
                <Text style={styles.label}>Комментарий</Text>
                <Text style={styles.value}>{booking.notes}</Text>
              </>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleConfirm}>
                <Text style={styles.buttonPrimaryText}>Подтвердить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonSecondary} onPress={handleCancel}>
                <Text style={styles.buttonSecondaryText}>Отменить</Text>
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
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  closeText: {
    color: colors.primary,
    fontSize: 16,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 2,
  },
  value: {
    fontSize: 16,
    color: colors.text,
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
    backgroundColor: colors.primary,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
