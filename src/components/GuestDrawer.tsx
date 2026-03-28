import { useState, useEffect, useMemo } from 'react';
import { X, Phone, Mail, MessageCircle, History, Loader2, Star, Home, TrendingUp, Calendar, Edit3, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Guest, Booking, Property } from '@/lib/supabase';

interface GuestDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  guest: Guest | null;
  bookings: Booking[];
  properties: Property[];
  onSave: (data: Partial<Guest>) => Promise<void>;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Вручную',
  avito: 'Avito',
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  our_guests: 'Свои гости',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Подтверждено',
  pending: 'Ожидание',
  cancelled: 'Отменено',
};

function calcNights(checkIn: string, checkOut: string): number {
  return Math.max(
    1,
    Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    )
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

export function GuestDrawer({ isOpen, onClose, guest, bookings, properties, onSave }: GuestDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', notes: '', tags: [] as string[] });
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (guest) {
      setFormData({
        name: guest.name || '',
        email: guest.email || '',
        phone: guest.phone || '',
        notes: guest.notes || '',
        tags: guest.tags || [],
      });
    }
    setIsEditing(false);
  }, [guest, isOpen]);

  const guestBookings = useMemo(
    () =>
      bookings
        .filter(b => b.guest_id === guest?.id)
        .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime()),
    [bookings, guest]
  );

  const stats = useMemo(() => {
    if (!guestBookings.length) return null;
    const totalNights = guestBookings.reduce((sum, b) => sum + calcNights(b.check_in, b.check_out), 0);
    const totalSpent = guestBookings.reduce((sum, b) => sum + (b.total_price || 0), 0);
    const confirmed = guestBookings.filter(b => b.status !== 'cancelled');
    const avgPerStay = confirmed.length ? Math.round(confirmed.reduce((s, b) => s + (b.total_price || 0), 0) / confirmed.length) : 0;
    const avgPerNight = totalNights > 0 ? Math.round(totalSpent / totalNights) : 0;
    const propertyIds = guestBookings.map(b => b.property_id);
    const freqMap: Record<string, number> = {};
    propertyIds.forEach(id => { freqMap[id] = (freqMap[id] || 0) + 1; });
    const favPropId = Object.entries(freqMap).sort((a, b) => b[1] - a[1])[0]?.[0];
    const favProperty = properties.find(p => p.id === favPropId);
    const firstStay = guestBookings[guestBookings.length - 1]?.check_in;
    const lastStay = guestBookings[0]?.check_in;
    return { totalNights, totalSpent, avgPerStay, avgPerNight, favProperty, firstStay, lastStay, count: guestBookings.length };
  }, [guestBookings, properties]);

  const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || 'Объект удалён';

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Укажите имя гостя'); return; }
    setLoading(true);
    try {
      await onSave(formData);
      setIsEditing(false);
    } catch {
      toast.error('Ошибка при сохранении');
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(f => ({ ...f, tags: [...f.tags, tag] }));
    }
    setNewTag('');
  };

  const phone = guest?.phone || '';
  const phoneDigits = phone ? normalizePhone(phone) : '';

  if (!guest) return null;

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent className="sm:max-w-[520px]">
        {/* Header */}
        <SheetHeader className="gap-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <Input
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="text-lg font-semibold h-9"
                  autoFocus
                />
              ) : (
                <SheetTitle className="text-xl truncate">{guest.name}</SheetTitle>
              )}
              <SheetDescription className="sr-only">Профиль гостя</SheetDescription>
              <div className="flex flex-wrap gap-1 mt-2">
                {(isEditing ? formData.tags : (guest.tags || [])).map(tag => (
                  <Badge
                    key={tag}
                    variant={tag === 'Blacklist' ? 'destructive' : tag === 'VIP' ? 'default' : 'secondary'}
                    className={cn('text-xs', !isEditing && 'cursor-default')}
                  >
                    {tag}
                    {isEditing && (
                      <button
                        type="button"
                        className="ml-1 rounded-full hover:bg-black/20"
                        onClick={() => setFormData(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </Badge>
                ))}
                {isEditing && (
                  <div className="flex gap-1">
                    <Input
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Тег..."
                      className="h-6 text-xs w-24"
                    />
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={addTag}>+</Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={loading}>Отмена</Button>
                  <Button size="sm" onClick={handleSave} disabled={loading}>
                    {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                    Сохранить
                  </Button>
                </>
              ) : (
                <>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsEditing(true)} title="Редактировать">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Contact info + quick actions */}
          <div className="flex flex-col gap-2">
            {isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                  <Input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                  <Input value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {phone && (
                  <>
                    <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Phone className="h-3.5 w-3.5" />
                      {phone}
                    </a>
                    <div className="flex gap-1">
                      <a
                        href={`https://wa.me/${phoneDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors"
                        title="WhatsApp"
                      >
                        <MessageCircle className="h-3 w-3" />
                        WA
                      </a>
                      <a
                        href={`https://t.me/${phoneDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                        title="Telegram"
                      >
                        <MessageCircle className="h-3 w-3" />
                        TG
                      </a>
                      <a
                        href={`sms:${phone}`}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
                        title="SMS"
                      >
                        SMS
                      </a>
                    </div>
                  </>
                )}
                {guest.email && (
                  <a href={`mailto:${guest.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {guest.email}
                  </a>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={<History className="h-4 w-4" />} label="Броней" value={stats.count} />
                <StatCard icon={<Calendar className="h-4 w-4" />} label="Ночей всего" value={stats.totalNights} />
                <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Потрачено" value={`${stats.totalSpent.toLocaleString('ru-RU')} ₽`} />
                <StatCard icon={<Star className="h-4 w-4" />} label="Средний чек" value={`${stats.avgPerStay.toLocaleString('ru-RU')} ₽`} />
                <StatCard icon={<Home className="h-4 w-4" />} label="Любимый объект" value={stats.favProperty?.name ?? '—'} small />
                <StatCard
                  icon={<Calendar className="h-4 w-4" />}
                  label="Первый / последний"
                  value={`${formatDate(stats.firstStay)} — ${formatDate(stats.lastStay)}`}
                  small
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Заметки</label>
              {isEditing ? (
                <Textarea
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Важная информация о госте..."
                  className="resize-none text-sm"
                />
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap rounded-md bg-muted/40 p-3 min-h-[56px]">
                  {guest.notes || <span className="text-muted-foreground italic">Нет заметок</span>}
                </p>
              )}
            </div>

            <Separator />

            {/* Booking history */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                История бронирований
                {guestBookings.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs font-normal">{guestBookings.length}</Badge>
                )}
              </h3>
              {guestBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Нет истории бронирований</p>
              ) : (
                <div className="space-y-2">
                  {guestBookings.map(booking => {
                    const nights = calcNights(booking.check_in, booking.check_out);
                    return (
                      <div key={booking.id} className="rounded-lg border border-border bg-card p-3 hover:bg-accent/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{getPropertyName(booking.property_id)}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(booking.check_in)} — {formatDate(booking.check_out)}
                              <span className="ml-2 text-foreground font-medium">
                                {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}
                              </span>
                            </div>
                            {booking.source && booking.source !== 'manual' && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {SOURCE_LABELS[booking.source] ?? booking.source}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-primary">
                              {booking.total_price.toLocaleString('ru-RU')} ₽
                            </div>
                            <Badge
                              variant={booking.status === 'confirmed' ? 'success' : booking.status === 'cancelled' ? 'destructive' : 'secondary'}
                              className="text-xs mt-1"
                            >
                              {STATUS_LABELS[booking.status] ?? booking.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function StatCard({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={cn('font-semibold leading-tight', small ? 'text-xs' : 'text-base')}>{value}</div>
    </div>
  );
}
