/* eslint-disable react-refresh/only-export-components */
/**
 * Контекст глобального открытия модалки добавления брони (кнопка «+» в таббаре).
 * Провайдер держит AddBookingModal и загружает properties.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type Property } from '../lib/supabase';
import { AddBookingModal } from '../screens/AddBookingModal';

async function fetchProperties(): Promise<Property[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

type AddBookingContextType = {
  openAddBooking: () => void;
};

const AddBookingContext = createContext<AddBookingContextType | undefined>(undefined);

export function useAddBooking() {
  const ctx = useContext(AddBookingContext);
  if (ctx === undefined) throw new Error('useAddBooking must be used within AddBookingProvider');
  return ctx;
}

export function AddBookingProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const queryClient = useQueryClient();
  const { data: properties = [] } = useQuery({ queryKey: ['properties'], queryFn: fetchProperties });

  const openAddBooking = useCallback(() => setVisible(true), []);

  return (
    <AddBookingContext.Provider value={{ openAddBooking }}>
      {children}
      <AddBookingModal
        visible={visible}
        properties={properties}
        onClose={() => setVisible(false)}
        onSuccess={() => {
          setVisible(false);
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
        }}
      />
    </AddBookingContext.Provider>
  );
}
