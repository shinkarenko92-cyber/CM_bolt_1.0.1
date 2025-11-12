import { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Calendar } from './Calendar';
import { AddReservationModal } from './AddReservationModal';
import { EditReservationModal } from './EditReservationModal';
import { OverlapWarningModal } from './OverlapWarningModal';
import { PropertiesView } from './PropertiesView';
import { BookingsView } from './BookingsView';
import { AnalyticsView } from './AnalyticsView';
import { AdminView } from './AdminView';
import { UserProfileModal } from './UserProfileModal';
import { ThemeToggle } from './ThemeToggle';
import { supabase, Property, Booking, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { syncWithExternalAPIs } from '../services/apiSync';

export function Dashboard() {
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
  const [pendingReservation, setPendingReservation] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [prefilledDates, setPrefilledDates] = useState<{ propertyId: string; checkIn: string; checkOut: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

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

  const loadData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      console.log('Loading data for user:', user.id);

      const session = await supabase.auth.getSession();
      console.log('Session user ID:', session.data.session?.user?.id);

      const { data: propertiesData, error: propsError } = await supabase
        .from('properties')
        .select('*')
        .eq('owner_id', user.id);

      console.log('Properties error:', propsError);
      console.log('Properties data:', propertiesData);

      if (propertiesData) {
        setProperties(propertiesData);

        const propertyIds = propertiesData.map(p => p.id);
        console.log('Property IDs:', propertyIds);

        if (propertyIds.length > 0) {
          const { data: bookingsData, error: bookingsError } = await supabase
            .from('bookings')
            .select('*')
            .in('property_id', propertyIds)
            .order('check_in');

          console.log('Bookings error:', bookingsError);
          console.log('Bookings data:', bookingsData);

          if (bookingsData) {
            setBookings(bookingsData);
            setFilteredBookings(bookingsData);
          }
        }
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData) {
        setUserProfile(profileData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const saveReservationToDatabase = async (reservation: any) => {
    try {
      const { data, error } = await supabase.from('bookings').insert([reservation]).select();

      if (error) throw error;

      if (data && data.length > 0) {
        setBookings([...bookings, data[0]]);
        setFilteredBookings([...bookings, data[0]]);
      }
      setIsAddModalOpen(false);
      setPrefilledDates(null);
    } catch (error) {
      console.error('Error saving reservation:', error);
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
    } catch (error) {
      console.error('Error updating reservation:', error);
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
    } catch (error) {
      console.error('Error deleting reservation:', error);
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
    } catch (error) {
      console.error('Error adding property:', error);
      throw error;
    }
  };

  const handleUpdateProperty = async (id: string, property: Partial<Property>) => {
    try {
      const { error } = await supabase.from('properties').update(property).eq('id', id);

      if (error) throw error;

      setProperties(properties.map((p) => (p.id === id ? { ...p, ...property } : p)));
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  };

  const handleDeleteProperty = async (id: string) => {
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);

      if (error) throw error;

      setProperties(properties.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Error deleting property:', error);
      throw error;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowSearchDropdown(true)}
                placeholder="Поиск по имени, телефону или email..."
                className="w-96 pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-96 overflow-y-auto z-50">
                  {searchResults.map((booking) => {
                    const property = properties.find(p => p.id === booking.property_id);
                    const checkIn = new Date(booking.check_in).toLocaleDateString('ru-RU');
                    const checkOut = new Date(booking.check_out).toLocaleDateString('ru-RU');
                    return (
                      <button
                        key={booking.id}
                        onClick={() => {
                          setShowSearchDropdown(false);
                          handleEditReservation(booking);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-b-0"
                      >
                        <div className="font-semibold text-white mb-1">{booking.guest_name}</div>
                        <div className="text-sm text-slate-400">
                          {property?.name || 'Unknown Property'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {checkIn} - {checkOut}
                        </div>
                        {booking.guest_phone && (
                          <div className="text-xs text-slate-500">{booking.guest_phone}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 ml-6">
              <ThemeToggle />

              <button
                onClick={handleSync}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors relative"
                title="Sync with external APIs"
              >
                <Bell className="w-5 h-5 text-slate-400" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-teal-500 rounded-full"></span>
              </button>

              <div
                className="flex items-center gap-3 pl-4 border-l border-slate-700 cursor-pointer hover:bg-slate-700/50 rounded-lg p-2 transition-colors"
                onClick={() => setIsProfileModalOpen(true)}
                title="View profile"
              >
                <div className="text-right">
                  <div className="text-sm font-medium text-white">My Properties</div>
                  <div className="text-xs text-slate-400">{user?.email}</div>
                </div>
                <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-slate-400">Loading...</div>
          </div>
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
              <p className="text-slate-400 mb-4">This section is under development</p>
              <button
                onClick={() => setCurrentView('calendar')}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
              >
                Go to Calendar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
