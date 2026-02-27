import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Trash2, Upload, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import toast from 'react-hot-toast';
import { Property, PropertyIntegration, BookingLog } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { AvitoConnectModal } from '@/components/AvitoConnectModal';
import { getOAuthSuccess, getOAuthError, parseOAuthState } from '@/services/avito';
import { syncAvitoIntegration, AvitoSyncError } from '@/services/apiSync';
import { showAvitoErrors } from '@/services/avitoErrors';
import { BookingLogsTable } from '@/components/BookingLogsTable';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';

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
    image_url: '',
  });

  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [avitoIntegration, setAvitoIntegration] = useState<PropertyIntegration | null>(null);
  const [isAvitoModalOpen, setIsAvitoModalOpen] = useState(false);
  const [isEditMarkupModalOpen, setIsEditMarkupModalOpen] = useState(false);
  const [newMarkup, setNewMarkup] = useState<number>(0);
  const [newMarkupType, setNewMarkupType] = useState<'percent' | 'rub'>('percent');
  const [isEditingItemId, setIsEditingItemId] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string>('');
  const [apiIntegrationsOpen, setApiIntegrationsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('main');
  const [bookingLogs, setBookingLogs] = useState<BookingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [confirmAvito, setConfirmAvito] = useState<'disconnect' | 'delete' | null>(null);
  const [confirmAvitoLoading, setConfirmAvitoLoading] = useState(false);

  const loadAvitoIntegration = useCallback(async () => {
    if (!property) return;

    const { data } = await supabase
      .from('integrations')
      .select('*')
      .eq('property_id', property.id)
      .eq('platform', 'avito')
      .maybeSingle();

    // Load Avito integration
    setAvitoIntegration(data);
    if (data != null) {
      const m = data.avito_markup;
      if (m != null && m !== undefined) {
        if (m < 0) {
          setNewMarkupType('rub');
          setNewMarkup(Math.abs(m));
        } else {
          setNewMarkupType('percent');
          setNewMarkup(m);
        }
      } else {
        setNewMarkupType('percent');
        setNewMarkup(0);
      }
    } else {
      setNewMarkupType('percent');
      setNewMarkup(0);
    }

    // Show warning if old integration (missing avito_item_id)
    if (data && data.is_active && !data.avito_item_id) {
      // Old integration detected - missing avito_item_id
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
        image_url: property.image_url || '',
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
        image_url: '',
      });
    }
    setShowDeleteConfirm(false);
    setError(null);
    loadAvitoIntegration();
    if (property) {
      loadBookingLogs(property.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, isOpen, loadAvitoIntegration]);

  const loadBookingLogs = useCallback(async (propId: string) => {
    if (!propId) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('booking_logs')
        .select('*')
        .eq('property_id', propId)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) {
        // Таблица booking_logs может отсутствовать (миграции не применены) — 404 / PGRST205 / PGRST301
        const err = error as { code?: string; status?: number; message?: string };
        if (err.code === 'PGRST205' || err.status === 404 || err.message?.includes('404') || err.code === 'PGRST301') {
          setBookingLogs([]);
          return;
        }
        throw error;
      }
      setBookingLogs(data || []);
    } catch (err) {
      console.error('Error loading booking logs:', err);
      // Не показывать toast при 404 (таблица отсутствует)
      const is404 = err && typeof err === 'object' && ((err as { status?: number }).status === 404 || (err as Error).message?.includes('404'));
      if (!is404) toast.error('Ошибка загрузки истории');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите изображение');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Размер файла не должен превышать 5MB');
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('property-images')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, image_url: data.publicUrl }));
      toast.success('Изображение загружено');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Ошибка загрузки изображения');
    } finally {
      setUploadingImage(false);
    }
  };

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

    // Check for OAuth callback
    if (oauthSuccess) {
      // Проверяем, что state соответствует текущему property
      try {
        const stateData = parseOAuthState(oauthSuccess.state);

        if (stateData && stateData.property_id === property.id) {
          // OAuth callback detected for property, opening Avito modal
          setIsAvitoModalOpen(true);
        } else if (stateData && stateData.property_id !== property.id) {
          // OAuth callback is for different property
        }
      } catch (error) {
        console.error('PropertyModal: Error parsing OAuth state:', error);
      }
    } else if (oauthError) {
      // Если есть ошибка OAuth, тоже открываем модальное окно, чтобы показать ошибку
      setIsAvitoModalOpen(true);
    }
  }, [property, isOpen, isAvitoModalOpen]); // Include isAvitoModalOpen with early exit to prevent unnecessary processing

  const runDisconnectAvito = async () => {
    if (!avitoIntegration) return;
    setConfirmAvitoLoading(true);
    try {
      await supabase
        .from('integrations')
        .update({ is_active: false })
        .eq('id', avitoIntegration.id);
      await supabase
        .from('avito_sync_queue')
        .delete()
        .eq('integration_id', avitoIntegration.id);
      toast.success('Avito отключён');
      loadAvitoIntegration();
      setConfirmAvito(null);
    } finally {
      setConfirmAvitoLoading(false);
    }
  };

  const runDeleteAvito = async () => {
    if (!avitoIntegration) return;
    setConfirmAvitoLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', avitoIntegration.id);
      if (error) {
        toast.error('Ошибка при удалении: ' + error.message);
        return;
      }
      toast.success('Интеграция Avito удалена');
      loadAvitoIntegration();
      setConfirmAvito(null);
    } finally {
      setConfirmAvitoLoading(false);
    }
  };

  const handleDisconnectAvito = () => setConfirmAvito('disconnect');
  const handleDeleteAvito = () => setConfirmAvito('delete');

  const handleEditMarkup = () => {
    setIsEditMarkupModalOpen(true);
  };

  const handleSaveMarkup = async () => {
    if (!avitoIntegration) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ avito_markup: newMarkupType === 'rub' ? -newMarkup : newMarkup })
        .eq('id', avitoIntegration.id);

      if (error) throw error;

      toast.success(t('avito.integration.markupUpdated'));
      setIsEditMarkupModalOpen(false);
      loadAvitoIntegration();
    } catch (error) {
      console.error('Failed to update markup:', error);
      toast.error('Ошибка при обновлении наценки: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
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
      toast.error('ID объявления должен содержать 10-11 цифр');
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

      toast.success('ID объявления обновлён');
      setIsEditingItemId(false);
      setEditingItemId('');
      loadAvitoIntegration();
    } catch (error) {
      console.error('Failed to update item_id:', error);
      toast.error('Ошибка при обновлении ID объявления');
    } finally {
      setLoading(false);
    }
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

    // Check if token is expired
    return expired;
  }, [avitoIntegration?.token_expires_at]);

  const avitoSynced = useMemo(() => {
    const isActive = avitoIntegration?.is_active;
    const tokenValid = !isTokenExpired;
    const hasItemId = avitoIntegration?.avito_item_id && String(avitoIntegration.avito_item_id).length >= 10;
    return !!(isActive && tokenValid && hasItemId);
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
        base_price: newBasePrice,
        currency: formData.currency,
        minimum_booking_days: newMinimumBookingDays,
        status: formData.status,
        image_url: formData.image_url || null,
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
          if (syncResult.pushSuccess) {
            toast.success('Синхронизация успешна! Цены и даты обновлены в Avito');
          } else if (syncResult.pricesSuccess && syncResult.intervalsFailed) {
            toast.success(t('avito.sync.pricesUpdated', { defaultValue: 'Цены обновлены в Avito' }));
            toast(t('avito.sync.partialCalendarWarning', { defaultValue: 'Часть календаря Avito пока не обновлена. Повтори синхронизацию позже.' }), {
              icon: '⚠️',
              duration: 6000,
            });
          } else if (syncResult.success) {
            toast.success('Синхронизация успешна! Цены и даты обновлены в Avito');
          }
          if (syncResult.success && (syncResult.warnings?.length || syncResult.warningMessage)) {
            toast(syncResult.warningMessage || syncResult.warnings?.map(w => w.message).join(' ') || 'Есть предупреждения по Avito', {
              icon: '⚠️',
              duration: 6000,
            });
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
          <div className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="main">Основная информация</TabsTrigger>
                {property && <TabsTrigger value="history">История</TabsTrigger>}
              </TabsList>
              <TabsContent value="main">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
                          {error}
                        </div>
                      )}

                      {/* Основная информация */}
                      <div>
                        <h3 className="text-lg font-medium text-white mb-4">Основная информация</h3>

                        {/* Image Upload */}
                        <div className="mb-6">
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Фото объекта
                          </label>
                          <div className="flex items-start gap-4">
                            <div className="relative w-32 h-24 bg-slate-700 rounded-lg overflow-hidden border border-slate-600 flex items-center justify-center group">
                              {formData.image_url ? (
                                <>
                                  <img
                                    src={formData.image_url}
                                    alt="Preview"
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, image_url: '' })}
                                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </>
                              ) : (
                                <ImageIcon className="text-slate-500 w-8 h-8" />
                              )}
                              {uploadingImage && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                  <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <label className="cursor-pointer px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 border border-slate-600">
                                  <Upload size={16} />
                                  Загрузить фото
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                    disabled={uploadingImage}
                                  />
                                </label>
                                {formData.image_url && (
                                  <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, image_url: '' })}
                                    className="text-sm text-red-400 hover:text-red-300 transition"
                                  >
                                    Удалить
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">
                                Рекомендуемый размер: 800x600px. JPG, PNG до 5MB.
                              </p>
                            </div>
                          </div>
                        </div>

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
                        <div className="border-t border-slate-700 pt-6 min-w-0">
                          <h3 className="text-lg font-medium text-white mb-4">{t('avito.integration.apiIntegrations')}</h3>

                          <div className="bg-slate-700/50 rounded-lg p-4 min-w-0 overflow-hidden">
                            {!avitoIntegration ? (
                              <Button onClick={() => setIsAvitoModalOpen(true)}>
                                {t('avito.integration.connectAvito')}
                              </Button>
                            ) : (
                              <Collapsible open={apiIntegrationsOpen} onOpenChange={setApiIntegrationsOpen}>
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <div className="flex items-center gap-3 min-w-0 shrink">
                                    <span className="text-white font-medium shrink-0">Avito</span>
                                    {avitoSynced ? (
                                      <span className="flex items-center gap-1.5 text-green-400 text-sm shrink-0">
                                        <Check className="h-4 w-4" />
                                        {t('avito.integration.synced')}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-sm shrink-0">{t('avito.integration.disabled')}</span>
                                    )}
                                  </div>
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      size="sm"
                                      className="shrink-0"
                                      type="button"
                                    >
                                      {apiIntegrationsOpen ? t('avito.integration.collapse') : t('avito.integration.expand')}
                                    </Button>
                                  </CollapsibleTrigger>
                                </div>
                                <CollapsibleContent>
                                  <div className="mt-4 space-y-4">
                                    {!avitoIntegration.is_active && (
                                      <Button onClick={() => setIsAvitoModalOpen(true)}>
                                        {t('avito.integration.reconnect')}
                                      </Button>
                                    )}
                                    {/* Warnings inside expanded block */}
                                    {avitoIntegration.avito_item_id && String(avitoIntegration.avito_item_id).length < 10 && (
                                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-3">
                                        <p className="text-yellow-300 text-sm font-medium mb-1">{t('avito.integration.warningUpdateItemId')}</p>
                                        <p className="text-yellow-200 text-xs">{t('avito.integration.warningUpdateItemIdHint')}</p>
                                      </div>
                                    )}
                                    {!avitoIntegration.avito_item_id && (
                                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-3">
                                        <p className="text-yellow-300 text-sm font-medium mb-1">{t('avito.integration.warningUpdateItemId')}</p>
                                        <p className="text-yellow-200 text-xs">{t('avito.integration.warningUpdateItemIdHint')}</p>
                                      </div>
                                    )}

                                    {/* ID объявления */}
                                    <div className="min-w-0">
                                      <label className="block text-sm text-slate-400 mb-1">{t('avito.integration.itemId')}</label>
                                      {isEditingItemId ? (
                                        <div className="p-3 bg-slate-600/50 rounded border border-slate-500 space-y-2">
                                          <Input
                                            placeholder={t('avito.integration.itemIdPlaceholder')}
                                            value={editingItemId}
                                            onChange={(e) => {
                                              const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                                              setEditingItemId(value);
                                            }}
                                            maxLength={11}
                                            className="min-w-0"
                                          />
                                          {editingItemId && !/^[0-9]{10,11}$/.test(editingItemId) && (
                                            <p className="text-xs text-red-400">{t('avito.integration.itemIdInvalid')}</p>
                                          )}
                                          <div className="flex flex-wrap gap-2">
                                            <Button size="sm" onClick={handleSaveItemId} disabled={!editingItemId || !/^[0-9]{10,11}$/.test(editingItemId) || loading}>
                                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                              {t('avito.integration.save')}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { setIsEditingItemId(false); setEditingItemId(''); }} disabled={loading}>
                                              {t('avito.integration.cancel')}
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-white truncate min-w-0" title={avitoIntegration.avito_item_id || ''}>
                                            {avitoIntegration.avito_item_id || '—'}
                                          </span>
                                          <Button size="sm" variant="outline" onClick={handleEditItemId} disabled={loading}>
                                            {t('avito.integration.editItemId')}
                                          </Button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Наценка */}
                                    <div>
                                      <label className="block text-sm text-slate-400 mb-1">{t('avito.integration.markup')}</label>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-white">
                                          {avitoIntegration.avito_markup != null && avitoIntegration.avito_markup < 0
                                            ? `${Math.abs(avitoIntegration.avito_markup)} руб`
                                            : `${avitoIntegration.avito_markup ?? 0}%`}
                                        </span>
                                        <Button size="sm" variant="outline" onClick={handleEditMarkup}>{t('avito.integration.editMarkup')}</Button>
                                      </div>
                                    </div>

                                    {/* Отключить (Switch) */}
                                    {avitoIntegration.is_active && (
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm text-slate-300">{t('avito.integration.disable')}</span>
                                        <Switch
                                          checked={!!avitoIntegration.is_active}
                                          onCheckedChange={(checked) => { if (!checked) handleDisconnectAvito(); }}
                                        />
                                      </div>
                                    )}

                                    {/* Удалить интеграцию */}
                                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-600">
                                      <Button
                                        variant="destructive"
                                        onClick={handleDeleteAvito}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        {t('avito.integration.delete')}
                                      </Button>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                          </div>
                        </div>
                      )}

                      {!property && (
                        <div className="border-t border-slate-700 pt-6">
                          <h3 className="text-lg font-medium text-white mb-2">{t('avito.integration.apiIntegrations')}</h3>
                          <p className="text-sm text-slate-400">
                            {t('avito.integration.saveFirst')}
                          </p>
                        </div>
                      )}

                      {/* Кнопки */}
                      <div className="flex gap-3 justify-between pt-4 border-t border-slate-700">
                        {property && (
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition flex items-center gap-2"
                            disabled={loading}
                          >
                            <Trash2 className="w-4 h-4" />
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
              </TabsContent>
              {property && (
                <TabsContent value="history">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium text-white">История бронирований</h3>
                      <Button
                        onClick={() => property && loadBookingLogs(property.id)}
                        disabled={loadingLogs}
                      >
                        {loadingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Обновить
                      </Button>
                    </div>
                    <BookingLogsTable logs={bookingLogs} loading={loadingLogs} />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
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

        {/* Confirm Avito disconnect / delete */}
        <Dialog open={!!confirmAvito} onOpenChange={(open) => !open && setConfirmAvito(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmAvito === 'disconnect' ? t('avito.integration.disconnectConfirmTitle') : t('avito.integration.deleteConfirmTitle')}
              </DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              {confirmAvito === 'disconnect' ? t('avito.integration.disconnectConfirmContent') : t('avito.integration.deleteConfirmContent')}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmAvito(null)} disabled={confirmAvitoLoading}>
                {t('avito.integration.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={confirmAvito === 'disconnect' ? runDisconnectAvito : runDeleteAvito}
                disabled={confirmAvitoLoading}
              >
                {confirmAvitoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmAvito === 'disconnect' ? t('avito.integration.disable') : t('avito.integration.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Markup Modal */}
        <Dialog open={isEditMarkupModalOpen} onOpenChange={setIsEditMarkupModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('avito.integration.editMarkup')}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <label className="block text-sm text-muted-foreground mb-2">{t('avito.integration.markup')}</label>
              <div className="flex gap-2 mb-2">
                <SelectRoot value={newMarkupType} onValueChange={(v) => v && setNewMarkupType(v as 'percent' | 'rub')}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">%</SelectItem>
                    <SelectItem value="rub">Руб</SelectItem>
                  </SelectContent>
                </SelectRoot>
                <Input
                  type="number"
                  min={0}
                  max={newMarkupType === 'percent' ? 100 : undefined}
                  value={newMarkup}
                  onChange={(e) => setNewMarkup(parseFloat(e.target.value) || 0)}
                  className="flex-1"
                />
              </div>
              <div className="mt-3 p-3 rounded-md border border-border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const basePrice = property?.base_price ?? parseFloat(formData.base_price) ?? 0;
                    const withMarkup = newMarkupType === 'percent'
                      ? Math.round(basePrice * (1 + newMarkup / 100))
                      : Math.round(basePrice + newMarkup);
                    return (
                      <>
                        <span className="text-muted-foreground">База {basePrice}</span>
                        {newMarkupType === 'percent' ? (
                          <span> + {newMarkup}% = <span className="font-semibold text-foreground">{withMarkup}</span></span>
                        ) : (
                          <span> + {newMarkup} руб = <span className="font-semibold text-foreground">{withMarkup}</span></span>
                        )}
                      </>
                    );
                  })()}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditMarkupModalOpen(false)}>
                {t('avito.integration.cancel')}
              </Button>
              <Button onClick={handleSaveMarkup} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('avito.integration.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
