/**
 * Строка комнаты в таблице доступности: ячейки броней по дням + Standard rate с ценами.
 * Для каждой даты — цветной блок брони (confirmed/pending/cancelled) с именем гостя в первой ячейке или пусто.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Property, Booking } from '../lib/supabase';
import { colors } from '../constants/colors';
import { DAY_CELL_WIDTH } from '../constants/layout';

const GUEST_NAME_MAX = 14;

function statusToColor(status: string): string {
  if (status === 'confirmed') return colors.successCalendar;
  if (status === 'pending') return colors.warningCalendar;
  if (status === 'cancelled') return colors.cancelled;
  return colors.border;
}

/** Бронь, в которую попадает дата d (check_in <= d <= check_out). */
function getBookingForDate(bookings: Booking[], date: string): Booking | undefined {
  const d = date.split('T')[0];
  return bookings.find((b) => {
    const checkIn = b.check_in.split('T')[0];
    const checkOut = b.check_out.split('T')[0];
    return d >= checkIn && d <= checkOut;
  });
}

/** Является ли date первым днём брони b. */
function isFirstDayOfBooking(b: Booking, date: string): boolean {
  const d = date.split('T')[0];
  const checkIn = b.check_in.split('T')[0];
  return d === checkIn;
}

/** Является ли date последним днём брони b. */
function isLastDayOfBooking(b: Booking, date: string): boolean {
  const d = date.split('T')[0];
  const checkOut = b.check_out.split('T')[0];
  return d === checkOut;
}

function truncateGuest(name: string): string {
  if (name.length <= GUEST_NAME_MAX) return name;
  return name.slice(0, GUEST_NAME_MAX) + '…';
}

export type RoomRowProps = {
  property: Property;
  dates: string[];
  bookings: Booking[];
};

export function RoomRow({ property, dates, bookings }: RoomRowProps) {
  return (
    <>
      {/* Ряд 1: брони по дням */}
      <View style={styles.cellsRow}>
        {dates.map((date) => {
          const booking = getBookingForDate(bookings, date);
          const isFirst = booking ? isFirstDayOfBooking(booking, date) : false;
          const isLast = booking ? isLastDayOfBooking(booking, date) : false;
          const bg = booking ? statusToColor(booking.status) : colors.background;
          const roundedStyle =
            booking && (isFirst || isLast)
              ? {
                  borderTopLeftRadius: isFirst ? 12 : 0,
                  borderBottomLeftRadius: isFirst ? 12 : 0,
                  borderTopRightRadius: isLast ? 12 : 0,
                  borderBottomRightRadius: isLast ? 12 : 0,
                }
              : {};
          return (
            <View
              key={date}
              style={[
                styles.cell,
                styles.bookingCell,
                { backgroundColor: bg },
                roundedStyle,
              ]}
            >
              {isFirst && booking && (
                <Text style={styles.guestName} numberOfLines={1}>
                  {truncateGuest(booking.guest_name || '—')}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {/* Ряд 2: Standard rate — цены по дням */}
      <View style={styles.cellsRow}>
        {dates.map((date) => (
          <View key={date} style={[styles.cell, styles.rateCell]}>
            <Text style={styles.rateText}>{property.base_price}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  cellsRow: {
    flexDirection: 'row',
  },
  cell: {
    width: DAY_CELL_WIDTH,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  bookingCell: {
    marginHorizontal: 1,
  },
  guestName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  rateCell: {
    backgroundColor: colors.rateCellBg,
    marginHorizontal: 1,
    borderRadius: 12,
  },
  rateText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
});
