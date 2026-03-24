import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Bell, BellOff, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';

interface AvitoIntegration {
  id: string;
  property_id: string;
  avito_user_id: string | null;
  scope: string | null;
  property_name?: string;
}

interface AccountsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: { id: string; name: string }[];
  onRequestMessengerAuth: (integrationId: string | null) => void;
}

const COMING_SOON_PLATFORMS = [
  { id: 'cian', name: 'Циан', color: '#0057B8' },
  { id: 'sutochno', name: 'Суточно.ру', color: '#FF6B00' },
  { id: 'airbnb', name: 'Airbnb', color: '#FF5A5F' },
  { id: 'booking', name: 'Booking.com', color: '#003580' },
];

export function AccountsModal({
  open,
  onOpenChange,
  properties,
  onRequestMessengerAuth,
}: AccountsModalProps) {
  const { user } = useAuth();
  const [avitoIntegrations, setAvitoIntegrations] = useState<AvitoIntegration[]>([]);
  const [loading, setLoading] = useState(false);
  const { supported: pushSupported, status: pushStatus, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushSubscription();
  const { permission, requestPermission, supported: notifSupported } = useNotificationPermission();
  const [testingSend, setTestingSend] = useState(false);

  useEffect(() => {
    if (!open || !user || !properties.length) return;
    setLoading(true);
    const propertyIds = properties.map(p => p.id);
    supabase
      .from('integrations')
      .select('id, property_id, avito_user_id, scope')
      .eq('platform', 'avito')
      .eq('is_active', true)
      .in('property_id', propertyIds)
      .then(({ data }) => {
        const enriched = (data || []).map(r => ({
          ...r,
          property_name: properties.find(p => p.id === r.property_id)?.name,
        }));
        setAvitoIntegrations(enriched);
        setLoading(false);
      });
  }, [open, user, properties]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Подключённые аккаунты</DialogTitle>
          <DialogDescription>
            Управляйте интеграциями с площадками. Новые платформы появятся в ближайших обновлениях.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Avito section */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-[#00AAFF] flex items-center justify-center shrink-0">
                <span className="text-white font-extrabold text-xs">A</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Avito</p>
                <p className="text-xs text-muted-foreground">Мессенджер Avito</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : avitoIntegrations.length === 0 ? (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span className="text-sm">Не подключено</span>
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => { onOpenChange(false); onRequestMessengerAuth(null); }}>
                  Подключить
                </Button>
              </div>
            ) : (() => {
              // Group integrations by avito_user_id (one Avito account)
              const hasMessenger = avitoIntegrations.some(i => (i.scope ?? '').includes('messenger:read'));
              const firstIntegration = avitoIntegrations[0];
              return (
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-1.5">
                      {hasMessenger ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <span className="text-xs text-green-600 dark:text-green-400">Мессенджер подключён</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs text-amber-600 dark:text-amber-400">Нет доступа к мессенджеру</span>
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={hasMessenger ? 'outline' : 'default'}
                      className="h-7 text-xs shrink-0"
                      onClick={() => { onOpenChange(false); onRequestMessengerAuth(firstIntegration.id); }}
                    >
                      {hasMessenger ? 'Переподключить' : 'Авторизовать'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-1">Объекты ({avitoIntegrations.length}):</p>
                  <div className="space-y-0.5">
                    {avitoIntegrations.map(i => (
                      <p key={i.id} className="text-xs text-foreground truncate pl-2 border-l-2 border-border">
                        {i.property_name ?? 'Объект'}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Push notifications section */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Push-уведомления</p>
                <p className="text-xs text-muted-foreground">Сообщения при закрытом приложении</p>
              </div>
            </div>
            <div className="px-4 py-3">
              {!notifSupported || !pushSupported ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BellOff className="w-4 h-4 shrink-0" />
                  <span className="text-xs">Не поддерживается в этом браузере</span>
                </div>
              ) : permission === 'denied' ? (
                <div className="flex items-center gap-2 text-destructive">
                  <BellOff className="w-4 h-4 shrink-0" />
                  <span className="text-xs">Уведомления заблокированы в настройках браузера</span>
                </div>
              ) : pushStatus === 'subscribed' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-xs text-green-600 dark:text-green-400">Включены</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        disabled={testingSend}
                        onClick={async () => {
                          setTestingSend(true);
                          try {
                            const { error } = await supabase.functions.invoke('send-push', {
                              body: {
                                user_id: user?.id,
                                title: 'Тестовое уведомление',
                                body: 'Push-уведомления работают!',
                                tag: 'test-push',
                                url: '/?view=messages',
                              },
                            });
                            if (error) console.error('Test push error:', error);
                          } catch (e) {
                            console.error('Test push failed:', e);
                          } finally {
                            setTestingSend(false);
                          }
                        }}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        {testingSend ? '...' : 'Тест'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0 text-destructive hover:text-destructive"
                        onClick={unsubscribePush}
                      >
                        <BellOff className="h-3 w-3 mr-1" />
                        Отключить
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <BellOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">Отключены</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={async () => {
                      if (permission !== 'granted') {
                        await requestPermission();
                      }
                      await subscribePush();
                    }}
                  >
                    <Bell className="h-3 w-3 mr-1" />
                    Включить
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Coming soon platforms */}
          {COMING_SOON_PLATFORMS.map(platform => (
            <div key={platform.id} className="rounded-lg border border-border flex items-center gap-3 px-4 py-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: platform.color }}
              >
                <span className="text-white font-extrabold text-xs">{platform.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">{platform.name}</p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground shrink-0">
                Скоро
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
