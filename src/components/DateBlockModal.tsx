import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Property } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

interface DateBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (block: {
    property_id: string;
    start_date: string;
    end_date: string;
    reason: string;
    notes: string | null;
  }) => Promise<void>;
  properties: Property[];
  prefilledData?: {
    propertyId: string;
    startDate: string;
    endDate: string;
  } | null;
  editBlock?: {
    id: string;
    property_id: string;
    start_date: string;
    end_date: string;
    reason: string;
    notes: string | null;
  } | null;
  onDelete?: (id: string) => Promise<void>;
}

export function DateBlockModal({
  isOpen,
  onClose,
  onSave,
  properties,
  prefilledData = null,
  editBlock = null,
  onDelete,
}: DateBlockModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    property_id: '',
    start_date: '',
    end_date: '',
    reason: 'personal',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (editBlock) {
        setFormData({
          property_id: editBlock.property_id,
          start_date: editBlock.start_date,
          end_date: editBlock.end_date,
          reason: editBlock.reason,
          notes: editBlock.notes || '',
        });
      } else if (prefilledData) {
        // endDate from calendar is checkout (exclusive), subtract 1 day for inclusive end
        const endDate = new Date(prefilledData.endDate);
        endDate.setDate(endDate.getDate() - 1);
        setFormData({
          property_id: prefilledData.propertyId,
          start_date: prefilledData.startDate,
          end_date: endDate.toISOString().split('T')[0],
          reason: 'personal',
          notes: '',
        });
      } else {
        setFormData({
          property_id: properties[0]?.id || '',
          start_date: '',
          end_date: '',
          reason: 'personal',
          notes: '',
        });
      }
      setError(null);
    }
  }, [isOpen, prefilledData, editBlock, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!formData.property_id || !formData.start_date || !formData.end_date) {
        setError(t('errors.fillAllFields', { defaultValue: 'Заполните все обязательные поля' }));
        return;
      }
      if (new Date(formData.start_date) > new Date(formData.end_date)) {
        setError(t('errors.checkOutBeforeCheckIn', { defaultValue: 'Дата начала не может быть позже даты окончания' }));
        return;
      }
      await onSave({
        property_id: formData.property_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason,
        notes: formData.notes || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editBlock || !onDelete) return;
    setLoading(true);
    try {
      await onDelete(editBlock.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      repair: t('dateBlock.repair', { defaultValue: 'Ремонт' }),
      personal: t('dateBlock.personal', { defaultValue: 'Личное использование' }),
      cleaning: t('dateBlock.cleaning', { defaultValue: 'Уборка' }),
      other: t('dateBlock.other', { defaultValue: 'Другое' }),
    };
    return labels[reason] || reason;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editBlock
              ? t('dateBlock.editTitle', { defaultValue: 'Редактировать блокировку' })
              : t('dateBlock.addTitle', { defaultValue: 'Заблокировать даты' })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/20 border border-destructive/50 rounded text-destructive text-sm">
              {error}
            </div>
          )}

          {properties.length > 1 && (
            <div className="space-y-2">
              <Label>{t('bookings.property', { defaultValue: 'Объект' })}</Label>
              <Select
                value={formData.property_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, property_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('dateBlock.startDate', { defaultValue: 'Дата начала' })}</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dateBlock.endDate', { defaultValue: 'Дата окончания' })}</Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('dateBlock.reason', { defaultValue: 'Причина' })}</Label>
            <Select
              value={formData.reason}
              onValueChange={(v) => setFormData(prev => ({ ...prev, reason: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">{getReasonLabel('personal')}</SelectItem>
                <SelectItem value="repair">{getReasonLabel('repair')}</SelectItem>
                <SelectItem value="cleaning">{getReasonLabel('cleaning')}</SelectItem>
                <SelectItem value="other">{getReasonLabel('other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('modals.notes', { defaultValue: 'Заметки' })}</Label>
            <Textarea
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="flex gap-3 justify-between pt-2">
            {editBlock && onDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                {t('common.delete')}
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
