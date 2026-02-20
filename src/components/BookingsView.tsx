import { useState, useMemo, useCallback } from 'react';
import { Search, Calendar, MapPin, User, Phone, Mail, Upload } from 'lucide-react';
import { Booking, Property } from '../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from '@/lib/utils';

interface BookingsViewProps {
  bookings: Booking[];
  properties: Property[];
  onEdit: (booking: Booking) => void;
  onImport?: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Вручную',
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  avito: 'Avito',
  cian: 'CIAN',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Подтверждено',
  pending: 'Ожидание',
  cancelled: 'Отменено',
};

export function BookingsView({ bookings, properties, onEdit, onImport }: BookingsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'upcoming' | 'past'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'property' | 'source'>('date');

  const getPropertyName = useCallback(
    (propertyId: string) => properties.find((p) => p.id === propertyId)?.name || 'Неизвестно',
    [properties]
  );

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
      }
      if (sortBy === 'property') {
        return getPropertyName(a.property_id).localeCompare(getPropertyName(b.property_id));
      }
      if (sortBy === 'source') {
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
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Бронирования</h1>
            <p className="text-muted-foreground text-sm mt-1">Просмотр всех прошлых и будущих бронирований</p>
          </div>
          {onImport && (
            <Button onClick={onImport} className="shrink-0">
              <Upload className="h-4 w-4 mr-2" />
              Импорт из Excel
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Всего</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Будущие</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{stats.upcoming}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Прошлые</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-muted-foreground">{stats.past}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Поиск по гостю или объекту..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-10"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['all', 'upcoming', 'past'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType(type)}
                  >
                    {type === 'all' ? 'Все' : type === 'upcoming' ? 'Будущие' : 'Прошлые'}
                  </Button>
                ))}
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'property' | 'source')}>
                <SelectTrigger className="w-[180px] h-10">
                  <SelectValue placeholder="Сортировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">По дате</SelectItem>
                  <SelectItem value="property">По объекту</SelectItem>
                  <SelectItem value="source">По источнику</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {filteredAndSortedBookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Бронирований не найдено</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedBookings.map((booking) => {
              const nights = calculateNights(booking.check_in, booking.check_out);
              const sourceLabel = SOURCE_LABELS[booking.source] || booking.source;
              const statusLabel = STATUS_LABELS[booking.status] || booking.status;

              return (
                <Card
                  key={booking.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:border-primary/50 hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  onClick={() => onEdit(booking)}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold tracking-wide">{booking.guest_name}</h3>
                          <Badge variant="secondary" className="font-normal">
                            {sourceLabel}
                          </Badge>
                          <Badge
                            variant={
                              booking.status === 'confirmed'
                                ? 'success'
                                : booking.status === 'pending'
                                  ? 'warning'
                                  : 'destructive'
                            }
                          >
                            {statusLabel}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 shrink-0" />
                            {getPropertyName(booking.property_id)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 shrink-0" />
                            {new Date(booking.check_in).toLocaleDateString('ru-RU')} —{' '}
                            {new Date(booking.check_out).toLocaleDateString('ru-RU')} ({nights}{' '}
                            {nights === 1 ? 'ночь' : 'ночей'})
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4 shrink-0" />
                            {booking.guests_count} {booking.guests_count === 1 ? 'гость' : 'гостей'}
                          </span>
                        </div>

                        {(booking.guest_email || booking.guest_phone) && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {booking.guest_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-4 w-4 shrink-0" />
                                {booking.guest_email}
                              </span>
                            )}
                            {booking.guest_phone && (
                              <span className="flex items-center gap-2">
                                <Phone className="h-4 w-4 shrink-0" />
                                {booking.guest_phone}
                                <a
                                  href={`https://wa.me/${booking.guest_phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-green-600/20 transition-colors"
                                  title="Открыть в WhatsApp"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <img src="/whatsapp-icon.svg" alt="WhatsApp" className="h-5 w-5" />
                                </a>
                              </span>
                            )}
                          </div>
                        )}

                        {booking.notes && (
                          <div className="pt-3 border-t border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Заметки</p>
                            <p className="text-sm whitespace-pre-wrap break-words line-clamp-2">
                              {booking.notes.length > 150 ? `${booking.notes.substring(0, 150)}...` : booking.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="text-left md:text-right shrink-0">
                        <p className="text-2xl font-bold">{booking.total_price} {booking.currency}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {nights > 0 ? Math.round(booking.total_price / nights) : 0} {booking.currency}/ночь
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
