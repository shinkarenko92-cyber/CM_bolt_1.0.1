/**
 * Avito Error Modal Component
 * Displays detailed information about Avito API errors
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { getDisplayMessage, type AvitoErrorInfo } from '../services/avitoErrors';

interface AvitoErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: AvitoErrorInfo;
  onRetry?: () => void;
}

export function AvitoErrorModal({
  isOpen,
  onClose,
  error,
  onRetry,
}: AvitoErrorModalProps) {
  const { t } = useTranslation();

  const recommendations = getRecommendations(error, t);
  const operationKey = `avito.errors.${error.operation}`;
  const operationName = t(operationKey, { defaultValue: error.operation });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {t('avito.errors.syncFailed', { defaultValue: 'Ошибка синхронизации с Avito' })}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div>
            <strong>{t('avito.errors.operation', { defaultValue: 'Операция' })}:</strong> {operationName}
          </div>
          <div>
            <strong>{t('avito.errors.message', { defaultValue: 'Сообщение' })}:</strong> {getDisplayMessage(error, t)}
          </div>
          {error.statusCode && (
            <div>
              <strong>{t('avito.errors.statusCode', { defaultValue: 'Код статуса' })}:</strong> {error.statusCode}
            </div>
          )}
          {error.errorCode && (
            <div>
              <strong>{t('avito.errors.errorCode', { defaultValue: 'Код ошибки' })}:</strong> {error.errorCode}
            </div>
          )}
          {error.details ? (() => {
            const detailsString: string = typeof error.details === 'string'
              ? error.details
              : JSON.stringify(error.details, null, 2);
            return (
              <div>
                <strong>{t('avito.errors.details', { defaultValue: 'Детали ошибки' })}:</strong>
                <pre className="mt-1 rounded bg-slate-800 p-2 text-xs text-slate-100 max-h-[200px] overflow-auto">
                  {detailsString}
                </pre>
              </div>
            );
          })() : null}
          {recommendations.length > 0 && (
            <div className="pt-4">
              <strong>{t('avito.errors.recommendationsTitle', { defaultValue: 'Рекомендации' })}:</strong>
              <ul className="mt-2 list-inside list-disc space-y-1 pl-0">
                {recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onRetry && (
            <Button
              onClick={() => {
                onRetry();
                onClose();
              }}
            >
              {t('common.retry', { defaultValue: 'Повторить' })}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.close', { defaultValue: 'Закрыть' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Get recommendations based on error type
 */
function getRecommendations(error: AvitoErrorInfo, t: (key: string, options?: { defaultValue?: string }) => string): string[] {
  const recommendations: string[] = [];
  const { statusCode, errorCode, message } = error;

  // Validation errors
  if (statusCode === 400 || errorCode === 'VALIDATION_ERROR') {
    if (message.toLowerCase().includes('price') || message.toLowerCase().includes('цена')) {
      if (message.toLowerCase().includes('low') || message.toLowerCase().includes('низк')) {
        recommendations.push(
          t('avito.errors.recommendations.priceTooLow', {
            defaultValue: 'Убедитесь, что цена соответствует минимальным требованиям Avito',
          })
        );
      } else if (message.toLowerCase().includes('high') || message.toLowerCase().includes('высок')) {
        recommendations.push(
          t('avito.errors.recommendations.priceTooHigh', {
            defaultValue: 'Убедитесь, что цена не превышает максимально допустимую',
          })
        );
      }
    }
    if (message.toLowerCase().includes('date') || message.toLowerCase().includes('дата')) {
      recommendations.push(
        t('avito.errors.recommendations.invalidDateRange', {
          defaultValue: 'Проверьте корректность диапазона дат',
        })
      );
    }
  }

  // Authorization errors
  if (statusCode === 401 || statusCode === 403 || errorCode === 'UNAUTHORIZED') {
    recommendations.push(
      t('avito.errors.recommendations.reconnect', {
        defaultValue: 'Попробуйте переподключить интеграцию с Avito',
      })
    );
  }

  // Token expiration
  if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('истёк')) {
    recommendations.push(
      t('avito.errors.recommendations.tokenExpired', {
        defaultValue: 'Токен доступа истёк. Переподключите интеграцию',
      })
    );
  }

  // Network errors
  if (statusCode === 0 || message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    recommendations.push(
      t('avito.errors.recommendations.networkError', {
        defaultValue: 'Проверьте подключение к интернету и попробуйте снова',
      })
    );
  }

  // Default recommendation
  if (recommendations.length === 0) {
    recommendations.push(
      t('avito.errors.recommendations.contactSupport', {
        defaultValue: 'Если проблема повторяется, обратитесь в поддержку',
      })
    );
  }

  return recommendations;
}

