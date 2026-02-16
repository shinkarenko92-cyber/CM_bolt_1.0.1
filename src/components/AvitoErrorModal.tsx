/**
 * Avito Error Modal Component
 * Displays detailed information about Avito API errors
 */

import { Modal } from 'antd';
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
    <Modal
      open={isOpen}
      onCancel={onClose}
      title={t('avito.errors.syncFailed', { defaultValue: 'Ошибка синхронизации с Avito' })}
      width={600}
      footer={[
        onRetry && (
          <button
            key="retry"
            onClick={() => {
              onRetry();
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('common.retry', { defaultValue: 'Повторить' })}
          </button>
        ),
        <button
          key="close"
          onClick={onClose}
          className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
        >
          {t('common.close', { defaultValue: 'Закрыть' })}
        </button>,
      ].filter(Boolean)}
    >
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <strong>{t('avito.errors.operation', { defaultValue: 'Операция' })}:</strong> {operationName}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>{t('avito.errors.message', { defaultValue: 'Сообщение' })}:</strong> {getDisplayMessage(error, t)}
        </div>
        {error.statusCode && (
          <div style={{ marginBottom: 12 }}>
            <strong>{t('avito.errors.statusCode', { defaultValue: 'Код статуса' })}:</strong> {error.statusCode}
          </div>
        )}
        {error.errorCode && (
          <div style={{ marginBottom: 12 }}>
            <strong>{t('avito.errors.errorCode', { defaultValue: 'Код ошибки' })}:</strong> {error.errorCode}
          </div>
        )}
        {error.details ? (() => {
          const detailsString: string = typeof error.details === 'string' 
            ? error.details 
            : JSON.stringify(error.details, null, 2);
          return (
            <div style={{ marginBottom: 12 }}>
              <strong>{t('avito.errors.details', { defaultValue: 'Детали ошибки' })}:</strong>
              <pre
                style={{
                  background: '#1e293b',
                  color: '#f1f5f9',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  maxHeight: '200px',
                  overflow: 'auto',
                  marginTop: '4px',
                }}
              >
                {detailsString}
              </pre>
            </div>
          );
        })() : null}
        {recommendations.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <strong>{t('avito.errors.recommendationsTitle', { defaultValue: 'Рекомендации' })}:</strong>
            <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
              {recommendations.map((rec, index) => (
                <li key={index} style={{ marginBottom: '4px' }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
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

