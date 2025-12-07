import { useState, useMemo, useCallback } from 'react';
import { Search, Calendar, MapPin, User, Phone, Mail } from 'lucide-react';
import { Booking, Property } from '../lib/supabase';

interface BookingsViewProps {
  bookings: Booking[];
  properties: Property[];
  onEdit: (booking: Booking) => void;
}

export function BookingsView({ bookings, properties, onEdit }: BookingsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'upcoming' | 'past'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'property' | 'source'>('date');

  const getPropertyName = useCallback((propertyId: string) => {
    return properties.find((p) => p.id === propertyId)?.name || 'Неизвестно';
  }, [properties]);

  const getSourceBadge = (source: string) => {
    const colors = {
      manual: 'bg-slate-600 text-slate-200',
      airbnb: 'bg-pink-600 text-white',
      booking: 'bg-blue-600 text-white',
      avito: 'bg-green-600 text-white',
      cian: 'bg-red-600 text-white',
    };

    const labels = {
      manual: 'Вручную',
      airbnb: 'Airbnb',
      booking: 'Booking.com',
      avito: 'Avito',
      cian: 'CIAN',
    };

    return {
      color: colors[source as keyof typeof colors] || colors.manual,
      label: labels[source as keyof typeof labels] || source,
    };
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };

    const labels = {
      confirmed: 'Подтверждено',
      pending: 'Ожидание',
      cancelled: 'Отменено',
    };

    return {
      color: colors[status as keyof typeof colors] || colors.pending,
      label: labels[status as keyof typeof labels] || status,
    };
  };

  const filteredAndSortedBookings = useMemo(() => {
    const nowDate = new Date();
    const now = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

    const filtered = bookings.filter((booking) => {
      const matchesSearch =
        booking.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getPropertyName(booking.property_id).toLowerCase().includes(searchTerm.toLowerCase());

      const checkInDate = new Date(booking.check_in);
      const checkIn = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());

      const matchesFilter =
        filterType === 'all' ||
        (filterType === 'upcoming' && checkIn >= now) ||
        (filterType === 'past' && checkIn < now);

      return matchesSearch && matchesFilter;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.check_in).getTime() - new Date(a.check_in).getTime();
      } else if (sortBy === 'property') {
        return getPropertyName(a.property_id).localeCompare(getPropertyName(b.property_id));
      } else if (sortBy === 'source') {
        return a.source.localeCompare(b.source);
      }
      return 0;
    });

    return filtered;
  }, [bookings, searchTerm, filterType, sortBy, getPropertyName]);

  const stats = useMemo(() => {
    const nowDate = new Date();
    const now = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

    const upcoming = bookings.filter((b) => {
      const checkInDate = new Date(b.check_in);
      const checkIn = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      return checkIn >= now;
    }).length;

    const past = bookings.filter((b) => {
      const checkInDate = new Date(b.check_in);
      const checkIn = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      return checkIn < now;
    }).length;

    return { total: bookings.length, upcoming, past };
  }, [bookings]);

  const calculateNights = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Бронирования</h1>
          <p className="text-slate-400">Просмотр всех прошлых и будущих бронирований</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">Всего</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">Будущие</div>
            <div className="text-2xl font-bold text-teal-400">{stats.upcoming}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">Прошлые</div>
            <div className="text-2xl font-bold text-slate-400">{stats.past}</div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Поиск по гостю или объекту..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  filterType === 'all'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => setFilterType('upcoming')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  filterType === 'upcoming'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Будущие
              </button>
              <button
                onClick={() => setFilterType('past')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  filterType === 'past'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Прошлые
              </button>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'property' | 'source')}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            >
              <option value="date">Сортировка: Дата</option>
              <option value="property">Сортировка: Объект</option>
              <option value="source">Сортировка: Источник</option>
            </select>
          </div>
        </div>

        {filteredAndSortedBookings.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg">
            <p className="text-slate-400">Бронирований не найдено</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedBookings.map((booking) => {
              const source = getSourceBadge(booking.source);
              const status = getStatusBadge(booking.status);
              const nights = calculateNights(booking.check_in, booking.check_out);

              return (
                <div
                  key={booking.id}
                  onClick={() => onEdit(booking)}
                  className="bg-slate-800 rounded-lg p-4 hover:ring-2 hover:ring-teal-500 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{booking.guest_name}</h3>
                        <span className={`px-2 py-1 text-xs rounded ${source.color}`}>
                          {source.label}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
                        <div className="flex items-center gap-1">
                          <MapPin size={14} />
                          <span>{getPropertyName(booking.property_id)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span>
                            {new Date(booking.check_in).toLocaleDateString('ru-RU')} -{' '}
                            {new Date(booking.check_out).toLocaleDateString('ru-RU')} ({nights}{' '}
                            {nights === 1 ? 'ночь' : 'ночей'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User size={14} />
                          <span>
                            {booking.guests_count} {booking.guests_count === 1 ? 'гость' : 'гостей'}
                          </span>
                        </div>
                      </div>

                      {(booking.guest_email || booking.guest_phone) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
                          {booking.guest_email && (
                            <div className="flex items-center gap-1">
                              <Mail size={14} />
                              <span>{booking.guest_email}</span>
                            </div>
                          )}
                          {booking.guest_phone && (
                            <div className="flex items-center gap-1">
                              <Phone size={14} />
                              <span>{booking.guest_phone}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">
                        {booking.total_price} {booking.currency}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        {nights > 0 ? (booking.total_price / nights).toFixed(0) : 0} {booking.currency}/ночь
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
