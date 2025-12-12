import { X } from 'lucide-react';
import { Property, Booking } from '../lib/supabase';

interface PriceRecalculationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeepPrice: () => void;
  onRecalculate: () => void;
  booking: Booking | null;
  oldProperty: Property | null;
  newProperty: Property | null;
  calculatedPrice: number;
}

export function PriceRecalculationModal({
  isOpen,
  onClose,
  onKeepPrice,
  onRecalculate,
  booking,
  oldProperty,
  newProperty,
  calculatedPrice,
}: PriceRecalculationModalProps) {
  if (!isOpen || !booking || !oldProperty || !newProperty) return null;

  const nights = Math.ceil(
    (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) /
      (1000 * 60 * 60 * 24)
  );

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
        className="bg-slate-800 rounded-lg shadow-lg w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Изменить цену?</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-slate-300 mb-6">
            Вы меняете объект бронирования. Хотите пересчитать цену на основе тарифов нового объекта или оставить текущую цену?
          </p>

          <div className="space-y-4 mb-6">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-2">Старый объект</div>
              <div className="text-white font-semibold">{oldProperty.name}</div>
              <div className="text-sm text-slate-400 mt-1">
                Базовый тариф: {oldProperty.base_price} {oldProperty.currency}/ночь
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-2">Новый объект</div>
              <div className="text-white font-semibold">{newProperty.name}</div>
              <div className="text-sm text-slate-400 mt-1">
                Базовый тариф: {newProperty.base_price} {newProperty.currency}/ночь
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4 border-2 border-teal-500/30">
              <div className="text-sm text-slate-400 mb-2">Текущая цена брони</div>
              <div className="text-2xl text-white font-bold">
                {booking.total_price} {booking.currency}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {nights} ночей × {(booking.total_price / nights).toFixed(0)} {booking.currency}/ночь
              </div>
            </div>

            <div className="bg-teal-600/20 rounded-lg p-4 border-2 border-teal-500/50">
              <div className="text-sm text-teal-400 mb-2">Рассчитанная цена для нового объекта</div>
              <div className="text-2xl text-teal-300 font-bold">
                {calculatedPrice} {newProperty.currency}
              </div>
              <div className="text-sm text-teal-400 mt-1">
                {nights} ночей × {(calculatedPrice / nights).toFixed(0)} {newProperty.currency}/ночь
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onKeepPrice}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
            >
              Оставить текущую цену
            </button>
            <button
              onClick={onRecalculate}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded transition"
            >
              Пересчитать цену
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
