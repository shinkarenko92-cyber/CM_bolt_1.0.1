/**
 * LargeSecureStore — хранение сессии Supabase без лимита 2048 байт SecureStore.
 * Ключ шифрования в SecureStore, данные сессии в зашифрованном MMKV.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createMMKV, type MMKV } from 'react-native-mmkv';

const ENCRYPTION_KEY_KEY = 'supabase_encryption_key';

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

let mmkvInstance: MMKV | null = null;
let mmkvPromise: Promise<MMKV> | null = null;

function getMMKV(): Promise<MMKV> {
  if (mmkvInstance) return Promise.resolve(mmkvInstance);
  if (!mmkvPromise) {
    mmkvPromise = getOrCreateEncryptionKey().then((encryptionKey) => {
      mmkvInstance = createMMKV({
        id: 'supabase-session',
        encryptionKey,
      });
      return mmkvInstance;
    });
  }
  return mmkvPromise;
}

export const secureStorage = {
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
