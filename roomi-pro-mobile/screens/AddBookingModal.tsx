/**
 * Модалка добавления брони: React Hook Form + Zod.
 * Поля: объект, заезд/выезд, гость, сумма, статус.
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Property } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';

const schema = z.object({
  property_id: z.string().min(1, 'Выберите объект'),
  check_in: z.string().min(10, 'Дата заезда'),
  check_out: z.string().min(10, 'Дата выезда'),
  guest_name: z.string().min(1, 'Введите имя гостя'),
  guest_email: z.string().optional(),
  guest_phone: z.string().optional(),
  total_price: z.number().min(0, 'Сумма ≥ 0'),
  status: z.enum(['confirmed', 'pending']),
  notes: z.string().optional(),
}).refine((d) => d.check_out > d.check_in, {
  message: 'Выезд должен быть после заезда',
  path: ['check_out'],
});

export type AddBookingFormValues = z.infer<typeof schema>;

export type AddBookingModalProps = {
  visible: boolean;
  properties: Property[];
  onClose: () => void;
  onSuccess: () => void;
};

const defaultValues: AddBookingFormValues = {
  property_id: '',
  check_in: '',
  check_out: '',
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  total_price: 0,
  status: 'pending',
  notes: '',
};

function toISODate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  return dateStr.slice(0, 10) + 'T12:00:00.000Z';
}

export function AddBookingModal({
  visible,
  properties,
  onClose,
  onSuccess,
}: AddBookingModalProps) {
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddBookingFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const selectedPropertyId = watch('property_id');

  useEffect(() => {
    if (visible) {
      reset(defaultValues);
      if (properties.length === 1) {
        setValue('property_id', properties[0].id);
      }
    }
  }, [visible, properties, reset, setValue]);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  useEffect(() => {
    if (selectedProperty && visible) {
      setValue('total_price', selectedProperty.base_price);
      setValue('check_in', new Date().toISOString().slice(0, 10));
      const next = new Date();
      next.setDate(next.getDate() + 1);
      setValue('check_out', next.toISOString().slice(0, 10));
    }
  }, [selectedProperty, visible, setValue]);

  const onSubmit = async (data: AddBookingFormValues) => {
    if (!supabase) {
      Alert.alert('Ошибка', 'Supabase не настроен');
      return;
    }
    const { error } = await supabase.from('bookings').insert({
      property_id: data.property_id,
      source: 'manual',
      guest_name: data.guest_name,
      guest_email: data.guest_email || null,
      guest_phone: data.guest_phone || null,
      check_in: toISODate(data.check_in),
      check_out: toISODate(data.check_out),
      guests_count: 1,
      total_price: data.total_price,
      currency: selectedProperty?.currency ?? 'RUB',
      status: data.status,
      notes: data.notes || null,
    });
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    onSuccess();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Новая бронь</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.closeText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Controller
              control={control}
              name="property_id"
              render={({ field: { onChange, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Объект *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                    {properties.map((p) => (
                      <Pressable
                        key={p.id}
                        style={[styles.chip, value === p.id && styles.chipSelected]}
                        onPress={() => onChange(p.id)}
                      >
                        <Text style={[styles.chipText, value === p.id && styles.chipTextSelected]} numberOfLines={1}>
                          {p.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {errors.property_id && (
                    <Text style={styles.errorText}>{errors.property_id.message}</Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="check_in"
              render={({ field: { onChange, onBlur, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Заезд *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                  {errors.check_in && (
                    <Text style={styles.errorText}>{errors.check_in.message}</Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="check_out"
              render={({ field: { onChange, onBlur, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Выезд *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                  {errors.check_out && (
                    <Text style={styles.errorText}>{errors.check_out.message}</Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="guest_name"
              render={({ field: { onChange, onBlur, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Гость *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Имя гостя"
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                  {errors.guest_name && (
                    <Text style={styles.errorText}>{errors.guest_name.message}</Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="guest_phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Телефон</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+7..."
                    placeholderTextColor={colors.textSecondary}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType={Platform.OS === 'ios' ? 'phone-pad' : 'numeric'}
                  />
                </View>
              )}
            />

            <Controller
              control={control}
              name="total_price"
              render={({ field: { onChange, onBlur, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Сумма *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    value={value === 0 ? '' : String(value)}
                    onChangeText={(t) => onChange(t === '' ? (0 as AddBookingFormValues['total_price']) : Number(t))}
                    onBlur={onBlur}
                    keyboardType="numeric"
                  />
                  {errors.total_price && (
                    <Text style={styles.errorText}>{errors.total_price.message}</Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="status"
              render={({ field: { onChange, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Статус</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.chip, value === 'pending' && styles.chipSelected]}
                      onPress={() => onChange('pending')}
                    >
                      <Text style={[styles.chipText, value === 'pending' && styles.chipTextSelected]}>
                        Ожидание
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chip, value === 'confirmed' && styles.chipSelected]}
                      onPress={() => onChange('confirmed')}
                    >
                      <Text style={[styles.chipText, value === 'confirmed' && styles.chipTextSelected]}>
                        Подтверждено
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />

            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              onPress={handleSubmit(onSubmit as (data: AddBookingFormValues) => void)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Создать бронь</Text>
              )}
            </Pressable>
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
    maxHeight: '85%',
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
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
