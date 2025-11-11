import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Property, supabase } from '../lib/supabase';

interface AddReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  properties: Property[];
  onAdd: (reservation: {
    property_id: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    total_price: number;
    currency: string;
    status: string;
    source: string;
    guests_count: number;
  }) => Promise<void>;
  selectedProperties?: string[];
  prefilledDates?: { propertyId: string; checkIn: string; checkOut: string } | null;
}

export function AddReservationModal({
  isOpen,
  onClose,
  properties,
  onAdd,
  selectedProperties = [],
  prefilledDates = null,
}: AddReservationModalProps) {
  const [formData, setFormData] = useState({
    property_id: selectedProperties[0] || '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    check_in: '',
    check_out: '',
    total_price: '',
    currency: 'EUR',
    status: 'confirmed',
    source: 'manual',
    guests_count: '1',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);

  useEffect(() => {
    if (prefilledDates) {
      setFormData(prev => ({
        ...prev,
        property_id: prefilledDates.propertyId,
        check_in: prefilledDates.checkIn,
        check_out: prefilledDates.checkOut,
      }));
      calculatePrice(prefilledDates.propertyId, prefilledDates.checkIn, prefilledDates.checkOut);
    }
  }, [prefilledDates]);

  useEffect(() => {
    if (formData.property_id && formData.check_in && formData.check_out) {
      calculatePrice(formData.property_id, formData.check_in, formData.check_out);
    }
  }, [formData.property_id, formData.check_in, formData.check_out]);

  const calculatePrice = async (propertyId: string, checkIn: string, checkOut: string) => {
    if (!propertyId || !checkIn || !checkOut) return;

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkOutDate <= checkInDate) return;

    setCalculatingPrice(true);
    try {
      const { data, error } = await supabase.rpc('calculate_booking_price', {
        p_property_id: propertyId,
        p_check_in: checkIn,
        p_check_out: checkOut,
      });

      if (error) throw error;

      if (data !== null) {
        const property = properties.find(p => p.id === propertyId);
        setFormData(prev => ({
          ...prev,
          total_price: data.toString(),
          currency: property?.currency || 'RUB',
        }));
      }
    } catch (err) {
      console.error('Error calculating price:', err);
    } finally {
      setCalculatingPrice(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!formData.property_id || !formData.guest_name || !formData.check_in || !formData.check_out) {
        setError('Please fill in all required fields');
        return;
      }

      const checkInDate = new Date(formData.check_in);
      const checkOutDate = new Date(formData.check_out);

      if (checkOutDate <= checkInDate) {
        setError('Check-out date must be after check-in date');
        return;
      }

      await onAdd({
        property_id: formData.property_id,
        guest_name: formData.guest_name,
        guest_email: formData.guest_email || `guest-${Date.now()}@rentlio.local`,
        guest_phone: formData.guest_phone || '',
        check_in: formData.check_in,
        check_out: formData.check_out,
        total_price: parseFloat(formData.total_price) || 0,
        currency: formData.currency,
        status: formData.status,
        source: formData.source,
        guests_count: parseInt(formData.guests_count) || 1,
      });

      setFormData({
        property_id: selectedProperties[0] || '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        check_in: '',
        check_out: '',
        total_price: '',
        currency: 'EUR',
        status: 'confirmed',
        source: 'manual',
        guests_count: '1',
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Add Reservation</h2>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Property *
              </label>
              <select
                value={formData.property_id}
                onChange={(e) =>
                  setFormData({ ...formData, property_id: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              >
                <option value="">Select property</option>
                {properties.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Guest Name *
              </label>
              <input
                type="text"
                value={formData.guest_name}
                onChange={(e) =>
                  setFormData({ ...formData, guest_name: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Guest Email
              </label>
              <input
                type="email"
                value={formData.guest_email}
                onChange={(e) =>
                  setFormData({ ...formData, guest_email: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="guest@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Guest Phone
              </label>
              <input
                type="tel"
                value={formData.guest_phone}
                onChange={(e) =>
                  setFormData({ ...formData, guest_phone: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="+1234567890"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Check-in *
              </label>
              <input
                type="date"
                value={formData.check_in}
                onChange={(e) =>
                  setFormData({ ...formData, check_in: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Check-out *
              </label>
              <input
                type="date"
                value={formData.check_out}
                onChange={(e) =>
                  setFormData({ ...formData, check_out: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Total Price {calculatingPrice && '(calculating...)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.total_price}
                onChange={(e) =>
                  setFormData({ ...formData, total_price: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="0.00"
                disabled={calculatingPrice}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Currency
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="RUB">RUB</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Guests Count
              </label>
              <input
                type="number"
                min="1"
                value={formData.guests_count}
                onChange={(e) =>
                  setFormData({ ...formData, guests_count: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
