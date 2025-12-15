/**
 * Avito Connect Modal - OAuth flow with 3-step stepper
 * Uses Ant Design v5 components
 */

import { useState, useEffect, useCallback } from 'react';
import { Modal, Steps, Button, Input, InputNumber, Spin, message } from 'antd';
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { Property } from '../lib/supabase';
import { supabase } from '../lib/supabase';
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
  exchangeCodeForToken,
  validateItemId,
  performInitialSync,
} from '../services/avito';

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
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [markup, setMarkup] = useState<number>(15);
  const [accessToken, setAccessToken] = useState<string>('');
  const [refreshToken, setRefreshToken] = useState<string>('');
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [validatingItemId, setValidatingItemId] = useState(false);
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);

  const handleOAuthCallback = useCallback(async (code: string, state: string) => {
    // Предотвращаем двойной вызов
    if (isProcessingOAuth) {
      console.log('AvitoConnectModal: OAuth callback already processing, skipping');
      return;
    }

    console.log('AvitoConnectModal: handleOAuthCallback called', {
      hasCode: !!code,
      hasState: !!state,
      codeLength: code.length,
      stateLength: state.length,
      propertyId: property.id,
      isOpen,
      isProcessingOAuth
    });

    // Удаляем OAuth данные из localStorage СРАЗУ после первого использования кода
    // Это предотвратит повторное использование кода, даже если функция вызывается дважды
    console.log('AvitoConnectModal: Clearing OAuth data from localStorage immediately to prevent code reuse');
    clearOAuthSuccess();

    setIsProcessingOAuth(true);
    setLoading(true);
    try {
      const stateData = parseOAuthState(state);
      console.log('AvitoConnectModal: Parsed OAuth state', { stateData });
      
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
      console.log('AvitoConnectModal: Exchanging code for token', { redirectUri });
      
      // Exchange code for token
      const tokenResponse = await exchangeCodeForToken(code, redirectUri);
      console.log('AvitoConnectModal: Token exchange response', {
        hasResponse: !!tokenResponse,
        hasAccessToken: !!tokenResponse?.access_token,
        tokenLength: tokenResponse?.access_token?.length
      });
      
      // Валидация токена
      if (!tokenResponse || !tokenResponse.access_token) {
        console.error('AvitoConnectModal: Token response is invalid:', tokenResponse);
        throw new Error('Не удалось получить access token от Avito');
      }
      
      console.log('AvitoConnectModal: Token received successfully', {
        tokenLength: tokenResponse.access_token.length,
        expiresIn: tokenResponse.expires_in,
        accountId: tokenResponse.account_id,
        hasRefreshToken: !!tokenResponse.refresh_token,
      });
      setAccessToken(tokenResponse.access_token);
      setExpiresIn(tokenResponse.expires_in);
      // Save refresh_token if provided by Avito
      if (tokenResponse.refresh_token) {
        setRefreshToken(tokenResponse.refresh_token);
      }

      // Get account_id from token response (obtained via GET /core/v1/user in Edge Function)
      let accountId = tokenResponse.account_id;
      
      // Fallback: if Edge Function didn't return account_id, fetch it directly from Avito API
      if (!accountId) {
        console.warn('AvitoConnectModal: No account_id in token response, fetching directly from Avito API', {
          tokenResponseKeys: Object.keys(tokenResponse),
          hasAccountId: 'account_id' in tokenResponse,
        });
        
        try {
          console.log('AvitoConnectModal: Fetching user info from Avito API to get account_id', {
            endpoint: 'https://api.avito.ru/core/v1/user',
            tokenLength: tokenResponse.access_token.length,
          });

          const userResponse = await fetch('https://api.avito.ru/core/v1/user', {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!userResponse.ok) {
            const errorText = await userResponse.text().catch(() => 'Unable to read error');
            console.error('AvitoConnectModal: Failed to get user info from Avito API', {
              status: userResponse.status,
              statusText: userResponse.statusText,
              errorText: errorText.substring(0, 500),
            });
            throw new Error(`Не удалось получить данные аккаунта Avito (${userResponse.status}): ${errorText.substring(0, 200)}`);
          }

          const userData = await userResponse.json();
          console.log('AvitoConnectModal: Avito user API response', {
            userDataKeys: Object.keys(userData),
            hasUser: !!userData.user,
            userDataStructure: JSON.stringify(userData).substring(0, 500),
          });

          // Avito API returns user.id or id field
          // Try multiple possible paths: user.id, id, user_id
          accountId = userData.user?.id || userData.id || userData.user_id || null;

          if (accountId) {
            console.log('AvitoConnectModal: Successfully extracted account_id from Avito user API', {
              accountId,
              source: userData.user?.id ? 'user.id' : (userData.id ? 'id' : 'user_id'),
            });
          } else {
            console.error('AvitoConnectModal: Failed to extract account_id from user data', {
              userDataKeys: Object.keys(userData),
              userData: JSON.stringify(userData).substring(0, 1000),
            });
            throw new Error('Не удалось получить ID аккаунта Avito из ответа API. Попробуйте подключить заново.');
          }
        } catch (userError) {
          const errorMessage = userError instanceof Error ? userError.message : String(userError);
          console.error('AvitoConnectModal: Critical error fetching user info from Avito', {
            error: errorMessage,
            errorType: userError instanceof Error ? userError.constructor.name : typeof userError,
          });
          throw new Error(errorMessage || 'Не удалось получить ID аккаунта Avito. Попробуйте подключить заново.');
        }
      } else {
        console.log('AvitoConnectModal: Using account_id from token response', accountId);
      }

      setSelectedAccountId(accountId);
      saveConnectionProgress(property.id, 1, {
        accountId: accountId,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || '',
      });
      
      // Show success toast and move to next step
      message.success('Аккаунт Avito подключён! Теперь введи ID объявления');
      setCurrentStep(1); // Go to Item ID step

      // OAuth данные уже удалены в начале функции, просто логируем успех
      console.log('AvitoConnectModal: OAuth callback processed successfully');
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
  }, [property.id, isOpen, isProcessingOAuth]);

  // Load progress on open
  useEffect(() => {
    if (isOpen) {
      console.log('AvitoConnectModal: Modal opened, loading progress', { propertyId: property.id });
      
      const progress = loadConnectionProgress(property.id);
      console.log('AvitoConnectModal: Loaded progress', { progress });
      
      if (progress && progress.step > 0) {
        console.log('AvitoConnectModal: Resuming from saved progress', { step: progress.step });
        setCurrentStep(progress.step);
        if (progress.data.accountId) setSelectedAccountId(progress.data.accountId);
        if (progress.data.itemId) setItemId(progress.data.itemId);
        if (progress.data.markup) setMarkup(progress.data.markup);
        if (progress.data.accessToken) setAccessToken(progress.data.accessToken);
        if (progress.data.refreshToken) setRefreshToken(progress.data.refreshToken);
      } else {
        // Check for OAuth callback results
        console.log('AvitoConnectModal: No saved progress, checking for OAuth callback');
        
        const oauthError = getOAuthError();
        if (oauthError) {
          console.log('AvitoConnectModal: OAuth error detected', oauthError);
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
          console.log('AvitoConnectModal: OAuth success detected, calling handleOAuthCallback', {
            hasCode: !!oauthSuccess.code,
            hasState: !!oauthSuccess.state
          });
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        } else {
          console.log('AvitoConnectModal: No OAuth callback, starting from step 0');
          setCurrentStep(0);
        }
      }
    } else {
      // Reset on close
      console.log('AvitoConnectModal: Modal closed, resetting state');
      setCurrentStep(0);
      setOauthRedirecting(false);
      setIsProcessingOAuth(false);
    }
  }, [isOpen, property.id, handleOAuthCallback]);

  // Check if user is returning from OAuth redirect
  // This handles the case when the modal is already open but OAuth callback hasn't been processed yet
  useEffect(() => {
    if (isOpen && currentStep === 0 && !isProcessingOAuth) {
      console.log('AvitoConnectModal: Setting up interval to check for OAuth callback');
      const checkInterval = setInterval(() => {
        // Проверяем, не обрабатывается ли уже OAuth callback
        if (isProcessingOAuth) {
          console.log('AvitoConnectModal: OAuth callback already processing, skipping interval check');
          return;
        }

        const oauthSuccess = getOAuthSuccess();
        if (oauthSuccess) {
          console.log('AvitoConnectModal: OAuth success detected in interval, calling handleOAuthCallback');
          clearInterval(checkInterval);
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        }
      }, 500);

      return () => {
        console.log('AvitoConnectModal: Clearing OAuth callback check interval');
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
            console.log('AvitoConnectModal: OAuth callback detected while modal is closed, will process when modal opens', {
              propertyId: property.id
            });
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

  const handleItemIdValidate = async () => {
    if (!itemId || !selectedAccountId || !accessToken) {
      message.error('Заполните все поля');
      return;
    }

    // Validate itemId: must be 10-11 digits
    const trimmedItemId = itemId.trim();
    if (!trimmedItemId || !/^[0-9]{10,11}$/.test(trimmedItemId)) {
      message.error('ID объявления должен содержать 10-11 цифр (например, 2336174775)');
      return;
    }

    setValidatingItemId(true);
    try {
      const validation = await validateItemId(selectedAccountId, trimmedItemId, accessToken, property.id);
      
      if (!validation.available) {
        Modal.error({
          title: 'ID уже используется',
          content: validation.error || 'Этот ID уже подключен к другому объекту',
          okText: 'Выбрать другой ID',
        });
        return;
      }

      // Item ID is valid, ready to save
      saveConnectionProgress(property.id, 1, {
        accountId: selectedAccountId,
        itemId: trimmedItemId,
        accessToken,
        refreshToken: refreshToken || undefined,
      });
      message.success('ID объявления проверен. Нажмите "Завершить подключение" для сохранения.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Проверяем ошибку 404
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        if (errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
          Modal.error({
            title: 'Edge Function не найдена',
            content: 'Функция avito_sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
            okText: 'Понятно',
            width: 500,
          });
        } else {
          Modal.error({
            title: 'Объявление не найдено',
            content: 'Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции.',
            okText: 'Понятно',
          });
        }
      } else {
        message.error(errorMessage);
      }
    } finally {
      setValidatingItemId(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAccountId || !itemId || !accessToken) {
      message.error('Заполните все поля');
      return;
    }

    // Validate itemId: must be 10-11 digits before saving
    const trimmedItemId = itemId.trim();
    if (!trimmedItemId || !/^[0-9]{10,11}$/.test(trimmedItemId)) {
      message.error('ID объявления должен содержать 10-11 цифр');
      return;
    }

    setLoading(true);
    try {
      // Encrypt tokens via Edge Function (Vault encryption)
      const { data: integration, error } = await supabase.functions.invoke('avito_sync', {
        body: {
          action: 'save-integration',
          property_id: property.id,
          avito_account_id: selectedAccountId,
          avito_item_id: parseInt(trimmedItemId, 10),
          avito_markup: markup,
          access_token: accessToken,
          refresh_token: refreshToken || null, // Pass refresh_token if available
          expires_in: expiresIn,
        },
      });

      if (error) throw error;

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

      message.success('Avito подключён! Синхронизация запущена');
      
      // Вызываем onSuccess для обновления UI
      onSuccess?.();
      
      // Добавляем небольшую задержку перед закрытием, чтобы UI успел обновиться
      // и база данных успела обновиться после initial-sync
      await new Promise(resolve => setTimeout(resolve, 500));
      
      onClose();
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
        if (progress.data.accountId) setSelectedAccountId(progress.data.accountId);
        if (progress.data.itemId) setItemId(progress.data.itemId);
        if (progress.data.markup) setMarkup(progress.data.markup);
        if (progress.data.accessToken) setAccessToken(progress.data.accessToken);
        if (progress.data.refreshToken) setRefreshToken(progress.data.refreshToken);
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

      <Steps 
        current={currentStep} 
        className="mb-6"
        items={[
          { title: 'Подключить аккаунт Avito' },
          { title: 'Введи ID объявления' },
        ]}
      />

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

        {/* Step 1: Item ID Input */}
        {currentStep === 1 && (
          <div>
            <p className="text-white mb-2 font-medium">Введите ID объявления на Avito:</p>
            <p className="text-sm text-slate-300 mb-4">
              ID объявления должен содержать 10-11 цифр. ID можно найти в URL объявления: avito.ru/moskva/kvartiry/
              <span className="text-teal-400 font-bold">2336174775</span>
            </p>
            <Input
              placeholder="Например: 2336174775"
              value={itemId}
              onChange={(e) => {
                // Only allow numbers, max 11 digits
                const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                setItemId(value);
              }}
              onPressEnter={handleItemIdValidate}
              disabled={validatingItemId}
              required
              maxLength={11}
              pattern="[0-9]{10,11}"
            />
            {!itemId && (
              <p className="text-xs text-red-400 mt-1">ID объявления обязателен</p>
            )}
            {itemId && !/^[0-9]{10,11}$/.test(itemId) && (
              <p className="text-xs text-red-400 mt-1">ID объявления должен содержать 10-11 цифр</p>
            )}
            <div className="mt-4">
              <p className="text-white mb-2 font-medium">Наценка для компенсации комиссии:</p>
              <p className="text-sm text-slate-300 mb-4">
                Цена на Avito = базовая цена + наценка (%)
              </p>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={100}
                value={markup}
                onChange={(value) => setMarkup(value !== null && value !== undefined ? value : 15)}
                formatter={(value) => `${value}%`}
                parser={(value) => parseFloat(value?.replace('%', '') || '0')}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={loading || validatingItemId}
                disabled={!itemId || !/^[0-9]{10,11}$/.test(itemId) || !selectedAccountId}
                icon={<CheckCircleOutlined />}
              >
                Завершить подключение
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

