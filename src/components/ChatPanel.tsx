import { useState, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  Send,
  Paperclip,
  MoreVertical,
  Calendar,
  User,
  MapPin,
  FileText,
  MessageCircle,
  RefreshCw,
  CalendarCheck,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Chat, Message, Property } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { avitoApi } from '@/services/avitoApi';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatPanelProps {
  chat: Chat | null;
  property: Property | null;
  messages: Message[];
  isLoading: boolean;
  isSyncing?: boolean;
  onSendMessage: (text: string, attachments?: Array<{ type: string; url: string; name?: string }>) => Promise<void>;
  onLoadMore: () => void;
  hasMore: boolean;
  onCreateBooking?: (chat: Chat) => void;
  onStatusChange?: (chat: Chat, status: Chat['status']) => void;
  onViewBooking?: (bookingId: string) => void;
}

const TEMPLATES = [
  { key: 'greeting', label: 'Приветствие' },
  { key: 'availability', label: 'Доступность' },
  { key: 'price', label: 'Цена' },
  { key: 'details', label: 'Детали' },
  { key: 'booking', label: 'Бронирование' },
];

const TEMPLATE_TEXTS: Record<string, string> = {
  greeting: 'Здравствуйте! Спасибо за интерес к нашему объявлению.',
  availability: 'Да, объект свободен на эти даты. Могу забронировать для вас.',
  price: 'Цена за ночь составляет {{price}} {{currency}}. Итоговая стоимость зависит от количества ночей.',
  details: 'Могу предоставить дополнительную информацию об объекте. Что именно вас интересует?',
  booking: 'Для бронирования мне нужны следующие данные: даты заезда и выезда, количество гостей, контактный телефон.',
};

function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups = new Map<string, Message[]>();
  for (const msg of messages) {
    const d = new Date(msg.created_at);
    const key = format(d, 'yyyy-MM-dd');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(msg);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, msgs]) => ({ date, messages: msgs.sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()) }));
}

function formatDateKey(dateKey: string): string {
  const d = new Date(dateKey);
  if (isToday(d)) return format(d, 'd MMMM yyyy', { locale: ru });
  if (isYesterday(d)) return 'Вчера';
  return format(d, 'd MMMM yyyy', { locale: ru });
}

export function ChatPanel({
  chat,
  property,
  messages,
  isLoading,
  isSyncing = false,
  onSendMessage,
  onLoadMore,
  hasMore,
  onCreateBooking,
  onStatusChange,
  onViewBooking,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesByDate = useMemo(() => groupMessagesByDate(messages), [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() && !uploading) return;
    const text = inputValue.trim();
    setInputValue('');
    try {
      await onSendMessage(text);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      console.error('Failed to send message:', e);
      toast.error(t('messages.error.failedToSend'));
    }
  };

  const handleTemplateSelect = (templateKey: string) => {
    const template = TEMPLATE_TEXTS[templateKey];
    if (!template) return;
    let text = template;
    if (property) {
      text = text.replace('{{price}}', property.base_price.toString());
      text = text.replace('{{currency}}', property.currency);
    }
    setInputValue(text);
  };

  const handleFileUpload = async (file: File) => {
    if (!chat) return;
    setUploading(true);
    try {
      const { data: integration } = await supabase
        .from('integrations')
        .select('avito_user_id, access_token_encrypted')
        .eq('id', chat.integration_id || '')
        .single();
      if (!integration?.avito_user_id) throw new Error('Integration not found');
      const attachment = await avitoApi.uploadAttachment(integration.avito_user_id, file, file.name);
      await onSendMessage('', [attachment]);
      toast.success(t('messages.success.uploaded'));
    } catch (e) {
      console.error('Failed to upload file:', e);
      toast.error(t('messages.error.failedToUpload'));
    } finally {
      setUploading(false);
    }
  };

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.scrollTop === 0 && hasMore && !isLoading) onLoadMore();
    },
    [hasMore, isLoading, onLoadMore]
  );

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20 border-l border-border">
        <div className="text-center">
          <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{t('messages.noMessages')}</p>
          <p className="text-sm text-muted-foreground mt-2">{t('messages.noMessagesDescription')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header — design: avatar, name, property • Booking ID, View Booking, Details, more_vert */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted flex items-center justify-center">
            {chat.contact_avatar_url ? (
              <img src={chat.contact_avatar_url} alt={chat.contact_name || ''} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold truncate">{chat.contact_name || t('messages.contact')}</h3>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {property?.name ?? '—'}
              {chat.booking_id && (
                <>
                  {' • '}
                  {t('messages.bookingId', { defaultValue: 'Бронь' })} #{chat.booking_id.slice(0, 8)}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSyncing && (
            <RefreshCw className="h-4 w-4 animate-spin text-primary" aria-hidden />
          )}
          {chat.booking_id && onViewBooking && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-xs font-bold"
              onClick={() => onViewBooking(chat.booking_id!)}
            >
              <CalendarCheck className="w-3.5 h-3.5 mr-1" />
              {t('messages.viewBooking', { defaultValue: 'Бронь' })}
            </Button>
          )}
          {onCreateBooking && (
            <Button variant="secondary" size="sm" className="h-8 text-xs font-bold" onClick={() => onCreateBooking(chat)}>
              <Calendar className="w-3.5 h-3.5 mr-1" />
              {t('messages.createBooking')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onStatusChange?.(chat, 'new')}>
                {t('messages.status.new')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStatusChange?.(chat, 'in_progress')}>
                {t('messages.status.in_progress')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStatusChange?.(chat, 'closed')}>
                {t('messages.status.closed')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages with date separators */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-muted/20"
        onScroll={handleScroll}
      >
        {isLoading && messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">{t('messages.loading')}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <Button variant="link" size="sm" onClick={onLoadMore} disabled={isLoading}>
                  {isLoading ? t('messages.loading') : t('messages.loadMore')}
                </Button>
              </div>
            )}
            {messagesByDate.map(({ date, messages: dayMessages }) => (
              <div key={date} className="space-y-4">
                <div className="flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {formatDateKey(date)}
                  </span>
                </div>
                {dayMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-[80%] ${msg.sender_type === 'user' ? 'flex-row-reverse ml-auto' : 'flex-row'}`}
                  >
                    {msg.sender_type === 'contact' && (
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 mt-1 bg-muted flex items-center justify-center">
                        {chat.contact_avatar_url ? (
                          <img
                            src={chat.contact_avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    {msg.sender_type === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={`flex-1 min-w-0 ${msg.sender_type === 'user' ? 'flex flex-col items-end' : ''}`}>
                      <div
                        className={
                          msg.sender_type === 'user'
                            ? 'bg-primary text-primary-foreground p-3 rounded-xl rounded-tr-none shadow-sm'
                            : 'bg-card border border-border p-3 rounded-xl rounded-tl-none shadow-sm'
                        }
                      >
                        {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
                        {msg.attachments?.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {msg.attachments.map((att: { type: string; url: string; name?: string }, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                {att.type === 'image' ? (
                                  <img
                                    src={att.url}
                                    alt={att.name || 'Attachment'}
                                    className="max-w-xs rounded-lg"
                                  />
                                ) : (
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-primary hover:underline"
                                  >
                                    <FileText size={16} />
                                    <span>{att.name || 'Attachment'}</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[10px] text-muted-foreground mt-1 block ${msg.sender_type === 'user' ? 'mr-1' : 'ml-1'}`}
                      >
                        {format(new Date(msg.created_at), 'HH:mm', { locale: ru })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input — rounded-xl, Quick Reply under, Shift+Enter hint, no Translate */}
      <div className="p-6 border-t border-border bg-background shrink-0">
        <div className="flex items-center gap-3 p-2 bg-muted rounded-xl border border-border">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 text-muted-foreground hover:text-primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('messages.sendPlaceholder')}
            className="flex-1 min-w-0 bg-transparent border-0 focus:ring-0 focus:outline-none text-sm py-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSend}
            disabled={(!inputValue.trim() && !uploading) || uploading}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center justify-between mt-3 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs font-bold text-muted-foreground h-auto py-1 px-0 hover:text-foreground">
                <Zap className="w-4 h-4 mr-1.5" />
                {t('messages.quickReply', { defaultValue: 'Быстрый ответ' })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {TEMPLATES.map((tpl) => (
                <DropdownMenuItem key={tpl.key} onClick={() => handleTemplateSelect(tpl.key)}>
                  {tpl.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-[10px] text-muted-foreground font-medium">
            {t('messages.shiftEnterHint', { defaultValue: 'Shift + Enter — новая строка' })}
          </p>
        </div>
      </div>
    </div>
  );
}
