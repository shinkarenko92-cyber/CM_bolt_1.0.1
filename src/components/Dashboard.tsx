import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, User, X, Plug2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Sidebar } from '@/components/Sidebar';
import { Calendar } from '@/components/Calendar';
import { AddReservationModal } from '@/components/AddReservationModal';
import { EditReservationModal } from '@/components/EditReservationModal';
import { OverlapWarningModal } from '@/components/OverlapWarningModal';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { GuestModal } from '@/components/GuestModal';
import { UserProfileModal } from '@/components/UserProfileModal';

const PropertiesView = lazy(() => import('@/components/PropertiesView').then(m => ({ default: m.PropertiesView })));
const BookingsView = lazy(() => import('@/components/BookingsView').then(m => ({ default: m.BookingsView })));
const AnalyticsView = lazy(() => import('@/components/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const AnalyticsInsights = lazy(() => import('@/components/AnalyticsInsights').then(m => ({ default: m.AnalyticsInsights })));
const AdminView = lazy(() => import('@/components/AdminView').then(m => ({ default: m.AdminView })));
const SettingsView = lazy(() => import('@/components/SettingsView').then(m => ({ default: m.SettingsView })));
const MessagesView = lazy(() => import('@/components/MessagesView').then(m => ({ default: m.MessagesView })));
const ChatPanel = lazy(() => import('@/components/ChatPanel').then(m => ({ default: m.ChatPanel })));
import { ThemeToggle } from '@/components/ThemeToggle';
import { SkeletonCalendar } from '@/components/Skeleton';
import { ViewSkeleton } from '@/components/ViewSkeleton';
import { ErrorRetry } from '@/components/ErrorRetry';
import { DashboardKPI } from '@/components/DashboardKPI';
const OnboardingWizard = lazy(() => import('@/components/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
import { supabase, Property, Booking, Guest, Chat } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getOAuthSuccess, getOAuthError } from '@/services/avito';
import { useAvitoChats } from '@/hooks/useAvitoChats';
import { syncWithExternalAPIs } from '@/services/apiSync';
import { syncAvitoWithNotify } from '@/services/avitoSyncNotify';
import { insertBookingWithRetry, updateBookingWithRetry } from '@/utils/bookingMutations';
const DeletePropertyModal = lazy(() => import('@/components/DeletePropertyModal').then(m => ({ default: m.DeletePropertyModal })));
const ImportBookingsModal = lazy(() => import('@/components/ImportBookingsModal').then(m => ({ default: m.ImportBookingsModal })));
const AccountsModal = lazy(() => import('@/components/AccountsModal').then(m => ({ default: m.AccountsModal })));
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logBookingChange, getBookingChanges } from '@/services/bookingLog';
import { getPropertyLimit, getBookingLimit, isDemoExpired } from '@/utils/subscriptionLimits';
const CleaningAdminView = lazy(() => import('@/pages/Cleaning/AdminView').then(m => ({ default: m.CleaningAdminView })));
const CleaningCleanerView = lazy(() => import('@/pages/Cleaning/CleanerView').then(m => ({ default: m.CleaningCleanerView })));
import { BottomNav } from '@/components/BottomNav';

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
  deposit_amount?: number | null;
  deposit_received?: boolean | null;
  deposit_returned?: boolean | null;
};


export function Dashboard() {
  const { t } = useTranslation();
  const { user, isAdmin, profile: authProfile } = useAuth();
  const isCleaner = authProfile?.role === 'cleaner';
  const location = useLocation();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState(isCleaner ? 'cleaning' : 'calendar');
  const {
    properties, setProperties,
    bookings, setBookings,
    filteredBookings, setFilteredBookings,
    dateBlocks,
    guests, setGuests,
    userProfile,
    loading,
    loadError,
    reload: reloadDashboardData,
  } = useDashboardData();
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
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [prefilledDates, setPrefilledDates] = useState<{ propertyId: string; checkIn: string; checkOut: string } | null>(null);
  const [isDeletePropertyModalOpen, setIsDeletePropertyModalOpen] = useState(false);
  const [refreshIntegrationsTrigger, setRefreshIntegrationsTrigger] = useState(0);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [bookingsForDelete, setBookingsForDelete] = useState<Booking[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingOpenAddPropertyModal, setPendingOpenAddPropertyModal] = useState(false);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [isBookingLimitModalOpen, setIsBookingLimitModalOpen] = useState(false);
  const [duplicateBooking, setDuplicateBooking] = useState<Booking | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const oauthProcessedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    chats, setChats,
    messages,
    selectedChatId, setSelectedChatId,
    messagesLoading,
    messagesOffset,
    hasMoreMessages,
    isSyncing,
    hasMessengerAccess,
    avitoIntegrationsForMessages,
    loadMessages,
    handleSendMessage,
    handleAvitoMessengerAuth,
    syncMessagesFromAvitoRef,
  } = useAvitoChats(properties, currentView);

  useKeyboardShortcuts({
    onNewBooking: () => setIsAddModalOpen(true),
    searchInputRef,
  });

  // Open Messages tab when returning from Avito Messenger OAuth callback; open Properties when no integration or after Avito OAuth
  useEffect(() => {
    const state = location.state as { openMessages?: boolean; openProperties?: boolean; avitoConnected?: boolean; propertyId?: string };
    if (state?.openMessages) {
      setCurrentView('messages');
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.openProperties || (state?.avitoConnected && state?.propertyId)) {
      setCurrentView('properties');
      if (!state?.avitoConnected) {
        navigate(location.pathname, { replace: true, state: {} });
      }
      // avitoConnected + propertyId: не чистим state здесь — PropertiesView откроет модалку и передаст initialShowAvitoSuccess
    }
  }, [location.state, location.pathname, navigate]);





  // Handle create booking from chat
  const handleCreateBookingFromChat = useCallback((chat: Chat) => {
    if (!chat.property_id) {
      toast.error('Не выбран объект для чата');
      return;
    }

    // Pre-fill reservation modal with chat data
    setSelectedPropertyIds([chat.property_id]);
    setIsAddModalOpen(true);
    // Note: You might want to pre-fill guest info from chat.contact_name, chat.contact_phone
  }, []);

  // Handle status change
  const handleChatStatusChange = useCallback(async (chat: Chat, status: Chat['status']) => {
    try {
      const { error } = await supabase
        .from('chats')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', chat.id);

      if (error) throw error;

      setChats(prev => prev.map(c => c.id === chat.id ? { ...c, status } : c));
      toast.success(t('messages.success.updated'));
    } catch (error) {
      console.error('Error updating chat status:', error);
      toast.error(t('messages.error.failedToUpdate'));
    }
  }, [t, setChats]);

  const handleMarkAllRead = useCallback(async () => {
    const unreadChatIds = chats.filter(c => c.unread_count > 0).map(c => c.id);
    if (!unreadChatIds.length) return;
    // Update state immediately
    setChats(prev => prev.map(c => c.unread_count > 0 ? { ...c, unread_count: 0 } : c));
    // Persist to DB
    await supabase.from('chats').update({ unread_count: 0 }).in('id', unreadChatIds);
    await supabase.from('messages').update({ is_read: true }).in('chat_id', unreadChatIds).eq('is_read', false).eq('sender_type', 'contact');
  }, [chats, setChats]);

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
          toast.success('Лид с Avito!');
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKzn8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDknE4MDlCs5/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch {
            // ignore
          }

          // Refresh bookings
          reloadDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, reloadDashboardData]);


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
  }, [searchQuery, bookings, setFilteredBookings]);

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
    let tempId: string | null = null;
    try {
      const limit = getBookingLimit(userProfile);
      if (limit >= 0) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const userPropertyIds = properties.filter(p => p.owner_id === user?.id).map(p => p.id);
        const countThisMonth = bookings.filter(
          b => userPropertyIds.includes(b.property_id) && new Date(b.check_in) >= monthStart
        ).length;
        if (countThisMonth >= limit) {
          setIsBookingLimitModalOpen(true);
          return;
        }
      }

      // Optimistic: close modal and add temp booking immediately
      tempId = `temp-${Date.now()}`;
      const tempBooking = {
        id: tempId,
        ...reservation,
        owner_id: user!.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as Booking;
      setBookings(prev => [...prev, tempBooking]);
      setFilteredBookings(prev => [...prev, tempBooking]);
      setIsAddModalOpen(false);
      setPrefilledDates(null);
      toast.success(`${t('success.bookingCreated')}. ${t('success.changesSaved')}`);

      const insertPayload: Record<string, unknown> = { ...reservation };
      if (user?.id) {
        insertPayload.created_by = user.id;
        insertPayload.updated_by = user.id;
      }

      const { result: insertResult } = await insertBookingWithRetry(insertPayload);
      if (insertResult.error) throw insertResult.error;
      const data = insertResult.data as unknown[] | null;

      if (data && data.length > 0) {
        const newBooking = data[0] as Booking;
        // Replace temp booking with real booking from DB
        setBookings(prev => prev.map(b => b.id === tempId ? newBooking : b));
        setFilteredBookings(prev => prev.map(b => b.id === tempId ? newBooking : b));

        // Log the creation
        await logBookingChange(
          newBooking.id,
          newBooking.property_id,
          'created',
          undefined,
          reservation.source || 'manual'
        );
      }

      // Sync to Avito (fire-and-forget — modal is already closed)
      syncAvitoWithNotify(reservation.property_id, t, { context: 'booking create' });
    } catch (error) {
      // Rollback optimistic booking
      if (tempId) {
        setBookings(prev => prev.filter(b => b.id !== tempId));
        setFilteredBookings(prev => prev.filter(b => b.id !== tempId));
      }
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

  const handleEditReservation = useCallback((booking: Booking) => {
    setSelectedBooking(booking);
    setIsEditModalOpen(true);
  }, []);

  const handleCalendarBookingUpdate = useCallback((id: string, updates: Partial<Booking>) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    setFilteredBookings(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, [setBookings, setFilteredBookings]);

  const handleCalendarDateSelectionReset = useCallback(() => {}, []);

  const handleDuplicateBooking = useCallback((booking: Booking) => {
    setDuplicateBooking(booking);
    setIsAddModalOpen(true);
  }, []);

  const handleUpdateReservation = async (id: string, data: Partial<Booking>) => {
    // Find the old booking to compare changes
    const oldBooking = bookings.find((b) => b.id === id);

    // Optimistic: update calendar immediately
    const preUpdateBookings = bookings;
    const preUpdateFiltered = filteredBookings;
    setBookings(bookings.map(b => b.id === id ? { ...b, ...data } : b));
    setFilteredBookings(filteredBookings.map(b => b.id === id ? { ...b, ...data } : b));

    try {
      const updatePayload: Record<string, unknown> = { ...data };
      if (user?.id) updatePayload.updated_by = user.id;

      const { result: updateResult, finalPayload } = await updateBookingWithRetry(id, updatePayload);
      if (updateResult.error) throw updateResult.error;

      const finalData = finalPayload as Partial<Booking>;
      const updatedBookings = bookings.map(b => b.id === id ? { ...b, ...finalData } : b);

      // Log the update
      if (oldBooking) {
        const changes = getBookingChanges(oldBooking, finalData);
        if (Object.keys(changes).length > 0) {
          await logBookingChange(id, oldBooking.property_id, 'updated', changes, oldBooking.source || 'manual');
        }
      }
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);
      toast.success(`${t('success.bookingUpdated')}. ${t('success.changesSaved')}`);

      // Sync to Avito for old + new property (covers booking moved between properties)
      const uniqueIds = [...new Set([oldBooking?.property_id, data.property_id].filter(Boolean))] as string[];
      if (uniqueIds.length > 0) {
        syncAvitoWithNotify(uniqueIds, t, { context: 'booking update' });
      }
    } catch (error) {
      // Rollback optimistic update
      setBookings(preUpdateBookings);
      setFilteredBookings(preUpdateFiltered);
      console.error('Error updating reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleDeleteReservation = async (id: string) => {
    // Capture data and optimistically remove from UI immediately
    const booking = bookings.find(b => b.id === id);
    const propertyId = booking?.property_id;
    const bookingSource = booking?.source || 'manual';
    const isAvitoBooking = bookingSource === 'avito';
    const preDeleteBookings = bookings;
    const preDeleteFiltered = filteredBookings;
    setBookings(bookings.filter(b => b.id !== id));
    setFilteredBookings(filteredBookings.filter(b => b.id !== id));
    toast.success(t('success.bookingDeleted'));

    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;

      // Deletion is already logged by DB trigger trigger_log_booking_changes_before_delete

      // Sync to Avito (fire-and-forget — syncAvitoIntegration handles missing integration silently)
      if (propertyId) {
        syncAvitoWithNotify(propertyId, t, {
          excludeBookingId: isAvitoBooking ? undefined : id,
          context: 'booking delete',
        });
      }
    } catch (error) {
      // Rollback optimistic delete
      setBookings(preDeleteBookings);
      setFilteredBookings(preDeleteFiltered);
      console.error('Error deleting reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleSync = async () => {
    await syncWithExternalAPIs();
  };

  const handleAddProperty = async (property: Omit<Property, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => {
    const limit = getPropertyLimit(userProfile);
    if (properties.length >= limit) {
      toast.error(
        t('subscription.propertyLimitReached', {
          defaultValue: 'Достигнут лимит объектов по вашему тарифу. Перейдите в профиль и запросите счёт для повышения тарифа.',
        })
      );
      return;
    }
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
        if (import.meta.env.DEV) console.warn('deleted_at column not found, using hard delete', { error: softDeleteError });
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

  const handleSaveGuest = async (data: Partial<Guest>) => {
    if (!user) return;
    try {
      if (selectedGuest) {
        const { error } = await supabase
          .from('guests')
          .update(data)
          .eq('id', selectedGuest.id);
        if (error) throw error;

        setGuests(guests.map(g => g.id === selectedGuest.id ? { ...g, ...data } as Guest : g));
        toast.success('Данные гостя обновлены');
      } else {
        const { data: newGuest, error } = await supabase
          .from('guests')
          .insert([{ ...data, owner_id: user.id }])
          .select()
          .single();
        if (error) throw error;

        setGuests([...guests, newGuest]);
        toast.success('Гость добавлен');
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при сохранении гостя');
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {isCleaner && isMobile ? (
        <BottomNav currentView={currentView} onViewChange={setCurrentView} />
      ) : (
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="relative z-40 backdrop-blur-md bg-card/90 border-b border-border px-3 md:px-6 py-3 md:py-4 shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowSearchDropdown(true)}
                placeholder={t('common.search')}
                className="pl-9 md:pl-10 h-10"
                data-testid="input-search"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-96 overflow-y-auto z-[100]">
                  <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground">
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
                        type="button"
                        onClick={() => {
                          setShowSearchDropdown(false);
                          setSearchQuery('');
                          handleEditReservation(booking);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-3 transition-colors border-b border-border last:border-b-0',
                          'hover:bg-accent hover:text-accent-foreground'
                        )}
                        data-testid={`search-result-${booking.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{booking.guest_name}</span>
                          <span className="text-sm font-medium text-primary">
                            {booking.total_price.toLocaleString('ru-RU')} {booking.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{property?.name || t('common.unknown')}</span>
                          <span className={cn(
                            'px-2 py-0.5 rounded text-xs',
                            booking.status === 'confirmed' && 'bg-success/20 text-success',
                            booking.status === 'pending' && 'bg-warning/20 text-warning',
                            booking.status === 'cancelled' && 'bg-destructive/20 text-destructive'
                          )}>
                            {booking.status === 'confirmed' ? t('bookings.confirmed') : booking.status === 'pending' ? t('bookings.pending') : t('bookings.cancelled')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
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
                type="button"
                onClick={handleSync}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors relative"
                title="Синхронизация с внешними API"
                data-testid="button-sync"
              >
                <Bell className="h-4 w-4 md:h-5 md:w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-brand rounded-full" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-border cursor-pointer hover:bg-accent rounded-lg p-1 md:p-2 transition-colors outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    title={t('settings.profile')}
                    data-testid="button-profile"
                  >
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-medium">{t('properties.title')}</div>
                      <div className="text-xs text-muted-foreground">{user?.email}</div>
                    </div>
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-brand text-brand-foreground">
                        <User className="h-4 w-4 md:h-5 md:w-5" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setIsProfileModalOpen(true)}>
                    <User className="mr-2 h-4 w-4" />
                    {t('settings.profile')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {userProfile && isDemoExpired(userProfile) && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-amber-800 dark:text-amber-200 text-sm font-medium">
              {t('subscription.demoExpired', { defaultValue: 'Демо закончилось. Выберите тариф в профиле для продолжения работы.' })}
            </span>
            <Button variant="outline" size="sm" onClick={() => setIsProfileModalOpen(true)} className="border-amber-500/50 text-amber-800 dark:text-amber-200">
              {t('subscription.openProfile', { defaultValue: 'Профиль и тариф' })}
            </Button>
          </div>
        )}

        <ErrorBoundary inline>
        <Suspense fallback={<ViewSkeleton />}>
        {loading ? (
          currentView === 'bookings' ? <ViewSkeleton variant="cards" /> :
          currentView === 'properties' ? <ViewSkeleton variant="cards" /> :
          currentView === 'messages' ? <ViewSkeleton variant="chat" /> :
          currentView === 'analytics' ? <ViewSkeleton variant="cards" /> :
          <SkeletonCalendar />
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <ErrorRetry message={loadError} onRetry={reloadDashboardData} />
          </div>
        ) : bookings.length === 0 && properties.length === 0 && currentView !== 'properties' ? (
          <OnboardingWizard
            hasProperties={properties.length > 0}
            hasBookings={bookings.length > 0}
            hasAvito={avitoIntegrationsForMessages.length > 0}
            onGoToProperties={() => setCurrentView('properties')}
            onAddProperty={() => {
              setCurrentView('properties');
              setPendingOpenAddPropertyModal(true);
            }}
          />
        ) : currentView === 'properties' ? (
          <PropertiesView
            properties={properties || []}
            onAdd={handleAddProperty}
            onUpdate={handleUpdateProperty}
            onDelete={handleDeleteProperty}
            onPropertyModalClose={() => setRefreshIntegrationsTrigger((t) => t + 1)}
            initialOpenAddModal={bookings.length === 0 && properties.length === 0 ? pendingOpenAddPropertyModal : false}
            onOpenAddModalConsumed={() => setPendingOpenAddPropertyModal(false)}
          />
        ) : currentView === 'bookings' ? (
          <BookingsView
            bookings={bookings}
            properties={properties}
            onEdit={handleEditReservation}
            onImport={() => setIsImportModalOpen(true)}
          />
        ) : currentView === 'messages' ? (
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Header - hide on mobile when chat is open */}
            {(!isMobile || !selectedChatId) && (
              <header className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
                <h2 className="text-lg font-bold">{t('messages.title', 'Сообщения')}</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAccountsModalOpen(true)}>
                  <Plug2 className="h-4 w-4" />
                </Button>
              </header>
            )}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Chat list - full width on mobile, hidden when chat is open on mobile */}
              {(!isMobile || !selectedChatId) && (
                <div className={`${isMobile ? 'flex-1' : 'w-80 shrink-0 border-r border-border'} flex flex-col min-h-0`}>
                  <MessagesView
                    chats={chats}
                    properties={properties}
                    selectedChatId={selectedChatId}
                    onSelectChat={setSelectedChatId}
                    hasMessengerAccess={hasMessengerAccess}
                    integrationsForMessenger={avitoIntegrationsForMessages}
                    onRequestMessengerAuth={handleAvitoMessengerAuth}
                    onGoToProperties={() => setCurrentView('properties')}
                    onMarkAllRead={handleMarkAllRead}
                  />
                </div>
              )}
              {/* Chat panel - full width on mobile */}
              {selectedChatId ? (
                <div className="flex-1 flex flex-col min-w-0">
                  <ChatPanel
                    chat={chats.find(c => c.id === selectedChatId) || null}
                    property={chats.find(c => c.id === selectedChatId)?.property_id
                      ? properties.find(p => p.id === chats.find(c => c.id === selectedChatId)?.property_id || '') || null
                      : null}
                    messages={messages}
                    isLoading={messagesLoading}
                    isSyncing={isSyncing}
                    onSendMessage={async (text, attachments) => {
                      if (selectedChatId) {
                        await handleSendMessage(selectedChatId, text, attachments);
                      }
                    }}
                    onLoadMore={() => selectedChatId && loadMessages(selectedChatId, messagesOffset)}
                    hasMore={hasMoreMessages}
                    onCreateBooking={handleCreateBookingFromChat}
                    onStatusChange={handleChatStatusChange}
                    onRefresh={selectedChatId ? () => syncMessagesFromAvitoRef.current(selectedChatId) : undefined}
                    onBack={isMobile ? () => setSelectedChatId(null) : undefined}
                  />
                </div>
              ) : !isMobile ? (
                <div className="flex-1 flex items-center justify-center bg-muted/30 border-l border-border">
                  <div className="text-center px-6">
                    <p className="text-muted-foreground">{t('messages.selectChat', 'Выберите чат')}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : currentView === 'analytics' ? (
          isMobile ? (
            <AnalyticsInsights bookings={bookings} properties={properties} />
          ) : (
            <AnalyticsView bookings={bookings} properties={properties} />
          )
        ) : currentView === 'cleaning' ? (
          isAdmin ? <CleaningAdminView properties={properties} /> : <CleaningCleanerView />
        ) : currentView === 'admin' && isAdmin ? (
          <AdminView />
        ) : currentView === 'settings' ? (
          <div className="flex flex-1 flex-col overflow-auto">
            <div className="flex flex-1 overflow-auto p-4 md:p-6 lg:p-8">
              <div className="w-full max-w-4xl space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{t('settings.title', 'Настройки')}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('settings.close', 'Закрыть')}
                    onClick={() => setCurrentView('calendar')}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <SettingsView bookings={bookings} properties={properties} />
              </div>
            </div>
          </div>
        ) : currentView === 'calendar' ? (
          <>
            {(bookings.length > 0 || properties.length > 0) && (
              <div className="mt-10">
                <DashboardKPI bookings={bookings} properties={properties} />
              </div>
            )}
            <Calendar
              properties={properties}
              bookings={bookings}
              dateBlocks={dateBlocks}
              onAddReservation={handleAddReservation}
              onEditReservation={handleEditReservation}
              onBookingUpdate={handleCalendarBookingUpdate}
              onPropertiesUpdate={setProperties}
              onDateSelectionReset={handleCalendarDateSelectionReset}
              onRefresh={reloadDashboardData}
              refreshIntegrationsTrigger={refreshIntegrationsTrigger}
            />
            <AddReservationModal
              isOpen={isAddModalOpen}
              onClose={() => {
                setIsAddModalOpen(false);
                setSelectedPropertyIds([]);
                setPrefilledDates(null);
                setDuplicateBooking(null);
                // Reset date selection in Calendar via window function
                const resetFn = (window as Window & { __calendarResetDateSelection?: () => void }).__calendarResetDateSelection;
                if (resetFn) {
                  resetFn();
                }
              }}
              properties={properties}
              selectedProperties={selectedPropertyIds}
              prefilledDates={prefilledDates}
              prefilledBooking={duplicateBooking}
              onAdd={handleSaveReservation}
              guests={guests}
            />
            <GuestModal
              isOpen={isGuestModalOpen}
              onClose={() => {
                setIsGuestModalOpen(false);
                setSelectedGuest(null);
              }}
              guest={selectedGuest}
              bookings={bookings}
              properties={properties}
              onSave={handleSaveGuest}
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
              onDuplicate={handleDuplicateBooking}
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
            <Dialog open={isBookingLimitModalOpen} onOpenChange={setIsBookingLimitModalOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('subscription.bookingLimitTitle', { defaultValue: 'Лимит бронирований' })}</DialogTitle>
                  <DialogDescription>
                    {t('subscription.bookingLimitReached', {
                      defaultValue: 'Лимит бронирований по тарифу за месяц достигнут. Перейдите в профиль для смены плана.',
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setIsBookingLimitModalOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={() => {
                      setIsBookingLimitModalOpen(false);
                      setIsProfileModalOpen(true);
                    }}
                  >
                    {t('subscription.requestInvoiceOrPlan', { defaultValue: 'Запросить счёт / Подключить тариф' })}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">{t('common.underDevelopment')}</p>
              <Button onClick={() => setCurrentView('calendar')}>{t('nav.calendar')}</Button>
            </div>
          </div>
        )}
        </Suspense>
        </ErrorBoundary>

        {/* Delete Property Modal */}
        {propertyToDelete && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}

        {/* Accounts Modal */}
        <Suspense fallback={null}>
          <AccountsModal
            open={accountsModalOpen}
            onOpenChange={setAccountsModalOpen}
            properties={properties}
            onRequestMessengerAuth={handleAvitoMessengerAuth}
          />
        </Suspense>

        {/* Import Bookings Modal */}
        {isImportModalOpen && (
          <Suspense fallback={null}>
          <ImportBookingsModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={() => {
              reloadDashboardData();
              setCurrentView('bookings');
            }}
          />
          </Suspense>
        )}
      </div>
    </div>
  );
}
