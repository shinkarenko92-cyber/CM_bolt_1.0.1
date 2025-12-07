import { useState, useEffect } from 'react';
import { X, Home, Settings, Link2, DollarSign } from 'lucide-react';
import { Property } from '../lib/supabase';
import { ApiIntegrationSettings } from './ApiIntegrationSettings';

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
  const [activeTab, setActiveTab] = useState<'info' | 'params' | 'pricing' | 'integrations'>('info');

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
    setActiveTab('info');
  }, [property, isOpen]);

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
        // В БД address сейчас NOT NULL, поэтому при пустом значении шлём пустую строку
        address: formData.address || '',
        // Для описания тоже безопаснее слать строку, а не null
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
          <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex border-b border-slate-700">
              <button
                onClick={() => setActiveTab('info')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'info'
                    ? 'text-teal-400 border-b-2 border-teal-400 -mb-px'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Home className="w-4 h-4" />
                Основное
              </button>
              <button
                onClick={() => setActiveTab('params')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'params'
                    ? 'text-teal-400 border-b-2 border-teal-400 -mb-px'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" />
                Параметры
              </button>
              <button
                onClick={() => setActiveTab('pricing')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'pricing'
                    ? 'text-teal-400 border-b-2 border-teal-400 -mb-px'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                Цены
              </button>
              <button
                onClick={() => setActiveTab('integrations')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'integrations'
                    ? 'text-teal-400 border-b-2 border-teal-400 -mb-px'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Link2 className="w-4 h-4" />
                API интеграции
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto">
              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
                  {error}
                </div>
              )}

              {/* Tab: Info */}
              {activeTab === 'info' && (
                <div className="space-y-4">
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

                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Адрес</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                      placeholder="Улица, дом, квартира"
                    />
                  </div>

                  <div>
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
              )}

              {/* Tab: Params */}
              {activeTab === 'params' && (
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
              )}

              {/* Tab: Pricing */}
              {activeTab === 'pricing' && (
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
              )}

              {/* Tab: Integrations */}
              {activeTab === 'integrations' && property && (
                <ApiIntegrationSettings property={property} />
              )}
              
              {activeTab === 'integrations' && !property && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-300 text-sm">
                    Сначала сохраните объект, чтобы настроить интеграции с площадками.
                  </p>
                </div>
              )}

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
          </div>
        )}
      </div>
    </div>
  );
}
