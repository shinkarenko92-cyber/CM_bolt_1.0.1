/**
 * Массовое редактирование: макет updated_bulk_edit — bottom sheet,
 * даты, цена, скидка, кнопка Apply. Цвета из useTheme().
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
import { useTheme } from '../contexts/ThemeContext';

export interface BulkEditModalProps {
  visible: boolean;
  onClose: () => void;
  onApply?: (params: { price?: number; discount?: number }) => void;
}

export function BulkEditModal({ visible, onClose, onApply }: BulkEditModalProps) {
  const { colors } = useTheme();
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
        <View style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Массовое редактирование</Text>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
              <Text style={[styles.resetText, { color: colors.primary }]}>Сброс</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Диапазон дат</Text>
            <View style={[styles.dateBlock, { backgroundColor: colors.input }]}>
              <TouchableOpacity style={styles.chevron}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.text }]}>Октябрь 2024</Text>
              <TouchableOpacity style={styles.chevron}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Цена за ночь (₽)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.text }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Скидка (%)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.text }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={discount}
              onChangeText={setDiscount}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={handleApply}>
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
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
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
    textAlign: 'center',
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 12,
    marginTop: 20,
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
  },
  chevron: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  applyBtn: {
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
