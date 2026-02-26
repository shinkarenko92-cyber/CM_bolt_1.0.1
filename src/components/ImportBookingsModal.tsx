import { useState, useCallback, useRef } from 'react';
import { X, Upload, FileSpreadsheet } from 'lucide-react';
import { parseExcelFile, type ParsedBooking } from '../utils/excelParser';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedBookings, setParsedBookings] = useState<ParsedBooking[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setParsedBookings([]);
    setParseErrors([]);
    setImportResult(null);
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.xls') && !fileNameLower.endsWith('.xlsx')) {
      toast.error('Файл должен быть в формате .xls или .xlsx');
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const result = await parseExcelFile(file);
      setParsedBookings(result.bookings);
      setParseErrors(result.errors);
      if (result.errors.length > 0) {
        toast(`Найдено ${result.errors.length} ошибок при парсинге`, { icon: '⚠️' });
      } else {
        toast.success(`Успешно распознано ${result.bookings.length} броней`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при чтении файла');
      setFileName(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

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
        toast.error(`Импорт заблокирован: найдено ${result.errors.length} пересечений дат`);
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
      toast.error(
        error instanceof Error ? error.message : 'Ошибка при импорте'
      );
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }, [parsedBookings, user, onSuccess, onClose]);

  const handleClose = () => {
    if (importing) return;
    setFileName(null);
    setParsedBookings([]);
    setParseErrors([]);
    setImportResult(null);
    onClose();
  };

  const stats = {
    total: parsedBookings.length,
    revenue: parsedBookings.reduce((sum, b) => sum + b.amount, 0),
    uniqueProperties: new Set(parsedBookings.map(b => b.property_name)).size,
  };

  const previewData = parsedBookings.slice(0, 20);

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
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading || importing}
            />
            <div
              role="button"
              tabIndex={0}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/50'
              } ${loading || importing ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <FileSpreadsheet size={48} className="mx-auto text-primary mb-2" />
              <p className="font-medium text-foreground">
                {fileName || 'Нажмите или перетащите файл сюда для загрузки'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Поддерживаются файлы .xls и .xlsx</p>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-8">
              <div className="text-slate-400">Парсинг файла...</div>
            </div>
          )}

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="mb-4 rounded-md border border-warning/50 bg-warning/10 p-4">
              <p className="font-medium text-warning">Найдено {parseErrors.length} ошибок при парсинге</p>
              <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                {parseErrors.slice(0, 10).map((error, idx) => (
                  <div key={idx} className="text-sm text-muted-foreground">
                    Строка {error.row}: {error.message}
                  </div>
                ))}
                {parseErrors.length > 10 && (
                  <div className="text-sm text-muted-foreground mt-2">... и еще {parseErrors.length - 10} ошибок</div>
                )}
              </div>
            </div>
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
              <div className="rounded-lg border border-border overflow-hidden max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Объект</TableHead>
                      <TableHead>Заезд</TableHead>
                      <TableHead>Выезд</TableHead>
                      <TableHead>Гость</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Сумма</TableHead>
                      <TableHead>Источник</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((booking, index) => (
                      <TableRow key={index}>
                        <TableCell>{booking.property_name}</TableCell>
                        <TableCell>{new Date(booking.start_date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell>{new Date(booking.end_date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell>{booking.guest_name}</TableCell>
                        <TableCell>{booking.guest_phone || '—'}</TableCell>
                        <TableCell>{booking.amount.toLocaleString('ru-RU')} ₽</TableCell>
                        <TableCell>{booking.channel.charAt(0).toUpperCase() + booking.channel.slice(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Import Errors (Overlaps) */}
          {importResult && importResult.errors.length > 0 && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4">
              <p className="font-medium text-destructive">Импорт заблокирован: найдены пересечения дат</p>
              <div className="max-h-60 overflow-y-auto mt-2 space-y-2">
                {importResult.errors.map((error, idx) => (
                  <div key={idx} className="text-sm text-muted-foreground">
                    <div className="font-medium text-foreground">
                      Строка {error.row} ({error.property_name || 'Неизвестный объект'}):
                    </div>
                    <div className="ml-4">{error.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import Progress */}
          {importing && (
            <div className="mb-4">
              <Progress value={importProgress} className="h-2" />
              <div className="text-center text-muted-foreground mt-2">Импорт броней...</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Отмена
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedBookings.length === 0 || loading || importing}
          >
            <Upload size={16} />
            Импортировать всё ({parsedBookings.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
