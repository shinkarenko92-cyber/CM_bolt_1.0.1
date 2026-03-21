import { useState, useMemo, useCallback } from 'react';
import { Search, MessageCircle, User, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { Chat, Property } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type IntegrationForMessenger = { id: string; property_id: string };

interface MessagesViewProps {
  chats: Chat[];
  properties: Property[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  hasMessengerAccess?: boolean;
  integrationsForMessenger?: IntegrationForMessenger[];
  onRequestMessengerAuth?: (integrationId: string | null) => void;
  onGoToProperties?: () => void;
}

export function MessagesView({
  chats,
  properties,
  selectedChatId,
  onSelectChat,
  hasMessengerAccess = true,
  integrationsForMessenger = [],
  onRequestMessengerAuth,
  onGoToProperties,
}: MessagesViewProps) {
  const { t } = useTranslation();
  const { permission, requestPermission, supported: notifSupported } = useNotificationPermission();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPropertyId, setFilterPropertyId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'in_progress' | 'closed'>('all');
  const [messengerAuthModalOpen, setMessengerAuthModalOpen] = useState(false);
  const [noIntegrationModalOpen, setNoIntegrationModalOpen] = useState(false);

  const showMessengerCta = !hasMessengerAccess && !!onRequestMessengerAuth;
  const firstIntegrationForMessenger = integrationsForMessenger[0];

  const getPropertyName = useCallback((propertyId: string | null) => {
    if (!propertyId) return t('common.unknown');
    return properties.find((p) => p.id === propertyId)?.name || t('common.unknown');
  }, [properties, t]);

  const getStatusBadge = (status: Chat['status']) => {
    const isHighlight = status === 'new' || status === 'in_progress';
    return {
      className: isHighlight
        ? 'bg-primary/20 text-primary'
        : 'bg-muted text-muted-foreground',
      label:
        status === 'new'
          ? t('messages.status.new')
          : status === 'in_progress'
            ? t('messages.status.in_progress')
            : t('messages.status.closed'),
    };
  };

  const filteredAndSortedChats = useMemo(() => {
    const filtered = chats.filter((chat) => {
      const matchesSearch =
        (chat.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (chat.last_message_text?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
      const matchesProperty = filterPropertyId === 'all' || chat.property_id === filterPropertyId;
      const matchesStatus = filterStatus === 'all' || chat.status === filterStatus;
      return matchesSearch && matchesProperty && matchesStatus;
    });
    filtered.sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });
    return filtered;
  }, [chats, searchTerm, filterPropertyId, filterStatus]);

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return t('common.justNow', { defaultValue: 'Только что' });
    if (diffMins < 60) return `${diffMins} ${t('common.minutesAgo', { defaultValue: 'мин назад' })}`;
    if (diffHours < 24) return `${diffHours} ${t('common.hoursAgo', { defaultValue: 'ч назад' })}`;
    if (diffDays < 7) return `${diffDays} ${t('common.daysAgo', { defaultValue: 'дн назад' })}`;
    if (diffDays < 2) return t('common.yesterday', { defaultValue: 'Вчера' });
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {showMessengerCta && (
        <div className="p-3 border-b border-border">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
            <p className="text-sm font-medium mb-2">{t('messages.messengerCta.title')}</p>
            <Button
              size="sm"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => {
                if (integrationsForMessenger.length === 0) {
                  setNoIntegrationModalOpen(true);
                } else {
                  setMessengerAuthModalOpen(true);
                }
              }}
            >
              <MessageCircle className="w-4 h-4 mr-1.5" />
              {t('messages.messengerCta.button')}
            </Button>
          </div>
        </div>
      )}

      {notifSupported && permission === 'default' && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground leading-snug">
              {t('messages.notifBanner', { defaultValue: 'Включите уведомления — узнавайте о новых сообщениях, даже когда вкладка свёрнута' })}
            </p>
            <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={requestPermission}>
              <Bell className="h-3.5 w-3.5 mr-1" />
              {t('messages.enableNotif', { defaultValue: 'Включить' })}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={noIntegrationModalOpen} onOpenChange={setNoIntegrationModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('messages.noAvitoIntegration.title')}</DialogTitle>
            <DialogDescription>
              {t('messages.noAvitoIntegration.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoIntegrationModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                setNoIntegrationModalOpen(false);
                onGoToProperties?.();
              }}
              disabled={!onGoToProperties}
            >
              {t('messages.noAvitoIntegration.connectButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={messengerAuthModalOpen} onOpenChange={setMessengerAuthModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('messages.messengerCta.modalTitle')}</DialogTitle>
            <DialogDescription>
              {t('messages.messengerCta.modalDescription')}
              <span className="mt-2 block text-muted-foreground text-sm">
                {t('messages.messengerCta.modalHint')}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessengerAuthModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                onRequestMessengerAuth?.(firstIntegrationForMessenger?.id ?? null);
                setMessengerAuthModalOpen(false);
              }}
            >
              {t('messages.messengerCta.modalConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('messages.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted border-0 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <select
            value={filterPropertyId}
            onChange={(e) => setFilterPropertyId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-muted rounded border-0 focus:ring-1 focus:ring-primary/50"
          >
            <option value="all">{t('messages.allProperties')}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-muted rounded border-0 focus:ring-1 focus:ring-primary/50"
          >
            <option value="all">{t('messages.allStatuses')}</option>
            <option value="new">{t('messages.status.new')}</option>
            <option value="in_progress">{t('messages.status.in_progress')}</option>
            <option value="closed">{t('messages.status.closed')}</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {filteredAndSortedChats.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('messages.noChats')}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredAndSortedChats.map((chat) => {
              const status = getStatusBadge(chat.status);
              const isSelected = selectedChatId === chat.id;
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full text-left p-4 border-b border-border/50 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? 'bg-primary/5 border-l-4 border-l-primary'
                      : chat.unread_count > 0
                        ? 'bg-primary/[0.03] hover:bg-primary/[0.06]'
                        : 'hover:bg-muted/80'
                  }`}
                >
                  <div className="relative w-12 h-12 shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                      {chat.contact_avatar_url ? (
                        <img
                          src={chat.contact_avatar_url}
                          alt={chat.contact_name || ''}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    {chat.unread_count > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                        {chat.unread_count > 99 ? '99+' : chat.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <h3 className={`text-sm truncate ${chat.unread_count > 0 ? 'font-extrabold' : 'font-bold'}`}>
                        {chat.contact_name || t('messages.contact')}
                      </h3>
                      <span className={`text-[10px] shrink-0 ml-1 ${chat.unread_count > 0 ? 'text-primary font-bold' : 'text-muted-foreground font-medium'}`}>
                        {formatTime(chat.last_message_at)}
                      </span>
                    </div>
                    <p
                      className={`text-xs font-semibold truncate mb-0.5 ${
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {chat.property_id ? getPropertyName(chat.property_id) : '—'}
                    </p>
                    {(chat.avito_item_title || chat.avito_item_id) ? (
                      <p className="text-xs text-gray-400 truncate mb-1">
                        {chat.avito_item_title ?? `№ ${chat.avito_item_id}`}
                      </p>
                    ) : null}
                    <p className={`text-xs truncate ${chat.unread_count > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                      {chat.last_message_text ?? ''}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${status.className}`}
                  >
                    {status.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
