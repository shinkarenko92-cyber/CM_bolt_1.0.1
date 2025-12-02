import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Booking, Property, supabase } from '../lib/supabase';
import { PriceRecalculationModal } from './PriceRecalculationModal';

interface EditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  properties: Property[];
  onUpdate: (id: string, data: Partial<Booking>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EditReservationModal({
  isOpen,
  onClose,
  booking,
  properties,
  onUpdate,
  onDelete,
}: EditReservationModalProps) {
  const [formData, setFormData] = useState({
    property_id: '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    check_in: '',
    check_out: '',
    total_price: '',
    currency: 'RUB',
    status: 'confirmed',
    guests_count: '1',
  });
  const [originalPropertyId, setOriginalPropertyId] = useState('');
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const [, setPendingPropertyChange] = useState(false);

  useEffect(() => {
    if (booking) {
      setFormData({
        property_id: booking.property_id || '',
        guest_name: booking.guest_name || '',
        guest_email: booking.guest_email || '',
        guest_phone: booking.guest_phone || '',
        check_in: booking.check_in || '',
        check_out: booking.check_out || '',
        total_price: booking.total_price?.toString() || '',
        currency: booking.currency || 'RUB',
        status: booking.status || 'confirmed',
        guests_count: booking.guests_count?.toString() || '1',
      });
      setOriginalPropertyId(booking.property_id);
    }
  }, [booking]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!booking) return null;

  const calculateNewPrice = async (propertyId: string, checkIn: string, checkOut: string): Promise<number> => {
    const property = properties.find(p => p.id === propertyId);
    if (!property) return 0;

    const { data: rates } = await supabase
      .from('property_rates')
      .select('*')
      .eq('property_id', propertyId);

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    let total = 0;
    const current = new Date(start);

    while (current < end) {
      const dateStr = current.toISOString().split('T')[0];
      const rate = rates?.find(r => r.date === dateStr);
      total += rate?.daily_price || property.base_price;
      current.setDate(current.getDate() + 1);
    }

    return total;
  };

  const handlePropertyChange = async (newPropertyId: string) => {
    if (newPropertyId !== originalPropertyId) {
      const newPrice = await calculateNewPrice(newPropertyId, formData.check_in, formData.check_out);
      setCalculatedPrice(newPrice);
      setPendingPropertyChange(true);
      setShowPriceModal(true);
      setFormData({ ...formData, property_id: newPropertyId });
    } else {
      setFormData({ ...formData, property_id: newPropertyId });
    }
  };

  const handleKeepPrice = () => {
    setShowPriceModal(false);
    setPendingPropertyChange(false);
  };

  const handleRecalculatePrice = () => {
    const newProperty = properties.find(p => p.id === formData.property_id);
    setFormData({
      ...formData,
      total_price: calculatedPrice.toString(),
      currency: newProperty?.currency || formData.currency,
    });
    setShowPriceModal(false);
    setPendingPropertyChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const checkInDate = new Date(formData.check_in);
      const checkOutDate = new Date(formData.check_out);

      if (checkOutDate <= checkInDate) {
        setError('Check-out date must be after check-in date');
        return;
      }

      await onUpdate(booking.id, {
        property_id: formData.property_id,
        guest_name: formData.guest_name,
        guest_email: formData.guest_email,
        guest_phone: formData.guest_phone,
        check_in: formData.check_in,
        check_out: formData.check_out,
        total_price: parseFloat(formData.total_price) || 0,
        currency: formData.currency,
        status: formData.status,
        guests_count: parseInt(formData.guests_count) || 1,
      } as Partial<Booking>);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setLoading(true);

    try {
      await onDelete(booking.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const propertyName = properties.find((p) => p.id === booking.property_id)?.name || 'Unknown Property';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Reservation</h2>
            <p className="text-sm text-slate-400 mt-1">{propertyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        {showDeleteConfirm ? (
          <div className="p-6 border-b border-slate-700">
            <p className="text-white mb-4">Are you sure you want to delete this reservation?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Property
              </label>
              <select
                value={formData.property_id}
                onChange={(e) => handlePropertyChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Guest Name
                </label>
                <input
                  type="text"
                  value={formData.guest_name}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_name: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
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
                />
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

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Check-in
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
                  Check-out
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
                  Total Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_price}
                  onChange={(e) =>
                    setFormData({ ...formData, total_price: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
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

              <div className="col-span-2">
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
            </div>

            <div className="flex gap-3 justify-between pt-4 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded transition"
                disabled={loading}
              >
                Delete
              </button>
              <div className="flex gap-3">
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
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <PriceRecalculationModal
        isOpen={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        onKeepPrice={handleKeepPrice}
        onRecalculate={handleRecalculatePrice}
        booking={booking}
        oldProperty={properties.find(p => p.id === originalPropertyId) || null}
        newProperty={properties.find(p => p.id === formData.property_id) || null}
        calculatedPrice={calculatedPrice}
      />
    </div>
  );
}
