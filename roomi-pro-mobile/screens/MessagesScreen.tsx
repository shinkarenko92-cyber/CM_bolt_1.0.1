/**
 * Сообщения: макет updated_messages — поиск, табы All/Action Required/Unread, список чатов.
 * Пока мок-данные; нажатие → заглушка чата.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

type MessageTab = 'all' | 'action' | 'unread';

const MOCK_CHATS = [
  { id: '1', name: 'Иван Петров', time: '10:24', actionRequired: true, room: '302', dates: '12–15 окт', preview: 'Можно ли продлить выезд до 14:00?', unread: true },
  { id: '2', name: 'Мария Сидорова', time: '9:45', actionRequired: false, room: '105', dates: '10–14 окт', preview: 'Спасибо за полотенца!', unread: false },
  { id: '3', name: 'Алексей Козлов', time: 'Вчера', actionRequired: true, room: '201', dates: '8–12 окт', preview: 'Нужен ранний завтрак в 6:00', unread: true },
];

function ChatRow({
  item,
  onPress,
}: {
  item: (typeof MOCK_CHATS)[0];
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.chatRow} onPress={onPress}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </View>
        {item.unread && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.chatBody}>
        <View style={styles.chatHead}>
          <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.chatTime, item.unread && styles.chatTimeActive]}>{item.time}</Text>
        </View>
        {item.actionRequired && (
          <View style={styles.actionTag}>
            <Text style={styles.actionTagText}>Нужно действие</Text>
          </View>
        )}
        <Text style={styles.chatMeta} numberOfLines={1}>
          {item.room} • {item.dates}
        </Text>
        <Text style={styles.chatPreview} numberOfLines={1}>{item.preview}</Text>
      </View>
    </Pressable>
  );
}

export function MessagesScreen() {
  const [tab, setTab] = useState<MessageTab>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = MOCK_CHATS;
    if (tab === 'action') list = list.filter((c) => c.actionRequired);
    if (tab === 'unread') list = list.filter((c) => c.unread);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.room.includes(q));
    }
    return list;
  }, [tab, search]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="menu" size={24} color={colors.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="create-outline" size={24} color={colors.textDark} />
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Сообщения</Text>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Гости или номера"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <View style={styles.tabs}>
        {(['all', 'action', 'unread'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'Все' : t === 'action' ? 'Нужно действие' : 'Непрочитанные'}
            </Text>
            {t === 'unread' && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{MOCK_CHATS.filter((c) => c.unread).length}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatRow item={item} onPress={() => {}} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>Нет сообщений</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerIcon: {
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textDark,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    height: 44,
    backgroundColor: colors.slate800,
    borderRadius: 12,
    paddingLeft: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textDark,
    paddingVertical: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
    marginBottom: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textDark,
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  listContent: {
    paddingBottom: 120,
  },
  chatRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,41,59,0.5)',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.slate800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.backgroundDark,
  },
  chatBody: {
    flex: 1,
    minWidth: 0,
  },
  chatHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  chatTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chatTimeActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  actionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,189,164,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,189,164,0.25)',
  },
  actionTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  chatMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  chatPreview: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  empty: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
});
