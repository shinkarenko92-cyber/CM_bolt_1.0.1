import { useState, useEffect, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { Badge, Button, Input, InputNumber, Modal, message } from 'antd';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Property, PropertyIntegration } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { AvitoConnectModal } from './AvitoConnectModal';
import { getOAuthSuccess, getOAuthError, parseOAuthState } from '../services/avito';
import { syncAvitoIntegration, AvitoSyncError } from '../services/apiSync';
import { showAvitoErrors } from '../services/avitoErrors';

interface PropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  onSave: (data: Partial<Property>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PropertyModal({ isOpen, onClose, property, onSave, onDelete }: PropertyModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    type: 'apartment',
    address: '',
    description: '',
    max_guests: '2',
    bedrooms: '1',
    base_price: '',
    currency: 'RUB',
    minimum_booking_days: '1',
    status: 'active',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [avitoIntegration, setAvitoIntegration] = useState<PropertyIntegration | null>(null);
  const [isAvitoModalOpen, setIsAvitoModalOpen] = useState(false);
  const [isEditMarkupModalOpen, setIsEditMarkupModalOpen] = useState(false);
  const [newMarkup, setNewMarkup] = useState<number>(15);
  const [isEditingItemId, setIsEditingItemId] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string>('');

  const loadAvitoIntegration = useCallback(async () => {
    if (!property) return;
    
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('property_id', property.id)
      .eq('platform', 'avito')
      .maybeSingle();
    
    console.log('PropertyModal: loadAvitoIntegration', {
      property_id: property.id,
      hasData: !!data,
      error,
      integration: data ? {
        id: data.id,
        is_active: data.is_active,
        token_expires_at: data.token_expires_at,
        last_sync_at: data.last_sync_at,
      } : null,
    });
    
    setAvitoIntegration(data);
    if (data?.avito_markup) {
      setNewMarkup(data.avito_markup);
    }
    
    // Show warning if old integration (missing avito_item_id)
    if (data && data.is_active && !data.avito_item_id) {
      console.warn('PropertyModal: Old integration detected - missing avito_item_id', {
        integration_id: data.id,
        property_id: property?.id,
      });
      // Warning will be shown in UI
    }
  }, [property]);

  useEffect(() => {
    if (property) {
      setFormData({
        name: property.name || '',
        type: property.type || 'apartment',
        address: property.address || '',
        description: property.description || '',
        max_guests: property.max_guests?.toString() || '2',
        bedrooms: property.bedrooms?.toString() || '1',
        base_price: property.base_price?.toString() || '',
        currency: property.currency || 'RUB',
        minimum_booking_days: property.minimum_booking_days?.toString() || '1',
        status: property.status || 'active',
      });
    } else {
      setFormData({
        name: '',
        type: 'apartment',
        address: '',
        description: '',
        max_guests: '2',
        bedrooms: '1',
        base_price: '',
        currency: 'RUB',
        minimum_booking_days: '1',
        status: 'active',
      });
    }
    setShowDeleteConfirm(false);
    setError(null);
    loadAvitoIntegration();
  }, [property, isOpen, loadAvitoIntegration]);

  // Автоматически открываем модальное окно Avito, если есть OAuth callback
  useEffect(() => {
    if (!property || !isOpen) {
      return;
    }

    // Check localStorage FIRST before any work
    const oauthSuccess = getOAuthSuccess();
    const oauthError = getOAuthError();

    // Early exit if no OAuth callback
    if (!oauthSuccess && !oauthError) {
      return;
    }

    // Early exit if Avito modal is already open (avoid unnecessary processing)
    if (isAvitoModalOpen) {
      return;
    }
    
    console.log('PropertyModal: Checking for OAuth callback', {
      propertyId: property.id,
      propertyName: property.name,
      isAvitoModalOpen
    });
    
    if (oauthSuccess) {
      // Проверяем, что state соответствует текущему property
      try {
        const stateData = parseOAuthState(oauthSuccess.state);
        console.log('PropertyModal: Parsed OAuth state', {
          stateData,
          propertyId: property.id,
          matches: stateData?.property_id === property.id
        });
        
        if (stateData && stateData.property_id === property.id) {
          console.log('PropertyModal: OAuth callback detected for property, opening Avito modal', {
            propertyId: property.id,
            propertyName: property.name
          });
          setIsAvitoModalOpen(true);
        } else if (stateData && stateData.property_id !== property.id) {
          console.log('PropertyModal: OAuth callback is for different property', {
            callbackPropertyId: stateData.property_id,
            currentPropertyId: property.id
          });
        }
      } catch (error) {
        console.error('PropertyModal: Error parsing OAuth state:', error);
      }
    } else if (oauthError) {
      // Если есть ошибка OAuth, тоже открываем модальное окно, чтобы показать ошибку
      console.log('PropertyModal: OAuth error detected, opening Avito modal', {
        error: oauthError.error,
        errorDescription: oauthError.error_description
      });
      setIsAvitoModalOpen(true);
    }
  }, [property, isOpen, isAvitoModalOpen]); // Include isAvitoModalOpen with early exit to prevent unnecessary processing

  const handleDisconnectAvito = () => {
    Modal.confirm({
      title: 'Отключить Avito?',
      content: 'Синхронизация будет остановлена. Вы можете подключить заново позже.',
      okText: 'Отключить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!avitoIntegration) return;
        
        // Set is_active = false
        await supabase
          .from('integrations')
          .update({ is_active: false })
          .eq('id', avitoIntegration.id);
        
        // Remove from sync queue
        await supabase
          .from('avito_sync_queue')
          .delete()
          .eq('integration_id', avitoIntegration.id);
        
        message.success('Avito отключён');
        loadAvitoIntegration();
      },
    });
  };

  const handleDeleteAvito = () => {
    Modal.confirm({
      title: 'Удалить интеграцию Avito?',
      content: 'Интеграция будет полностью удалена из базы данных. Это действие нельзя отменить.',
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!avitoIntegration) return;
        
        // Delete from integrations (CASCADE will handle avito_items and avito_sync_queue)
        const { error } = await supabase
          .from('integrations')
          .delete()
          .eq('id', avitoIntegration.id);
        
        if (error) {
          message.error('Ошибка при удалении: ' + error.message);
          return;
        }
        
        message.success('Интеграция Avito удалена');
        loadAvitoIntegration();
      },
    });
  };

  const handleEditMarkup = () => {
    setIsEditMarkupModalOpen(true);
  };

  const handleSaveMarkup = async () => {
    if (!avitoIntegration) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ avito_markup: newMarkup })
        .eq('id', avitoIntegration.id);
      
      if (error) throw error;
      
      message.success('Наценка обновлена');
      setIsEditMarkupModalOpen(false);
      loadAvitoIntegration();
    } catch (error) {
      console.error('Failed to update markup:', error);
      message.error('Ошибка при обновлении наценки: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditItemId = () => {
    const currentItemId = avitoIntegration?.avito_item_id || '';
    setEditingItemId(currentItemId);
    setIsEditingItemId(true);
  };

  const handleSaveItemId = async () => {
    if (!avitoIntegration || !editingItemId || !/^[0-9]{10,11}$/.test(editingItemId.trim())) {
      message.error('ID объявления должен содержать 10-11 цифр');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ 
          avito_item_id: editingItemId.trim(),
          is_active: true  // Активируем, если была деактивирована миграцией
        })
        .eq('id', avitoIntegration.id);

      if (error) throw error;

      message.success('ID объявления обновлён');
      setIsEditingItemId(false);
      setEditingItemId('');
      loadAvitoIntegration();
    } catch (error) {
      console.error('Failed to update item_id:', error);
      message.error('Ошибка при обновлении ID объявления');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Никогда';
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Memoize token expiration check to avoid recalculating on every render
  const isTokenExpired = useMemo(() => {
    if (!avitoIntegration?.token_expires_at) {
      return false; // If no expiration date, assume token is valid
    }
    
    // Если строка без 'Z' или часового пояса, добавляем 'Z' чтобы явно указать UTC
    // Это важно, так как Supabase может сохранять timestamp без 'Z', и браузер интерпретирует его как локальное время
    let expiresAtString = avitoIntegration.token_expires_at;
    if (!expiresAtString.endsWith('Z') && !expiresAtString.includes('+') && !expiresAtString.includes('-', 10)) {
      expiresAtString = expiresAtString + 'Z';
    }
    
    const expiresAt = new Date(expiresAtString);
    const now = new Date();
    const expired = expiresAt.getTime() <= now.getTime();
    
    console.log('PropertyModal: isTokenExpired', {
      token_expires_at: avitoIntegration.token_expires_at,
      expiresAtString,
      expiresAt: expiresAt.toISOString(),
      now: now.toISOString(),
      expired,
      timeDiff: expiresAt.getTime() - now.getTime(), // Разница в миллисекундах
    });
    
    return expired;
  }, [avitoIntegration?.token_expires_at]);

  // Memoize status badge to avoid recalculating on every render
  const avitoStatusBadge = useMemo(() => {
    const isActive = avitoIntegration?.is_active;
    const tokenValid = !isTokenExpired;
    const showActive = isActive && tokenValid;
    const hasIntegration = !!avitoIntegration;
    
    console.log('PropertyModal: Status check', {
      hasIntegration,
      is_active: isActive,
      tokenValid,
      showActive,
    });
    
    return showActive ? (
      <Badge status="success" text="синхронизировано" />
    ) : (
      <Badge status="default" text="отключено" />
    );
  }, [avitoIntegration, isTokenExpired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!formData.name || !formData.base_price) {
        setError('Заполните все обязательные поля');
        return;
      }

      const oldBasePrice = property?.base_price;
      const newBasePrice = parseFloat(formData.base_price) || 0;
      const newMaxGuests = parseInt(formData.max_guests) || 2;
      const newBedrooms = parseInt(formData.bedrooms) || 1;
      const newMinimumBookingDays = parseInt(formData.minimum_booking_days) || 1;

      await onSave({
        name: formData.name,
        type: formData.type,
        address: formData.address || '',
        description: formData.description || '',
        max_guests: newMaxGuests,
        bedrooms: newBedrooms,
        base_price: newBasePrice,
        currency: formData.currency,
        minimum_booking_days: newMinimumBookingDays,
        status: formData.status,
      });

      // Auto-sync to Avito if any relevant field changed and integration is active
      const hasRelevantChanges = 
        oldBasePrice !== newBasePrice ||
        property?.name !== formData.name ||
        property?.description !== formData.description ||
        property?.address !== formData.address ||
        property?.max_guests !== newMaxGuests ||
        property?.bedrooms !== newBedrooms ||
        property?.minimum_booking_days !== newMinimumBookingDays;

      // Note: We don't check isTokenExpired here because Edge Function will automatically refresh the token if needed
      if (property && avitoIntegration?.is_active && hasRelevantChanges) {
        try {
          const syncResult = await syncAvitoIntegration(property.id);
          // Показываем успешное уведомление - check if pushSuccess for specific message
          if (syncResult.pushSuccess) {
            toast.success('Даты и цены закрыты в Avito 🚀');
          } else if (syncResult.pricesSuccess && syncResult.intervalsFailed) {
            toast.success('Цены обновлены в Avito');
            toast('Даты не закрыты (ожидаем активацию Avito). Используй iCal URL для закрытия дат.', {
              icon: '⚠️',
              duration: 6000,
            });
          } else {
            toast.success(t('avito.success.syncCompleted', { defaultValue: 'Синхронизация с Avito завершена успешно' }));
          }
        } catch (error) {
          console.error('Failed to sync prices to Avito:', error);
          
          // Если это AvitoSyncError с массивом ошибок, показываем их
          if (error instanceof AvitoSyncError && error.errors.length > 0) {
            // Показываем модальные окна с ошибками последовательно
            showAvitoErrors(error.errors, t).catch((err) => {
              console.error('Error showing Avito error modals:', err);
            });
          } else {
            // Для других ошибок показываем простое сообщение
            let errorMessage: string;
            if (typeof error === 'string') {
              errorMessage = error;
            } else if (error && typeof error === 'object' && 'message' in error) {
              errorMessage = (error as { message?: string }).message || JSON.stringify(error);
            } else {
              errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            }
            
            // Check for 404 errors
            if (errorMessage.includes('404') || errorMessage.includes('не найдено')) {
              toast.error('Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции');
            } else {
              toast.error(t('avito.errors.syncFailed', { defaultValue: 'Ошибка синхронизации с Avito' }) + ': ' + errorMessage);
            }
          }
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!property) return;

    setError(null);
    setLoading(true);

    try {
      await onDelete(property.id);
      onClose();
    } catch (err) {
      // Проверяем, является ли это ошибкой foreign key constraint
      if (err && typeof err === 'object' && 'code' in err && err.code === '23503') {
        const errorMessage = t('errors.cannotDeletePropertyWithBookings', { 
          defaultValue: 'Невозможно удалить объект, так как у него есть связанные бронирования. Сначала удалите все бронирования для этого объекта.' 
        });
        setError(errorMessage);
        toast.error(errorMessage);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка';
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        // Сохраняем, что mousedown произошел на backdrop
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLElement).dataset.mouseDown = 'true';
        }
      }}
      onMouseUp={(e) => {
        // Закрываем только если mousedown и mouseup произошли на backdrop
        const backdrop = e.currentTarget as HTMLElement;
        if (e.target === backdrop && backdrop.dataset.mouseDown === 'true') {
          onClose();
        }
        delete backdrop.dataset.mouseDown;
      }}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-xl font-semibold text-white">
            {property ? 'Редактировать объект' : 'Добавить объект'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        {showDeleteConfirm ? (
          <div className="p-6 border-b border-slate-700">
            <p className="text-white mb-4">Вы уверены, что хотите удалить этот объект?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition"
                disabled={loading}
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Основная информация */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Основная информация</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Название *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="Например: Double Room 1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Тип объекта
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="apartment">Квартира</option>
                    <option value="DOUBLE ROOM">Двухместный номер</option>
                    <option value="ONE BEDROOM">Однокомнатная</option>
                    <option value="studio">Студия</option>
                    <option value="house">Дом</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Статус
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="active">Активен</option>
                    <option value="inactive">Неактивен</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Адрес</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="Улица, дом, квартира"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Описание</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    rows={3}
                    placeholder="Дополнительная информация об объекте"
                  />
                </div>
              </div>
            </div>

            {/* Параметры */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Параметры</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Максимум гостей
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_guests}
                    onChange={(e) => setFormData({ ...formData, max_guests: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Количество спален
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.bedrooms}
                    onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
              </div>
            </div>

            {/* Цены и бронирование */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Цены и бронирование</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Цена за ночь *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.base_price}
                    onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Валюта</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="RUB">RUB</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Минимальный срок бронирования (ночей)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.minimum_booking_days}
                    onChange={(e) =>
                      setFormData({ ...formData, minimum_booking_days: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
              </div>
            </div>

            {/* API интеграции */}
            {property && (
              <div className="border-t border-slate-700 pt-6">
                <h3 className="text-lg font-medium text-white mb-4">API интеграции</h3>
                
                {/* Avito Integration Section */}
                <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-white font-medium">Avito</h4>
                      {avitoStatusBadge}
                    </div>
                  </div>

                  {avitoIntegration?.is_active ? (
                    <>
                      {/* Warning for old integrations with short avito_item_id */}
                      {avitoIntegration.avito_item_id && 
                       String(avitoIntegration.avito_item_id).length < 10 && (
                        <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-3 mb-3">
                          <p className="text-yellow-300 text-sm font-medium mb-1">⚠️ Требуется обновление</p>
                          <p className="text-yellow-200 text-xs">
                            Обнови ID объявления — должен быть длинный номер (10-11 цифр) из Avito. 
                            Нажми "Редактировать ID объявления" ниже.
                          </p>
                        </div>
                      )}
                      {/* Warning for missing avito_item_id */}
                      {!avitoIntegration.avito_item_id && (
                        <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-3 mb-3">
                          <p className="text-yellow-300 text-sm font-medium mb-1">⚠️ Требуется обновление</p>
                          <p className="text-yellow-200 text-xs">
                            Обнови ID объявления — должен быть длинный номер (10-11 цифр) из Avito. 
                            Нажми "Редактировать ID объявления" ниже.
                          </p>
                        </div>
                      )}
                      {/* Display current item_id */}
                      {avitoIntegration.avito_item_id && String(avitoIntegration.avito_item_id).length >= 10 && (
                        <div className="text-sm text-slate-400 mb-2">
                          ID объявления: {avitoIntegration.avito_item_id}
                        </div>
                      )}
                      <div className="text-sm text-slate-400">
                        Последняя синхронизация: {formatDate(avitoIntegration.last_sync_at)}
                      </div>
                      <div className="text-sm text-slate-400">
                        Наценка: {avitoIntegration.avito_markup || 15}%
                      </div>
                      
                      {/* Inline form for editing item_id */}
                      {isEditingItemId ? (
                        <div className="mt-3 p-3 bg-slate-600/50 rounded border border-slate-500">
                          <label className="block text-sm text-white mb-2">ID объявления на Avito</label>
                          <Input
                            placeholder="Например, 2336174775"
                            value={editingItemId}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                              setEditingItemId(value);
                            }}
                            maxLength={11}
                          />
                          {editingItemId && !/^[0-9]{10,11}$/.test(editingItemId) && (
                            <p className="text-xs text-red-400 mt-1">
                              ID объявления должен содержать 10-11 цифр
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <Button 
                              type="primary" 
                              size="small"
                              onClick={handleSaveItemId}
                              disabled={!editingItemId || !/^[0-9]{10,11}$/.test(editingItemId)}
                              loading={loading}
                            >
                              Сохранить
                            </Button>
                            <Button 
                              size="small"
                              onClick={() => {
                                setIsEditingItemId(false);
                                setEditingItemId('');
                              }}
                              disabled={loading}
                            >
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-3">
                          <Button onClick={handleEditMarkup}>Редактировать наценку</Button>
                          <Button onClick={handleEditItemId}>Редактировать ID объявления</Button>
                          <Button onClick={handleDisconnectAvito}>
                            Отключить
                          </Button>
                          <Button danger onClick={handleDeleteAvito}>
                            Удалить
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Button type="primary" onClick={() => setIsAvitoModalOpen(true)}>
                      {avitoIntegration ? 'Подключить заново' : 'Подключить Avito'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {!property && (
              <div className="border-t border-slate-700 pt-6">
                <h3 className="text-lg font-medium text-white mb-2">API интеграции</h3>
                <p className="text-sm text-slate-400">
                  Сначала сохраните объект, чтобы настроить интеграции с площадками.
                </p>
              </div>
            )}

            {/* Кнопки */}
            <div className="flex gap-3 justify-between pt-4 border-t border-slate-700">
              {property && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded transition"
                  disabled={loading}
                >
                  Удалить
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-300 hover:text-white transition"
                  disabled={loading}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded transition disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Avito Connect Modal */}
        {property && (
          <AvitoConnectModal
            isOpen={isAvitoModalOpen}
            onClose={() => setIsAvitoModalOpen(false)}
            property={property}
            onSuccess={() => {
              loadAvitoIntegration();
            }}
          />
        )}

        {/* Edit Markup Modal */}
        <Modal
          title="Редактировать наценку"
          open={isEditMarkupModalOpen}
          onOk={handleSaveMarkup}
          onCancel={() => setIsEditMarkupModalOpen(false)}
          okText="Сохранить"
          cancelText="Отмена"
        >
          <div className="py-4">
            <label className="block text-sm text-slate-300 mb-2">Наценка (%)</label>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={100}
              value={newMarkup}
              onChange={(value) => setNewMarkup(value !== null && value !== undefined ? value : 15)}
              formatter={(value) => `${value}%`}
              parser={(value) => parseFloat(value?.replace('%', '') || '0')}
            />
            <p className="text-xs text-slate-500 mt-2">
              Цена на Avito = базовая цена + {newMarkup}%
            </p>
          </div>
        </Modal>
      </div>
    </div>
  );
}
