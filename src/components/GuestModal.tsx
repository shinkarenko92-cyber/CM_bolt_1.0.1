import { useState, useEffect } from 'react';
import { History } from 'lucide-react';
import { Modal, Input, Button, Tag as AntTag, Space, Divider, List } from 'antd';
import toast from 'react-hot-toast';
import { Guest, Booking, Property } from '../lib/supabase';

interface GuestModalProps {
    isOpen: boolean;
    onClose: () => void;
    guest: Guest | null;
    bookings: Booking[];
    properties: Property[];
    onSave: (data: Partial<Guest>) => Promise<void>;
}

export function GuestModal({ isOpen, onClose, guest, bookings, properties, onSave }: GuestModalProps) {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        notes: '',
        tags: [] as string[],
    });
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
        } else {
            setFormData({
                name: '',
                email: '',
                phone: '',
                notes: '',
                tags: [],
            });
        }
    }, [guest, isOpen]);

    const guestBookings = bookings
        .filter(b => b.guest_id === guest?.id)
        .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());

    const handleAddTag = () => {
        if (newTag && !formData.tags.includes(newTag)) {
            setFormData({ ...formData, tags: [...formData.tags, newTag] });
            setNewTag('');
        }
    };

    const handleRemoveTag = (tag: string) => {
        setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
    };

    const handleSubmit = async () => {
        if (!formData.name) {
            toast.error('Укажите имя гостя');
            return;
        }
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error('Ошибка при сохранении');
        } finally {
            setLoading(false);
        }
    };

    const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || 'Объект удален';

    return (
        <Modal
            title={guest ? 'Профиль гостя' : 'Новый гость'}
            open={isOpen}
            onCancel={onClose}
            footer={null}
            width={700}
            className="dark-modal"
        >
            <div className="space-y-6 pt-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-400 mb-1">Имя</label>
                        <Input
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Телефон</label>
                        <Input
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
                        <Input
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-white"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Метки (Теги)</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {formData.tags.map(tag => (
                            <AntTag
                                key={tag}
                                closable
                                onClose={() => handleRemoveTag(tag)}
                                className="bg-slate-600 border-slate-500 text-white"
                            >
                                {tag}
                            </AntTag>
                        ))}
                    </div>
                    <Space.Compact className="w-full">
                        <Input
                            placeholder="Добавить тег (например, VIP, Постоянный...)"
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onPressEnter={handleAddTag}
                            className="bg-slate-700 border-slate-600 text-white"
                        />
                        <Button type="primary" onClick={handleAddTag} className="bg-teal-600 border-teal-600">
                            Добавить
                        </Button>
                    </Space.Compact>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Заметки</label>
                    <Input.TextArea
                        rows={3}
                        value={formData.notes}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        className="bg-slate-700 border-slate-600 text-white"
                        placeholder="Любая важная информация о госте..."
                    />
                </div>

                <Divider className="border-slate-700 m-0" />

                <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <History size={18} />
                        История бронирований
                    </h3>
                    {guestBookings.length === 0 ? (
                        <p className="text-slate-500 text-center py-4">Нет истории бронирований</p>
                    ) : (
                        <List
                            dataSource={guestBookings}
                            renderItem={booking => (
                                <List.Item className="border-slate-700 px-0">
                                    <div className="w-full flex items-center justify-between">
                                        <div>
                                            <div className="text-white font-medium">{getPropertyName(booking.property_id)}</div>
                                            <div className="text-xs text-slate-400">
                                                {new Date(booking.check_in).toLocaleDateString('ru-RU')} — {new Date(booking.check_out).toLocaleDateString('ru-RU')}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-teal-400 font-semibold">{booking.total_price.toLocaleString()} ₽</div>
                                            <AntTag color={booking.status === 'confirmed' ? 'success' : 'default'}>
                                                {booking.status}
                                            </AntTag>
                                        </div>
                                    </div>
                                </List.Item>
                            )}
                        />
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                    <Button onClick={onClose} className="bg-transparent border-slate-600 text-slate-300 hover:text-white">
                        Отмена
                    </Button>
                    <Button
                        type="primary"
                        onClick={handleSubmit}
                        loading={loading}
                        className="bg-teal-600 border-teal-600 hover:bg-teal-700"
                    >
                        Сохранить изменения
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
