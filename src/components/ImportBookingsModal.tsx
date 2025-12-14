import { useState, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Upload as AntUpload, Table, Button, Progress, Alert, message } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { parseExcelFile, type ParsedBooking } from '../utils/excelParser';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';

interface ImportBookingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportResult {
  imported: number;
  created_properties: number;
  errors: Array<{ row: number; message: string; property_name?: string }>;
}

export function ImportBookingsModal({ isOpen, onClose, onSuccess }: ImportBookingsModalProps) {
  const { user } = useAuth();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [parsedBookings, setParsedBookings] = useState<ParsedBooking[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileChange: UploadProps['onChange'] = async ({ fileList: newFileList }) => {
    setFileList(newFileList);
    setParsedBookings([]);
    setParseErrors([]);
    setImportResult(null);

    if (newFileList.length === 0) {
      return;
    }

    const file = newFileList[0].originFileObj;
    if (!file) {
      return;
    }

    // Проверяем расширение файла
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
      message.error('Файл должен быть в формате .xls или .xlsx');
      setFileList([]);
      return;
    }

    setLoading(true);
    try {
      const result = await parseExcelFile(file);
      setParsedBookings(result.bookings);
      setParseErrors(result.errors);

      if (result.errors.length > 0) {
        message.warning(`Найдено ${result.errors.length} ошибок при парсинге`);
      } else {
        message.success(`Успешно распознано ${result.bookings.length} броней`);
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Ошибка при чтении файла'
      );
      setFileList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = useCallback(async () => {
    if (parsedBookings.length === 0 || !user) {
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      // Получаем сессию для передачи в Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Необходима авторизация');
      }

      // Вызываем Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/import-bookings`;

      setImportProgress(30);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          bookings: parsedBookings,
        }),
      });

      setImportProgress(60);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }));
        throw new Error(errorData.error || `Ошибка ${response.status}`);
      }

      const result: ImportResult = await response.json();
      setImportResult(result);
      setImportProgress(100);

      if (result.errors.length > 0) {
        // Есть ошибки overlaps - блокируем импорт
        message.error(`Импорт заблокирован: найдено ${result.errors.length} пересечений дат`);
      } else {
        // Успешный импорт
        const totalRevenue = parsedBookings.reduce((sum, b) => sum + b.amount, 0);
        
        // Запускаем конфетти
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });

        toast.success(
          `Готово! Импортировано ${result.imported} броней на ${totalRevenue.toLocaleString('ru-RU')} руб. Твой портфель теперь в Roomi.`,
          { duration: 5000 }
        );

        // Закрываем модалку и обновляем данные
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Ошибка при импорте'
      );
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }, [parsedBookings, user, onSuccess, onClose]);

  const handleClose = () => {
    if (importing) {
      return; // Не закрываем во время импорта
    }
    setFileList([]);
    setParsedBookings([]);
    setParseErrors([]);
    setImportResult(null);
    onClose();
  };

  // Подсчет статистики
  const stats = {
    total: parsedBookings.length,
    revenue: parsedBookings.reduce((sum, b) => sum + b.amount, 0),
    uniqueProperties: new Set(parsedBookings.map(b => b.property_name)).size,
  };

  // Preview таблица (первые 20 строк)
  const previewData = parsedBookings.slice(0, 20).map((booking, index) => ({
    key: index,
    ...booking,
  }));

  const columns = [
    {
      title: 'Объект',
      dataIndex: 'property_name',
      key: 'property_name',
    },
    {
      title: 'Заезд',
      dataIndex: 'start_date',
      key: 'start_date',
      render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
    },
    {
      title: 'Выезд',
      dataIndex: 'end_date',
      key: 'end_date',
      render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
    },
    {
      title: 'Гость',
      dataIndex: 'guest_name',
      key: 'guest_name',
    },
    {
      title: 'Телефон',
      dataIndex: 'guest_phone',
      key: 'guest_phone',
      render: (phone: string | null) => phone || '-',
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `${amount.toLocaleString('ru-RU')} ₽`,
    },
    {
      title: 'Источник',
      dataIndex: 'channel',
      key: 'channel',
      render: (channel: string) => channel.charAt(0).toUpperCase() + channel.slice(1),
    },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Импорт броней из Excel</h2>
            <p className="text-slate-400 text-sm mt-1">
              Экспортируй все брони из RealtyCalendar → Загрузи файл сюда
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            className="text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Upload Zone */}
          <div className="mb-6">
            <AntUpload.Dragger
              accept=".xls,.xlsx"
              fileList={fileList}
              onChange={handleFileChange}
              beforeUpload={() => false} // Отключаем автоматическую загрузку
              maxCount={1}
              disabled={loading || importing}
            >
              <p className="ant-upload-drag-icon flex justify-center">
                <FileSpreadsheet size={48} className="text-teal-500" />
              </p>
              <p className="ant-upload-text text-white">
                Нажмите или перетащите файл сюда для загрузки
              </p>
              <p className="ant-upload-hint text-slate-400">
                Поддерживаются файлы .xls и .xlsx
              </p>
            </AntUpload.Dragger>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-8">
              <div className="text-slate-400">Парсинг файла...</div>
            </div>
          )}

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <Alert
              message={`Найдено ${parseErrors.length} ошибок при парсинге`}
              description={
                <div className="max-h-40 overflow-y-auto mt-2">
                  {parseErrors.slice(0, 10).map((error, idx) => (
                    <div key={idx} className="text-sm text-slate-300">
                      Строка {error.row}: {error.message}
                    </div>
                  ))}
                  {parseErrors.length > 10 && (
                    <div className="text-sm text-slate-400 mt-2">
                      ... и еще {parseErrors.length - 10} ошибок
                    </div>
                  )}
                </div>
              }
              type="warning"
              showIcon
              className="mb-4"
            />
          )}

          {/* Preview Table */}
          {parsedBookings.length > 0 && (
            <div className="mb-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white mb-2">Предпросмотр</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-slate-400 text-sm">Всего броней</div>
                    <div className="text-2xl font-bold text-white">{stats.total}</div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-slate-400 text-sm">Сумма</div>
                    <div className="text-2xl font-bold text-teal-400">
                      {stats.revenue.toLocaleString('ru-RU')} ₽
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-slate-400 text-sm">Уникальных объектов</div>
                    <div className="text-2xl font-bold text-white">{stats.uniqueProperties}</div>
                  </div>
                </div>
                {parsedBookings.length > 20 && (
                  <div className="text-slate-400 text-sm mb-2">
                    Показаны первые 20 из {parsedBookings.length} броней
                  </div>
                )}
              </div>
              <div className="bg-slate-900 rounded-lg overflow-hidden">
                <Table
                  columns={columns}
                  dataSource={previewData}
                  pagination={false}
                  scroll={{ y: 400 }}
                  size="small"
                />
              </div>
            </div>
          )}

          {/* Import Errors (Overlaps) */}
          {importResult && importResult.errors.length > 0 && (
            <Alert
              message="Импорт заблокирован: найдены пересечения дат"
              description={
                <div className="max-h-60 overflow-y-auto mt-2">
                  {importResult.errors.map((error, idx) => (
                    <div key={idx} className="text-sm text-slate-300 mb-2">
                      <div className="font-medium">
                        Строка {error.row} ({error.property_name || 'Неизвестный объект'}):
                      </div>
                      <div className="ml-4">{error.message}</div>
                    </div>
                  ))}
                </div>
              }
              type="error"
              showIcon
              className="mb-4"
            />
          )}

          {/* Import Progress */}
          {importing && (
            <div className="mb-4">
              <Progress percent={importProgress} status="active" />
              <div className="text-center text-slate-400 mt-2">Импорт броней...</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <Button onClick={handleClose} disabled={importing}>
            Отмена
          </Button>
          <Button
            type="primary"
            onClick={handleImport}
            disabled={parsedBookings.length === 0 || loading || importing}
            icon={<Upload size={16} />}
            loading={importing}
          >
            Импортировать всё ({parsedBookings.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
