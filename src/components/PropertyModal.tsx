import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge, Button, InputNumber, Modal, message } from 'antd';
import { Property, PropertyIntegration } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { AvitoConnectModal } from './AvitoConnectModal';

interface PropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  onSave: (data: Partial<Property>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PropertyModal({ isOpen, onClose, property, onSave, onDelete }: PropertyModalProps) {
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
  }, [property, isOpen]);

  const loadAvitoIntegration = async () => {
    if (!property) return;
    
    const { data } = await supabase
      .from('integrations')
      .select('*')
      .eq('property_id', property.id)
      .eq('platform', 'avito')
      .maybeSingle();
    
    setAvitoIntegration(data);
    if (data?.avito_markup) {
      setNewMarkup(data.avito_markup);
    }
  };

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

  const handleEditMarkup = () => {
    setIsEditMarkupModalOpen(true);
  };

  const handleSaveMarkup = async () => {
    if (!avitoIntegration) return;
    
    await supabase
      .from('integrations')
      .update({ avito_markup: newMarkup })
      .eq('id', avitoIntegration.id);
    
    message.success('Наценка обновлена');
    setIsEditMarkupModalOpen(false);
    loadAvitoIntegration();
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

  const isTokenExpired = () => {
    if (!avitoIntegration?.token_expires_at) return true;
    return new Date(avitoIntegration.token_expires_at) < new Date();
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

      await onSave({
        name: formData.name,
        type: formData.type,
        address: formData.address || '',
        description: formData.description || '',
        max_guests: parseInt(formData.max_guests) || 2,
        bedrooms: parseInt(formData.bedrooms) || 1,
        base_price: parseFloat(formData.base_price) || 0,
        currency: formData.currency,
        minimum_booking_days: parseInt(formData.minimum_booking_days) || 1,
        status: formData.status,
      });

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
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
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
                      {avitoIntegration?.is_active && !isTokenExpired() ? (
                        <Badge status="success" text="синхронизировано" />
                      ) : (
                        <Badge status="default" text="отключено" />
                      )}
                    </div>
                  </div>

                  {avitoIntegration?.is_active && !isTokenExpired() ? (
                    <>
                      <div className="text-sm text-slate-400">
                        Последняя синхронизация: {formatDate(avitoIntegration.last_sync_at)}
                      </div>
                      <div className="text-sm text-slate-400">
                        Наценка: {avitoIntegration.avito_markup || 15}%
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleEditMarkup}>Редактировать наценку</Button>
                        <Button danger onClick={handleDisconnectAvito}>
                          Отключить
                        </Button>
                      </div>
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
              onChange={(value) => setNewMarkup(value || 15)}
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
