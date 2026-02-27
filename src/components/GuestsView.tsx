import { useState, useMemo } from 'react';
import { Search, Phone, Mail, User } from 'lucide-react';
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

export function GuestsView({ guests, bookings, onEditGuest }: GuestsViewProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<'visits' | 'total_spent' | null>(null);
    const [sortAsc, setSortAsc] = useState(true);

    const guestStats = useMemo(() => {
        const stats = new Map<string, { count: number; total: number; lastStay: string | null }>();

        bookings.forEach(booking => {
            if (!booking.guest_id) return;

            const current = stats.get(booking.guest_id) || { count: 0, total: 0, lastStay: null };
            current.count += 1;
            current.total += booking.total_price;

            if (!current.lastStay || new Date(booking.check_in) > new Date(current.lastStay)) {
                current.lastStay = booking.check_in;
            }

            stats.set(booking.guest_id, current);
        });

        return stats;
    }, [bookings]);

    const filteredGuests = useMemo(() => {
        return guests.filter(guest =>
            guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (guest.phone && guest.phone.includes(searchTerm)) ||
            (guest.email && guest.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [guests, searchTerm]);

    const sortedGuests = useMemo(() => {
        if (!sortKey) return filteredGuests;
        const copy = [...filteredGuests];
        copy.sort((a, b) => {
            const aVal = sortKey === 'visits' ? (guestStats.get(a.id)?.count ?? 0) : (guestStats.get(a.id)?.total ?? 0);
            const bVal = sortKey === 'visits' ? (guestStats.get(b.id)?.count ?? 0) : (guestStats.get(b.id)?.total ?? 0);
            return sortAsc ? aVal - bVal : bVal - aVal;
        });
        return copy;
    }, [filteredGuests, sortKey, sortAsc, guestStats]);

    const toggleSort = (key: 'visits' | 'total_spent') => {
        setSortKey(prev => (prev === key ? prev : key));
        setSortAsc(prev => (sortKey === key ? !prev : true));
    };

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">База гостей (CRM)</h1>
                        <p className="text-muted-foreground mt-1">История бронирований и лояльность ваших клиентов</p>
                    </div>
                </div>

                <div className="rounded-lg p-4 mb-6 border border-border bg-card">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Поиск по имени, телефону или email..."
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
                                <TableHead>Гость</TableHead>
                                <TableHead>Контакты</TableHead>
                                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('visits')}>Визиты</TableHead>
                                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('total_spent')}>Всего потрачено</TableHead>
                                <TableHead>Последний заезд</TableHead>
                                <TableHead className="w-[60px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedGuests.slice(0, 15).map(record => (
                                <TableRow key={record.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{record.name}</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {record.tags?.map(tag => (
                                                    <Badge key={tag} variant={tag === 'Blacklist' ? 'destructive' : 'secondary'}>
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
                                                    <Phone size={14} />
                                                    <span>{record.phone}</span>
                                                </div>
                                            )}
                                            {record.email && (
                                                <div className="flex items-center gap-1">
                                                    <Mail size={14} />
                                                    <span>{record.email}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{guestStats.get(record.id)?.count ?? 0}</TableCell>
                                    <TableCell className="text-primary font-medium">
                                        {Math.round(guestStats.get(record.id)?.total ?? 0).toLocaleString()} ₽
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {guestStats.get(record.id)?.lastStay
                                            ? new Date(guestStats.get(record.id)!.lastStay!).toLocaleDateString('ru-RU')
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => onEditGuest(record)} aria-label="Редактировать">
                                            <User size={16} className="text-muted-foreground" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {sortedGuests.length > 15 && (
                        <p className="text-sm text-muted-foreground p-3 border-t border-border">
                            Показано 15 из {sortedGuests.length}. Уточните поиск для фильтрации.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
