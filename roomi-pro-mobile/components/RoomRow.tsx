/**
 * Строка комнаты в таблице доступности: блоки броней по дням (flexBasis по числу дней) + Standard rate с ценами.
 * Блок — цвет по статусу (confirmed/pending/cancelled), внутри имя гостя (обрезать если длинное).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Property, Booking } from '../lib/supabase';
import { useTheme } from '../contexts/useTheme';
import { DAY_CELL_WIDTH } from '../constants/layout';

const GUEST_NAME_MAX = 14;

function statusToColor(status: string, border: string): string {
  if (status === 'confirmed') return '#10B981';
  if (status === 'pending') return '#F59E0B';
  if (status === 'cancelled') return '#EF4444';
  return border;
}

function truncateGuest(name: string): string {
  if (name.length <= GUEST_NAME_MAX) return name;
  return name.slice(0, GUEST_NAME_MAX) + '…';
}

type Segment =
  | { type: 'empty'; days: number }
  | { type: 'booking'; booking: Booking; days: number };

/** Строит сегменты строки: пустые промежутки и блоки броней по check_in → check_out. */
function buildSegments(dates: string[], bookings: Booking[]): Segment[] {
  if (dates.length === 0) return [];
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const inMonth = (b: Booking) => {
    const ci = b.check_in.split('T')[0];
    const co = b.check_out.split('T')[0];
    return ci <= lastDate && co >= firstDate;
  };
  const sorted = [...bookings].filter(inMonth).sort(
    (a, b) => a.check_in.localeCompare(b.check_in)
  );
  const segments: Segment[] = [];
  let currentIndex = 0;

  for (const b of sorted) {
    const checkIn = b.check_in.split('T')[0];
    const checkOut = b.check_out.split('T')[0];
    let startIdx = dates.findIndex((d) => d >= checkIn);
    if (startIdx === -1) startIdx = 0;
    let endIdx = dates.findIndex((d) => d >= checkOut);
    if (endIdx === -1) endIdx = dates.length - 1;
    if (startIdx > endIdx) continue;

    if (currentIndex < startIdx) {
      segments.push({ type: 'empty', days: startIdx - currentIndex });
    }
    segments.push({ type: 'booking', booking: b, days: endIdx - startIdx + 1 });
    currentIndex = endIdx + 1;
  }
  if (currentIndex < dates.length) {
    segments.push({ type: 'empty', days: dates.length - currentIndex });
  }
  return segments.length ? segments : [{ type: 'empty', days: dates.length }];
}

export type RoomRowProps = {
  property: Property;
  dates: string[];
  bookings: Booking[];
};

export function RoomRow({ property, dates, bookings }: RoomRowProps) {
  const { colors } = useTheme();
  const segments = useMemo(() => buildSegments(dates, bookings), [dates, bookings]);

  return (
    <>
      {/* Ряд 1: блоки броней (ширина по количеству дней) */}
      <View style={styles.cellsRow}>
        {segments.map((seg, i) => {
          if (seg.type === 'empty') {
            return (
              <View
                key={`e-${i}`}
                style={[styles.cell, styles.emptyCell, { width: seg.days * DAY_CELL_WIDTH }]}
              />
            );
          }
          const width = seg.days * DAY_CELL_WIDTH;
          const bg = statusToColor(seg.booking.status, colors.border);
          return (
            <View
              key={`b-${seg.booking.id}`}
              style={[styles.bookingBlock, { width, backgroundColor: bg }]}
            >
              <Text style={styles.guestName} numberOfLines={1}>
                {truncateGuest(seg.booking.guest_name || '—')}
              </Text>
            </View>
          );
        })}
      </View>
      {/* Ряд 2: Standard rate — цены по дням */}
      <View style={styles.cellsRow}>
        {dates.map((date) => (
          <View key={date} style={[styles.cell, styles.rateCell, { backgroundColor: colors.input }]}>
            <Text style={[styles.rateText, { color: colors.text }]}>{property.base_price}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  cellsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    width: DAY_CELL_WIDTH,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  emptyCell: {
    marginHorizontal: 1,
  },
  bookingBlock: {
    minHeight: 40,
    marginHorizontal: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  guestName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  rateCell: {
    marginHorizontal: 1,
    borderRadius: 8,
  },
  rateText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
