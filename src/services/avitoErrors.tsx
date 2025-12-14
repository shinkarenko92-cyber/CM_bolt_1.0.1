/**
 * Avito Error Parsing and Display Utilities
 * Handles parsing errors from Avito API and Edge Function responses
 */

import { Modal } from 'antd';
import type { TFunction } from 'i18next';

/**
 * Information about an Avito API error
 */
export interface AvitoErrorInfo {
  operation: string; // e.g., 'price_update', 'calendar_update', 'base_params_update', 'bookings_update'
  statusCode?: number;
  errorCode?: string;
  message: string;
  details?: unknown;
  recommendations?: string[];
}

/**
 * Error response from Edge Function
 */
export interface AvitoSyncErrorResponse {
  success: boolean;
  errors?: AvitoErrorInfo[];
  message?: string;
}

/**
 * Parse error from various sources (Edge Function, Avito API, network)
 */
export function parseAvitoError(error: unknown, operation?: string): AvitoErrorInfo {
  const defaultOperation = operation || 'unknown_operation';
  
  // If it's already an AvitoErrorInfo, return it
  if (error && typeof error === 'object' && 'operation' in error && 'message' in error) {
    return error as AvitoErrorInfo;
  }

  // If it's an Error object
  if (error instanceof Error) {
    // Try to parse error message for structured data
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.errors && Array.isArray(parsed.errors)) {
        // This is a sync error response
        return {
          operation: defaultOperation,
          message: parsed.message || error.message,
          details: parsed,
        };
      }
    } catch {
      // Not JSON, continue with normal error parsing
    }

    return {
      operation: defaultOperation,
      message: error.message,
      details: error.stack,
    };
  }

  // If it's a response from Edge Function
  if (error && typeof error === 'object' && 'data' in error) {
    const errorData = (error as { data?: unknown }).data;
    
    if (errorData && typeof errorData === 'object') {
      const data = errorData as Record<string, unknown>;
      
      // Check if it's a sync error response
      if ('errors' in data && Array.isArray(data.errors)) {
        // This is a structured error response with multiple errors
        // Return the first error or a summary
        const errors = data.errors as AvitoErrorInfo[];
        if (errors.length > 0) {
          return errors[0];
        }
      }

      // Try to extract error information
      const message = 
        (data.message as string) ||
        (data.error as string) ||
        (data.error_description as string) ||
        'Unknown error';

      return {
        operation: defaultOperation,
        statusCode: data.status as number,
        errorCode: data.error as string,
        message: typeof message === 'string' ? message : 'Unknown error',
        details: data,
      };
    }
  }

  // If it's a string
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      if (parsed.errors && Array.isArray(parsed.errors)) {
        const errors = parsed.errors as AvitoErrorInfo[];
        if (errors.length > 0) {
          return errors[0];
        }
      }
      return {
        operation: defaultOperation,
        message: parsed.message || error,
        details: parsed,
      };
    } catch {
      return {
        operation: defaultOperation,
        message: error,
      };
    }
  }

  // Default fallback
  return {
    operation: defaultOperation,
    message: 'Unknown error occurred',
    details: error,
  };
}

/**
 * Format error message for display
 */
export function formatAvitoError(errorInfo: AvitoErrorInfo, t: TFunction): string {
  const { operation, message, statusCode, errorCode } = errorInfo;

  // Get operation name translation
  const operationKey = `avito.errors.${operation}`;
  const operationName = t(operationKey, { defaultValue: operation });

  let formatted = `${operationName}: ${message}`;

  if (statusCode) {
    formatted += ` (${t('avito.errors.statusCode')}: ${statusCode})`;
  }

  if (errorCode) {
    formatted += ` [${errorCode}]`;
  }

  return formatted;
}

/**
 * Get recommendations based on error type
 */
function getRecommendations(errorInfo: AvitoErrorInfo, t: TFunction): string[] {
  const recommendations: string[] = [];
  const { statusCode, errorCode, message } = errorInfo;

  // Validation errors
  if (statusCode === 400 || errorCode === 'VALIDATION_ERROR') {
    if (message.toLowerCase().includes('price') || message.toLowerCase().includes('цена')) {
      if (message.toLowerCase().includes('low') || message.toLowerCase().includes('низк')) {
        recommendations.push(t('avito.errors.recommendations.priceTooLow', { defaultValue: 'Убедитесь, что цена соответствует минимальным требованиям Avito' }));
      } else if (message.toLowerCase().includes('high') || message.toLowerCase().includes('высок')) {
        recommendations.push(t('avito.errors.recommendations.priceTooHigh', { defaultValue: 'Убедитесь, что цена не превышает максимально допустимую' }));
      }
    }
    if (message.toLowerCase().includes('date') || message.toLowerCase().includes('дата')) {
      recommendations.push(t('avito.errors.recommendations.invalidDateRange', { defaultValue: 'Проверьте корректность диапазона дат' }));
    }
  }

  // Authorization errors
  if (statusCode === 401 || statusCode === 403 || errorCode === 'UNAUTHORIZED') {
    recommendations.push(t('avito.errors.recommendations.reconnect', { defaultValue: 'Попробуйте переподключить интеграцию с Avito' }));
  }

  // Token expiration
  if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('истёк')) {
    recommendations.push(t('avito.errors.recommendations.tokenExpired', { defaultValue: 'Токен доступа истёк. Переподключите интеграцию' }));
  }

  // Network errors
  if (statusCode === 0 || message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    recommendations.push(t('avito.errors.recommendations.networkError', { defaultValue: 'Проверьте подключение к интернету и попробуйте снова' }));
  }

  // Default recommendation
  if (recommendations.length === 0) {
    recommendations.push(t('avito.errors.recommendations.contactSupport', { defaultValue: 'Если проблема повторяется, обратитесь в поддержку' }));
  }

  return recommendations;
}

/**
 * Show Avito errors sequentially in modal dialogs
 */
export async function showAvitoErrors(
  errors: AvitoErrorInfo[],
  t: TFunction
): Promise<void> {
  if (!errors || errors.length === 0) {
    return;
  }

  // Show errors one by one, waiting for each modal to close
  for (const error of errors) {
    await new Promise<void>((resolve) => {
      let recommendations: string[] = [];
      try {
        recommendations = getRecommendations(error, t);
        // Handle case where t() returns an object instead of string
        recommendations = recommendations.map(rec => 
          typeof rec === 'string' ? rec : 'Ошибка при получении рекомендаций'
        );
      } catch (err) {
        // If getRecommendations throws (e.g., i18n key returned object), use empty array
        console.warn('Error getting recommendations:', err);
        recommendations = [];
      }
      
      const operationKey = `avito.errors.${error.operation}`;
      let operationName: string;
      try {
        const opName = t(operationKey, { defaultValue: error.operation });
        operationName = typeof opName === 'string' ? opName : error.operation;
      } catch {
        operationName = error.operation;
      }

      Modal.error({
        title: t('avito.errors.syncFailed', { defaultValue: 'Ошибка синхронизации с Avito' }),
        width: 600,
        content: (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <strong>{t('avito.errors.operation', { defaultValue: 'Операция' })}:</strong> {operationName}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>{t('avito.errors.message', { defaultValue: 'Сообщение' })}:</strong> {error.message}
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
                  <pre style={{ 
                    background: '#1e293b', 
                    color: '#f1f5f9', 
                    padding: '8px', 
                    borderRadius: '4px',
                    fontSize: '12px',
                    maxHeight: '200px',
                    overflow: 'auto',
                    marginTop: '4px'
                  }}>
                    {detailsString}
                  </pre>
                </div>
              );
            })() : null}
            {recommendations.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <strong>{t('avito.errors.recommendations', { defaultValue: 'Рекомендации' })}:</strong>
                <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                  {recommendations.map((rec, index) => (
                    <li key={index} style={{ marginBottom: '4px' }}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ),
        okText: t('common.close', { defaultValue: 'Закрыть' }),
        onOk: () => resolve(),
        afterClose: () => resolve(),
      });
    });
  }
}

/**
 * Parse errors from Edge Function response
 */
export function parseSyncErrorResponse(response: unknown): AvitoErrorInfo[] {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const data = response as Record<string, unknown>;

  // Check if it's a sync error response
  if ('errors' in data && Array.isArray(data.errors)) {
    return data.errors as AvitoErrorInfo[];
  }

  // If there's a single error message, convert it to error info
  if ('message' in data && typeof data.message === 'string') {
    return [
      {
        operation: 'sync',
        message: data.message,
        statusCode: data.status as number,
        details: data,
      },
    ];
  }

  return [];
}

