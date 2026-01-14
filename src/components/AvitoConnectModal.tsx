/**
 * Avito Connect Modal - OAuth flow with 3-step stepper
 * Uses Ant Design v5 components
 */

import { useState, useEffect, useCallback } from 'react';
import { Modal, Steps, Button, Input, InputNumber, Spin, message, Select } from 'antd';
import { CheckCircleOutlined, LoadingOutlined, CopyOutlined } from '@ant-design/icons';
import { Property, supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
  generateOAuthUrl,
  parseOAuthState,
  saveConnectionProgress,
  loadConnectionProgress,
  clearConnectionProgress,
  getOAuthError,
  getOAuthSuccess,
  clearOAuthError,
  clearOAuthSuccess,
  performInitialSync,
} from '../services/avito';
import { getIcalUrl } from '../utils/icalUrl';

interface AvitoConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  onSuccess?: () => void;
}

export function AvitoConnectModal({
  isOpen,
  onClose,
  property,
  onSuccess,
}: AvitoConnectModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [oauthRedirecting, setOauthRedirecting] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [markup, setMarkup] = useState<number>(15);
  const [markupType, setMarkupType] = useState<'percent' | 'rub'>('percent');
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [icalUrl, setIcalUrl] = useState<string>('');

  const handleOAuthCallback = useCallback(async (code: string, state: string) => {
    // Предотвращаем двойной вызов
    if (isProcessingOAuth) {
      return;
    }

    // Handle OAuth callback

    // Удаляем OAuth данные из localStorage СРАЗУ после первого использования кода
    // Это предотвратит повторное использование кода, даже если функция вызывается дважды
    clearOAuthSuccess();

    setIsProcessingOAuth(true);
    setLoading(true);
    try {
      const stateData = parseOAuthState(state);
      
      if (!stateData || stateData.property_id !== property.id) {
        console.error('AvitoConnectModal: Invalid state parameter', {
          stateData,
          propertyId: property.id
        });
        throw new Error('Invalid state parameter');
      }

      // Используем тот же redirect_uri, что и в OAuth URL
      // Должен совпадать с настройками в Avito: https://app.roomi.pro/auth/avito-callback
      const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';
      
      // Call Edge Function to handle OAuth callback (token exchange + account_id fetch + save)
      const { data: callbackResponse, error: callbackError } = await supabase.functions.invoke('avito-oauth-callback', {
        body: {
          code,
          state,
          redirect_uri: redirectUri,
        },
      });

      if (callbackError) {
        console.error('AvitoConnectModal: Edge Function error', {
          error: callbackError,
          message: callbackError.message,
          status: callbackError.status,
          data: callbackError.data,
        });
        throw new Error(callbackError.message || 'Ошибка при обработке OAuth callback');
      }

      if (!callbackResponse || !callbackResponse.success) {
        console.error('AvitoConnectModal: Invalid callback response', callbackResponse);
        throw new Error(callbackResponse?.error || 'Не удалось обработать OAuth callback');
      }

      // OAuth callback processed successfully

      // Load integration to verify it was saved
      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('id, access_token_encrypted, refresh_token_encrypted, token_expires_at')
        .eq('property_id', property.id)
        .eq('platform', 'avito')
        .eq('is_active', true)
        .single();

      if (integrationError || !integration) {
        // Could not load integration after OAuth callback
        // Continue anyway - tokens are saved, user can proceed to item_id step
      } else {
        console.log('AvitoConnectModal: Integration loaded', {
          integrationId: integration.id,
          hasAccessToken: !!integration.access_token_encrypted,
          hasRefreshToken: !!integration.refresh_token_encrypted,
        });
      }

      message.success('Аккаунт Avito подключён! Теперь введи ID объявления');
      saveConnectionProgress(property.id, 1, {
        // Tokens are saved in DB by Edge Function, we don't need to store them in progress
      });
      
      // Clean URL - remove OAuth callback parameters
      if (typeof window !== 'undefined' && window.history) {
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        window.history.replaceState({}, '', url.toString());
      }
      
      // Show success toast and move to next step
          message.success('Аккаунт Avito подключён! Теперь введи номер аккаунта');
          setCurrentStep(1); // Go to User ID step

      // OAuth callback processed successfully
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при обработке авторизации';
      
      // Извлекаем детали ошибки, если они есть
      interface ErrorWithDetails extends Error {
        details?: {
          error?: string;
          error_description?: string;
          details?: string;
        } | null;
      }
      const errorDetails = (error as ErrorWithDetails)?.details;
      const hasInvalidGrant = errorMessage.includes('invalid_grant') || 
                             errorDetails?.error === 'invalid_grant' ||
                             errorMessage.toLowerCase().includes('invalid_grant');
      
      console.error('AvitoConnectModal: Error in handleOAuthCallback', {
        error,
        errorMessage,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorDetails,
        hasInvalidGrant
      });
      
      // Специальная обработка ошибки invalid_grant
      if (hasInvalidGrant) {
        Modal.error({
          title: 'Код авторизации недействителен',
          content: 'Код авторизации уже использован или истек. Пожалуйста, начните процесс подключения Avito заново. Нажмите "Подключить Avito" еще раз.',
          okText: 'Понятно',
          width: 500,
          onOk: () => {
            // Сбрасываем состояние и возвращаемся к начальному шагу
            clearConnectionProgress(property.id);
            setCurrentStep(0);
            setIsProcessingOAuth(false);
          },
        });
        return;
      }
      
      // Проверяем, не является ли это ошибкой 404 (Edge Function не развернута)
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        Modal.error({
          title: 'Edge Function не найдена',
          content: 'Функция avito_sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
          okText: 'Понятно',
          width: 500,
        });
      } else {
        // Показываем детальное сообщение об ошибке, если есть детали от Avito API
        const displayMessage = errorDetails?.error_description || 
                              errorDetails?.details || 
                              errorMessage;
        message.error(displayMessage);
      }
    } finally {
      setLoading(false);
      setIsProcessingOAuth(false);
    }
  }, [property.id, isProcessingOAuth]);

  // Load progress on open and reset success state
  useEffect(() => {
    if (isOpen) {
      // Modal opened, loading progress
      // Reset success state when modal opens
      setShowSuccess(false);
      setIcalUrl('');
      
      const progress = loadConnectionProgress(property.id);
      
      if (progress && progress.step > 0) {
        // Resuming from saved progress
        setCurrentStep(progress.step);
        if (progress.data.userId) setUserId(progress.data.userId);
        if (progress.data.itemId) setItemId(progress.data.itemId);
        if (progress.data.markup) setMarkup(progress.data.markup);
        // Tokens are now stored in DB, not in progress
      } else {
        // Check for OAuth callback results
        const oauthError = getOAuthError();
        if (oauthError) {
          // OAuth error detected
          // Удаляем OAuth error из localStorage после обработки
          clearOAuthError();
          Modal.error({
            title: 'Ошибка авторизации',
            content: oauthError.error_description || oauthError.error || 'Неизвестная ошибка',
            okText: 'Попробовать снова',
            onOk: () => {
              clearConnectionProgress(property.id);
              setCurrentStep(0);
            },
          });
          return;
        }

        const oauthSuccess = getOAuthSuccess();
        if (oauthSuccess) {
          // OAuth success detected, calling handleOAuthCallback
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        } else {
          // No OAuth callback, starting from step 0
          setCurrentStep(0);
        }
      }
    } else {
      // Reset on close
      setCurrentStep(0);
      setOauthRedirecting(false);
      setIsProcessingOAuth(false);
      setShowSuccess(false);
      setIcalUrl('');
    }
  }, [isOpen, property.id, handleOAuthCallback]);

  // Check if user is returning from OAuth redirect
  // This handles the case when the modal is already open but OAuth callback hasn't been processed yet
  useEffect(() => {
    if (isOpen && currentStep === 0 && !isProcessingOAuth) {
      const checkInterval = setInterval(() => {
        // Проверяем, не обрабатывается ли уже OAuth callback
        if (isProcessingOAuth) {
          return;
        }

        const oauthSuccess = getOAuthSuccess();
        if (oauthSuccess) {
          // OAuth success detected in interval
          clearInterval(checkInterval);
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        }
      }, 500);

      return () => {
        clearInterval(checkInterval);
      };
    }
  }, [isOpen, currentStep, handleOAuthCallback, isProcessingOAuth]);

  // Also check for OAuth callback when component mounts, even if modal is closed
  // This ensures we process the callback even if the user navigated away
  useEffect(() => {
    if (!isOpen) {
      const oauthSuccess = getOAuthSuccess();
      if (oauthSuccess) {
        try {
          const stateData = parseOAuthState(oauthSuccess.state);
          if (stateData && stateData.property_id === property.id) {
            // OAuth callback detected while modal is closed, will process when modal opens
            // Don't process here, just log - it will be processed when modal opens
          }
        } catch (error) {
          console.error('AvitoConnectModal: Error parsing OAuth state while modal is closed', error);
        }
      }
    }
  }, [isOpen, property.id]);

  const handleConnectClick = () => {
    try {
      const oauthUrl = generateOAuthUrl(property.id);
      setOauthRedirecting(true);
      saveConnectionProgress(property.id, 0, {});
      window.location.href = oauthUrl;
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Ошибка при генерации OAuth URL');
      setOauthRedirecting(false);
    }
  };

  const handleSubmit = async () => {
    if (!userId) {
      message.error('Введи номер аккаунта Avito');
      return;
    }

    if (!itemId) {
      message.error('Введи ID объявления');
      return;
    }

    // Validate userId: must be 6-8 digits
    const trimmedUserId = userId.trim();
    if (!trimmedUserId || !/^[0-9]{6,8}$/.test(trimmedUserId)) {
      message.error('Номер аккаунта должен содержать 6-8 цифр');
      return;
    }

    // Validate itemId: must be 10-12 digits before saving
    const trimmedItemId = itemId.trim();
    if (!trimmedItemId || !/^[0-9]{10,12}$/.test(trimmedItemId)) {
      message.error('ID объявления должен содержать 10-12 цифр');
      return;
    }

    setLoading(true);
    try {
      // Update integration with user_id and item_id (tokens are already saved by OAuth callback)
      // Convert to numbers for BIGINT columns
      const userIdNumber = parseInt(trimmedUserId, 10);
      const itemIdNumber = parseInt(trimmedItemId, 10);
      
      // Validate parsed numbers
      if (isNaN(userIdNumber) || isNaN(itemIdNumber)) {
        message.error('Ошибка: неверный формат номера аккаунта или ID объявления');
        return;
      }
      
      // First, check if integration exists
      const { data: existingIntegration } = await supabase
        .from('integrations')
        .select('id')
        .eq('property_id', property.id)
        .eq('platform', 'avito')
        .maybeSingle();

      let integrationId: string;
      
      if (existingIntegration) {
        // Update existing integration (without select to avoid 406)
        const { error: updateError } = await supabase
          .from('integrations')
          .update({
            avito_user_id: userIdNumber,
            avito_item_id: itemIdNumber,
            avito_markup: markupType === 'rub' ? -markup : markup,
            external_id: trimmedItemId,
            is_active: true,
          })
          .eq('id', existingIntegration.id);

        if (updateError) throw updateError;
        integrationId = existingIntegration.id;
      } else {
        // Create new integration using upsert
        const { data: newIntegration, error: upsertError } = await supabase
          .from('integrations')
          .upsert({
            property_id: property.id,
            platform: 'avito',
            avito_user_id: userIdNumber,
            avito_item_id: itemIdNumber,
            avito_markup: markupType === 'rub' ? -markup : markup,
            external_id: trimmedItemId,
            is_active: true,
          }, {
            onConflict: 'property_id,platform',
          })
          .select('id')
          .single();

        if (upsertError) throw upsertError;
        if (!newIntegration) {
          throw new Error('Не удалось создать интеграцию');
        }
        integrationId = newIntegration.id;
      }

      // Load integration for sync
      const { data: integration } = await supabase
        .from('integrations')
        .select('id, property_id, platform, avito_user_id, avito_item_id, avito_markup, is_active')
        .eq('id', integrationId)
        .single();

      if (!integration) {
        throw new Error('Интеграция не найдена после сохранения');
      }

      // Perform initial sync
      await performInitialSync(integration.id);

      // Add to sync queue
      await supabase.from('avito_sync_queue').insert({
        property_id: property.id,
        integration_id: integration.id,
        next_sync_at: new Date().toISOString(),
        status: 'pending',
      });

      // Clear progress
      clearConnectionProgress(property.id);

      // Show iCal URL for date blocking fallback
      const { url: icalUrlValue, isLocalhost } = getIcalUrl(property.id);
      setIcalUrl(icalUrlValue);
      if (isLocalhost) {
        toast('iCal работает только в prod/staging (Avito не тянет localhost)', { icon: '⚠️' });
      }

      // Show success toast
      message.success('Цены обновлены в Avito 🚀');
      
      // Show warning toast
      message.warning('Даты закрываются через iCal (полный API после активации)');

      // Show success block instead of closing modal
      setShowSuccess(true);

      // Auto trigger sync after a short delay to ensure DB is updated
      setTimeout(async () => {
        try {
          const { syncAvitoIntegration } = await import('../services/apiSync');
          const syncResult = await syncAvitoIntegration(property.id);
          
          if (syncResult.success) {
            if (syncResult.pricesSuccess && syncResult.intervalsFailed) {
              message.success('Цены обновлены в Avito');
              // iCal warning already shown above
            } else if (syncResult.errors && syncResult.errors.length > 0) {
              const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
              message.warning(`Частичная синхронизация: ${errorMessages}`);
            } else {
              message.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
            }
          } else {
            // Check for "Объявление не найдено" error
            const errorMessage = syncResult.message || 'Ошибка синхронизации с Avito';
            if (errorMessage.includes('Объявление не найдено') || errorMessage.includes('404') || errorMessage.includes('не найдено')) {
              message.error('Проверь ID объявления — это длинный номер из URL Avito (10-12 цифр)');
            } else {
              message.error(errorMessage);
            }
          }
        } catch (syncError) {
          console.error('Auto sync after item_id save failed:', syncError);
          // Don't show error toast - user already saw success message
        }
      }, 1000);
      
      // Вызываем onSuccess для обновления UI
      onSuccess?.();
      
      // Don't close modal - show success block instead
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при сохранении интеграции';
      
      // Проверяем ошибку 404
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        Modal.error({
          title: 'Edge Function не найдена',
          content: 'Функция avito_sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
          okText: 'Понятно',
          width: 500,
        });
      } else {
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResume = () => {
    const progress = loadConnectionProgress(property.id);
      if (progress) {
        setCurrentStep(progress.step);
        if (progress.data.itemId) setItemId(progress.data.itemId);
        if (progress.data.markup) setMarkup(progress.data.markup);
        // Tokens are now stored in DB, not in progress
        message.info('Продолжаем подключение Avito');
      }
  };

  const handleCancel = () => {
    if (currentStep > 0) {
      Modal.confirm({
        title: 'Прервать подключение?',
        content: 'Ваш прогресс будет сохранён. Вы сможете продолжить позже.',
        onOk: () => {
          onClose();
        },
      });
    } else {
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Show resume prompt if progress exists (check dynamically)
  const checkProgress = loadConnectionProgress(property.id);
  const showResumePrompt = checkProgress && checkProgress.step > 0 && currentStep === 0;

  // Render custom footer with navigation buttons
  const renderFooter = () => {
    // Don't show footer if success block is shown
    if (showSuccess) {
      return null;
    }
    
    return (
      <div className="flex justify-between items-center">
        <div>
          {currentStep > 0 && (
            <Button onClick={handleBack} disabled={loading || oauthRedirecting}>
              Назад
            </Button>
          )}
        </div>
        <div>
          <Button onClick={handleCancel} disabled={loading && !oauthRedirecting}>
            Отмена
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title="Подключение Avito"
      open={isOpen}
      onCancel={handleCancel}
      footer={renderFooter()}
      width={600}
      destroyOnClose
      closable={!oauthRedirecting}
      maskClosable={false}
    >
      {showResumePrompt && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
          <p className="text-sm text-blue-200 mb-2 font-medium">
            Обнаружен сохранённый прогресс подключения
          </p>
          <Button type="primary" onClick={handleResume}>
            Продолжить подключение Avito
          </Button>
        </div>
      )}

      {!showSuccess && (
        <Steps 
          current={currentStep} 
          className="mb-6"
          items={[
            { title: 'Подключить аккаунт Avito' },
            { title: 'Введи номер аккаунта и ID объявления' },
          ]}
        />
      )}

      <div className="min-h-[200px]">
        {/* Step 0: OAuth Redirect */}
        {currentStep === 0 && (
          <div className="text-center py-8">
            {oauthRedirecting ? (
              <div>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <p className="mt-4 text-slate-200">
                  Ждём, пока вы подтвердите доступ в Avito… Это займёт 10 секунд
                </p>
              </div>
            ) : (
              <div>
                <p className="text-white mb-6 text-base">
                  Нажмите кнопку ниже, чтобы авторизоваться в Avito и предоставить доступ к вашему
                  аккаунту
                </p>
                <Button type="primary" size="large" onClick={handleConnectClick} loading={loading}>
                  Подключить Avito
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 1: User ID and Item ID Input (combined) */}
        {currentStep === 1 && !showSuccess && (
          <div>
            <div className="mb-6">
              <p className="text-white mb-2 font-medium">Номер аккаунта Avito:</p>
              <p className="text-sm text-slate-300 mb-4">
                Короткий номер аккаунта (например, <span className="text-teal-400 font-bold">4720770</span>).
                Можно найти в настройках аккаунта Avito.
              </p>
              <Input
                placeholder="Например: 4720770"
                value={userId}
                onChange={(e) => {
                  // Only allow numbers, max 8 digits
                  const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setUserId(value);
                }}
                disabled={loading}
                required
                maxLength={8}
              />
              {!userId && (
                <p className="text-xs text-red-400 mt-1">Номер аккаунта обязателен</p>
              )}
              {userId && (!/^[0-9]{6,8}$/.test(userId)) && (
                <p className="text-xs text-red-400 mt-1">Номер аккаунта должен содержать 6-8 цифр</p>
              )}
            </div>

            <div className="mb-6">
              <p className="text-white mb-2 font-medium">ID объявления на Avito:</p>
              <p className="text-sm text-slate-300 mb-4">
                ID объявления должен содержать 10-12 цифр. ID можно найти в URL объявления: avito.ru/moskva/kvartiry/
                <span className="text-teal-400 font-bold">2336174775</span>
              </p>
              <Input
                placeholder="Пример: 3123456789 (из URL Avito)"
                value={itemId}
                onChange={(e) => {
                  // Only allow numbers, max 12 digits
                  const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setItemId(value);
                }}
                disabled={loading}
                required
                maxLength={12}
                pattern="[0-9]{10,12}"
              />
              {!itemId && (
                <p className="text-xs text-red-400 mt-1">ID объявления обязателен</p>
              )}
              {itemId && !/^[0-9]{10,12}$/.test(itemId) && (
                <p className="text-xs text-red-400 mt-1">ID объявления должен содержать 10-12 цифр</p>
              )}
            </div>

            <div className="mb-6">
              <p className="text-white mb-2 font-medium">Наценка для компенсации комиссии:</p>
              <div className="flex gap-2 mb-2">
                <Select
                  value={markupType}
                  onChange={setMarkupType}
                  style={{ width: 100 }}
                  options={[
                    { label: '%', value: 'percent' },
                    { label: 'Руб', value: 'rub' },
                  ]}
                />
                <InputNumber
                  style={{ flex: 1 }}
                  min={0}
                  max={markupType === 'percent' ? 100 : undefined}
                  value={markup}
                  onChange={(value) => setMarkup(value !== null && value !== undefined ? value : (markupType === 'percent' ? 15 : 0))}
                  formatter={(value) => markupType === 'percent' ? `${value}%` : `${value} руб`}
                  parser={(value) => parseFloat(value?.replace(/[%\sруб]/g, '') || '0')}
                />
              </div>
              <div className="mt-3 p-3 bg-slate-800 rounded border border-slate-700">
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Base 5000</span>
                  {markupType === 'percent' ? (
                    <span> + {markup}% = <span className="text-white font-semibold">{Math.round(5000 * (1 + markup / 100))}</span></span>
                  ) : (
                    <span> + {markup} руб = <span className="text-white font-semibold">{5000 + markup}</span></span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={loading}
                disabled={!userId || !itemId || !/^[0-9]{6,8}$/.test(userId) || !/^[0-9]{10,12}$/.test(itemId)}
                icon={<CheckCircleOutlined />}
              >
                Завершить подключение
              </Button>
            </div>
          </div>
        )}

        {/* Success Block: Show iCal URL after successful save */}
        {showSuccess && (
          <div className="py-4">
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircleOutlined className="text-green-400 text-2xl" />
                <h3 className="text-white text-lg font-semibold">Интеграция Avito успешно подключена!</h3>
              </div>
              
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                <p className="text-yellow-200 text-sm font-medium mb-2">
                  ⚠️ Даты закрываются через iCal (полный API после активации)
                </p>
              </div>

              <div className="mb-4">
                <p className="text-white mb-2 font-medium">iCal URL для закрытия дат:</p>
                <div className="flex items-center gap-2 p-3 bg-slate-800 rounded border border-slate-700">
                  <code className="flex-1 text-sm text-slate-300 break-all font-mono">
                    {icalUrl}
                  </code>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={async () => {
                      try {
                        const { isLocalhost } = getIcalUrl(property.id);
                        if (isLocalhost) {
                          toast('iCal работает только в prod/staging (Avito не тянет localhost)', { icon: '⚠️' });
                        }
                        await navigator.clipboard.writeText(icalUrl);
                        message.success('iCal URL скопирован в буфер обмена');
                      } catch (err) {
                        console.error('Failed to copy URL:', err);
                        message.error('Не удалось скопировать URL');
                      }
                    }}
                    className="flex-shrink-0"
                  >
                    Скопировать URL
                  </Button>
                </div>
              </div>

              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                <p className="text-sm text-slate-300">
                  Вставь этот URL в Avito → Календарь доступности → Импорт iCal (один раз — и даты закрываются автоматически)
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <Button type="primary" onClick={onClose}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

