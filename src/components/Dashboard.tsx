import { useState, useEffect, useCallback } from 'react';
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
import { syncWithExternalAPIs } from '../services/apiSync';

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
          if (result.error && attempt > 1) {
            console.log(`Query succeeded after ${attempt} attempts`);
          }
          return result;
        }
        
        // Если это последняя попытка, возвращаем результат с ошибкой
        if (attempt === retries) {
          console.error(`Query failed after ${retries} attempts:`, result.error);
          return result;
        }
        
        // Логируем только первую попытку, чтобы не засорять консоль
        if (attempt === 1 && result.error.message?.includes('Failed to fetch')) {
          console.log(`Query failed, retrying... (attempt ${attempt}/${retries})`);
        }
        
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
        
        // Логируем только первую попытку
        if (attempt === 1) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('Failed to fetch')) {
            console.log(`Query error, retrying... (attempt ${attempt}/${retries})`);
          }
        }
        
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
      console.log('Loading data for user:', user.id);

      const session = await supabase.auth.getSession();
      console.log('Session user ID:', session.data.session?.user?.id);

      // Retry для properties
      const propertiesResult = await retrySupabaseQuery<Property[]>(
        async () => {
          const result = await supabase
            .from('properties')
            .select('*')
            .eq('owner_id', user.id);
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

      console.log('Properties error:', propsError);
      console.log('Properties data:', propertiesData);

      if (propertiesData) {
        setProperties(propertiesData);

        const propertyIds = propertiesData.map((p: Property) => p.id);
        console.log('Property IDs:', propertyIds);

        if (propertyIds.length > 0) {
          // Retry для bookings
          const bookingsResult = await retrySupabaseQuery<Booking[]>(
            async () => {
              const result = await supabase
                .from('bookings')
                .select('*')
                .in('property_id', propertyIds)
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

          console.log('Bookings error:', bookingsError);
          console.log('Bookings data:', bookingsData);

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
    } finally {
      setLoading(false);
    }
  }, [user, retrySupabaseQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadData]);

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
      const { data, error } = await supabase.from('bookings').insert([reservation]).select();

      if (error) throw error;

      if (data && data.length > 0) {
        setBookings([...bookings, data[0]]);
        setFilteredBookings([...bookings, data[0]]);
      }
      setIsAddModalOpen(false);
      setPrefilledDates(null);
      toast.success(t('success.bookingCreated'));
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
      const { error } = await supabase.from('bookings').update(data).eq('id', id);

      if (error) throw error;

      const updatedBookings = bookings.map((b) =>
        b.id === id ? { ...b, ...data } : b
      );
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);
      toast.success(t('success.bookingUpdated'));
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleDeleteReservation = async (id: string) => {
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id);

      if (error) throw error;

      const updatedBookings = bookings.filter((b) => b.id !== id);
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);
      toast.success(t('success.bookingDeleted'));
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
      const { error } = await supabase.from('properties').update(property).eq('id', id);

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
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);

      if (error) throw error;

      setProperties(properties.filter((p) => p.id !== id));
      toast.success(t('success.propertyDeleted'));
    } catch (error) {
      console.error('Error deleting property:', error);
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
          <PropertiesView
            properties={properties}
            onAdd={handleAddProperty}
            onUpdate={handleUpdateProperty}
            onDelete={handleDeleteProperty}
          />
        ) : currentView === 'bookings' ? (
          <BookingsView
            bookings={bookings}
            properties={properties}
            onEdit={handleEditReservation}
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
            />
            <AddReservationModal
              isOpen={isAddModalOpen}
              onClose={() => {
                setIsAddModalOpen(false);
                setSelectedPropertyIds([]);
                setPrefilledDates(null);
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
      </div>
    </div>
  );
}
