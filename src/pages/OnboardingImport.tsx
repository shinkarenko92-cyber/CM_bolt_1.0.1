import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Upload as AntUpload, Table, Button, Progress, Alert } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { FileSpreadsheet, ArrowRight } from 'lucide-react';
import { parseExcelFile, type ParsedBooking } from '../utils/excelParser';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button as ShadcnButton } from '../components/ui/button';

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
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [parsedBookings, setParsedBookings] = useState<ParsedBooking[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleFileChange: UploadProps['onChange'] = async ({ fileList: newFileList }) => {
    setFileList(newFileList);
    setParsedBookings([]);
    setParseErrors([]);
    setImportResult(null);
    setImportSuccess(false);

    if (newFileList.length === 0) return;

    const file = newFileList[0].originFileObj;
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
      toast.error('Файл должен быть в формате .xls или .xlsx');
      setFileList([]);
      return;
    }

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
      setFileList([]);
    } finally {
      setLoading(false);
    }
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

  const previewData = parsedBookings.slice(0, 10).map((b, i) => ({
    key: i,
    ...b,
  }));

  const columns = [
    { title: 'Объект', dataIndex: 'property_name', key: 'property_name' },
    { title: 'Заезд', dataIndex: 'start_date', key: 'start_date', render: (d: string) => new Date(d).toLocaleDateString('ru-RU') },
    { title: 'Выезд', dataIndex: 'end_date', key: 'end_date', render: (d: string) => new Date(d).toLocaleDateString('ru-RU') },
    { title: 'Гость', dataIndex: 'guest_name', key: 'guest_name' },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', render: (a: number) => `${a.toLocaleString('ru-RU')} ₽` },
  ];

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
            <AntUpload.Dragger
              accept=".xls,.xlsx"
              fileList={fileList}
              onChange={handleFileChange}
              beforeUpload={() => false}
              maxCount={1}
              disabled={loading || importing}
            >
              <p className="ant-upload-drag-icon flex justify-center">
                <FileSpreadsheet className="h-12 w-12 text-primary" />
              </p>
              <p className="ant-upload-text">Нажмите или перетащите файл сюда</p>
              <p className="ant-upload-hint text-muted-foreground">Поддерживаются .xls и .xlsx</p>
            </AntUpload.Dragger>

            {loading && (
              <div className="text-center py-4 text-muted-foreground">Парсинг файла...</div>
            )}

            {parseErrors.length > 0 && (
              <Alert
                message={`Найдено ${parseErrors.length} ошибок при парсинге`}
                description={
                  <div className="max-h-32 overflow-y-auto mt-2 text-sm">
                    {parseErrors.slice(0, 5).map((e, i) => (
                      <div key={i}>Строка {e.row}: {e.message}</div>
                    ))}
                    {parseErrors.length > 5 && `... и ещё ${parseErrors.length - 5}`}
                  </div>
                }
                type="warning"
                showIcon
              />
            )}

            {parsedBookings.length > 0 && !importSuccess && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Распознано броней: {parsedBookings.length}
                  </p>
                  <Button
                    type="primary"
                    onClick={handleImport}
                    disabled={importing}
                    loading={importing}
                  >
                    Импортировать всё ({parsedBookings.length})
                  </Button>
                </div>
                {importing && (
                  <Progress percent={importProgress} status="active" />
                )}
                {importResult && importResult.errors.length > 0 && (
                  <Alert
                    message="Импорт заблокирован: пересечения дат"
                    description={
                      <div className="max-h-24 overflow-y-auto mt-2 text-sm">
                        {importResult.errors.slice(0, 3).map((e, i) => (
                          <div key={i}>Строка {e.row}: {e.message}</div>
                        ))}
                      </div>
                    }
                    type="error"
                    showIcon
                  />
                )}
                <div className="border rounded-md overflow-hidden">
                  <Table
                    dataSource={previewData}
                    columns={columns}
                    pagination={false}
                    size="small"
                    scroll={{ y: 200 }}
                  />
                  {parsedBookings.length > 10 && (
                    <div className="text-center py-2 text-sm text-muted-foreground border-t">
                      Показаны первые 10 из {parsedBookings.length}
                    </div>
                  )}
                </div>
              </>
            )}

            {importSuccess && importResult && (
              <div className="space-y-4">
                <p className="text-lg font-medium text-primary">
                  Импортировано {importResult.imported} броней. Можешь перейти в календарь или подключить Avito.
                </p>
                <div className="flex flex-wrap gap-3">
                  <ShadcnButton asChild>
                    <Link to="/">В календарь</Link>
                  </ShadcnButton>
                  <ShadcnButton variant="outline" asChild>
                    <Link to="/">
                      Дальше — подключаем Avito
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </ShadcnButton>
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
