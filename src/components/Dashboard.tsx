import { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Calendar } from './Calendar';
import { supabase, Property, Booking } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState('calendar');
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSeeded, setHasSeeded] = useState(false);

  useEffect(() => {
    loadData();
  }, [user]);

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
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search bookings, guests, properties..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 ml-6">
              <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5 text-slate-400" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-teal-500 rounded-full"></span>
              </button>

              <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
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
        ) : currentView === 'calendar' ? (
          <Calendar properties={properties} bookings={bookings} />
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
