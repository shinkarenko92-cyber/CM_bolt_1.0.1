import { useState, useMemo, useCallback } from 'react';
import { Search, MessageCircle, Clock, User, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Chat, Property } from '../lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';

export type IntegrationForMessenger = { id: string; property_id: string };

interface MessagesViewProps {
  chats: Chat[];
  properties: Property[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  /** If false and integrationsForMessenger.length > 0, show CTA to connect Avito Messenger */
  hasMessengerAccess?: boolean;
  integrationsForMessenger?: IntegrationForMessenger[];
  onRequestMessengerAuth?: (integrationId: string) => void;
}

export function MessagesView({
  chats,
  properties,
  selectedChatId,
  onSelectChat,
  hasMessengerAccess = true,
  integrationsForMessenger = [],
  onRequestMessengerAuth,
}: MessagesViewProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPropertyId, setFilterPropertyId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'in_progress' | 'closed'>('all');
  const [messengerAuthModalOpen, setMessengerAuthModalOpen] = useState(false);

  const showMessengerCta = !hasMessengerAccess && integrationsForMessenger.length > 0 && onRequestMessengerAuth;
  const firstIntegrationForMessenger = integrationsForMessenger[0];

  const getPropertyName = useCallback((propertyId: string | null) => {
    if (!propertyId) return t('common.unknown');
    return properties.find((p) => p.id === propertyId)?.name || t('common.unknown');
  }, [properties, t]);

  const getStatusBadge = (status: Chat['status']) => {
    const colors: Record<Chat['status'], string> = {
      new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      closed: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    };

    const labels: Record<Chat['status'], string> = {
      new: t('messages.status.new'),
      in_progress: t('messages.status.in_progress'),
      closed: t('messages.status.closed'),
    };

    const statusKey: Chat['status'] = status;
    return {
      color: colors[statusKey] ?? colors.new,
      label: labels[statusKey] ?? status,
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

    // Sort: unread first, then by last_message_at
    filtered.sort((a, b) => {
      // Unread chats first
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      
      // Then by last_message_at (most recent first)
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    return filtered;
  }, [chats, searchTerm, filterPropertyId, filterStatus]);

  const stats = useMemo(() => {
    const total = chats.length;
    const unread = chats.reduce((sum, chat) => sum + chat.unread_count, 0);
    const newChats = chats.filter(c => c.status === 'new').length;

    return { total, unread, newChats };
  }, [chats]);

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('common.today', { defaultValue: 'Только что' });
    if (diffMins < 60) return `${diffMins} ${t('common.minutesAgo', { defaultValue: 'мин назад' })}`;
    if (diffHours < 24) return `${diffHours} ${t('common.hoursAgo', { defaultValue: 'ч назад' })}`;
    if (diffDays < 7) return `${diffDays} ${t('common.daysAgo', { defaultValue: 'дн назад' })}`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">{t('messages.title')}</h1>
          <p className="text-slate-400">{t('messages.subtitle')}</p>
        </div>

        {showMessengerCta && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">{t('messages.messengerCta.title')}</h2>
            <p className="text-slate-300 mb-4">{t('messages.messengerCta.description')}</p>
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setMessengerAuthModalOpen(true)}
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              {t('messages.messengerCta.button')}
            </Button>
          </div>
        )}

        <Dialog open={messengerAuthModalOpen} onOpenChange={setMessengerAuthModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('messages.messengerCta.modalTitle')}</DialogTitle>
              <DialogDescription>{t('messages.messengerCta.modalDescription')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMessengerAuthModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  if (firstIntegrationForMessenger) {
                    onRequestMessengerAuth?.(firstIntegrationForMessenger.id);
                  }
                  setMessengerAuthModalOpen(false);
                }}
              >
                {t('messages.messengerCta.modalConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">{t('bookings.total')}</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">{t('messages.unread')}</div>
            <div className="text-2xl font-bold text-teal-400">{stats.unread}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">{t('messages.status.new')}</div>
            <div className="text-2xl font-bold text-blue-400">{stats.newChats}</div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('messages.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <select
              value={filterPropertyId}
              onChange={(e) => setFilterPropertyId(e.target.value)}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            >
              <option value="all">{t('messages.allProperties')}</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            >
              <option value="all">{t('messages.allStatuses')}</option>
              <option value="new">{t('messages.status.new')}</option>
              <option value="in_progress">{t('messages.status.in_progress')}</option>
              <option value="closed">{t('messages.status.closed')}</option>
            </select>
          </div>
        </div>

        {filteredAndSortedChats.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg">
            <MessageCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">{t('messages.noChats')}</p>
            <p className="text-slate-500 text-sm mt-2">{t('messages.noChatsDescription')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAndSortedChats.map((chat) => {
              const status = getStatusBadge(chat.status);
              const isSelected = selectedChatId === chat.id;

              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full text-left bg-slate-800 rounded-lg p-4 hover:ring-2 hover:ring-teal-500 transition ${
                    isSelected ? 'ring-2 ring-teal-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {chat.contact_avatar_url ? (
                          <img
                            src={chat.contact_avatar_url}
                            alt={chat.contact_name || ''}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center">
                            <User className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">
                              {chat.contact_name || t('messages.contact')}
                            </h3>
                            {chat.unread_count > 0 && (
                              <span className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center text-xs text-white font-semibold">
                                {chat.unread_count > 9 ? '9+' : chat.unread_count}
                              </span>
                            )}
                          </div>
                          {chat.contact_phone && (
                            <p className="text-sm text-slate-400">{chat.contact_phone}</p>
                          )}
                        </div>
                      </div>

                      {chat.last_message_text && (
                        <p className="text-sm text-slate-300 mb-2 line-clamp-2">
                          {chat.last_message_text}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {chat.property_id && (
                          <div className="flex items-center gap-1">
                            <MapPin size={12} />
                            <span>{getPropertyName(chat.property_id)}</span>
                          </div>
                        )}
                        {chat.last_message_at && (
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{formatTime(chat.last_message_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ml-4">
                      <span className={`px-2 py-1 text-xs rounded border ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
