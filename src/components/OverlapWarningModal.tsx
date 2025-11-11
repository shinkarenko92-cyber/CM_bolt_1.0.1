import { AlertTriangle } from 'lucide-react';

interface OverlapWarningModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onGoBack: () => void;
  overlappingBookings: Array<{
    guest_name: string;
    check_in: string;
    check_out: string;
  }>;
}

export function OverlapWarningModal({
  isOpen,
  onContinue,
  onGoBack,
  overlappingBookings,
}: OverlapWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white mb-2">
                Даты заняты
              </h2>
              <p className="text-slate-300 mb-4">
                В выбранные даты уже есть бронирования:
              </p>
              <div className="bg-slate-700 rounded p-3 mb-4 space-y-2">
                {overlappingBookings.map((booking, idx) => (
                  <div key={idx} className="text-sm text-slate-300">
                    <div className="font-medium">{booking.guest_name}</div>
                    <div className="text-slate-400">
                      {new Date(booking.check_in).toLocaleDateString('ru-RU')} -{' '}
                      {new Date(booking.check_out).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-slate-400 text-sm">
                Вы можете вернуться и изменить даты, или продолжить создание брони.
                При продолжении бронь будет отображаться ниже существующей.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end p-6 border-t border-slate-700">
          <button
            onClick={onGoBack}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
          >
            Назад
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition"
          >
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
