import { useState, useEffect, useCallback } from 'react';
import { X, Trash2, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { Property, BookingLog } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { syncAvitoIntegration, AvitoSyncError } from '@/services/apiSync';
import { showAvitoErrors } from '@/services/avitoErrors';
import { BookingLogsTable } from '@/components/BookingLogsTable';
import { AvitoIntegrationForm } from '@/components/AvitoIntegrationForm';

interface PropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  onSave: (data: Partial<Property>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** После редиректа с Avito OAuth — открыть форму ID объявления и наценки, а не экран успеха */
  initialShowAvitoForm?: boolean;
  /** Вызвать когда пользователь закрыл модалку «Подключение Avito» (чтобы не открывать её снова при ре-рендере) */
  onAvitoConnectClose?: () => void;
}

export function PropertyModal({ isOpen, onClose, property, onSave, onDelete, initialShowAvitoForm = false, onAvitoConnectClose }: PropertyModalProps) {
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
  const [activeTab, setActiveTab] = useState('main');
  const [bookingLogs, setBookingLogs] = useState<BookingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);


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
    if (property) {
      loadBookingLogs(property.id);
    }
  }, [property, isOpen, loadBookingLogs]);

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

      // syncAvitoIntegration handles no-integration case gracefully (returns skipUserError: true)
      if (property && hasRelevantChanges) {
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
                      <AvitoIntegrationForm
                        property={property}
                        isOpen={isOpen}
                        initialShowAvitoForm={initialShowAvitoForm}
                        onAvitoConnectClose={onAvitoConnectClose}
                        basePrice={parseFloat(formData.base_price) || 0}
                      />

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

      </div>
    </div>
  );
}
