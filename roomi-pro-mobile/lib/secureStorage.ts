/**
 * LargeSecureStore — хранение сессии Supabase без лимита 2048 бат SecureStore.
 * В Expo Go: только SecureStore (+ AsyncStorage при переполнении).
 * В dev build: ключ в SecureStore, данные в зашифрованном MMKV (dynamic require).
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Alert } from 'react-native';

const ENCRYPTION_KEY_KEY = 'supabase_encryption_key';
const isExpoGo =
  Constants.appOwnership === 'expo' || Constants.appOwnership === 'guest';

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getOrCreateEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_KEY);
  if (!key) {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    key = uint8ArrayToHex(randomBytes);
    await SecureStore.setItemAsync(ENCRYPTION_KEY_KEY, key);
  }
  return key;
}

// Dev build: MMKV (dynamic require, чтобы не падать в Expo Go из‑за Nitro)
let mmkvInstance: import('react-native-mmkv').MMKV | null = null;
let mmkvPromise: Promise<import('react-native-mmkv').MMKV> | null = null;

function getMMKV(): Promise<import('react-native-mmkv').MMKV> {
  if (mmkvInstance) return Promise.resolve(mmkvInstance);
  if (!mmkvPromise) {
    mmkvPromise = getOrCreateEncryptionKey().then((encryptionKey) => {
      const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
      mmkvInstance = createMMKV({
        id: 'supabase-session',
        encryptionKey,
      });
      return mmkvInstance;
    });
  }
  return mmkvPromise;
}

// Expo Go: SecureStore, при переполнении — Alert + AsyncStorage
const expoGoStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const fromSecure = await SecureStore.getItemAsync(key);
    if (fromSecure != null) return fromSecure;
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      Alert.alert(
        'Сессия слишком большая',
        'Используй development build для полной поддержки сессии.'
      );
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

// Dev build: MMKV
const mmkvStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const mmkv = await getMMKV();
    return mmkv.getString(key) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const mmkv = await getMMKV();
    mmkv.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    const mmkv = await getMMKV();
    mmkv.remove(key);
  },
};

export const secureStorage = isExpoGo ? expoGoStorage : mmkvStorage;
