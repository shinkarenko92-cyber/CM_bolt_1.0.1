import { useState, useEffect } from 'react';
import { History, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[700px]">
                <DialogHeader>
                    <DialogTitle>{guest ? 'Профиль гостя' : 'Новый гость'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-muted-foreground mb-1">Имя</label>
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1">Телефон</label>
                            <Input
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                            <Input
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Метки (Теги)</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {formData.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="pr-1 gap-1">
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                                        aria-label="Удалить тег"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                        <div className="flex gap-0 w-full">
                            <Input
                                placeholder="Добавить тег (например, VIP, Постоянный...)"
                                value={newTag}
                                onChange={e => setNewTag(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                className="rounded-r-none border-r-0"
                            />
                            <Button type="button" onClick={handleAddTag} className="rounded-l-none">
                                Добавить
                            </Button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Заметки</label>
                        <Textarea
                            rows={3}
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Любая важная информация о госте..."
                        />
                    </div>

                    <Separator />

                    <div>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <History size={18} />
                            История бронирований
                        </h3>
                        {guestBookings.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">Нет истории бронирований</p>
                        ) : (
                            <ScrollArea className="h-[200px] rounded-md border border-border">
                                <ul className="divide-y divide-border p-0 m-0 list-none">
                                    {guestBookings.map(booking => (
                                        <li key={booking.id} className="py-3 px-0">
                                            <div className="w-full flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium">{getPropertyName(booking.property_id)}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {new Date(booking.check_in).toLocaleDateString('ru-RU')} — {new Date(booking.check_out).toLocaleDateString('ru-RU')}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-primary font-semibold">{booking.total_price.toLocaleString()} ₽</div>
                                                    <Badge variant={booking.status === 'confirmed' ? 'success' : 'secondary'}>
                                                        {booking.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </ScrollArea>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <Button variant="outline" onClick={onClose} disabled={loading}>
                            Отмена
                        </Button>
                        <Button onClick={handleSubmit} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                            Сохранить изменения
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
