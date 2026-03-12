import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Property } from '@/lib/supabase';
import type { Cleaner } from '@/types/cleaning';
import { createTask, notifyCleaner } from '@/services/cleaning';
import toast from 'react-hot-toast';

type TaskDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: Property[];
  cleaners: Cleaner[];
  defaultDate?: string; // YYYY-MM-DD
  defaultTime?: string; // HH:00
  onSuccess: () => void;
};

export function TaskDrawer({
  open,
  onOpenChange,
  properties,
  cleaners,
  defaultDate,
  defaultTime,
  onSuccess,
}: TaskDrawerProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState<string>('');
  const [cleanerId, setCleanerId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [address, setAddress] = useState('');
  const [addressOverride, setAddressOverride] = useState(false);
  const [doorCode, setDoorCode] = useState('');
  const [notes, setNotes] = useState('');

  const selectedProperty = properties.find((p) => p.id === propertyId);

  useEffect(() => {
    if (!open) return;
    if (defaultDate) setScheduledDate(defaultDate);
    else setScheduledDate(new Date().toISOString().slice(0, 10));
    if (defaultTime) setScheduledTime(defaultTime.includes(':') ? defaultTime.slice(0, 5) : `${defaultTime.padStart(2, '0')}:00`);
  }, [open, defaultDate, defaultTime]);

  useEffect(() => {
    if (!addressOverride && selectedProperty?.address) {
      setAddress(selectedProperty.address);
    } else if (!addressOverride) {
      setAddress('');
    }
  }, [selectedProperty?.address, addressOverride]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) {
      toast.error(t('cleaning.admin.selectProperty', { defaultValue: 'Выберите объект' }));
      return;
    }
    const timeStr = scheduledTime.length === 5 ? `${scheduledTime}:00` : scheduledTime;
    setLoading(true);
    try {
      const task = await createTask({
        property_id: propertyId,
        cleaner_id: cleanerId || null,
        scheduled_date: scheduledDate,
        scheduled_time: timeStr,
        door_code: doorCode.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      await notifyCleaner(task.id);
      toast.success(t('cleaning.admin.taskCreated', { defaultValue: 'Уборка создана' }));
      onOpenChange(false);
      onSuccess();
      setPropertyId('');
      setCleanerId('');
      setDoorCode('');
      setNotes('');
      setAddressOverride(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.loadError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('cleaning.admin.newTask', { defaultValue: 'Новая уборка' })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t('bookings.property', { defaultValue: 'Объект' })} *</Label>
            <Select value={propertyId} onValueChange={setPropertyId} required>
              <SelectTrigger>
                <SelectValue placeholder={t('cleaning.admin.selectProperty', { defaultValue: 'Выберите объект' })} />
              </SelectTrigger>
              <SelectContent>
                {properties.filter((p) => !p.deleted_at).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('cleaning.admin.cleaner', { defaultValue: 'Уборщица' })}</Label>
            <Select value={cleanerId} onValueChange={setCleanerId}>
              <SelectTrigger>
                <SelectValue placeholder={t('cleaning.admin.selectCleaner', { defaultValue: 'Выберите уборщицу' })} />
              </SelectTrigger>
              <SelectContent>
                {cleaners.filter((c) => c.is_active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('cleaning.admin.date', { defaultValue: 'Дата' })} *</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t('cleaning.admin.time', { defaultValue: 'Время' })} *</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label>{t('cleaning.admin.address', { defaultValue: 'Адрес' })}</Label>
            <Input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressOverride(true);
              }}
              placeholder={t('cleaning.admin.addressPlaceholder', { defaultValue: 'Подтягивается из объекта' })}
            />
            {selectedProperty?.address && !addressOverride && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('cleaning.admin.addressFromProperty', { defaultValue: 'Из объекта' })}
              </p>
            )}
          </div>
          <div>
            <Label>{t('cleaning.admin.doorCode', { defaultValue: 'Код двери' })}</Label>
            <Input
              value={doorCode}
              onChange={(e) => setDoorCode(e.target.value)}
              placeholder="1234"
            />
          </div>
          <div>
            <Label>{t('cleaning.admin.notes', { defaultValue: 'Заметки' })}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
