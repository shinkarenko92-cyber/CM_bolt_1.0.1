import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { message } from 'antd';
import { Sidebar } from './Sidebar';
import { Calendar } from './Calendar';
import { AddReservationModal } from './AddReservationModal';
import { EditReservationModal } from './EditReservationModal';
import { OverlapWarningModal } from './OverlapWarningModal';
import { PropertiesView } from './PropertiesView';
import { BookingsView } from './BookingsView';
import { AnalyticsView } from './AnalyticsView';
import { AdminView } from './AdminView';
import { SettingsView } from './SettingsView';
import { UserProfileModal } from './UserProfileModal';
import { ThemeToggle } from './ThemeToggle';
import { SkeletonCalendar } from './Skeleton';
import { supabase, Property, Booking, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getOAuthSuccess, getOAuthError } from '../services/avito';
import { syncWithExternalAPIs, syncAvitoIntegration } from '../services/apiSync';
import { showAvitoErrors } from '../services/avitoErrors';
import { DeletePropertyModal } from './DeletePropertyModal';
import { ImportBookingsModal } from './ImportBookingsModal';
import { logBookingChange, getBookingChanges } from '../services/bookingLog';

type NewReservation = {
  property_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  status: string;
  source: string;
  guests_count: number;
  notes?: string | null;
  extra_services_amount?: number;
};

export function Dashboard() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState('calendar');
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [isOverlapWarningOpen, setIsOverlapWarningOpen] = useState(false);
  const [overlappingBookings, setOverlappingBookings] = useState<Booking[]>([]);
  const [pendingReservation, setPendingReservation] = useState<NewReservation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [prefilledDates, setPrefilledDates] = useState<{ propertyId: string; checkIn: string; checkOut: string } | null>(null);
  const [isDeletePropertyModalOpen, setIsDeletePropertyModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [bookingsForDelete, setBookingsForDelete] = useState<Booking[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const oauthProcessedRef = useRef(false);

  // Helper function for retry logic
  type SupabaseQueryResult<T> = {
    data: T | null;
    error: { message: string; details?: string; hint?: string; code?: string } | null;
  };

  const retrySupabaseQuery = useCallback(async <T,>(
    queryFn: () => Promise<SupabaseQueryResult<T>>,
    retries = 3,
    delay = 1000
  ): Promise<SupabaseQueryResult<T>> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await queryFn();
        // Если нет ошибки или ошибка не связана с сетью, возвращаем результат
        if (!result.error || (result.error.message && !result.error.message.includes('Failed to fetch'))) {
          // Если была ошибка, но retry успешен, не логируем ошибку
          // Query succeeded after retries
          return result;
        }
        
        // Если это последняя попытка, возвращаем результат с ошибкой
        if (attempt === retries) {
          console.error(`Query failed after ${retries} attempts:`, result.error);
          return result;
        }
        
        // Логируем только первую попытку, чтобы не засорять консоль
        // Query failed, retrying
        
        // Ждем перед повторной попыткой (экспоненциальная задержка)
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      } catch (error: unknown) {
        // Если это последняя попытка, возвращаем ошибку
        if (attempt === retries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Query failed after ${retries} attempts:`, errorMessage);
          return { 
            data: null, 
            error: { 
              message: errorMessage,
              details: error instanceof Error ? error.stack : undefined
            } 
          };
        }
        
        // Query error, retrying
        
        // Ждем перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    return { data: null, error: { message: 'Max retries exceeded' } };
  }, []);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      await supabase.auth.getSession();

      // Retry для properties
      const propertiesResult = await retrySupabaseQuery<Property[]>(
        async () => {
          const result = await supabase
            .from('properties')
            .select('*')
            .eq('owner_id', user.id);
          // Note: deleted_at filter temporarily removed - will be re-enabled after migration verification
          return {
            data: result.data,
            error: result.error ? {
              message: result.error.message,
              details: result.error.details,
              hint: result.error.hint,
              code: result.error.code
            } : null
          };
        }
      );
      const { data: propertiesData, error: propsError } = propertiesResult;

      if (propsError) {
        toast.error(`${t('errors.failedToLoadProperties')}: ${propsError.message}`);
      }

      if (propertiesData) {
        setProperties(propertiesData);

        const propertyIds = propertiesData.map((p: Property) => p.id);

        if (propertyIds.length > 0) {
          // Retry для bookings - загружаем только подтвержденные брони (confirmed и paid)
          const bookingsResult = await retrySupabaseQuery<Booking[]>(
            async () => {
              const result = await supabase
                .from('bookings')
                .select('*')
                .in('property_id', propertyIds)
                .in('status', ['confirmed', 'paid'])
                .order('check_in');
              return {
                data: result.data,
                error: result.error ? {
                  message: result.error.message,
                  details: result.error.details,
                  hint: result.error.hint,
                  code: result.error.code
                } : null
              };
            }
          );
          const { data: bookingsData, error: bookingsError } = bookingsResult;

          if (bookingsError) {
            toast.error(`${t('errors.failedToLoadBookings')}: ${bookingsError.message}`);
          }

          if (bookingsData) {
            setBookings(bookingsData);
            setFilteredBookings(bookingsData);
          }
        }
      }

      // Retry для profile
      const profileResult = await retrySupabaseQuery<Profile>(
        async () => {
          const result = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          return {
            data: result.data,
            error: result.error ? {
              message: result.error.message,
              details: result.error.details,
              hint: result.error.hint,
              code: result.error.code
            } : null
          };
        }
      );
      const { data: profileData } = profileResult;

      if (profileData) {
        setUserProfile(profileData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : t('errors.somethingWentWrong');
      toast.error(`${t('errors.failedToLoadData')}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [user, retrySupabaseQuery, t]);

  // Keep loadData ref up to date
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Проверяем OAuth callback и автоматически переключаемся на Properties
  useEffect(() => {
    const oauthSuccess = getOAuthSuccess();
    const oauthError = getOAuthError();
    
    if ((oauthSuccess || oauthError) && !oauthProcessedRef.current) {
      // Переключаемся на вкладку Properties, чтобы PropertiesView мог обработать callback
      setCurrentView((prevView) => {
        if (prevView !== 'properties') {
          return 'properties';
      }
        return prevView;
      });
      oauthProcessedRef.current = true;
    }
  }, []); // Запускаем только при монтировании

  // Realtime subscription for new Avito bookings
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('avito_bookings')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: 'source=eq.avito',
        },
        () => {
          // Toast notification
          message.success('Лид с Avito!');
          
          // Optional: Play sound notification
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKzn8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDknE4MDlCs5/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
            audio.volume = 0.3;
            audio.play().catch(() => {
              // Ignore errors (user may have blocked audio)
            });
          } catch {
            // Ignore audio errors
          }
          
          // Refresh bookings
          loadDataRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]); // Убрали loadData из зависимостей, используем ref

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBookings(bookings);
      setSearchResults([]);
      setShowSearchDropdown(false);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = bookings.filter(
        (b) =>
          b.guest_name.toLowerCase().includes(query) ||
          (b.guest_phone && b.guest_phone.toLowerCase().includes(query)) ||
          (b.guest_email && b.guest_email.toLowerCase().includes(query))
      );
      setFilteredBookings(filtered);
      setSearchResults(filtered);
      setShowSearchDropdown(true);
    }
  }, [searchQuery, bookings]);

  const handleAddReservation = (propertyIdOrIds: string | string[], checkIn?: string, checkOut?: string) => {
    if (typeof propertyIdOrIds === 'string' && checkIn && checkOut) {
      setPrefilledDates({ propertyId: propertyIdOrIds, checkIn, checkOut });
      setSelectedPropertyIds([propertyIdOrIds]);
    } else if (Array.isArray(propertyIdOrIds)) {
      setSelectedPropertyIds(propertyIdOrIds);
      setPrefilledDates(null);
    } else {
      setSelectedPropertyIds([]);
      setPrefilledDates(null);
    }
    setIsAddModalOpen(true);
  };

  const checkDateOverlap = (propertyId: string, checkIn: string, checkOut: string) => {
    const newStart = new Date(checkIn);
    const newEnd = new Date(checkOut);

    return bookings.filter((booking) => {
      if (booking.property_id !== propertyId) return false;

      const existingStart = new Date(booking.check_in);
      const existingEnd = new Date(booking.check_out);

      return (
        (newStart >= existingStart && newStart < existingEnd) ||
        (newEnd > existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      );
    });
  };

  const handleSaveReservation = async (reservation: {
    property_id: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    total_price: number;
    currency: string;
    status: string;
    source: string;
    guests_count: number;
    notes?: string | null;
    extra_services_amount?: number;
  }) => {
    const overlaps = checkDateOverlap(reservation.property_id, reservation.check_in, reservation.check_out);

    if (overlaps.length > 0) {
      setPendingReservation(reservation);
      setOverlappingBookings(overlaps);
      setIsOverlapWarningOpen(true);
      return;
    }

    await saveReservationToDatabase(reservation);
  };

  const saveReservationToDatabase = async (reservation: NewReservation) => {
    try {
      // Add created_by and updated_by fields only if user exists
      // Note: These fields may not exist if migration hasn't been applied yet
      const reservationWithAudit: NewReservation & { created_by?: string; updated_by?: string } = {
        ...reservation,
      };
      
      // Only add audit fields if user exists (migration applied)
      if (user?.id) {
        reservationWithAudit.created_by = user.id;
        reservationWithAudit.updated_by = user.id;
      }

      let { data, error } = await supabase.from('bookings').insert([reservationWithAudit]).select();

      // Handle PGRST204 error (column not found) - retry without audit fields
      if (error && (error.code === 'PGRST204' || error.message?.includes('Could not find the') || error.message?.includes('created_by'))) {
        // Retry without audit fields - create new object without created_by and updated_by
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { created_by, updated_by, ...reservationWithoutAudit } = reservationWithAudit;
        
        const retryResult = await supabase.from('bookings').insert([reservationWithoutAudit]).select();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) throw error;

      if (data && data.length > 0) {
        const newBooking = data[0];
        setBookings([...bookings, newBooking]);
        setFilteredBookings([...bookings, newBooking]);
        
        // Log the creation
        await logBookingChange(
          newBooking.id,
          newBooking.property_id,
          'created',
          undefined,
          reservation.source || 'manual'
        );
      }
      setIsAddModalOpen(false);
      setPrefilledDates(null);
      
      toast.success(
        `${t('success.bookingCreated')}. ${t('success.changesSaved')}`
      );

      // Sync to Avito after successful booking creation
      const syncToastId = toast.loading('Синхронизация с Avito...');
      
      try {
        const syncResult = await syncAvitoIntegration(reservation.property_id);
        
        // PRIORITY: Check hasError === false first (from Edge Function response)
        // If syncResult.success === true, it means hasError was false or not present
        if (syncResult.success) {
          toast.dismiss(syncToastId);
          // Show success message - check if pushSuccess (prices/intervals) for specific message
          if (syncResult.pushSuccess) {
            toast.success('Синхронизация успешна! Цены и даты обновлены в Avito');
          } else if (syncResult.pricesSuccess && syncResult.intervalsFailed) {
            toast.success('Цены обновлены в Avito');
            toast('Даты не закрыты (ожидаем активацию Avito). Используй iCal URL для закрытия дат.', {
              icon: '⚠️',
              duration: 6000,
            });
          } else {
            toast.success('Синхронизация успешна! Цены и даты обновлены в Avito');
          }
        } else {
          // Sync failed - show error
          toast.dismiss(syncToastId);
          if (syncResult.errors && syncResult.errors.length > 0) {
            const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
            toast.error(`Ошибка синхронизации: ${errorMessages}`);
            showAvitoErrors(syncResult.errors, t).catch((err) => {
              console.error('Error showing Avito error modals:', err);
            });
          } else {
            toast.error(syncResult.message || 'Ошибка синхронизации с Avito');
          }
          console.error('Dashboard: Avito sync failed after booking creation', syncResult);
        }
      } catch (error) {
        toast.dismiss(syncToastId);
        console.error('Dashboard: Unexpected error during Avito sync after booking creation:', error);
        toast.error('Ошибка синхронизации с Avito');
      }
    } catch (error) {
      console.error('Error saving reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleOverlapContinue = async () => {
    setIsOverlapWarningOpen(false);
    if (pendingReservation) {
      await saveReservationToDatabase(pendingReservation);
      setPendingReservation(null);
    }
  };

  const handleOverlapGoBack = () => {
    setIsOverlapWarningOpen(false);
    setPendingReservation(null);
  };

  const handleEditReservation = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsEditModalOpen(true);
  };

  const handleUpdateReservation = async (id: string, data: Partial<Booking>) => {
    try {
      // Find the old booking to compare changes
      const oldBooking = bookings.find((b) => b.id === id);
      
      // Add updated_by field only if user exists
      // Note: This field may not exist if migration hasn't been applied yet
      const dataWithAudit: Partial<Booking> & { updated_by?: string | null } = {
        ...data,
      };
      
      // Only add updated_by if user exists (migration applied)
      if (user?.id) {
        dataWithAudit.updated_by = user.id;
      }

      const { error } = await supabase.from('bookings').update(dataWithAudit).eq('id', id);

      if (error) throw error;

      const updatedBookings = bookings.map((b) =>
        b.id === id ? { ...b, ...dataWithAudit } : b
      );
      
      // Log the update if we have the old booking
      if (oldBooking) {
        const changes = getBookingChanges(oldBooking, dataWithAudit);
        if (Object.keys(changes).length > 0) {
          await logBookingChange(
            id,
            oldBooking.property_id,
            'updated',
            changes,
            oldBooking.source || 'manual'
          );
        }
      }
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);
      
      toast.success(
        `${t('success.bookingUpdated')}. ${t('success.changesSaved')}`
      );

      // Sync to Avito after successful booking update
      const booking = bookings.find(b => b.id === id);
      if (booking?.property_id) {
        const syncToastId = toast.loading('Синхронизация с Avito...');
        
        try {
          const syncResult = await syncAvitoIntegration(booking.property_id);
          
          // PRIORITY: Check hasError === false first (from Edge Function response)
          // If syncResult.success === true, it means hasError was false or not present
          if (syncResult.success) {
            toast.dismiss(syncToastId);
            // Show success message
            toast.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
          } else {
            // Sync failed - show error
            toast.dismiss(syncToastId);
            if (syncResult.errors && syncResult.errors.length > 0) {
              const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
              toast.error(`Ошибка синхронизации: ${errorMessages}`);
              showAvitoErrors(syncResult.errors, t).catch((err) => {
                console.error('Error showing Avito error modals:', err);
              });
            } else {
              toast.error(syncResult.message || 'Ошибка синхронизации с Avito');
            }
            console.error('Dashboard: Avito sync failed after booking update', syncResult);
          }
        } catch (error) {
          toast.dismiss(syncToastId);
          console.error('Dashboard: Unexpected error during Avito sync after booking update:', error);
          toast.error('Ошибка синхронизации с Avito');
        }
      }
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleDeleteReservation = async (id: string) => {
    // Find the booking before deletion to log it
    const bookingToDelete = bookings.find((b) => b.id === id);
    try {
      // Сохраняем данные брони перед удалением для синхронизации
      const booking = bookings.find(b => b.id === id);
      const propertyId = booking?.property_id;
      const bookingSource = booking?.source || 'manual';
      const isAvitoBooking = bookingSource === 'avito';

      const { error } = await supabase.from('bookings').delete().eq('id', id);

      if (error) throw error;

      const updatedBookings = bookings.filter((b) => b.id !== id);
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);
      
      // Log the deletion
      if (bookingToDelete) {
        await logBookingChange(
          id,
          bookingToDelete.property_id,
          'deleted',
          undefined,
          bookingToDelete.source || 'manual'
        );
      }
      
      toast.success(t('success.bookingDeleted'));

      // Sync to Avito after successful booking deletion
      // For manual bookings: open dates in Avito (exclude deleted booking from sync)
      // For Avito bookings: cancel booking + open dates
      if (propertyId) {
        try {
          // Check if Avito integration has valid item_id and account_id before syncing
          const { data: integration } = await supabase
            .from('integrations')
            .select('avito_item_id, is_active')
            .eq('property_id', propertyId)
            .eq('platform', 'avito')
            .eq('is_active', true)
            .maybeSingle();

          if (!integration) {
            toast.error('Интеграция Avito не найдена');
            return; // Skip sync if no integration
          }

          if (!integration.avito_item_id) {
            toast.error('Настрой ID объявления в интеграции Avito');
            return; // Skip sync if no valid item_id
          }

          // Validate item_id format (10-11 digits)
          const itemIdStr = String(integration.avito_item_id).trim();
          if (itemIdStr.length < 10 || itemIdStr.length > 11 || !/^\d+$/.test(itemIdStr)) {
            toast.error('Неверный ID объявления Avito. Должен быть 10–11 цифр.');
            // Invalid Avito item_id format
            return; // Skip sync if invalid format
          }

          // If manual booking, exclude it from sync to open dates in Avito
          // If Avito booking, full sync will handle cancellation
          const syncToastId = toast.loading('Синхронизация с Avito...');
          
          try {
            const syncResult = await syncAvitoIntegration(propertyId, isAvitoBooking ? undefined : id);
            
            // PRIORITY: Check hasError === false first (from Edge Function response)
            // If syncResult.success === true, it means hasError was false or not present
            if (syncResult.success) {
              toast.dismiss(syncToastId);
              // Show success message
              toast.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
              console.log('Dashboard: Avito sync completed successfully after booking deletion', {
                bookingId: id,
                source: bookingSource,
                isAvitoBooking,
                syncResult,
              });
            } else {
              // Sync failed - show error
              toast.dismiss(syncToastId);
              if (syncResult.errors && syncResult.errors.length > 0) {
                // Check for 404 errors
                const has404 = syncResult.errors.some(e => e.statusCode === 404);
                if (has404) {
                  toast.error('Объявление не найдено в Avito. Проверь ID объявления — должен быть длинный номер вроде 2336174775');
                } else {
                  // Check for 409 paid conflict
                  const hasPaidConflict = syncResult.errors.some(e => e.statusCode === 409);
                  if (hasPaidConflict) {
                    toast.error('Конфликт с оплаченной бронью в Avito — проверь вручную');
                  } else {
                    const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
                    toast.error(`Ошибка синхронизации: ${errorMessages}`);
                  }
                }
                
                showAvitoErrors(syncResult.errors, t).catch((err) => {
                  console.error('Error showing Avito error modals:', err);
                });
              } else {
                toast.error(syncResult.message || 'Ошибка синхронизации с Avito');
              }
              console.error('Dashboard: Avito sync failed after booking deletion', {
                bookingId: id,
                source: bookingSource,
                isAvitoBooking,
                syncResult,
              });
            }
          } catch (error) {
            toast.dismiss(syncToastId);
            console.error('Dashboard: Unexpected error during Avito sync after booking deletion:', error);
            toast.error('Ошибка синхронизации с Avito');
          }
        } catch (error) {
          console.error('Dashboard: Unexpected error during Avito sync after booking deletion:', error);
          toast.error('Ошибка синхронизации с Avito');
        }
      }
    } catch (error) {
      console.error('Error deleting reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleSync = async () => {
    await syncWithExternalAPIs();
  };

  const handleAddProperty = async (property: Omit<Property, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .insert([{ ...property, owner_id: user!.id }])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setProperties([...properties, data[0]]);
      }
      toast.success(t('success.propertyCreated'));
    } catch (error) {
      console.error('Error adding property:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleUpdateProperty = async (id: string, property: Partial<Property>) => {
    try {
      const { error } = await supabase
        .from('properties')
        .update(property)
        .eq('id', id);
      // Note: deleted_at filter temporarily removed

      if (error) throw error;

      setProperties(properties.map((p) => (p.id === id ? { ...p, ...property } : p)));
      toast.success(t('success.propertyUpdated'));
    } catch (error) {
      console.error('Error updating property:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!user) {
      toast.error(t('errors.somethingWentWrong'));
      return;
    }

    try {
      // Проверка владения объектом
      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .eq('owner_id', user.id)
        .single();

      if (propertyError || !property) {
        console.error('Property not found or access denied', { propertyError, id, userId: user.id });
        toast.error(t('errors.somethingWentWrong'));
        return;
      }

      // Fetch bookings details
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('property_id', id);

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        toast.error(t('errors.somethingWentWrong'));
        return;
      }

      const propertyBookings = bookingsData || [];

      // Если есть бронирования, показываем модальное окно
      if (propertyBookings.length > 0) {
        setPropertyToDelete(property);
        setBookingsForDelete(propertyBookings);
        setIsDeletePropertyModalOpen(true);
        return;
      }

      // Если нет бронирований, сразу удаляем
      await performPropertyDeletion(id, property, 'force_delete', []);
    } catch (error) {
      console.error('Error in handleDeleteProperty:', error);
      toast.error(t('errors.somethingWentWrong'));
    }
  };

  const handleDeletePropertyConfirm = async (action: 'cancel_unpaid' | 'force_delete' | 'abort') => {
    if (!propertyToDelete || action === 'abort') {
      setIsDeletePropertyModalOpen(false);
      setPropertyToDelete(null);
      setBookingsForDelete([]);
      return;
    }

    try {
      await performPropertyDeletion(propertyToDelete.id, propertyToDelete, action, bookingsForDelete);
      setIsDeletePropertyModalOpen(false);
      setPropertyToDelete(null);
      setBookingsForDelete([]);
    } catch (error) {
      console.error('Error in handleDeletePropertyConfirm:', error);
      // Модальное окно остается открытым для повторной попытки
    }
  };

  const performPropertyDeletion = async (
    propertyId: string,
    property: Property,
    action: 'cancel_unpaid' | 'force_delete',
    bookings: Booking[]
  ) => {
    if (!user) {
      toast.error(t('errors.somethingWentWrong'));
      return;
    }

    const loadingToast = toast.loading(t('common.loading', { defaultValue: 'Загрузка...' }));

    try {
      let processedBookingsCount = 0;

      // Обработка бронирований в зависимости от действия
      if (action === 'cancel_unpaid') {
        // Отменяем неоплаченные бронирования (status != 'confirmed')
        const unpaidBookings = bookings.filter(b => b.status !== 'confirmed');
        if (unpaidBookings.length > 0) {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('property_id', propertyId)
            .neq('status', 'confirmed'); // Обновляем только неоплаченные

          if (updateError) {
            throw updateError;
          }
          processedBookingsCount = unpaidBookings.length;
        }
      } else if (action === 'force_delete') {
        // Удаляем все бронирования
        const { error: deleteError } = await supabase
          .from('bookings')
          .delete()
          .eq('property_id', propertyId);

        if (deleteError) {
          throw deleteError;
        }
        processedBookingsCount = bookings.length;
      }

      // Проверяем наличие активной Avito интеграции
      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('*')
        .eq('property_id', propertyId)
        .eq('platform', 'avito')
        .eq('is_active', true)
        .maybeSingle();

      let avitoSynced = false;
      if (!integrationError && integration) {
        try {
          // Вызываем Edge Function для закрытия дат в Avito
          const { data: closeData, error: closeError } = await supabase.functions.invoke('avito-close-availability', {
            body: {
              integration_id: integration.id,
              property_id: propertyId,
            },
          });

          if (closeError) {
            console.error('Avito close availability error:', closeError);
            // Не блокируем удаление, но показываем предупреждение
            toast.error(t('avito.errors.syncFailed', { defaultValue: 'Ошибка синхронизации с Avito' }));
          } else if (closeData && closeData.error === 'paid_conflict') {
            // 409 Conflict - есть оплаченные бронирования
            toast.error(t('properties.avitoPaidBookingsError', {
              defaultValue: 'Avito: Есть оплаченные брони — верните деньги вручную',
            }));
            // Продолжаем удаление, но предупреждаем пользователя
          } else if (closeData && closeData.success) {
            avitoSynced = true;
          }
        } catch (avitoError) {
          console.error('Error calling Avito close availability:', avitoError);
          // Не блокируем удаление при ошибке Avito
        }
      }

      // Soft delete объекта
      // Try soft delete first, fallback to hard delete if column doesn't exist
      let deleteError: { code?: string; message?: string; details?: string; hint?: string } | null = null;
      const { error: softDeleteError } = await supabase
        .from('properties')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', propertyId)
        .eq('owner_id', user.id);
      
      // Check if error is due to missing deleted_at column
      const isColumnMissing = softDeleteError && (
        softDeleteError.code === 'PGRST204' ||
        (softDeleteError.message && softDeleteError.message.includes("deleted_at"))
      );
      
      if (isColumnMissing) {
        // Column doesn't exist, use hard delete
        console.warn('deleted_at column not found, using hard delete', { error: softDeleteError });
        const { error: hardDeleteError } = await supabase
          .from('properties')
          .delete()
          .eq('id', propertyId)
          .eq('owner_id', user.id);
        deleteError = hardDeleteError;
      } else {
        deleteError = softDeleteError;
      }

      if (deleteError) {
        throw deleteError;
      }

      // Обновляем локальное состояние (удаляем объект из списка)
      setProperties(prev => prev.filter((p) => p.id !== propertyId));

      // Обновляем бронирования (удаляем или обновляем статусы)
      if (action === 'force_delete') {
        // Удаляем все бронирования из локального состояния
        setBookings(prev => prev.filter((b) => b.property_id !== propertyId));
        setFilteredBookings(prev => prev.filter((b) => b.property_id !== propertyId));
      } else if (action === 'cancel_unpaid') {
        // Обновляем статусы отмененных бронирований в локальном состоянии
        setBookings(prev => prev.map(b => 
          b.property_id === propertyId && b.status !== 'confirmed' 
            ? { ...b, status: 'cancelled' as const }
            : b
        ));
        setFilteredBookings(prev => prev.map(b => 
          b.property_id === propertyId && b.status !== 'confirmed' 
            ? { ...b, status: 'cancelled' as const }
            : b
        ));
      }

      toast.dismiss(loadingToast);
      
      const avitoMessage = avitoSynced ? ', Avito синхронизирован' : '';
      toast.success(`Объект "${property.name}" удалён, ${processedBookingsCount} брони обработаны${avitoMessage}`);
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error performing property deletion:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-slate-800 border-b border-slate-700 px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowSearchDropdown(true)}
                placeholder={t('common.search')}
                className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                data-testid="input-search"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-96 overflow-y-auto z-50">
                  <div className="px-3 py-2 border-b border-slate-700 text-xs text-slate-500">
                    {t('bookings.found')}: {searchResults.length}
                  </div>
                  {searchResults.map((booking) => {
                    const property = properties.find(p => p.id === booking.property_id);
                    const checkIn = new Date(booking.check_in).toLocaleDateString('ru-RU');
                    const checkOut = new Date(booking.check_out).toLocaleDateString('ru-RU');
                    const nights = Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <button
                        key={booking.id}
                        onClick={() => {
                          setShowSearchDropdown(false);
                          setSearchQuery('');
                          handleEditReservation(booking);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-b-0"
                        data-testid={`search-result-${booking.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-white">{booking.guest_name}</span>
                          <span className="text-sm font-medium text-teal-400">
                            {booking.total_price.toLocaleString('ru-RU')} {booking.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">{property?.name || t('common.unknown')}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            booking.status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                            booking.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {booking.status === 'confirmed' ? t('bookings.confirmed') : booking.status === 'pending' ? t('bookings.pending') : t('bookings.cancelled')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                          <span>{checkIn} - {checkOut} ({nights} {nights === 1 ? t('common.night') : nights < 5 ? t('common.nights_few') : t('common.nights')})</span>
                          {booking.guest_phone && <span>{booking.guest_phone}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              <ThemeToggle />

              <button
                onClick={handleSync}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors relative"
                title="Sync with external APIs"
                data-testid="button-sync"
              >
                <Bell className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-teal-500 rounded-full"></span>
              </button>

              <div
                className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-slate-700 cursor-pointer hover:bg-slate-700/50 rounded-lg p-1 md:p-2 transition-colors"
                onClick={() => setIsProfileModalOpen(true)}
                title={t('settings.profile')}
                data-testid="button-profile"
              >
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-white">{t('properties.title')}</div>
                  <div className="text-xs text-slate-400">{user?.email}</div>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {loading ? (
          <SkeletonCalendar />
        ) : currentView === 'properties' ? (
          // ВСЕГДА передаем properties в PropertiesView, даже если groups error
          (() => {
            console.log('Dashboard: Rendering PropertiesView', { 
              propertiesCount: properties.length,
              properties: properties.map(p => ({ id: p.id, name: p.name }))
            });
            // ВСЕГДА рендерим PropertiesView, даже если properties пустой (покажет "нет объектов")
            return (
              <PropertiesView
                properties={properties || []}
                onAdd={handleAddProperty}
                onUpdate={handleUpdateProperty}
                onDelete={handleDeleteProperty}
              />
            );
          })()
        ) : currentView === 'bookings' ? (
          <BookingsView
            bookings={bookings}
            properties={properties}
            onEdit={handleEditReservation}
            onImport={() => setIsImportModalOpen(true)}
          />
        ) : currentView === 'analytics' ? (
          <AnalyticsView bookings={bookings} properties={properties} />
        ) : currentView === 'admin' && isAdmin ? (
          <AdminView />
        ) : currentView === 'settings' ? (
          <SettingsView bookings={bookings} properties={properties} />
        ) : currentView === 'calendar' ? (
          <>
            <Calendar
              properties={properties}
              bookings={filteredBookings}
              onAddReservation={handleAddReservation}
              onEditReservation={handleEditReservation}
              onBookingUpdate={(id, updates) => {
                const updatedBookings = bookings.map(b =>
                  b.id === id ? { ...b, ...updates } : b
                );
                setBookings(updatedBookings);
                setFilteredBookings(updatedBookings);
              }}
              onPropertiesUpdate={(updatedProperties) => {
                setProperties(updatedProperties);
              }}
              onDateSelectionReset={() => {
                // Callback for date selection reset (optional)
              }}
            />
            <AddReservationModal
              isOpen={isAddModalOpen}
              onClose={() => {
                setIsAddModalOpen(false);
                setSelectedPropertyIds([]);
                setPrefilledDates(null);
                // Reset date selection in Calendar via window function
                const resetFn = (window as Window & { __calendarResetDateSelection?: () => void }).__calendarResetDateSelection;
                if (resetFn) {
                  resetFn();
                }
              }}
              properties={properties}
              selectedProperties={selectedPropertyIds}
              prefilledDates={prefilledDates}
              onAdd={handleSaveReservation}
            />
            <EditReservationModal
              isOpen={isEditModalOpen}
              onClose={() => {
                setIsEditModalOpen(false);
                setSelectedBooking(null);
              }}
              booking={selectedBooking}
              properties={properties}
              onUpdate={handleUpdateReservation}
              onDelete={handleDeleteReservation}
            />
            <OverlapWarningModal
              isOpen={isOverlapWarningOpen}
              onContinue={handleOverlapContinue}
              onGoBack={handleOverlapGoBack}
              overlappingBookings={overlappingBookings}
            />
            <UserProfileModal
              isOpen={isProfileModalOpen}
              onClose={() => setIsProfileModalOpen(false)}
              profile={userProfile}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-slate-400 mb-4">{t('common.underDevelopment')}</p>
              <button
                onClick={() => setCurrentView('calendar')}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
              >
                {t('nav.calendar')}
              </button>
            </div>
          </div>
        )}

        {/* Delete Property Modal */}
        {propertyToDelete && (
          <DeletePropertyModal
            isOpen={isDeletePropertyModalOpen}
            onClose={() => {
              setIsDeletePropertyModalOpen(false);
              setPropertyToDelete(null);
              setBookingsForDelete([]);
            }}
            property={propertyToDelete}
            bookings={bookingsForDelete}
            onConfirm={handleDeletePropertyConfirm}
          />
        )}

        {/* Import Bookings Modal */}
        <ImportBookingsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            loadData();
            setCurrentView('bookings');
          }}
        />
      </div>
    </div>
  );
}
