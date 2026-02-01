import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Sidebar } from './Sidebar';
import { Calendar } from './Calendar';
import { AddReservationModal } from './AddReservationModal';
import { EditReservationModal } from './EditReservationModal';
import { OverlapWarningModal } from './OverlapWarningModal';
import { PropertiesView } from './PropertiesView';
import { BookingsView } from './BookingsView';
import { AnalyticsView } from './AnalyticsView';
import { GuestsView } from './GuestsView';
import { GuestModal } from './GuestModal';
import { AdminView } from './AdminView';
import { SettingsView } from './SettingsView';
import { UserProfileModal } from './UserProfileModal';
import { MessagesView } from './MessagesView';
import { ChatPanel } from './ChatPanel';
import { ThemeToggle } from './ThemeToggle';
import { SkeletonCalendar } from './Skeleton';
import { supabase, Property, Booking, Profile, Guest, Chat, Message } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getOAuthSuccess, getOAuthError } from '../services/avito';
import { syncWithExternalAPIs, syncAvitoIntegration } from '../services/apiSync';
import { showAvitoErrors } from '../services/avitoErrors';
import { avitoApi } from '../services/avitoApi';
import { DeletePropertyModal } from './DeletePropertyModal';
import { ImportBookingsModal } from './ImportBookingsModal';
import { logBookingChange, getBookingChanges } from '../services/bookingLog';

type NewReservation = {
  property_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  status: string;
  source: string;
  guests_count: number;
  notes?: string | null;
  extra_services_amount?: number;
  deposit_amount?: number | null;
  deposit_received?: boolean | null;
  deposit_returned?: boolean | null;
};

export function Dashboard() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState('calendar');
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [isOverlapWarningOpen, setIsOverlapWarningOpen] = useState(false);
  const [overlappingBookings, setOverlappingBookings] = useState<Booking[]>([]);
  const [pendingReservation, setPendingReservation] = useState<NewReservation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [prefilledDates, setPrefilledDates] = useState<{ propertyId: string; checkIn: string; checkOut: string } | null>(null);
  const [isDeletePropertyModalOpen, setIsDeletePropertyModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [bookingsForDelete, setBookingsForDelete] = useState<Booking[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const oauthProcessedRef = useRef(false);

  // Helper function for retry logic
  type SupabaseQueryResult<T> = {
    data: T | null;
    error: { message: string; details?: string; hint?: string; code?: string } | null;
  };

  const retrySupabaseQuery = useCallback(async <T,>(
    queryFn: () => Promise<SupabaseQueryResult<T>>,
    retries = 3,
    delay = 1000
  ): Promise<SupabaseQueryResult<T>> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await queryFn();
        // Если нет ошибки или ошибка не связана с сетью, возвращаем результат
        if (!result.error || (result.error.message && !result.error.message.includes('Failed to fetch'))) {
          // Если была ошибка, но retry успешен, не логируем ошибку
          // Query succeeded after retries
          return result;
        }

        // Если это последняя попытка, возвращаем результат с ошибкой
        if (attempt === retries) {
          console.error(`Query failed after ${retries} attempts:`, result.error);
          return result;
        }

        // Логируем только первую попытку, чтобы не засорять консоль
        // Query failed, retrying

        // Ждем перед повторной попыткой (экспоненциальная задержка)
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      } catch (error: unknown) {
        // Если это последняя попытка, возвращаем ошибку
        if (attempt === retries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Query failed after ${retries} attempts:`, errorMessage);
          return {
            data: null,
            error: {
              message: errorMessage,
              details: error instanceof Error ? error.stack : undefined
            }
          };
        }

        // Query error, retrying

        // Ждем перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    return { data: null, error: { message: 'Max retries exceeded' } };
  }, []);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      await supabase.auth.getSession();

      // Retry для properties
      const propertiesResult = await retrySupabaseQuery<Property[]>(
        async () => {
          const result = await supabase
            .from('properties')
            .select('*')
            .eq('owner_id', user.id);
          // Note: deleted_at filter temporarily removed - will be re-enabled after migration verification
          return {
            data: result.data,
            error: result.error ? {
              message: result.error.message,
              details: result.error.details,
              hint: result.error.hint,
              code: result.error.code
            } : null
          };
        }
      );
      const { data: propertiesData, error: propsError } = propertiesResult;

      if (propsError) {
        toast.error(`${t('errors.failedToLoadProperties')}: ${propsError.message}`);
      }

      if (propertiesData) {
        setProperties(propertiesData);

        const propertyIds = propertiesData.map((p: Property) => p.id);

        if (propertyIds.length > 0) {
          // Retry для bookings - загружаем только подтвержденные брони (confirmed и paid)
          const bookingsResult = await retrySupabaseQuery<Booking[]>(
            async () => {
              const result = await supabase
                .from('bookings')
                .select('*')
                .in('property_id', propertyIds)
                .in('status', ['confirmed', 'paid'])
                .order('check_in');
              return {
                data: result.data,
                error: result.error ? {
                  message: result.error.message,
                  details: result.error.details,
                  hint: result.error.hint,
                  code: result.error.code
                } : null
              };
            }
          );
          const { data: bookingsData, error: bookingsError } = bookingsResult;

          if (bookingsError) {
            toast.error(`${t('errors.failedToLoadBookings')}: ${bookingsError.message}`);
          }

          if (bookingsData) {
            setBookings(bookingsData);
            setFilteredBookings(bookingsData);
          }
        }
      }

      // Retry для profile
      const profileResult = await retrySupabaseQuery<Profile>(
        async () => {
          const result = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          return {
            data: result.data,
            error: result.error ? {
              message: result.error.message,
              details: result.error.details,
              hint: result.error.hint,
              code: result.error.code
            } : null
          };
        }
      );
      const { data: profileData } = profileResult;

      if (profileData) {
        setUserProfile(profileData);
      }

      // Load Guests
      const guestsResult = await retrySupabaseQuery<Guest[]>(
        async () => {
          const result = await supabase
            .from('guests')
            .select('*')
            .eq('owner_id', user.id)
            .order('name');
          return {
            data: result.data,
            error: result.error ? {
              message: result.error.message,
              details: result.error.details,
              hint: result.error.hint,
              code: result.error.code
            } : null
          };
        }
      );
      if (guestsResult.data) {
        setGuests(guestsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : t('errors.somethingWentWrong');
      toast.error(`${t('errors.failedToLoadData')}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [user, retrySupabaseQuery, t]);

  // Keep loadData ref up to date
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load chats
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

  // Sync chats from Avito API
  // TEMPORARILY DISABLED: Waiting for Avito approval
   
  const _syncChatsFromAvito = useCallback(async () => {
    if (!user) return;

    // If no properties loaded yet, skip sync
    if (!properties || properties.length === 0) {
      return;
    }

    try {
      // Get all active Avito integrations for this user's properties
      const { data: integrations, error: integrationsError } = await supabase
        .from('integrations')
        .select('id, property_id, avito_user_id, access_token_encrypted')
        .eq('platform', 'avito')
        .eq('is_active', true)
        .in('property_id', properties.map(p => p.id));

      if (integrationsError || !integrations || integrations.length === 0) {
        // No integrations or error - silently return
        return;
      }

      // Sync chats for each integration
      for (const integration of integrations) {
        if (!integration.avito_user_id || !integration.access_token_encrypted) {
          continue;
        }

        try {
          // Decrypt token if needed
          let accessToken = integration.access_token_encrypted;
          try {
            const { data: decrypted } = await supabase.rpc('decrypt_avito_token', {
              encrypted_token: accessToken,
            });
            if (decrypted) {
              accessToken = decrypted;
            }
          } catch {
            // If RPC fails, assume token is not encrypted or RPC doesn't exist
            // Use token as-is
          }

          // Fetch chats from Avito API
          const avitoResponse = await avitoApi.getChatsWithToken(
            integration.avito_user_id,
            accessToken
          );

          if (!avitoResponse.chats || avitoResponse.chats.length === 0) {
            continue;
          }

          // Transform Avito chats to our format and save to database
          const chatsToUpsert = avitoResponse.chats.map((avitoChat) => {
            // Find contact user (not the owner)
            const contactUser = avitoChat.users?.find((u) => u.user_id !== integration.avito_user_id);

            return {
              owner_id: user.id,
              property_id: integration.property_id,
              avito_chat_id: avitoChat.id,
              avito_user_id: integration.avito_user_id,
              avito_item_id: avitoChat.item_id || null,
              integration_id: integration.id,
              contact_name: contactUser?.name || null,
              contact_avatar_url: contactUser?.avatar?.url || null,
              status: 'new' as const, // Default status, can be updated later
              unread_count: avitoChat.unread_count || 0,
              last_message_text: avitoChat.last_message?.text || null,
              last_message_at: avitoChat.last_message?.created || avitoChat.updated || avitoChat.created,
              updated_at: new Date().toISOString(),
            };
          });

          // Upsert chats (update if exists, insert if new)
          if (chatsToUpsert.length > 0) {
            const { error: upsertError } = await supabase
              .from('chats')
              .upsert(
                chatsToUpsert,
                {
                  onConflict: 'owner_id,avito_chat_id',
                  ignoreDuplicates: false,
                }
              );

            if (upsertError) {
              console.error('Error upserting chats:', upsertError);
            }
          }
        } catch (error) {
          // Log error but don't block - continue with other integrations
          console.error(`Error syncing chats for integration ${integration.id}:`, error);
        }
      }

      // Reload chats from database to update UI
      await loadChats();
    } catch (error) {
      // Log error but don't block UI
      console.error('Error syncing chats from Avito:', error);
    }
  }, [user, properties, loadChats]);

  // Suppress unused variable warning - function is temporarily disabled
   
  void _syncChatsFromAvito;

  // Load messages for selected chat
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
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error(t('messages.error.failedToLoadMessages'));
    } finally {
      setMessagesLoading(false);
    }
  }, [user, t]);

  // Sync messages from Avito API
  const syncMessagesFromAvito = useCallback(async (chatId: string) => {
    if (!user) return;

    setIsSyncing(true);
    try {
      // Get chat to find integration
      const chat = chats.find(c => c.id === chatId);
      if (!chat || !chat.integration_id) {
        console.warn('Chat or integration not found for sync');
        return;
      }

      // Get integration to get avito_user_id and access_token
      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('avito_user_id, access_token_encrypted')
        .eq('id', chat.integration_id)
        .single();

      if (integrationError || !integration?.avito_user_id || !integration?.access_token_encrypted) {
        console.warn('Integration not found or missing credentials:', integrationError);
        return;
      }

      // Decrypt token if needed (check if RPC exists)
      let accessToken = integration.access_token_encrypted;
      try {
        const { data: decrypted } = await supabase.rpc('decrypt_avito_token', {
          encrypted_token: accessToken,
        });
        if (decrypted) {
          accessToken = decrypted;
        }
      } catch {
        // If RPC fails, assume token is not encrypted or RPC doesn't exist
        // Use token as-is
      }

      // Fetch messages from Avito API (last 20 messages)
      const avitoResponse = await avitoApi.getChatMessagesWithToken(
        integration.avito_user_id,
        chat.avito_chat_id,
        accessToken,
        20,
        0
      );

      if (!avitoResponse.messages || avitoResponse.messages.length === 0) {
        return;
      }

      // Transform Avito messages to our format and save to database
      const messagesToInsert = avitoResponse.messages.map((avitoMsg) => {
        // Determine sender type: if author.user_id matches avito_user_id, it's from user, otherwise from contact
        const senderType = avitoMsg.author.user_id === integration.avito_user_id ? 'user' : 'contact';
        
        return {
          chat_id: chatId,
          avito_message_id: avitoMsg.id,
          sender_type: senderType,
          sender_name: avitoMsg.author.name || (senderType === 'user' ? user.email || 'You' : 'Contact'),
          text: avitoMsg.content.text || null,
          attachments: avitoMsg.content.attachments || [],
          created_at: avitoMsg.created,
          is_read: senderType === 'user', // User's own messages are always read
        };
      });

      // Insert messages with conflict handling (ignore duplicates by avito_message_id)
      // Use upsert to handle duplicates - if message already exists, update it
      const { error: insertError } = await supabase
        .from('messages')
        .upsert(
          messagesToInsert.map(msg => ({
            ...msg,
            updated_at: new Date().toISOString(),
          })),
          {
            onConflict: 'chat_id,avito_message_id',
            ignoreDuplicates: false,
          }
        );

      if (insertError) {
        console.error('Error upserting messages:', insertError);
      }

      // Reload messages from database to update UI
      await loadMessages(chatId, 0, 50);
    } catch (error) {
      // Log error but don't block UI
      console.error('Error syncing messages from Avito:', error);
      // Only show toast for critical errors (not 401/403 which are auth issues)
      if (error instanceof Error && !error.message.includes('401') && !error.message.includes('403')) {
        // Silent error - don't show toast to avoid spam
      }
    } finally {
      setIsSyncing(false);
    }
  }, [user, chats, loadMessages]);

  // Load chats on mount and when view changes to messages
  useEffect(() => {
    if (currentView === 'messages' && user) {
      loadChats();
    }
  }, [currentView, user, loadChats]);

  // Load messages when chat is selected
  useEffect(() => {
    if (selectedChatId) {
      setMessagesOffset(0);
      setHasMoreMessages(true);
      // First load from local database
      loadMessages(selectedChatId, 0);
      // Then sync from Avito API
      syncMessagesFromAvito(selectedChatId);
    } else {
      setMessages([]);
    }
  }, [selectedChatId, loadMessages, syncMessagesFromAvito]);

  // Periodic sync every 7 seconds for active chat messages
  useEffect(() => {
    if (!selectedChatId) return;

    const intervalId = setInterval(() => {
      syncMessagesFromAvito(selectedChatId);
    }, 7000); // 7 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedChatId, syncMessagesFromAvito]);

  // Periodic sync every 15 seconds for chats (always, regardless of view)
  // TEMPORARILY DISABLED: Waiting for Avito approval
  // useEffect(() => {
  //   if (!user) return;

  //   // Initial sync
  //   _syncChatsFromAvito();

  //   const intervalId = setInterval(() => {
  //     _syncChatsFromAvito();
  //   }, 15000); // 15 seconds

  //   return () => {
  //     clearInterval(intervalId);
  //   };
  // }, [user, _syncChatsFromAvito]);

  // Handle send message
  const handleSendMessage = useCallback(async (
    chatId: string,
    text: string,
    attachments?: Array<{ type: string; url: string; name?: string }>
  ) => {
    if (!user) return;

    try {
      // Get integration to get avito_user_id
      const chat = chats.find(c => c.id === chatId);
      if (!chat) throw new Error('Chat not found');

      const { data: integration } = await supabase
        .from('integrations')
        .select('avito_user_id, access_token_encrypted')
        .eq('id', chat.integration_id || '')
        .single();

      if (!integration?.avito_user_id) {
        throw new Error('Integration not found');
      }

      // Send message via Avito API
      const avitoMessage = await avitoApi.sendMessage(
        integration.avito_user_id,
        chat.avito_chat_id,
        text,
        attachments
      );

      // Save message to database
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          avito_message_id: avitoMessage.id,
          sender_type: 'user',
          sender_name: user.email || 'You',
          text: text || null,
          attachments: attachments || [],
          is_read: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Update messages list
      setMessages(prev => [...prev, newMessage]);

      // Update chat's last message
      await supabase
        .from('chats')
        .update({
          last_message_text: text,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', chatId);

      toast.success(t('messages.success.sent'));
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(t('messages.error.failedToSend'));
      throw error;
    }
  }, [user, chats, t]);

  // Handle create booking from chat
  const handleCreateBookingFromChat = useCallback((chat: Chat) => {
    if (!chat.property_id) {
      toast.error('Не выбран объект для чата');
      return;
    }

    // Pre-fill reservation modal with chat data
    setSelectedPropertyIds([chat.property_id]);
    setIsAddModalOpen(true);
    // Note: You might want to pre-fill guest info from chat.contact_name, chat.contact_phone
  }, []);

  // Handle status change
  const handleChatStatusChange = useCallback(async (chat: Chat, status: Chat['status']) => {
    try {
      const { error } = await supabase
        .from('chats')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', chat.id);

      if (error) throw error;

      setChats(prev => prev.map(c => c.id === chat.id ? { ...c, status } : c));
      toast.success(t('messages.success.updated'));
    } catch (error) {
      console.error('Error updating chat status:', error);
      toast.error(t('messages.error.failedToUpdate'));
    }
  }, [t]);

  // Проверяем OAuth callback и автоматически переключаемся на Properties
  useEffect(() => {
    const oauthSuccess = getOAuthSuccess();
    const oauthError = getOAuthError();

    if ((oauthSuccess || oauthError) && !oauthProcessedRef.current) {
      // Переключаемся на вкладку Properties, чтобы PropertiesView мог обработать callback
      setCurrentView((prevView) => {
        if (prevView !== 'properties') {
          return 'properties';
        }
        return prevView;
      });
      oauthProcessedRef.current = true;
    }
  }, []); // Запускаем только при монтировании

  // Realtime subscription for new Avito bookings
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('avito_bookings')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: 'source=eq.avito',
        },
        () => {
          toast.success('Лид с Avito!');
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKzn8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDknE4MDlCs5/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch {
            // ignore
          }

          // Refresh bookings
          loadDataRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]); // Убрали loadData из зависимостей, используем ref

  // Realtime subscription for chats
  useEffect(() => {
    if (!user || currentView !== 'messages') return;

    const channel = supabase
      .channel('chats_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Chat change:', payload);
          if (payload.eventType === 'INSERT') {
            setChats(prev => [payload.new as Chat, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setChats(prev => prev.map(c => c.id === payload.new.id ? payload.new as Chat : c));
          } else if (payload.eventType === 'DELETE') {
            setChats(prev => prev.filter(c => c.id !== payload.old.id));
          }
          loadChats(); // Reload to ensure consistency
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentView, loadChats]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!user || !selectedChatId) return;

    const channel = supabase
      .channel('messages_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${selectedChatId}`,
        },
        (payload) => {
          console.log('Message change:', payload);
          if (payload.eventType === 'INSERT') {
            setMessages(prev => [...prev, payload.new as Message]);
            // Mark as read if it's from contact
            if ((payload.new as Message).sender_type === 'contact') {
              supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', (payload.new as Message).id);
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m));
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedChatId]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBookings(bookings);
      setSearchResults([]);
      setShowSearchDropdown(false);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = bookings.filter(
        (b) =>
          b.guest_name.toLowerCase().includes(query) ||
          (b.guest_phone && b.guest_phone.toLowerCase().includes(query)) ||
          (b.guest_email && b.guest_email.toLowerCase().includes(query))
      );
      setFilteredBookings(filtered);
      setSearchResults(filtered);
      setShowSearchDropdown(true);
    }
  }, [searchQuery, bookings]);

  const handleAddReservation = (propertyIdOrIds: string | string[], checkIn?: string, checkOut?: string) => {
    if (typeof propertyIdOrIds === 'string' && checkIn && checkOut) {
      setPrefilledDates({ propertyId: propertyIdOrIds, checkIn, checkOut });
      setSelectedPropertyIds([propertyIdOrIds]);
    } else if (Array.isArray(propertyIdOrIds)) {
      setSelectedPropertyIds(propertyIdOrIds);
      setPrefilledDates(null);
    } else {
      setSelectedPropertyIds([]);
      setPrefilledDates(null);
    }
    setIsAddModalOpen(true);
  };

  const checkDateOverlap = (propertyId: string, checkIn: string, checkOut: string) => {
    const newStart = new Date(checkIn);
    const newEnd = new Date(checkOut);

    return bookings.filter((booking) => {
      if (booking.property_id !== propertyId) return false;

      const existingStart = new Date(booking.check_in);
      const existingEnd = new Date(booking.check_out);

      return (
        (newStart >= existingStart && newStart < existingEnd) ||
        (newEnd > existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      );
    });
  };

  const handleSaveReservation = async (reservation: {
    property_id: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    total_price: number;
    currency: string;
    status: string;
    source: string;
    guests_count: number;
    notes?: string | null;
    extra_services_amount?: number;
  }) => {
    const overlaps = checkDateOverlap(reservation.property_id, reservation.check_in, reservation.check_out);

    if (overlaps.length > 0) {
      setPendingReservation(reservation);
      setOverlappingBookings(overlaps);
      setIsOverlapWarningOpen(true);
      return;
    }

    await saveReservationToDatabase(reservation);
  };

  const saveReservationToDatabase = async (reservation: NewReservation) => {
    try {
      // Add created_by and updated_by fields only if user exists
      // Note: These fields may not exist if migration hasn't been applied yet
      const reservationWithAudit: NewReservation & { created_by?: string; updated_by?: string } = {
        ...reservation,
      };

      // Only add audit fields if user exists (migration applied)
      if (user?.id) {
        reservationWithAudit.created_by = user.id;
        reservationWithAudit.updated_by = user.id;
      }

      type BookingInsertPayload = NewReservation & { created_by?: string; updated_by?: string };
      let payload: BookingInsertPayload = reservationWithAudit;
      let { data, error } = await supabase.from('bookings').insert([payload]).select();

      // Handle PGRST204 error (column not found) - retry without audit fields
      if (error && (error.code === 'PGRST204' || error.message?.includes('Could not find the') || error.message?.includes('created_by'))) {
        // Retry without audit fields - create new object without created_by and updated_by
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { created_by, updated_by, ...rest } = payload;
        payload = rest as typeof payload;

        const retryResult = await supabase.from('bookings').insert([payload]).select();
        data = retryResult.data;
        error = retryResult.error;
      }

      // Handle 400 / column not found - retry without deposit_received/deposit_returned (migration may not be applied)
      if (error && (error.code === 'PGRST204' || (error as { code?: string }).code === '400' || error.message?.includes('deposit_received') || error.message?.includes('deposit_returned'))) {
        // Strip deposit flags from current payload (already without audit if first retry ran)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { deposit_received, deposit_returned, ...rest } = payload;
        payload = rest as typeof payload;

        const retryDeposit = await supabase.from('bookings').insert([payload]).select();
        data = retryDeposit.data;
        error = retryDeposit.error;
      }

      // Handle deposit_amount column not found (migration 20260126000000 may not be applied)
      if (error && (error.code === 'PGRST204' || error.message?.includes('deposit_amount'))) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { deposit_amount, ...rest } = payload;
        payload = rest as typeof payload;

        const retryDepositAmount = await supabase.from('bookings').insert([payload]).select();
        data = retryDepositAmount.data;
        error = retryDepositAmount.error;
      }

      if (error) throw error;

      if (data && data.length > 0) {
        const newBooking = data[0];
        setBookings([...bookings, newBooking]);
        setFilteredBookings([...bookings, newBooking]);

        // Log the creation
        await logBookingChange(
          newBooking.id,
          newBooking.property_id,
          'created',
          undefined,
          reservation.source || 'manual'
        );
      }
      setIsAddModalOpen(false);
      setPrefilledDates(null);

      toast.success(
        `${t('success.bookingCreated')}. ${t('success.changesSaved')}`
      );

      // Sync to Avito after successful booking creation
      const syncToastId = toast.loading('Синхронизация с Avito...');

      try {
        const syncResult = await syncAvitoIntegration(reservation.property_id);

        // PRIORITY: Check hasError === false first (from Edge Function response)
        // If syncResult.success === true, it means hasError was false or not present
        if (syncResult.success) {
          toast.dismiss(syncToastId);
          // Show success message - check if pushSuccess (prices/intervals) for specific message
          if (syncResult.pushSuccess) {
            toast.success('Синхронизация успешна! Цены и даты обновлены в Avito');
          } else if (syncResult.pricesSuccess && syncResult.intervalsFailed) {
            toast.success('Цены обновлены в Avito');
            toast('Даты не закрыты (ожидаем активацию Avito). Используй iCal URL для закрытия дат.', {
              icon: '⚠️',
              duration: 6000,
            });
          } else {
            toast.success('Синхронизация успешна! Цены и даты обновлены в Avito');
          }
        } else {
          // Sync failed - show error only when integration was active (not skipUserError)
          toast.dismiss(syncToastId);
          if (syncResult.skipUserError) {
            // Integration not found/inactive or not configured - don't show error to user
          } else if (syncResult.errors && syncResult.errors.length > 0) {
            const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
            toast.error(`Ошибка синхронизации: ${errorMessages}`);
            showAvitoErrors(syncResult.errors, t).catch((err) => {
              console.error('Error showing Avito error modals:', err);
            });
          } else {
            toast.error(syncResult.message || 'Ошибка синхронизации с Avito');
          }
          if (!syncResult.skipUserError) {
            console.error('Dashboard: Avito sync failed after booking creation', syncResult);
          }
        }
      } catch (error) {
        toast.dismiss(syncToastId);
        console.error('Dashboard: Unexpected error during Avito sync after booking creation:', error);
        toast.error('Ошибка синхронизации с Avito');
      }
    } catch (error) {
      console.error('Error saving reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleOverlapContinue = async () => {
    setIsOverlapWarningOpen(false);
    if (pendingReservation) {
      await saveReservationToDatabase(pendingReservation);
      setPendingReservation(null);
    }
  };

  const handleOverlapGoBack = () => {
    setIsOverlapWarningOpen(false);
    setPendingReservation(null);
  };

  const handleEditReservation = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsEditModalOpen(true);
  };

  const handleUpdateReservation = async (id: string, data: Partial<Booking>) => {
    try {
      // Find the old booking to compare changes
      const oldBooking = bookings.find((b) => b.id === id);

      // Add updated_by field only if user exists
      // Note: This field may not exist if migration hasn't been applied yet
      const dataWithAudit: Partial<Booking> & { updated_by?: string | null } = {
        ...data,
      };

      // Only add updated_by if user exists (migration applied)
      if (user?.id) {
        dataWithAudit.updated_by = user.id;
      }

      let { error } = await supabase.from('bookings').update(dataWithAudit).eq('id', id);

      // Handle PGRST204 error (column not found) - retry without audit fields
      let finalData = dataWithAudit;
      if (error && (error.code === 'PGRST204' || error.message?.includes('Could not find the') || error.message?.includes('updated_by'))) {
        // Retry without audit fields - create new object without updated_by
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { updated_by, ...dataWithoutAudit } = dataWithAudit;
        finalData = dataWithoutAudit;

        const retryResult = await supabase.from('bookings').update(dataWithoutAudit).eq('id', id);
        error = retryResult.error;
      }

      // Handle 400 / column not found - retry without deposit fields (migration may not be applied)
      if (error && (error.code === 'PGRST204' || (error as { code?: string }).code === '400' || error.message?.includes('deposit_received') || error.message?.includes('deposit_returned'))) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { deposit_received, deposit_returned, ...dataWithoutDeposit } = finalData as typeof finalData & { deposit_received?: boolean; deposit_returned?: boolean };
        finalData = dataWithoutDeposit;

        const retryDeposit = await supabase.from('bookings').update(dataWithoutDeposit).eq('id', id);
        error = retryDeposit.error;
      }

      if (error) throw error;

      const updatedBookings = bookings.map((b) =>
        b.id === id ? { ...b, ...finalData } : b
      );

      // Log the update if we have the old booking
      if (oldBooking) {
        const changes = getBookingChanges(oldBooking, finalData);
        if (Object.keys(changes).length > 0) {
          await logBookingChange(
            id,
            oldBooking.property_id,
            'updated',
            changes,
            oldBooking.source || 'manual'
          );
        }
      }
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);

      toast.success(
        `${t('success.bookingUpdated')}. ${t('success.changesSaved')}`
      );

      // Sync to Avito after successful booking update
      const booking = bookings.find(b => b.id === id);
      if (booking?.property_id) {
        const syncToastId = toast.loading('Синхронизация с Avito...');

        try {
          const syncResult = await syncAvitoIntegration(booking.property_id);

          // PRIORITY: Check hasError === false first (from Edge Function response)
          // If syncResult.success === true, it means hasError was false or not present
          if (syncResult.success) {
            toast.dismiss(syncToastId);
            // Show success message
            toast.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
          } else {
            // Sync failed - show error only when integration was active (not skipUserError)
            toast.dismiss(syncToastId);
            if (syncResult.skipUserError) {
              // Integration not found/inactive or not configured - don't show error to user
            } else if (syncResult.errors && syncResult.errors.length > 0) {
              const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
              toast.error(`Ошибка синхронизации: ${errorMessages}`);
              showAvitoErrors(syncResult.errors, t).catch((err) => {
                console.error('Error showing Avito error modals:', err);
              });
            } else {
              toast.error(syncResult.message || 'Ошибка синхронизации с Avito');
            }
            if (!syncResult.skipUserError) {
              console.error('Dashboard: Avito sync failed after booking update', syncResult);
            }
          }
        } catch (error) {
          toast.dismiss(syncToastId);
          console.error('Dashboard: Unexpected error during Avito sync after booking update:', error);
          toast.error('Ошибка синхронизации с Avito');
        }
      }
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleDeleteReservation = async (id: string) => {
    // Find the booking before deletion to log it
    const bookingToDelete = bookings.find((b) => b.id === id);
    try {
      // Сохраняем данные брони перед удалением для синхронизации
      const booking = bookings.find(b => b.id === id);
      const propertyId = booking?.property_id;
      const bookingSource = booking?.source || 'manual';
      const isAvitoBooking = bookingSource === 'avito';

      const { error } = await supabase.from('bookings').delete().eq('id', id);

      if (error) throw error;

      const updatedBookings = bookings.filter((b) => b.id !== id);
      setBookings(updatedBookings);
      setFilteredBookings(updatedBookings);

      // Log the deletion
      if (bookingToDelete) {
        await logBookingChange(
          id,
          bookingToDelete.property_id,
          'deleted',
          undefined,
          bookingToDelete.source || 'manual'
        );
      }

      toast.success(t('success.bookingDeleted'));

      // Sync to Avito after successful booking deletion
      // For manual bookings: open dates in Avito (exclude deleted booking from sync)
      // For Avito bookings: cancel booking + open dates
      if (propertyId) {
        try {
          // Check if Avito integration has valid item_id and account_id before syncing
          const { data: integration } = await supabase
            .from('integrations')
            .select('avito_item_id, is_active')
            .eq('property_id', propertyId)
            .eq('platform', 'avito')
            .eq('is_active', true)
            .maybeSingle();

          if (!integration) {
            return; // Skip sync if no integration - don't show error to user
          }

          if (!integration.avito_item_id) {
            return; // Skip sync if no valid item_id - don't show error to user
          }

          // Validate item_id format (10-11 digits)
          const itemIdStr = String(integration.avito_item_id).trim();
          if (itemIdStr.length < 10 || itemIdStr.length > 11 || !/^\d+$/.test(itemIdStr)) {
            return; // Skip sync if invalid format - don't show error to user
          }

          // If manual booking, exclude it from sync to open dates in Avito
          // If Avito booking, full sync will handle cancellation
          const syncToastId = toast.loading('Синхронизация с Avito...');

          try {
            const syncResult = await syncAvitoIntegration(propertyId, isAvitoBooking ? undefined : id);

            // PRIORITY: Check hasError === false first (from Edge Function response)
            // If syncResult.success === true, it means hasError was false or not present
            if (syncResult.success) {
              toast.dismiss(syncToastId);
              // Show success message
              toast.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
              console.log('Dashboard: Avito sync completed successfully after booking deletion', {
                bookingId: id,
                source: bookingSource,
                isAvitoBooking,
                syncResult,
              });
            } else {
              // Sync failed - show error only when integration was active (not skipUserError)
              toast.dismiss(syncToastId);
              if (syncResult.skipUserError) {
                // Integration not found/inactive or not configured - don't show error to user
              } else if (syncResult.errors && syncResult.errors.length > 0) {
                // Check for 404 errors
                const has404 = syncResult.errors.some(e => e.statusCode === 404);
                if (has404) {
                  toast.error('Объявление не найдено в Avito. Проверь ID объявления — должен быть длинный номер вроде 2336174775');
                } else {
                  // Check for 409 paid conflict
                  const hasPaidConflict = syncResult.errors.some(e => e.statusCode === 409);
                  if (hasPaidConflict) {
                    toast.error('Конфликт с оплаченной бронью в Avito — проверь вручную');
                  } else {
                    const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
                    toast.error(`Ошибка синхронизации: ${errorMessages}`);
                  }
                }

                showAvitoErrors(syncResult.errors, t).catch((err) => {
                  console.error('Error showing Avito error modals:', err);
                });
              } else {
                toast.error(syncResult.message || 'Ошибка синхронизации с Avito');
              }
              if (!syncResult.skipUserError) {
                console.error('Dashboard: Avito sync failed after booking deletion', {
                  bookingId: id,
                  source: bookingSource,
                  isAvitoBooking,
                  syncResult,
                });
              }
            }
          } catch (error) {
            toast.dismiss(syncToastId);
            console.error('Dashboard: Unexpected error during Avito sync after booking deletion:', error);
            toast.error('Ошибка синхронизации с Avito');
          }
        } catch (error) {
          console.error('Dashboard: Unexpected error during Avito sync after booking deletion:', error);
          toast.error('Ошибка синхронизации с Avito');
        }
      }
    } catch (error) {
      console.error('Error deleting reservation:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleSync = async () => {
    await syncWithExternalAPIs();
  };

  const handleAddProperty = async (property: Omit<Property, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .insert([{ ...property, owner_id: user!.id }])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setProperties([...properties, data[0]]);
      }
      toast.success(t('success.propertyCreated'));
    } catch (error) {
      console.error('Error adding property:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleUpdateProperty = async (id: string, property: Partial<Property>) => {
    try {
      const { error } = await supabase
        .from('properties')
        .update(property)
        .eq('id', id);
      // Note: deleted_at filter temporarily removed

      if (error) throw error;

      setProperties(properties.map((p) => (p.id === id ? { ...p, ...property } : p)));
      toast.success(t('success.propertyUpdated'));
    } catch (error) {
      console.error('Error updating property:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!user) {
      toast.error(t('errors.somethingWentWrong'));
      return;
    }

    try {
      // Проверка владения объектом
      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .eq('owner_id', user.id)
        .single();

      if (propertyError || !property) {
        console.error('Property not found or access denied', { propertyError, id, userId: user.id });
        toast.error(t('errors.somethingWentWrong'));
        return;
      }

      // Fetch bookings details
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('property_id', id);

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        toast.error(t('errors.somethingWentWrong'));
        return;
      }

      const propertyBookings = bookingsData || [];

      // Если есть бронирования, показываем модальное окно
      if (propertyBookings.length > 0) {
        setPropertyToDelete(property);
        setBookingsForDelete(propertyBookings);
        setIsDeletePropertyModalOpen(true);
        return;
      }

      // Если нет бронирований, сразу удаляем
      await performPropertyDeletion(id, property, 'force_delete', []);
    } catch (error) {
      console.error('Error in handleDeleteProperty:', error);
      toast.error(t('errors.somethingWentWrong'));
    }
  };

  const handleDeletePropertyConfirm = async (action: 'cancel_unpaid' | 'force_delete' | 'abort') => {
    if (!propertyToDelete || action === 'abort') {
      setIsDeletePropertyModalOpen(false);
      setPropertyToDelete(null);
      setBookingsForDelete([]);
      return;
    }

    try {
      await performPropertyDeletion(propertyToDelete.id, propertyToDelete, action, bookingsForDelete);
      setIsDeletePropertyModalOpen(false);
      setPropertyToDelete(null);
      setBookingsForDelete([]);
    } catch (error) {
      console.error('Error in handleDeletePropertyConfirm:', error);
      // Модальное окно остается открытым для повторной попытки
    }
  };

  const performPropertyDeletion = async (
    propertyId: string,
    property: Property,
    action: 'cancel_unpaid' | 'force_delete',
    bookings: Booking[]
  ) => {
    if (!user) {
      toast.error(t('errors.somethingWentWrong'));
      return;
    }

    const loadingToast = toast.loading(t('common.loading', { defaultValue: 'Загрузка...' }));

    try {
      let processedBookingsCount = 0;

      // Обработка бронирований в зависимости от действия
      if (action === 'cancel_unpaid') {
        // Отменяем неоплаченные бронирования (status != 'confirmed')
        const unpaidBookings = bookings.filter(b => b.status !== 'confirmed');
        if (unpaidBookings.length > 0) {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('property_id', propertyId)
            .neq('status', 'confirmed'); // Обновляем только неоплаченные

          if (updateError) {
            throw updateError;
          }
          processedBookingsCount = unpaidBookings.length;
        }
      } else if (action === 'force_delete') {
        // Удаляем все бронирования
        const { error: deleteError } = await supabase
          .from('bookings')
          .delete()
          .eq('property_id', propertyId);

        if (deleteError) {
          throw deleteError;
        }
        processedBookingsCount = bookings.length;
      }

      // Проверяем наличие активной Avito интеграции
      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('*')
        .eq('property_id', propertyId)
        .eq('platform', 'avito')
        .eq('is_active', true)
        .maybeSingle();

      let avitoSynced = false;
      if (!integrationError && integration) {
        try {
          // Вызываем Edge Function для закрытия дат в Avito
          const { data: closeData, error: closeError } = await supabase.functions.invoke('avito-close-availability', {
            body: {
              integration_id: integration.id,
              property_id: propertyId,
            },
          });

          if (closeError) {
            console.error('Avito close availability error:', closeError);
            // Не блокируем удаление, но показываем предупреждение
            toast.error(t('avito.errors.syncFailed', { defaultValue: 'Ошибка синхронизации с Avito' }));
          } else if (closeData && closeData.error === 'paid_conflict') {
            // 409 Conflict - есть оплаченные бронирования
            toast.error(t('properties.avitoPaidBookingsError', {
              defaultValue: 'Avito: Есть оплаченные брони — верните деньги вручную',
            }));
            // Продолжаем удаление, но предупреждаем пользователя
          } else if (closeData && closeData.success) {
            avitoSynced = true;
          }
        } catch (avitoError) {
          console.error('Error calling Avito close availability:', avitoError);
          // Не блокируем удаление при ошибке Avito
        }
      }

      // Soft delete объекта
      // Try soft delete first, fallback to hard delete if column doesn't exist
      let deleteError: { code?: string; message?: string; details?: string; hint?: string } | null = null;
      const { error: softDeleteError } = await supabase
        .from('properties')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', propertyId)
        .eq('owner_id', user.id);

      // Check if error is due to missing deleted_at column
      const isColumnMissing = softDeleteError && (
        softDeleteError.code === 'PGRST204' ||
        (softDeleteError.message && softDeleteError.message.includes("deleted_at"))
      );

      if (isColumnMissing) {
        // Column doesn't exist, use hard delete
        console.warn('deleted_at column not found, using hard delete', { error: softDeleteError });
        const { error: hardDeleteError } = await supabase
          .from('properties')
          .delete()
          .eq('id', propertyId)
          .eq('owner_id', user.id);
        deleteError = hardDeleteError;
      } else {
        deleteError = softDeleteError;
      }

      if (deleteError) {
        throw deleteError;
      }

      // Обновляем локальное состояние (удаляем объект из списка)
      setProperties(prev => prev.filter((p) => p.id !== propertyId));

      // Обновляем бронирования (удаляем или обновляем статусы)
      if (action === 'force_delete') {
        // Удаляем все бронирования из локального состояния
        setBookings(prev => prev.filter((b) => b.property_id !== propertyId));
        setFilteredBookings(prev => prev.filter((b) => b.property_id !== propertyId));
      } else if (action === 'cancel_unpaid') {
        // Обновляем статусы отмененных бронирований в локальном состоянии
        setBookings(prev => prev.map(b =>
          b.property_id === propertyId && b.status !== 'confirmed'
            ? { ...b, status: 'cancelled' as const }
            : b
        ));
        setFilteredBookings(prev => prev.map(b =>
          b.property_id === propertyId && b.status !== 'confirmed'
            ? { ...b, status: 'cancelled' as const }
            : b
        ));
      }

      toast.dismiss(loadingToast);

      const avitoMessage = avitoSynced ? ', Avito синхронизирован' : '';
      toast.success(`Объект "${property.name}" удалён, ${processedBookingsCount} брони обработаны${avitoMessage}`);
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error performing property deletion:', error);
      toast.error(t('errors.somethingWentWrong'));
      throw error;
    }
  };

  const handleEditGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setIsGuestModalOpen(true);
  };

  const handleSaveGuest = async (data: Partial<Guest>) => {
    if (!user) return;
    try {
      if (selectedGuest) {
        const { error } = await supabase
          .from('guests')
          .update(data)
          .eq('id', selectedGuest.id);
        if (error) throw error;

        setGuests(guests.map(g => g.id === selectedGuest.id ? { ...g, ...data } as Guest : g));
        toast.success('Данные гостя обновлены');
      } else {
        const { data: newGuest, error } = await supabase
          .from('guests')
          .insert([{ ...data, owner_id: user.id }])
          .select()
          .single();
        if (error) throw error;

        setGuests([...guests, newGuest]);
        toast.success('Гость добавлен');
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при сохранении гостя');
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="backdrop-blur-md bg-card/90 border-b border-border px-3 md:px-6 py-3 md:py-4 shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowSearchDropdown(true)}
                placeholder={t('common.search')}
                className="pl-9 md:pl-10 h-10"
                data-testid="input-search"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-96 overflow-y-auto z-50">
                  <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground">
                    {t('bookings.found')}: {searchResults.length}
                  </div>
                  {searchResults.map((booking) => {
                    const property = properties.find(p => p.id === booking.property_id);
                    const checkIn = new Date(booking.check_in).toLocaleDateString('ru-RU');
                    const checkOut = new Date(booking.check_out).toLocaleDateString('ru-RU');
                    const nights = Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => {
                          setShowSearchDropdown(false);
                          setSearchQuery('');
                          handleEditReservation(booking);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-3 transition-colors border-b border-border last:border-b-0',
                          'hover:bg-accent hover:text-accent-foreground'
                        )}
                        data-testid={`search-result-${booking.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{booking.guest_name}</span>
                          <span className="text-sm font-medium text-primary">
                            {booking.total_price.toLocaleString('ru-RU')} {booking.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{property?.name || t('common.unknown')}</span>
                          <span className={cn(
                            'px-2 py-0.5 rounded text-xs',
                            booking.status === 'confirmed' && 'bg-success/20 text-success',
                            booking.status === 'pending' && 'bg-warning/20 text-warning',
                            booking.status === 'cancelled' && 'bg-destructive/20 text-destructive'
                          )}>
                            {booking.status === 'confirmed' ? t('bookings.confirmed') : booking.status === 'pending' ? t('bookings.pending') : t('bookings.cancelled')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>{checkIn} - {checkOut} ({nights} {nights === 1 ? t('common.night') : nights < 5 ? t('common.nights_few') : t('common.nights')})</span>
                          {booking.guest_phone && <span>{booking.guest_phone}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              <ThemeToggle />

              <button
                type="button"
                onClick={handleSync}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors relative"
                title="Синхронизация с внешними API"
                data-testid="button-sync"
              >
                <Bell className="h-4 w-4 md:h-5 md:w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-border cursor-pointer hover:bg-accent rounded-lg p-1 md:p-2 transition-colors outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    title={t('settings.profile')}
                    data-testid="button-profile"
                  >
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-medium">{t('properties.title')}</div>
                      <div className="text-xs text-muted-foreground">{user?.email}</div>
                    </div>
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                        <User className="h-4 w-4 md:h-5 md:w-5" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setIsProfileModalOpen(true)}>
                    <User className="mr-2 h-4 w-4" />
                    {t('settings.profile')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {loading ? (
          <SkeletonCalendar />
        ) : currentView === 'properties' ? (
          <PropertiesView
            properties={properties || []}
            onAdd={handleAddProperty}
            onUpdate={handleUpdateProperty}
            onDelete={handleDeleteProperty}
          />
        ) : currentView === 'bookings' ? (
          <BookingsView
            bookings={bookings}
            properties={properties}
            onEdit={handleEditReservation}
            onImport={() => setIsImportModalOpen(true)}
          />
        ) : currentView === 'guests' ? (
          <GuestsView
            guests={guests}
            bookings={bookings}
            onEditGuest={handleEditGuest}
          />
        ) : currentView === 'messages' ? (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <MessagesView
                chats={chats}
                properties={properties}
                selectedChatId={selectedChatId}
                onSelectChat={setSelectedChatId}
              />
            </div>
            {selectedChatId && (
              <div className="w-full md:w-1/2 lg:w-2/3 xl:w-3/4 border-l border-border">
                <ChatPanel
                  chat={chats.find(c => c.id === selectedChatId) || null}
                  property={chats.find(c => c.id === selectedChatId)?.property_id 
                    ? properties.find(p => p.id === chats.find(c => c.id === selectedChatId)?.property_id || '') || null
                    : null}
                  messages={messages}
                  isLoading={messagesLoading}
                  isSyncing={isSyncing}
                  onSendMessage={async (text, attachments) => {
                    if (selectedChatId) {
                      await handleSendMessage(selectedChatId, text, attachments);
                    }
                  }}
                  onLoadMore={() => selectedChatId && loadMessages(selectedChatId, messagesOffset)}
                  hasMore={hasMoreMessages}
                  onCreateBooking={handleCreateBookingFromChat}
                  onStatusChange={handleChatStatusChange}
                />
              </div>
            )}
          </div>
        ) : currentView === 'analytics' ? (
          <AnalyticsView bookings={bookings} properties={properties} />
        ) : currentView === 'admin' && isAdmin ? (
          <AdminView />
        ) : currentView === 'settings' ? (
          <SettingsView bookings={bookings} properties={properties} />
        ) : currentView === 'calendar' ? (
          <>
            <Calendar
              properties={properties}
              bookings={filteredBookings}
              onAddReservation={handleAddReservation}
              onEditReservation={handleEditReservation}
              onBookingUpdate={(id, updates) => {
                const updatedBookings = bookings.map(b =>
                  b.id === id ? { ...b, ...updates } : b
                );
                setBookings(updatedBookings);
                setFilteredBookings(updatedBookings);
              }}
              onPropertiesUpdate={(updatedProperties) => {
                setProperties(updatedProperties);
              }}
              onDateSelectionReset={() => {
                // Callback for date selection reset (optional)
              }}
            />
            <AddReservationModal
              isOpen={isAddModalOpen}
              onClose={() => {
                setIsAddModalOpen(false);
                setSelectedPropertyIds([]);
                setPrefilledDates(null);
                // Reset date selection in Calendar via window function
                const resetFn = (window as Window & { __calendarResetDateSelection?: () => void }).__calendarResetDateSelection;
                if (resetFn) {
                  resetFn();
                }
              }}
              properties={properties}
              selectedProperties={selectedPropertyIds}
              prefilledDates={prefilledDates}
              onAdd={handleSaveReservation}
              guests={guests}
            />
            <GuestModal
              isOpen={isGuestModalOpen}
              onClose={() => {
                setIsGuestModalOpen(false);
                setSelectedGuest(null);
              }}
              guest={selectedGuest}
              bookings={bookings}
              properties={properties}
              onSave={handleSaveGuest}
            />
            <EditReservationModal
              isOpen={isEditModalOpen}
              onClose={() => {
                setIsEditModalOpen(false);
                setSelectedBooking(null);
              }}
              booking={selectedBooking}
              properties={properties}
              onUpdate={handleUpdateReservation}
              onDelete={handleDeleteReservation}
            />
            <OverlapWarningModal
              isOpen={isOverlapWarningOpen}
              onContinue={handleOverlapContinue}
              onGoBack={handleOverlapGoBack}
              overlappingBookings={overlappingBookings}
            />
            <UserProfileModal
              isOpen={isProfileModalOpen}
              onClose={() => setIsProfileModalOpen(false)}
              profile={userProfile}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">{t('common.underDevelopment')}</p>
              <Button onClick={() => setCurrentView('calendar')}>{t('nav.calendar')}</Button>
            </div>
          </div>
        )}

        {/* Delete Property Modal */}
        {propertyToDelete && (
          <DeletePropertyModal
            isOpen={isDeletePropertyModalOpen}
            onClose={() => {
              setIsDeletePropertyModalOpen(false);
              setPropertyToDelete(null);
              setBookingsForDelete([]);
            }}
            property={propertyToDelete}
            bookings={bookingsForDelete}
            onConfirm={handleDeletePropertyConfirm}
          />
        )}

        {/* Import Bookings Modal */}
        <ImportBookingsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            loadData();
            setCurrentView('bookings');
          }}
        />
      </div>
    </div>
  );
}
