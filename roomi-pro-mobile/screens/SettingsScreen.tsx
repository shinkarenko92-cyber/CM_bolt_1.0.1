/**
 * Настройки: заглушка + кнопка «Выйти» (signOut + queryClient.clear).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '../constants/colors';

export function SettingsScreen() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Настройки</Text>
      <TouchableOpacity style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Выйти</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.error,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    maxWidth: 200,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
