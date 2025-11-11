import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { PropertyRate } from '../lib/supabase';

type RateCellProps = {
  date: Date;
  propertyId: string;
  rate: PropertyRate | null;
  basePrice: number;
  baseCurrency: string;
  baseMinStay: number;
  onSave: (date: string, dailyPrice: number, minStay: number) => Promise<void>;
};

export function RateCell({
  date,
  propertyId,
  rate,
  basePrice,
  baseCurrency,
  baseMinStay,
  onSave,
}: RateCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [price, setPrice] = useState(rate?.daily_price.toString() || basePrice.toString());
  const [minStay, setMinStay] = useState(rate?.min_stay.toString() || baseMinStay.toString());
  const [isSaving, setIsSaving] = useState(false);

  const displayPrice = rate?.daily_price || basePrice;
  const displayMinStay = rate?.min_stay || baseMinStay;
  const displayCurrency = rate?.currency || baseCurrency;

  const handleDoubleClick = () => {
    setIsEditing(true);
    setPrice(displayPrice.toString());
    setMinStay(displayMinStay.toString());
  };

  const handleSave = async () => {
    const numPrice = parseFloat(price);
    const numMinStay = parseInt(minStay, 10);

    if (isNaN(numPrice) || numPrice < 0) {
      alert('Please enter a valid price');
      return;
    }

    if (isNaN(numMinStay) || numMinStay < 1) {
      alert('Minimum stay must be at least 1 day');
      return;
    }

    setIsSaving(true);
    try {
      const dateString = date.toISOString().split('T')[0];
      await onSave(dateString, numPrice, numMinStay);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving rate:', error);
      alert('Failed to save rate. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setPrice(displayPrice.toString());
    setMinStay(displayMinStay.toString());
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1 bg-slate-700 rounded">
        <div className="flex flex-col gap-1">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-16 px-1 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            placeholder="Price"
            min="0"
            step="0.01"
            autoFocus
          />
          <input
            type="number"
            value={minStay}
            onChange={(e) => setMinStay(e.target.value)}
            className="w-16 px-1 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            placeholder="Min"
            min="1"
            step="1"
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="p-1 bg-teal-600 hover:bg-teal-700 rounded text-white disabled:opacity-50"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="p-1 bg-slate-600 hover:bg-slate-500 rounded text-white disabled:opacity-50"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="px-2 py-1 text-center cursor-pointer hover:bg-slate-700/50 transition-colors"
      title="Double-click to edit rate"
    >
      <div className="text-xs font-medium text-slate-300">
        {displayPrice} {displayCurrency}
      </div>
      <div className="text-[10px] text-slate-500">
        {displayMinStay}n min
      </div>
    </div>
  );
}
