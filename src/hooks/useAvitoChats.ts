/**
 * Encapsulates all Avito Messenger chat logic extracted from Dashboard.tsx:
 * - state: chats, messages, selectedChatId, loading flags, OAuth state
 * - functions: loadChats, syncChatsFromAvito, loadMessages, syncMessagesFromAvito,
 *              handleSendMessage, handleAvitoMessengerAuth
 * - effects: periodic sync, realtime subscriptions, OAuth popup handler
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase, Property, Chat, Message } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { generateMessengerOAuthUrl } from '@/services/avito';
import type { IntegrationForMessenger } from '@/components/MessagesView';
import { showBrowserNotification } from '@/hooks/useNotificationPermission';

// ---------------------------------------------------------------------------
// Avito API response shapes
// ---------------------------------------------------------------------------

type AvitoChatUser = {
  id?: number;
  user_id?: string;
  name: string;
  avatar?: { url: string };
  public_user_profile?: { avatar?: { default?: string } };
};
type AvitoLastMessage = {
  type?: string;
  content?: { text?: string };
  direction?: 'in' | 'out';
  created?: string | number;
  text?: string;
};
type AvitoChat = {
  id: string;
  item_id?: string;
  created: string | number;
  updated: string | number;
  unread_count: number;
  last_message?: AvitoLastMessage;
  users?: AvitoChatUser[];
  context?: { value?: { title?: string; id?: string; user_id?: string; [key: string]: unknown }; type?: string; [key: string]: unknown };
};
type AvitoMessage = {
  id: string;
  chat_id?: string;
  created: string | number;
  content?: { text?: string; attachments?: Array<{ type: string; url: string; name?: string }> };
  author?: { user_id: string; name: string };
  author_id?: number;
  direction?: 'in' | 'out';
};
type AvitoMessageRow = {
  chat_id: string;
  avito_message_id: string;
  sender_type: string;
  sender_name: string;
  text: string | null;
  attachments: Array<{ type: string; url: string; name?: string }>;
  created_at: string;
  is_read: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalizes Unix-second or Unix-ms timestamps to ISO string. */
function toIsoDate(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const ms = n <= 9999999999 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

function getLastMessagePreview(lm: AvitoLastMessage | null | undefined): string | null {
  if (!lm) return null;
  const prefix = lm.direction === 'out' ? 'Вы: ' : '';
  const text = (lm.content?.text ?? lm.text ?? '').trim();
  switch (lm.type) {
    case 'text': return text ? prefix + text : null;
    case 'image': return prefix + '📷 Фото';
    case 'call': return prefix + '📞 Звонок';
    case 'system': return prefix + (text || 'Системное сообщение');
    case 'deleted': return prefix + 'Сообщение удалено';
    default: return text ? prefix + text : null;
  }
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

export interface UseAvitoChatsReturn {
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedChatId: string | null;
  setSelectedChatId: React.Dispatch<React.SetStateAction<string | null>>;
  messagesLoading: boolean;
  messagesOffset: number;
  hasMoreMessages: boolean;
  isSyncing: boolean;
  hasMessengerAccess: boolean;
  avitoIntegrationsForMessages: IntegrationForMessenger[];
  messengerOauthInProgress: boolean;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string, offset?: number, limit?: number) => Promise<void>;
  handleSendMessage: (chatId: string, text: string, attachments?: Array<{ type: string; url: string; name?: string }>) => Promise<void>;
  handleAvitoMessengerAuth: (integrationId?: string | null) => Promise<void>;
  // Stable refs — safe to call from intervals/effects without stale closures
  syncChatsFromAvitoRef: React.MutableRefObject<() => Promise<void>>;
  loadChatsRef: React.MutableRefObject<() => Promise<void>>;
  syncMessagesFromAvitoRef: React.MutableRefObject<(chatId: string) => Promise<void>>;
  loadMessagesRef: React.MutableRefObject<(chatId: string, offset?: number, limit?: number) => Promise<void>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAvitoChats(
  properties: Property[],
  currentView: string
): UseAvitoChatsReturn {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasMessengerAccess, setHasMessengerAccess] = useState(false);
  const [avitoIntegrationsForMessages, setAvitoIntegrationsForMessages] = useState<IntegrationForMessenger[]>([]);
  const [messengerOauthInProgress, setMessengerOauthInProgress] = useState(false);

  const chatsRef = useRef<Chat[]>([]);
  const lastAvitoReauthToastRef = useRef(0);
  const avito403SkipRef = useRef<{ ids: Set<string>; until: number }>({ ids: new Set(), until: 0 });
  const messengerOauthPopupRef = useRef<Window | null>(null);
  const syncChatsFromAvitoRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const loadChatsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const syncMessagesFromAvitoRef = useRef<(chatId: string) => Promise<void>>(() => Promise.resolve());
  const loadMessagesRef = useRef<(chatId: string, offset?: number, limit?: number) => Promise<void>>(() => Promise.resolve());

  // -------------------------------------------------------------------------
  // Load chats from DB
  // -------------------------------------------------------------------------
  const loadChats = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('owner_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setChats(data || []);
    } catch (error) {
      console.error('Error loading chats:', error);
      toast.error(t('messages.error.failedToLoad'));
    }
  }, [user, t]);

  // -------------------------------------------------------------------------
  // Sync chats from Avito API
  // -------------------------------------------------------------------------
  const syncChatsFromAvito = useCallback(async () => {
    if (!user || !properties.length) return;

    try {
      const { data: integrations, error: integrationsError } = await supabase
        .from('integrations')
        .select('id, property_id, avito_user_id, access_token_encrypted, scope')
        .eq('platform', 'avito')
        .eq('is_active', true)
        .in('property_id', properties.map(p => p.id));

      if (integrationsError || !integrations?.length) return;

      const withMessengerScope = integrations.filter(
        (i: { scope?: string | null }) => (i.scope ?? '').includes('messenger:read')
      );
      const ownedIds = new Set(properties.filter(p => p.owner_id === user.id).map(p => p.id));
      const toSync = withMessengerScope.filter(
        (i: { property_id?: string }) => i.property_id && ownedIds.has(i.property_id)
      );

      if (!toSync.length) {
        await loadChats();
        return;
      }

      const now = Date.now();
      const skip403 = avito403SkipRef.current;
      if (skip403.until < now) { skip403.ids.clear(); skip403.until = 0; }

      for (const integration of toSync) {
        if (!integration.avito_user_id || skip403.ids.has(integration.id)) continue;

        try {
          const { data: avitoResponse, error: fnError } = await supabase.functions.invoke(
            'avito-messenger',
            { body: { action: 'getChats', integration_id: integration.id } }
          );

          if (fnError) {
            const err = fnError as { message?: string; context?: { status?: number }; status?: number };
            const status = err?.context?.status ?? err?.status ?? (err?.message?.includes('403') ? 403 : err?.message?.includes('401') ? 401 : 0);
            if (status === 403) {
              skip403.ids.add(integration.id);
              if (skip403.until === 0) skip403.until = now + 5 * 60 * 1000;
              setHasMessengerAccess(false);
              if (now - lastAvitoReauthToastRef.current > 120000) {
                lastAvitoReauthToastRef.current = now;
                toast.error(t('messages.avito.forbidden403', { defaultValue: 'Доступ к чатам Avito заблокирован (403). Задеплойте: supabase functions deploy avito-messenger --no-verify-jwt' }));
              }
            } else if (status === 401) {
              setHasMessengerAccess(false);
              if (now - lastAvitoReauthToastRef.current > 120000) {
                lastAvitoReauthToastRef.current = now;
                toast.error(t('messages.avito.reauthRequired', { defaultValue: 'Требуется повторная авторизация для сообщений Avito. Нажмите «Авторизоваться в Avito» в разделе Сообщения.' }));
              }
            }
            continue;
          }
          if (!avitoResponse?.chats?.length) continue;

          const ownerAvitoId = integration.avito_user_id != null ? String(integration.avito_user_id) : '';
          const chatsToUpsert = avitoResponse.chats.map((avitoChat: AvitoChat) => {
            const contactUser = avitoChat.users?.find((u: AvitoChatUser) => (u.user_id ?? String(u.id ?? '')) !== ownerAvitoId);
            const itemTitle = avitoChat.context?.value?.title?.trim() || null;
            return {
              owner_id: user.id,
              property_id: integration.property_id,
              avito_chat_id: avitoChat.id,
              avito_user_id: integration.avito_user_id,
              avito_item_id: avitoChat.item_id || null,
              avito_item_title: itemTitle,
              integration_id: integration.id,
              contact_name: contactUser?.name || null,
              contact_avatar_url: contactUser?.avatar?.url ?? contactUser?.public_user_profile?.avatar?.default ?? null,
              status: 'new' as const,
              unread_count: avitoChat.unread_count || 0,
              last_message_text: getLastMessagePreview(avitoChat.last_message) ?? avitoChat.last_message?.text ?? null,
              last_message_at: toIsoDate(avitoChat.last_message?.created ?? avitoChat.updated ?? avitoChat.created),
              updated_at: new Date().toISOString(),
            };
          });

          if (chatsToUpsert.length > 0) {
            const normalized = chatsToUpsert.map((row: typeof chatsToUpsert[number]) => ({
              ...row,
              last_message_at: toIsoDate(row.last_message_at as string | number) ?? row.last_message_at,
            }));
            const { error: upsertError } = await supabase
              .from('chats')
              .upsert(normalized, { onConflict: 'owner_id,avito_chat_id', ignoreDuplicates: false });
            if (upsertError) console.error('Error upserting chats:', upsertError);
          }
        } catch (err) {
          console.error(`Error syncing chats for integration ${integration.id}:`, err);
        }
      }

      await loadChats();
    } catch (err) {
      console.error('Error syncing chats from Avito:', err);
    }
  }, [user, properties, loadChats, t]);

  // -------------------------------------------------------------------------
  // Load messages from DB
  // -------------------------------------------------------------------------
  const loadMessages = useCallback(async (chatId: string, offset = 0, limit = 50) => {
    if (!user) return;
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      const newMessages = data || [];
      if (offset === 0) {
        setMessages(newMessages.reverse());
      } else {
        setMessages(prev => [...newMessages.reverse(), ...prev]);
      }
      setHasMoreMessages(newMessages.length === limit);
      setMessagesOffset(offset + newMessages.length);
    } catch (err) {
      console.error('Error loading messages:', err);
      toast.error(t('messages.error.failedToLoadMessages'));
    } finally {
      setMessagesLoading(false);
    }
  }, [user, t]);

  // -------------------------------------------------------------------------
  // Sync messages from Avito API
  // -------------------------------------------------------------------------
  const syncMessagesFromAvito = useCallback(async (chatId: string) => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const chat = chats.find(c => c.id === chatId);
      if (!chat?.integration_id) return;

      const { data: avitoResponse, error: fnError } = await supabase.functions.invoke(
        'avito-messenger',
        { body: { action: 'getMessages', integration_id: chat.integration_id, chat_id: chat.avito_chat_id, limit: 20, offset: 0 } }
      );
      if (fnError || !avitoResponse?.messages?.length) return;

      const { data: integration } = await supabase
        .from('integrations')
        .select('avito_user_id')
        .eq('id', chat.integration_id)
        .single();
      const avitoUserId = integration?.avito_user_id != null ? String(integration.avito_user_id) : null;

      const messagesToInsert: AvitoMessageRow[] = avitoResponse.messages.map((avitoMsg: AvitoMessage) => {
        const isOut = avitoMsg.direction === 'out' || (avitoUserId && String(avitoMsg.author_id ?? avitoMsg.author?.user_id) === avitoUserId);
        const senderType = isOut ? 'user' : 'contact';
        return {
          chat_id: chatId,
          avito_message_id: avitoMsg.id,
          sender_type: senderType,
          sender_name: avitoMsg.author?.name ?? (senderType === 'user' ? user.email ?? 'You' : 'Contact'),
          text: avitoMsg.content?.text ?? null,
          attachments: avitoMsg.content?.attachments ?? [],
          created_at: toIsoDate(avitoMsg.created) ?? new Date().toISOString(),
          is_read: senderType === 'user',
        };
      });

      const { error: insertError } = await supabase
        .from('messages')
        .upsert(
          messagesToInsert.map(msg => ({ ...msg, updated_at: new Date().toISOString() })),
          { onConflict: 'chat_id,avito_message_id', ignoreDuplicates: false }
        );
      if (insertError) console.error('Error upserting messages:', insertError);

      await loadMessages(chatId, 0, 50);
    } catch (err) {
      console.error('Error syncing messages from Avito:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user, chats, loadMessages]);

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------
  const handleSendMessage = useCallback(async (
    chatId: string,
    text: string,
    attachments?: Array<{ type: string; url: string; name?: string }>
  ) => {
    if (!user) return;
    const chat = chats.find(c => c.id === chatId);
    if (!chat?.integration_id) throw new Error('Chat not found');

    const { data: avitoMessage, error: fnError } = await supabase.functions.invoke(
      'avito-messenger',
      { body: { action: 'sendMessage', integration_id: chat.integration_id, chat_id: chat.avito_chat_id, text, attachments } }
    );
    if (fnError) throw fnError;
    if (!avitoMessage?.id) throw new Error('No message id from Avito');

    const { data: newMessage, error } = await supabase
      .from('messages')
      .insert({ chat_id: chatId, avito_message_id: avitoMessage.id, sender_type: 'user', sender_name: user.email || 'You', text: text || null, attachments: attachments || [], is_read: true })
      .select()
      .single();
    if (error) throw error;

    setMessages(prev => [...prev, newMessage]);
    await supabase.from('chats').update({ last_message_text: text, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', chatId);
    toast.success(t('messages.success.sent'));
  }, [user, chats, t]);

  // -------------------------------------------------------------------------
  // Avito Messenger OAuth
  // -------------------------------------------------------------------------
  const handleAvitoMessengerAuth = useCallback(async (integrationId?: string | null) => {
    const effectiveId = integrationId ?? avitoIntegrationsForMessages?.[0]?.id ?? null;
    const authUrl = await generateMessengerOAuthUrl(effectiveId);
    const popup = window.open(authUrl, 'avito_oauth', 'width=600,height=700,scrollbars=yes,resizable=yes');
    messengerOauthPopupRef.current = popup;
    setMessengerOauthInProgress(true);
    if (!popup) {
      toast.error(t('messages.messengerCta.popupBlocked', { defaultValue: 'Включите всплывающие окна для этого сайта и попробуйте снова' }));
      setMessengerOauthInProgress(false);
    }
  }, [avitoIntegrationsForMessages, t]);

  // -------------------------------------------------------------------------
  // Keep refs stable (for intervals/effects that must not re-subscribe on deps change)
  // -------------------------------------------------------------------------
  useEffect(() => {
    syncChatsFromAvitoRef.current = syncChatsFromAvito;
    loadChatsRef.current = loadChats;
    syncMessagesFromAvitoRef.current = syncMessagesFromAvito;
    loadMessagesRef.current = loadMessages;
  }, [syncChatsFromAvito, loadChats, syncMessagesFromAvito, loadMessages]);

  useEffect(() => { chatsRef.current = chats; }, [chats]);

  // -------------------------------------------------------------------------
  // Load chats + sync when entering Messages tab
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentView !== 'messages' || !user?.id) return;
    loadChatsRef.current();
    const timer = setTimeout(() => syncChatsFromAvitoRef.current(), 1000);
    return () => clearTimeout(timer);
  }, [currentView, user?.id]);

  // -------------------------------------------------------------------------
  // Load Avito integrations for Messages tab
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentView !== 'messages' || !user?.id || !properties.length) {
      setAvitoIntegrationsForMessages([]);
      setHasMessengerAccess(false);
      return;
    }
    let cancelled = false;
    const propertyIds = properties.map(p => p.id);
    (async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('id, property_id, scope')
        .eq('platform', 'avito')
        .eq('is_active', true)
        .in('property_id', propertyIds);
      if (cancelled || error) return;
      setAvitoIntegrationsForMessages((data || []).map((r: { id: string; property_id: string }) => ({ id: r.id, property_id: r.property_id })));
      setHasMessengerAccess((data || []).some((r: { scope?: string | null }) => {
        const scope = r.scope || '';
        return scope.includes('messenger:read') && scope.includes('messenger:write');
      }));
    })();
    return () => { cancelled = true; };
  }, [currentView, user?.id, properties]);

  // -------------------------------------------------------------------------
  // Messenger OAuth popup result
  // -------------------------------------------------------------------------
  useEffect(() => {
    const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'avito-oauth-result') return;
      if (!event.data?.isMessengerAuth) return;
      messengerOauthPopupRef.current = null;
      setMessengerOauthInProgress(false);
      if (event.data.success && event.data.code && event.data.state) {
        (async () => {
          const { data, error: fnError } = await supabase.functions.invoke('avito-oauth-callback', {
            body: { code: event.data.code, state: event.data.state, redirect_uri: redirectUri },
          });
          if (!fnError && data?.success) {
            toast.success(t('messages.messengerSuccess.title'));
            setHasMessengerAccess(true);
            const { data: integrations } = await supabase
              .from('integrations')
              .select('id, property_id, scope')
              .eq('platform', 'avito')
              .eq('is_active', true)
              .in('property_id', properties.map(p => p.id));
            if (integrations?.length) {
              setAvitoIntegrationsForMessages(integrations.map((r: { id: string; property_id: string }) => ({ id: r.id, property_id: r.property_id })));
            }
            await syncChatsFromAvitoRef.current();
            await loadChatsRef.current();
          } else if ((data as { reason?: string })?.reason === 'no_avito_integration') {
            toast.error(t('messages.noAvitoIntegration.title'));
          } else {
            toast.error(fnError?.message ?? (data as { error?: string })?.error ?? 'Ошибка подключения');
          }
        })();
      } else if (!event.data.success) {
        toast.error(event.data.error_description || event.data.error || 'Ошибка авторизации Avito');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [t, properties]);

  // -------------------------------------------------------------------------
  // Popup closed without completing OAuth
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!messengerOauthInProgress || !messengerOauthPopupRef.current) return;
    const interval = setInterval(() => {
      if (messengerOauthPopupRef.current?.closed) {
        messengerOauthPopupRef.current = null;
        setMessengerOauthInProgress(false);
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [messengerOauthInProgress]);

  // -------------------------------------------------------------------------
  // Periodic sync: chats every 15s, messages every 7s
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentView !== 'messages' || !user?.id) return;
    const id = setInterval(() => syncChatsFromAvitoRef.current(), 15000);
    return () => clearInterval(id);
  }, [currentView, user?.id]);

  useEffect(() => {
    if (!selectedChatId) return;
    const id = setInterval(() => syncMessagesFromAvitoRef.current(selectedChatId), 7000);
    return () => clearInterval(id);
  }, [selectedChatId]);

  // -------------------------------------------------------------------------
  // Load messages when chat selected + reset unread count
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }
    setMessagesOffset(0);
    setHasMoreMessages(true);
    loadMessagesRef.current(selectedChatId, 0, 50);
    const timer = setTimeout(() => syncMessagesFromAvitoRef.current(selectedChatId), 1000);

    // Reset unread count immediately in state
    setChats(prev => prev.map(c => c.id === selectedChatId && c.unread_count > 0 ? { ...c, unread_count: 0 } : c));
    // Persist to DB (fire-and-forget)
    supabase.from('chats').update({ unread_count: 0 }).eq('id', selectedChatId).then(({ error }) => {
      if (error) console.error('Error resetting unread_count:', error);
    });
    supabase.from('messages').update({ is_read: true }).eq('chat_id', selectedChatId).eq('is_read', false).eq('sender_type', 'contact').then(({ error }) => {
      if (error) console.error('Error marking messages as read:', error);
    });

    return () => clearTimeout(timer);
  }, [selectedChatId]);

  // -------------------------------------------------------------------------
  // Realtime: chats table
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user || currentView !== 'messages') return;
    const channel = supabase
      .channel(`chats_realtime_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `owner_id=eq.${user.id}` }, (payload) => {
        if (import.meta.env.DEV) console.log('Chat change:', payload);
        if (payload.eventType === 'INSERT') setChats(prev => [payload.new as Chat, ...prev]);
        else if (payload.eventType === 'UPDATE') setChats(prev => prev.map(c => c.id === payload.new.id ? payload.new as Chat : c));
        else if (payload.eventType === 'DELETE') setChats(prev => prev.filter(c => c.id !== payload.old.id));
        loadChatsRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, currentView]);

  // -------------------------------------------------------------------------
  // Realtime: messages table
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !selectedChatId) return;
    const channel = supabase
      .channel(`messages_realtime_${selectedChatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${selectedChatId}` }, (payload) => {
        if (import.meta.env.DEV) console.log('Message change:', payload);
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new as Message;
          setMessages(prev => [...prev, newMsg]);
          if (newMsg.sender_type === 'contact') {
            supabase.from('messages').update({ is_read: true }).eq('id', newMsg.id);
            // Browser notification when tab is hidden
            if (document.hidden) {
              const chat = chatsRef.current.find(c => c.id === newMsg.chat_id);
              showBrowserNotification(
                chat?.contact_name || 'Avito',
                newMsg.text || '📷 Фото',
                newMsg.chat_id
              );
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m));
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selectedChatId]);

  return {
    chats, setChats,
    messages, setMessages,
    selectedChatId, setSelectedChatId,
    messagesLoading,
    messagesOffset,
    hasMoreMessages,
    isSyncing,
    hasMessengerAccess,
    avitoIntegrationsForMessages,
    messengerOauthInProgress,
    loadChats,
    loadMessages,
    handleSendMessage,
    handleAvitoMessengerAuth,
    syncChatsFromAvitoRef,
    loadChatsRef,
    syncMessagesFromAvitoRef,
    loadMessagesRef,
  };
}
