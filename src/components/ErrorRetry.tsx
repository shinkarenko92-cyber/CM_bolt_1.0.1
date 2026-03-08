import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface ErrorRetryProps {
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function ErrorRetry({ message, onRetry, isRetrying = false }: ErrorRetryProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
      <AlertTriangle className="h-10 w-10 text-destructive/70" />
      <div>
        <p className="text-sm font-medium text-foreground">
          {message ?? t('common.loadError', { defaultValue: 'Ошибка загрузки данных' })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('common.tryAgainLater', { defaultValue: 'Проверьте соединение и попробуйте снова' })}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
        <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
        {t('common.retry', { defaultValue: 'Повторить' })}
      </Button>
    </div>
  );
}
