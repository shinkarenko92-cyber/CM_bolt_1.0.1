import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface MessageTemplate {
  id: string;
  label: string;
  text: string;
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  { id: 'greeting', label: 'Приветствие', text: 'Здравствуйте! Спасибо за интерес к нашему объявлению.' },
  { id: 'availability', label: 'Доступность', text: 'Да, объект свободен на эти даты. Могу забронировать для вас.' },
  { id: 'price', label: 'Цена', text: 'Цена за ночь составляет {{price}} {{currency}}. Итоговая стоимость зависит от количества ночей.' },
  { id: 'details', label: 'Детали', text: 'Могу предоставить дополнительную информацию об объекте. Что именно вас интересует?' },
  { id: 'booking', label: 'Бронирование', text: 'Для бронирования мне нужны следующие данные: даты заезда и выезда, количество гостей, контактный телефон.' },
];

export function useMessageTemplates() {
  const { user } = useAuth();
  const storageKey = user ? `cm-templates-${user.id}` : 'cm-templates';

  const [templates, setTemplates] = useState<MessageTemplate[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored) as MessageTemplate[];
    } catch {
      // ignore parse errors
    }
    return DEFAULT_TEMPLATES;
  });

  const save = useCallback((next: MessageTemplate[]) => {
    setTemplates(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storageKey]);

  const addTemplate = useCallback((label: string, text: string) => {
    save([...templates, { id: crypto.randomUUID(), label: label.trim(), text: text.trim() }]);
  }, [templates, save]);

  const updateTemplate = useCallback((id: string, label: string, text: string) => {
    save(templates.map(t => t.id === id ? { ...t, label: label.trim(), text: text.trim() } : t));
  }, [templates, save]);

  const deleteTemplate = useCallback((id: string) => {
    save(templates.filter(t => t.id !== id));
  }, [templates, save]);

  return { templates, addTemplate, updateTemplate, deleteTemplate };
}
