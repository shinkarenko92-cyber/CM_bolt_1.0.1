import { useState, useMemo } from 'react';
import { Search, Phone, Mail, User } from 'lucide-react';
import { Guest, Booking } from '../lib/supabase';
import { Table, Tag as AntTag, Button, Input } from 'antd';

interface GuestsViewProps {
    guests: Guest[];
    bookings: Booking[];
    onEditGuest: (guest: Guest) => void;
}

export function GuestsView({ guests, bookings, onEditGuest }: GuestsViewProps) {
    const [searchTerm, setSearchTerm] = useState('');

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

    const columns = [
        {
            title: 'Гость',
            key: 'name',
            render: (_: any, record: Guest) => (
                <div className="flex flex-col">
                    <span className="text-white font-medium">{record.name}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {record.tags?.map(tag => (
                            <AntTag key={tag} color={tag === 'Blacklist' ? 'error' : 'processing'}>
                                {tag}
                            </AntTag>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: 'Контакты',
            key: 'contacts',
            render: (_: any, record: Guest) => (
                <div className="flex flex-col text-sm text-slate-400 gap-1">
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
            ),
        },
        {
            title: 'Визиты',
            key: 'visits',
            sorter: (a: Guest, b: Guest) => (guestStats.get(a.id)?.count || 0) - (guestStats.get(b.id)?.count || 0),
            render: (_: any, record: Guest) => (
                <div className="text-slate-300">
                    {guestStats.get(record.id)?.count || 0}
                </div>
            ),
        },
        {
            title: 'Всего потрачено',
            key: 'total_spent',
            sorter: (a: Guest, b: Guest) => (guestStats.get(a.id)?.total || 0) - (guestStats.get(b.id)?.total || 0),
            render: (_: any, record: Guest) => (
                <div className="text-teal-400 font-medium">
                    {Math.round(guestStats.get(record.id)?.total || 0).toLocaleString()} ₽
                </div>
            ),
        },
        {
            title: 'Последний заезд',
            key: 'last_stay',
            render: (_: any, record: Guest) => (
                <div className="text-sm text-slate-400">
                    {guestStats.get(record.id)?.lastStay
                        ? new Date(guestStats.get(record.id)!.lastStay!).toLocaleDateString('ru-RU')
                        : '—'}
                </div>
            ),
        },
        {
            title: '',
            key: 'actions',
            render: (_: any, record: Guest) => (
                <Button
                    type="text"
                    icon={<User size={16} className="text-slate-400" />}
                    onClick={() => onEditGuest(record)}
                    className="hover:bg-slate-700"
                />
            ),
        },
    ];

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">База гостей (CRM)</h1>
                        <p className="text-slate-400 mt-1">История бронирований и лояльность ваших клиентов</p>
                    </div>
                </div>

                <div className="bg-slate-800 rounded-lg p-4 mb-6">
                    <Input
                        prefix={<Search size={18} className="text-slate-500 mr-2" />}
                        placeholder="Поиск по имени, телефону или email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="max-w-md bg-slate-700 border-slate-600 text-white"
                    />
                </div>

                <div className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                    <Table
                        dataSource={filteredGuests}
                        columns={columns}
                        rowKey="id"
                        pagination={{ pageSize: 15 }}
                        className="custom-table"
                    />
                </div>
            </div>
        </div>
    );
}
