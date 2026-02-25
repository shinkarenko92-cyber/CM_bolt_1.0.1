/**
 * Массовое редактирование: макет updated_bulk_edit — bottom sheet,
 * даты, цена, скидка, кнопка Apply. Вызов из Calendar/Dashboard.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

export interface BulkEditModalProps {
  visible: boolean;
  onClose: () => void;
  onApply?: (params: { price?: number; discount?: number }) => void;
}

export function BulkEditModal({ visible, onClose, onApply }: BulkEditModalProps) {
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');

  const handleApply = () => {
    const p = price.trim() ? parseFloat(price.replace(',', '.')) : undefined;
    const d = discount.trim() ? parseFloat(discount.replace(',', '.')) : undefined;
    onApply?.({ price: p, discount: d });
    onClose();
  };

  const handleReset = () => {
    setPrice('');
    setDiscount('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Массовое редактирование</Text>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
              <Text style={styles.resetText}>Сброс</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.sectionTitle}>Диапазон дат</Text>
            <View style={styles.dateBlock}>
              <TouchableOpacity style={styles.chevron}>
                <Ionicons name="chevron-back" size={22} color={colors.textDark} />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>Октябрь 2024</Text>
              <TouchableOpacity style={styles.chevron}>
                <Ionicons name="chevron-forward" size={22} color={colors.textDark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionTitle}>Цена за ночь (₽)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
            <Text style={styles.sectionTitle}>Скидка (%)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={discount}
              onChangeText={setDiscount}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>Применить</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.cardDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.slate800,
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
    textAlign: 'center',
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  body: {
    maxHeight: 400,
  },
  bodyContent: {
    padding: 24,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 12,
    marginTop: 20,
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.slate800,
    borderRadius: 16,
    padding: 16,
  },
  chevron: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  input: {
    backgroundColor: colors.slate800,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textDark,
  },
  applyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
