import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Phone, Mail, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Guest, Booking } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface GuestsViewProps {
    guests: Guest[];
    bookings: Booking[];
    onEditGuest: (guest: Guest) => void;
}

function calcNights(checkIn: string, checkOut: string): number {
    return Math.max(1, Math.round(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    ));
}

export function GuestsView({ guests, bookings, onEditGuest }: GuestsViewProps) {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<'visits' | 'total_spent' | 'nights' | null>(null);
    const [sortAsc, setSortAsc] = useState(false);

    const guestStats = useMemo(() => {
        const stats = new Map<string, { count: number; total: number; nights: number; lastStay: string | null }>();

        bookings.forEach(booking => {
            if (!booking.guest_id) return;
            const current = stats.get(booking.guest_id) || { count: 0, total: 0, nights: 0, lastStay: null };
            current.count += 1;
            current.total += booking.total_price || 0;
            current.nights += calcNights(booking.check_in, booking.check_out);
            if (!current.lastStay || new Date(booking.check_in) > new Date(current.lastStay)) {
                current.lastStay = booking.check_in;
            }
            stats.set(booking.guest_id, current);
        });

        return stats;
    }, [bookings]);

    const filteredGuests = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return guests.filter(g =>
            g.name.toLowerCase().includes(q) ||
            (g.phone && g.phone.includes(searchTerm)) ||
            (g.email && g.email.toLowerCase().includes(q))
        );
    }, [guests, searchTerm]);

    const sortedGuests = useMemo(() => {
        if (!sortKey) return filteredGuests;
        return [...filteredGuests].sort((a, b) => {
            const sa = guestStats.get(a.id);
            const sb = guestStats.get(b.id);
            let aVal = 0, bVal = 0;
            if (sortKey === 'visits') { aVal = sa?.count ?? 0; bVal = sb?.count ?? 0; }
            else if (sortKey === 'total_spent') { aVal = sa?.total ?? 0; bVal = sb?.total ?? 0; }
            else if (sortKey === 'nights') { aVal = sa?.nights ?? 0; bVal = sb?.nights ?? 0; }
            return sortAsc ? aVal - bVal : bVal - aVal;
        });
    }, [filteredGuests, sortKey, sortAsc, guestStats]);

    const toggleSort = (key: typeof sortKey) => {
        if (sortKey === key) setSortAsc(a => !a);
        else { setSortKey(key); setSortAsc(false); }
    };

    const sortIndicator = (key: typeof sortKey) => {
        if (sortKey !== key) return null;
        return sortAsc ? ' ↑' : ' ↓';
    };

    const handleExport = () => {
        const rows = sortedGuests.map(g => {
            const s = guestStats.get(g.id);
            return {
                'Имя': g.name,
                'Телефон': g.phone || '',
                'Email': g.email || '',
                'Теги': (g.tags || []).join(', '),
                'Визиты': s?.count ?? 0,
                'Ночей': s?.nights ?? 0,
                'Потрачено, ₽': s ? Math.round(s.total) : 0,
                'Средний чек, ₽': s?.count ? Math.round(s.total / s.count) : 0,
                'Последний заезд': s?.lastStay ? new Date(s.lastStay).toLocaleDateString('ru-RU') : '',
                'Заметки': g.notes || '',
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Гости');
        XLSX.writeFile(wb, `guests_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {t('guests.title', { defaultValue: 'База гостей (CRM)' })}
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {t('guests.subtitle', { defaultValue: 'История бронирований и лояльность ваших клиентов' })}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 shrink-0">
                        <Download className="h-4 w-4" />
                        Excel
                    </Button>
                </div>

                <div className="rounded-lg p-4 mb-6 border border-border bg-card">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t('guests.searchPlaceholder', { defaultValue: 'Поиск по имени, телефону или email...' })}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="rounded-lg overflow-hidden border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('guests.name', { defaultValue: 'Гость' })}</TableHead>
                                <TableHead>{t('guests.contacts', { defaultValue: 'Контакты' })}</TableHead>
                                <TableHead
                                    className="cursor-pointer select-none whitespace-nowrap"
                                    onClick={() => toggleSort('visits')}
                                >
                                    {t('guests.visits', { defaultValue: 'Визиты' })}{sortIndicator('visits')}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer select-none whitespace-nowrap"
                                    onClick={() => toggleSort('nights')}
                                >
                                    Ночей{sortIndicator('nights')}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer select-none whitespace-nowrap"
                                    onClick={() => toggleSort('total_spent')}
                                >
                                    {t('guests.totalSpent', { defaultValue: 'Потрачено' })}{sortIndicator('total_spent')}
                                </TableHead>
                                <TableHead>{t('guests.lastCheckIn', { defaultValue: 'Последний заезд' })}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedGuests.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        {guests.length === 0 ? (
                                            <>
                                                <p className="font-medium">{t('guests.noGuests', { defaultValue: 'Пока нет гостей' })}</p>
                                                <p className="text-sm mt-1">{t('guests.noGuestsDesc', { defaultValue: 'Гости появятся здесь после добавления бронирований с именем и контактами.' })}</p>
                                            </>
                                        ) : (
                                            t('guests.noResults', { defaultValue: 'Ничего не найдено. Уточните поиск.' })
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : sortedGuests.map(record => {
                                const s = guestStats.get(record.id);
                                return (
                                    <TableRow
                                        key={record.id}
                                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                                        onClick={() => onEditGuest(record)}
                                    >
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{record.name}</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {record.tags?.map(tag => (
                                                        <Badge
                                                            key={tag}
                                                            variant={tag === 'Blacklist' ? 'destructive' : tag === 'VIP' ? 'default' : 'secondary'}
                                                            className="text-xs"
                                                        >
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-sm text-muted-foreground gap-1">
                                                {record.phone && (
                                                    <div className="flex items-center gap-1">
                                                        <Phone size={13} />
                                                        <span>{record.phone}</span>
                                                    </div>
                                                )}
                                                {record.email && (
                                                    <div className="flex items-center gap-1">
                                                        <Mail size={13} />
                                                        <span className="truncate max-w-[160px]">{record.email}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">{s?.count ?? 0}</TableCell>
                                        <TableCell className="text-muted-foreground">{s?.nights ?? 0}</TableCell>
                                        <TableCell className="text-primary font-medium">
                                            {s ? Math.round(s.total).toLocaleString('ru-RU') + ' ₽' : '—'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {s?.lastStay ? new Date(s.lastStay).toLocaleDateString('ru-RU') : '—'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    {sortedGuests.length > 0 && (
                        <p className="text-xs text-muted-foreground p-3 border-t border-border">
                            Всего гостей: {sortedGuests.length}
                            {searchTerm && guests.length !== sortedGuests.length && ` (из ${guests.length})`}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
