import { useState, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  Send,
  Paperclip,
  MoreVertical,
  ChevronLeft,
  Calendar,
  User,
  MapPin,
  FileText,
  MessageCircle,
  RefreshCw,
  CalendarCheck,
  Zap,
  Settings2,
  ArrowLeft,
  Search,
  X,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMessageTemplates } from '@/hooks/useMessageTemplates';
import { QuickRepliesModal } from '@/components/QuickRepliesModal';

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
  onRefresh?: () => void;
  onBack?: () => void;
}


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
  onRefresh,
  onBack,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useMessageTemplates();
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);

  const messagesByDate = useMemo(() => groupMessagesByDate(messages), [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || sending || uploading) return;
    const text = inputValue.trim();
    setSending(true);
    try {
      await onSendMessage(text);
      setInputValue('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      console.error('Failed to send message:', e);
      toast.error(t('messages.error.failedToSend'));
      // input intentionally NOT cleared — user can retry
    } finally {
      setSending(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    let text = template.text;
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

  const highlightText = (text: string) => {
    if (!chatSearch || !text) return text;
    const regex = new RegExp(`(${chatSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-yellow-300/50 dark:bg-yellow-500/30 rounded-sm px-0.5">{part}</mark>
        : part
    );
  };

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
          {onBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8 mr-1 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted flex items-center justify-center">
            {chat.contact_avatar_url ? (
              <img src={chat.contact_avatar_url} alt={chat.contact_name || ''} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold truncate">{chat.contact_name || t('messages.contact')}</h3>
            {(chat.avito_item_title || chat.avito_item_id) && (
              <p className="text-[11px] text-primary/80 font-medium truncate">
                {chat.avito_item_title ?? `Объявление № ${chat.avito_item_id}`}
              </p>
            )}
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setChatSearchOpen(!chatSearchOpen)}>
            <Search className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCreateBooking && (
                <DropdownMenuItem onClick={() => onCreateBooking(chat)}>
                  <Calendar className="w-4 h-4 mr-2" />
                  {t('messages.createBooking')}
                </DropdownMenuItem>
              )}
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

      {chatSearchOpen && (
        <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Поиск по сообщениям..."
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-sm"
          />
          {chatSearch && (
            <span className="text-xs text-muted-foreground shrink-0">
              {messages.filter(m => m.text?.toLowerCase().includes(chatSearch.toLowerCase())).length} совпадений
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setChatSearch(''); setChatSearchOpen(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Messages with date separators */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-muted/20"
        onScroll={handleScroll}
      >
        {isLoading && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">{t('messages.loading')}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            {isSyncing ? (
              <>
                <RefreshCw className="h-8 w-8 animate-spin text-primary/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t('messages.syncing', { defaultValue: 'Загружаем сообщения из Avito...' })}
                </p>
              </>
            ) : (
              <>
                <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t('messages.noMessagesYet', { defaultValue: 'Сообщений пока нет' })}
                </p>
                {onRefresh && (
                  <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={onRefresh}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    {t('messages.syncFromAvito', { defaultValue: 'Загрузить из Avito' })}
                  </Button>
                )}
              </>
            )}
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
                        {msg.text && <p className="text-sm leading-relaxed">{highlightText(msg.text)}</p>}
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
            disabled={!inputValue.trim() || sending || uploading}
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <Send className="h-5 w-5" />
            )}
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
              {templates.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                  Нет шаблонов
                </DropdownMenuItem>
              )}
              {templates.map((tpl) => (
                <DropdownMenuItem key={tpl.id} onClick={() => handleTemplateSelect(tpl.id)}>
                  {tpl.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setQuickRepliesOpen(true)}>
                <Settings2 className="w-4 h-4 mr-2" />
                Управлять шаблонами
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-[10px] text-muted-foreground font-medium">
            {t('messages.shiftEnterHint', { defaultValue: 'Shift + Enter — новая строка' })}
          </p>
        </div>
      </div>
      <QuickRepliesModal
        open={quickRepliesOpen}
        onOpenChange={setQuickRepliesOpen}
        templates={templates}
        onAdd={addTemplate}
        onUpdate={updateTemplate}
        onDelete={deleteTemplate}
      />
    </div>
  );
}
