import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, ArrowRight } from 'lucide-react';
import { parseExcelFile, type ParsedBooking } from '@/utils/excelParser';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ImportResult {
  imported: number;
  created_properties: number;
  errors: Array<{ row: number; message: string; property_name?: string }>;
}

const INSTRUCTION = `Мы не даём готовый шаблон — используй свой существующий файл Excel (.xlsx), где уже есть твои брони.

Система автоматически распознает объекты, гостей, даты, цены.

Рекомендуемые колонки (система постарается сопоставить даже если названия отличаются):
• Имя объекта / Адрес объекта
• Дата заезда (check_in)
• Дата выезда (check_out)
• Имя гостя
• Телефон / Email гостя
• Сумма / Цена
• Статус
• Источник (Avito / Direct и т.д.)`;

export function OnboardingImport() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedBookings, setParsedBookings] = useState<ParsedBooking[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setParsedBookings([]);
    setParseErrors([]);
    setImportResult(null);
    setImportSuccess(false);
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
      } else if (result.bookings.length > 0) {
        toast.success(`Распознано ${result.bookings.length} броней`);
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

  const handleImport = useCallback(async () => {
    if (parsedBookings.length === 0 || !user) return;

    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Необходима авторизация');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/import-bookings`;
      setImportProgress(30);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookings: parsedBookings }),
      });
      setImportProgress(70);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }));
        throw new Error(errorData.error || `Ошибка ${response.status}`);
      }

      const result: ImportResult = await response.json();
      setImportResult(result);
      setImportProgress(100);

      if (result.errors.length > 0) {
        toast.error(`Импорт заблокирован: найдено ${result.errors.length} пересечений дат`);
      } else {
        setImportSuccess(true);
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        toast.success(`Импортировано ${result.imported} броней!`, { duration: 5000 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при импорте');
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }, [parsedBookings, user]);

  const previewData = parsedBookings.slice(0, 10);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Загрузи свой Excel-файл с бронями</CardTitle>
            <CardDescription className="whitespace-pre-line text-left mt-2">
              {INSTRUCTION}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/50'
              } ${loading || importing ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <FileSpreadsheet className="h-12 w-12 text-primary mx-auto mb-2" />
              <p className="font-medium">{fileName || 'Нажмите или перетащите файл сюда'}</p>
              <p className="text-sm text-muted-foreground mt-1">Поддерживаются .xls и .xlsx</p>
            </div>

            {loading && (
              <div className="text-center py-4 text-muted-foreground">Парсинг файла...</div>
            )}

            {parseErrors.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-4">
                <p className="font-medium text-warning">Найдено {parseErrors.length} ошибок при парсинге</p>
                <div className="max-h-32 overflow-y-auto mt-2 text-sm space-y-1">
                  {parseErrors.slice(0, 5).map((e, i) => (
                    <div key={i}>Строка {e.row}: {e.message}</div>
                  ))}
                  {parseErrors.length > 5 && <div className="text-muted-foreground">... и ещё {parseErrors.length - 5}</div>}
                </div>
              </div>
            )}

            {parsedBookings.length > 0 && !importSuccess && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Распознано броней: {parsedBookings.length}
                  </p>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? 'Импорт...' : `Импортировать всё (${parsedBookings.length})`}
                  </Button>
                </div>
                {importing && <Progress value={importProgress} className="h-2" />}
                {importResult && importResult.errors.length > 0 && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
                    <p className="font-medium text-destructive">Импорт заблокирован: пересечения дат</p>
                    <div className="max-h-24 overflow-y-auto mt-2 text-sm space-y-1">
                      {importResult.errors.slice(0, 3).map((e, i) => (
                        <div key={i}>Строка {e.row}: {e.message}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border border-border rounded-md overflow-hidden max-h-[200px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Объект</TableHead>
                        <TableHead>Заезд</TableHead>
                        <TableHead>Выезд</TableHead>
                        <TableHead>Гость</TableHead>
                        <TableHead>Сумма</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((b, i) => (
                        <TableRow key={i}>
                          <TableCell>{b.property_name}</TableCell>
                          <TableCell>{new Date(b.start_date).toLocaleDateString('ru-RU')}</TableCell>
                          <TableCell>{new Date(b.end_date).toLocaleDateString('ru-RU')}</TableCell>
                          <TableCell>{b.guest_name}</TableCell>
                          <TableCell>{b.amount.toLocaleString('ru-RU')} ₽</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {parsedBookings.length > 10 && (
                  <div className="text-center py-2 text-sm text-muted-foreground border border-border rounded-md">
                    Показаны первые 10 из {parsedBookings.length}
                  </div>
                )}
              </>
            )}

            {importSuccess && importResult && (
              <div className="space-y-4">
                <p className="text-lg font-medium text-primary">
                  Импортировано {importResult.imported} броней. Можешь перейти в календарь или подключить Avito.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/">В календарь</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/">
                      Дальше — подключаем Avito
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            Пропустить и перейти в календарь
          </Link>
        </div>
      </div>
    </div>
  );
}
