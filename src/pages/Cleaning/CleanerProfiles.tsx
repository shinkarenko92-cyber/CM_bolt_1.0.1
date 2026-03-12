import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Phone, Send, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Cleaner } from '@/types/cleaning';
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
import toast from 'react-hot-toast';

type CleanerProfilesProps = {
  addDialogOpen?: boolean;
  onAddDialogOpenChange?: (open: boolean) => void;
};

export function CleanerProfiles({ addDialogOpen, onAddDialogOpenChange }: CleanerProfilesProps = {}) {
  const { t } = useTranslation();
  const { cleaners, fetchCleaners } = useCleaning();
  const [openLocal, setOpenLocal] = useState(false);
  const isControlled = addDialogOpen !== undefined && onAddDialogOpenChange !== undefined;
  const open = isControlled ? addDialogOpen! : openLocal;
  const setOpen = isControlled ? onAddDialogOpenChange! : setOpenLocal;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [color, setColor] = useState('#6b7280');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = fullName.trim();
    const phoneVal = phone.trim().replace(/\s/g, '');
    if (!name) {
      toast.error(t('cleaning.admin.cleanerNameRequired', { defaultValue: 'Введите имя' }));
      return;
    }
    const digits = phoneVal.replace(/\D/g, '');
    const normalized = digits.length === 10 ? '7' + digits : digits;
    if (!phoneVal || normalized.length !== 11 || !normalized.startsWith('7')) {
      toast.error(t('cleaning.admin.cleanerPhoneRequired', { defaultValue: 'Введите телефон в формате +7XXXXXXXXXX' }));
      return;
    }
    setLoading(true);
    try {
      const { magic_link } = await assignCleanerRole({
        full_name: name,
        phone: phoneVal.startsWith('+') ? phoneVal : `+${phoneVal}`,
        telegram_chat_id: telegramChatId.trim() || null,
        color: color.trim() || null,
      });
      toast.success(t('cleaning.admin.cleanerAdded', { defaultValue: 'Уборщица добавлена' }));
      if (magic_link) {
        await navigator.clipboard.writeText(magic_link);
        toast.success(t('cleaning.admin.linkCopied', { defaultValue: 'Ссылка для входа скопирована в буфер' }));
      }
      setOpen(false);
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
    <>
      {cleaners.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cleaners.map((c) => (
            <CleanerCard key={c.id} cleaner={c} />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-16 px-6 border-dashed">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <UserPlus className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-medium mb-1">
            {t('cleaning.admin.noCleanersTitle', { defaultValue: 'Нет уборщиц' })}
          </p>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-xs">
            {t('cleaning.admin.noCleanersDesc', { defaultValue: 'Добавьте первую уборщицу, чтобы начать планировать уборки' })}
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('cleaning.admin.addCleaner', { defaultValue: 'Добавить уборщицу' })}
          </Button>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('cleaning.admin.addCleaner', { defaultValue: 'Добавить уборщицу' })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="cleaner-name">Имя *</Label>
              <Input
                id="cleaner-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Анна Иванова"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="cleaner-phone">Телефон *</Label>
              <Input
                id="cleaner-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 999 123 45 67"
                required
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
    </>
  );
}

function CleanerCard({ cleaner }: { cleaner: Cleaner }) {
  const { t } = useTranslation();
  const initials = cleaner.full_name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="p-4 transition-all hover:shadow-md hover:border-primary/20">
      <div className="flex items-start gap-3">
        <div
          className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold shadow-sm"
          style={{ backgroundColor: cleaner.color || '#6b7280' }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{cleaner.full_name}</p>
            {!cleaner.is_active && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {t('cleaning.admin.inactive', { defaultValue: 'Неактивна' })}
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            {cleaner.phone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{cleaner.phone}</span>
              </div>
            )}
            {cleaner.telegram_chat_id && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Send className="h-3 w-3" />
                <span>TG: {cleaner.telegram_chat_id}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
