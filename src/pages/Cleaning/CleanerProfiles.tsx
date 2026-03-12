import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCleaning } from '@/stores/cleaningStore';
import { assignCleanerRole } from '@/services/cleaning';
import type { Cleaner } from '@/types/cleaning';
import toast from 'react-hot-toast';

export function CleanerProfiles() {
  const { t } = useTranslation();
  const { cleaners, fetchCleaners } = useCleaning();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [color, setColor] = useState('#6b7280');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t('cleaning.admin.cleanerEmailRequired', { defaultValue: 'Введите email' }));
      return;
    }
    setLoading(true);
    try {
      await assignCleanerRole({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim() || email.trim(),
        phone: phone.trim() || null,
        telegram_chat_id: telegramChatId.trim() || null,
        color: color.trim() || null,
      });
      toast.success(t('cleaning.admin.cleanerAdded', { defaultValue: 'Уборщица добавлена' }));
      setOpen(false);
      setEmail('');
      setFullName('');
      setPhone('');
      setTelegramChatId('');
      setColor('#6b7280');
      void fetchCleaners();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg || t('cleaning.admin.cleanerAddError', { defaultValue: 'Ошибка добавления' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t('cleaning.admin.addCleaner', { defaultValue: 'Добавить уборщицу' })}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cleaners.map((c) => (
          <CleanerCard key={c.id} cleaner={c} />
        ))}
      </div>
      {cleaners.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('cleaning.admin.noCleaners', { defaultValue: 'Нет уборщиц. Добавьте по email.' })}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('cleaning.admin.addCleaner', { defaultValue: 'Добавить уборщицу' })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="cleaner-email">{t('auth.email')} *</Label>
              <Input
                id="cleaner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('cleaning.admin.cleanerEmailHint', {
                  defaultValue: 'Пользователь должен быть уже зарегистрирован в системе.',
                })}
              </p>
            </div>
            <div>
              <Label htmlFor="cleaner-name">{t('auth.firstName')} / Имя</Label>
              <Input
                id="cleaner-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('cleaning.admin.cleanerNamePlaceholder', { defaultValue: 'Имя уборщицы' })}
              />
            </div>
            <div>
              <Label htmlFor="cleaner-phone">{t('auth.phone')}</Label>
              <Input
                id="cleaner-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7..."
              />
            </div>
            <div>
              <Label htmlFor="cleaner-telegram">Telegram Chat ID</Label>
              <Input
                id="cleaner-telegram"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="123456789"
              />
            </div>
            <div>
              <Label htmlFor="cleaner-color">{t('cleaning.admin.cleanerColor', { defaultValue: 'Цвет в календаре' })}</Label>
              <div className="flex gap-2 items-center">
                <input
                  id="cleaner-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CleanerCard({ cleaner }: { cleaner: Cleaner }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-full shrink-0"
          style={{ backgroundColor: cleaner.color || '#6b7280' }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{cleaner.full_name}</p>
          {cleaner.phone && <p className="text-xs text-muted-foreground truncate">{cleaner.phone}</p>}
          {cleaner.telegram_chat_id && (
            <p className="text-xs text-muted-foreground">TG: {cleaner.telegram_chat_id}</p>
          )}
        </div>
        {!cleaner.is_active && (
          <span className="text-xs text-muted-foreground">{t('cleaning.admin.inactive', { defaultValue: 'Неактивна' })}</span>
        )}
      </div>
    </Card>
  );
}
