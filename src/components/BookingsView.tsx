import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Calendar, MapPin, User, Phone, Mail, Upload } from 'lucide-react';
import { Booking, Property, Guest } from '@/lib/supabase';
import { calculateNights } from '@/utils/bookingUtils';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GuestsView } from '@/components/GuestsView';
import { cn } from '@/lib/utils';

interface BookingsViewProps {
  bookings: Booking[];
  properties: Property[];
  onEdit: (booking: Booking) => void;
  onImport?: () => void;
  guests?: Guest[];
  onEditGuest?: (guest: Guest) => void;
}

export function BookingsView({ bookings, properties, onEdit, onImport, guests, onEditGuest }: BookingsViewProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'upcoming' | 'past'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'property' | 'source'>('date');
  const [visibleCount, setVisibleCount] = useState(50);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [searchTerm, filterType, sortBy]);

  const getPropertyName = useCallback(
    (propertyId: string) => properties.find((p) => p.id === propertyId)?.name || t('common.unknown', { defaultValue: 'Неизвестно' }),
    [properties, t]
  );

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      manual: t('sources.manual', { defaultValue: 'Вручную' }),
      airbnb: t('sources.airbnb', { defaultValue: 'Airbnb' }),
      booking: t('sources.booking', { defaultValue: 'Booking.com' }),
      avito: t('sources.avito', { defaultValue: 'Avito' }),
      cian: t('sources.cian', { defaultValue: 'CIAN' }),
    };
    return labels[source] ?? source;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      confirmed: t('bookings.confirmed', { defaultValue: 'Подтверждено' }),
      pending: t('bookings.pending', { defaultValue: 'Ожидание' }),
      cancelled: t('bookings.cancelled', { defaultValue: 'Отменено' }),
    };
    return labels[status] ?? status;
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

  return (
    <div className="flex-1 overflow-auto bg-background">
      <Tabs defaultValue="bookings" className="flex flex-col h-full">
        <div className="border-b border-border px-4 md:px-6 pt-4 md:pt-6 bg-background">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <TabsList className="w-fit">
              <TabsTrigger value="bookings">{t('bookings.title', { defaultValue: 'Бронирования' })}</TabsTrigger>
              <TabsTrigger value="guests">{t('nav.guests', { defaultValue: 'Гости' })}</TabsTrigger>
            </TabsList>
            {onImport && (
              <Button onClick={onImport} variant="outline" size="sm" className="shrink-0 self-start sm:self-auto">
                <Upload className="h-4 w-4 mr-2" />
                {t('bookings.importExcel', { defaultValue: 'Импорт из Excel' })}
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="bookings" className="flex-1 overflow-auto mt-0">
      <div className="p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('bookings.total', { defaultValue: 'Всего' })}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('bookings.upcoming', { defaultValue: 'Будущие' })}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{stats.upcoming}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('bookings.past', { defaultValue: 'Прошлые' })}</CardDescription>
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
                    placeholder={t('bookings.searchPlaceholder', { defaultValue: 'Поиск по гостю или объекту...' })}
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
                    {type === 'all' ? t('bookings.all', { defaultValue: 'Все' }) : type === 'upcoming' ? t('bookings.upcoming', { defaultValue: 'Будущие' }) : t('bookings.past', { defaultValue: 'Прошлые' })}
                  </Button>
                ))}
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'property' | 'source')}>
                <SelectTrigger className="w-[180px] h-10">
                  <SelectValue placeholder={t('bookings.sortLabel', { defaultValue: 'Сортировка' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">{t('bookings.sortByDate', { defaultValue: 'По дате' })}</SelectItem>
                  <SelectItem value="property">{t('bookings.sortByProperty', { defaultValue: 'По объекту' })}</SelectItem>
                  <SelectItem value="source">{t('bookings.sortBySource', { defaultValue: 'По источнику' })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {filteredAndSortedBookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t('bookings.noBookings', { defaultValue: 'Бронирований не найдено' })}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedBookings.slice(0, visibleCount).map((booking) => {
              const nights = calculateNights(booking.check_in, booking.check_out);
              const sourceLabel = getSourceLabel(booking.source);
              const statusLabel = getStatusLabel(booking.status);

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
                            <p className="text-xs font-medium text-muted-foreground mb-1">{t('fields.notes', { defaultValue: 'Заметки' })}</p>
                            <p className="text-sm whitespace-pre-wrap break-words line-clamp-2">
                              {booking.notes.length > 150 ? `${booking.notes.substring(0, 150)}...` : booking.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="text-left md:text-right shrink-0">
                        <p className="text-2xl font-bold">{booking.total_price} {booking.currency}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {nights > 0 ? Math.round(booking.total_price / nights) : 0} {booking.currency}{t('bookings.perNight', { defaultValue: '/ночь' })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredAndSortedBookings.length > visibleCount && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount(c => c + 50)}
                >
                  {t('bookings.loadMore', { defaultValue: 'Загрузить ещё' })} ({filteredAndSortedBookings.length - visibleCount})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
        </TabsContent>

        <TabsContent value="guests" className="flex-1 overflow-auto mt-0">
          <GuestsView
            guests={guests ?? []}
            bookings={bookings}
            onEditGuest={onEditGuest ?? (() => {})}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
