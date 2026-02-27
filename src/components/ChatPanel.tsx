import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Send, Paperclip, MoreVertical, Calendar, User, Phone, MapPin, FileText, MessageCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Chat, Message, Property } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { avitoApi } from '@/services/avitoApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleSend = async () => {
    if (!inputValue.trim() && !uploading) return;

    const text = inputValue.trim();
    setInputValue('');
    
    try {
      await onSendMessage(text);
      // Scroll to bottom after sending
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error(t('messages.error.failedToSend'));
    }
  };

  const handleTemplateSelect = (templateKey: string) => {
    const template = TEMPLATE_TEXTS[templateKey];
    if (template) {
      let text = template;
      // Replace placeholders if needed
      if (property) {
        text = text.replace('{{price}}', property.base_price.toString());
        text = text.replace('{{currency}}', property.currency);
      }
      setInputValue(text);
      setSelectedTemplate(templateKey);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!chat) return;

    setUploading(true);
    try {
      // Get integration to get avito_user_id
      const { data: integration } = await supabase
        .from('integrations')
        .select('avito_user_id, access_token_encrypted')
        .eq('id', chat.integration_id || '')
        .single();

      if (!integration?.avito_user_id) {
        throw new Error('Integration not found');
      }

      // Upload to Avito
      const attachment = await avitoApi.uploadAttachment(
        integration.avito_user_id,
        file,
        file.name
      );

      // Send message with attachment
      await onSendMessage('', [attachment]);
      toast.success(t('messages.success.uploaded'));
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error(t('messages.error.failedToUpload'));
    } finally {
      setUploading(false);
    }
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Load more when scrolled to top
    if (target.scrollTop === 0 && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-800 border-l border-slate-700">
        <div className="text-center">
          <MessageCircle className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400">{t('messages.noMessages')}</p>
          <p className="text-slate-500 text-sm mt-2">{t('messages.noMessagesDescription')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
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
            <div>
              <h3 className="text-lg font-semibold text-white">
                {chat.contact_name || t('messages.contact')}
              </h3>
              {chat.contact_phone && (
                <p className="text-sm text-slate-400 flex items-center gap-1">
                  <Phone size={12} />
                  {chat.contact_phone}
                </p>
              )}
            </div>
            {chat.unread_count > 0 && (
              <Badge variant="destructive">{chat.unread_count}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSyncing && (
              <RefreshCw className="h-4 w-4 animate-spin text-primary" aria-hidden />
            )}
            {onCreateBooking && (
              <Button onClick={() => onCreateBooking(chat)}>
                <Calendar size={16} />
                {t('messages.createBooking')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical size={16} />
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
        {property && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MapPin size={14} />
            <span>{property.name}</span>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4"
        onScroll={handleScroll}
      >
        {isLoading && messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400">{t('messages.loading')}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center mb-4">
                <Button variant="link" onClick={onLoadMore} disabled={isLoading}>
                  {isLoading ? t('messages.loading') : t('messages.loadMore')}
                </Button>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.sender_type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.sender_type === 'contact' && (
                    <div className="flex-shrink-0">
                      {chat?.contact_avatar_url ? (
                        <img
                          src={chat.contact_avatar_url}
                          alt={chat.contact_name || ''}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`flex-1 max-w-[70%] ${msg.sender_type === 'user' ? 'text-right' : 'text-left'}`}>
                    <div
                      className={`inline-block px-4 py-2 rounded-lg ${
                        msg.sender_type === 'user'
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      {msg.text && <p className="mb-2">{msg.text}</p>}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="space-y-2">
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
                                  className="flex items-center gap-2 text-teal-400 hover:text-teal-300"
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
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-700 bg-slate-800">
        {/* Templates */}
        <div className="mb-2 flex gap-2 flex-wrap">
          {TEMPLATES.map((template) => (
            <Button
              key={template.key}
              size="sm"
              variant={selectedTemplate === template.key ? 'default' : 'outline'}
              onClick={() => handleTemplateSelect(template.key)}
            >
              {template.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
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
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <Paperclip size={16} />
            )}
            {t('messages.attachPhoto')}
          </Button>
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('messages.sendPlaceholder')}
            rows={1}
            className="flex-1 min-h-[40px] max-h-24 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            onClick={handleSend}
            disabled={(!inputValue.trim() && !uploading) || uploading}
          >
            <Send size={16} />
            {t('messages.send')}
          </Button>
        </div>
      </div>
    </div>
  );
}
