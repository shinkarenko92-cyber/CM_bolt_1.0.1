import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase, Property } from '../lib/supabase';

interface ChangeConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  startDate: string;
  endDate: string;
  currentPrice: number;
  currentMinStay: number;
  currency: string;
  properties?: Property[];
}

export function ChangeConditionsModal({
  isOpen,
  onClose,
  propertyId,
  startDate,
  endDate,
  currentPrice,
  currentMinStay,
  currency,
  properties = [],
}: ChangeConditionsModalProps) {
  const [formData, setFormData] = useState({
    selectedPropertyId: propertyId,
    startDate: startDate,
    endDate: endDate,
    dailyPrice: currentPrice.toString(),
    minStay: currentMinStay.toString(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        selectedPropertyId: propertyId,
        startDate: startDate,
        endDate: endDate,
        dailyPrice: currentPrice.toString(),
        minStay: currentMinStay.toString(),
      });
      setError(null);
    }
  }, [isOpen, propertyId, startDate, endDate, currentPrice, currentMinStay]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const dailyPrice = parseFloat(formData.dailyPrice);
      const minStay = parseInt(formData.minStay, 10);

      if (!formData.selectedPropertyId) {
        setError('Пожалуйста, выберите объект');
        setLoading(false);
        return;
      }

      if (!formData.startDate || !formData.endDate) {
        setError('Пожалуйста, выберите даты');
        setLoading(false);
        return;
      }

      if (new Date(formData.startDate) > new Date(formData.endDate)) {
        setError('Дата начала не может быть позже даты окончания');
        setLoading(false);
        return;
      }

      if (isNaN(dailyPrice) || dailyPrice < 0) {
        setError('Пожалуйста, введите корректную цену');
        setLoading(false);
        return;
      }

      if (isNaN(minStay) || minStay < 1) {
        setError('Минимальный срок бронирования должен быть не менее 1 дня');
        setLoading(false);
        return;
      }

      const selectedProperty = properties.find(p => p.id === formData.selectedPropertyId);
      const propertyCurrency = selectedProperty?.currency || currency;

      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const dates: string[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      const rateRecords = dates.map((date) => ({
        property_id: formData.selectedPropertyId,
        date,
        daily_price: dailyPrice,
        min_stay: minStay,
        currency: propertyCurrency,
      }));

      const { error: upsertError } = await supabase
        .from('property_rates')
        .upsert(rateRecords, {
          onConflict: 'property_id,date',
        });

      if (upsertError) throw upsertError;

      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getDaysCount = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    return Math.ceil(
      (new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  };

  const daysCount = getDaysCount();
  const selectedProperty = properties.find(p => p.id === formData.selectedPropertyId);
  const displayCurrency = selectedProperty?.currency || currency;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-lg w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Изменить условия</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {properties.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Объект
              </label>
              <select
                value={formData.selectedPropertyId}
                onChange={(e) => {
                  const prop = properties.find(p => p.id === e.target.value);
                  setFormData({ 
                    ...formData, 
                    selectedPropertyId: e.target.value,
                    dailyPrice: prop?.base_price.toString() || formData.dailyPrice,
                    minStay: prop?.minimum_booking_days.toString() || formData.minStay,
                  });
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                {properties.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Дата начала
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Дата окончания
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              />
            </div>
          </div>

          {daysCount > 0 && (
            <div className="text-sm text-slate-400">
              Период: {daysCount} {daysCount === 1 ? 'день' : daysCount < 5 ? 'дня' : 'дней'}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Цена за ночь
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.dailyPrice}
                onChange={(e) => setFormData({ ...formData, dailyPrice: e.target.value })}
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="0.00"
                required
              />
              <span className="text-slate-400">{displayCurrency}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Минимальный срок бронирования (ночей)
            </label>
            <input
              type="number"
              min="1"
              value={formData.minStay}
              onChange={(e) => setFormData({ ...formData, minStay: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              required
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
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
        </form>
      </div>
    </div>
  );
}
