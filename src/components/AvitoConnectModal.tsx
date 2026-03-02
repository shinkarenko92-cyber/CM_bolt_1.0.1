/**
 * Avito Connect Modal - OAuth flow with 2-step stepper
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Property, supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { showAvitoErrors } from '@/services/avitoErrors';
import {
  generateOAuthUrl,
  getAvitoConfigValidation,
  parseOAuthState,
  saveConnectionProgress,
  loadConnectionProgress,
  clearConnectionProgress,
  getOAuthError,
  getOAuthSuccess,
  clearOAuthError,
  clearOAuthSuccess,
  performInitialSync,
} from '@/services/avito';

interface AvitoConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  onSuccess?: () => void;
  /** Показать экран успеха сразу при открытии (после полного редиректа с callback) */
  initialShowAvitoSuccess?: boolean;
}

export function AvitoConnectModal({
  isOpen,
  onClose,
  property,
  onSuccess,
  initialShowAvitoSuccess = false,
}: AvitoConnectModalProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [oauthRedirecting, setOauthRedirecting] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [markup, setMarkup] = useState<number>(0);
  const [markupType, setMarkupType] = useState<'percent' | 'rub'>('percent');
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{ title: string; content: string; onOk?: () => void } | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const oauthCodeConsumedRef = useRef(false);
  const hasShownRedirectSuccessRef = useRef(false);

  // Предполётная валидация Avito credentials при открытии модалки
  useEffect(() => {
    if (!isOpen) return;
    const validation = getAvitoConfigValidation();
    setConfigError(validation.valid ? null : validation.error);
  }, [isOpen]);

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
        const body = callbackResponse as { reason?: string; error?: string } | undefined;
        const reason = body?.reason;
        const msg =
          reason === 'invalid_redirect_uri'
            ? 'Неверный Redirect URI. Проверьте настройки в Avito Developer Portal.'
            : reason === 'invalid_credentials'
              ? 'Неверный Client ID или Secret. Проверьте настройки в админке.'
              : callbackError.message || 'Ошибка при обработке OAuth callback';
        console.error('AvitoConnectModal: Edge Function error', {
          error: callbackError,
          message: callbackError.message,
          status: callbackError.status,
          reason,
        });
        throw new Error(msg);
      }

      if (!callbackResponse || !callbackResponse.success) {
        const body = callbackResponse as { reason?: string; error?: string } | undefined;
        const reason = body?.reason;
        const msg =
          reason === 'invalid_redirect_uri'
            ? 'Неверный Redirect URI. Проверьте настройки в Avito Developer Portal.'
            : reason === 'invalid_credentials'
              ? 'Неверный Client ID или Secret. Проверьте настройки в админке.'
              : (callbackResponse as { error?: string })?.error || 'Не удалось обработать OAuth callback';
        console.error('AvitoConnectModal: Invalid callback response', callbackResponse);
        throw new Error(msg);
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
        if (import.meta.env.DEV) console.log('AvitoConnectModal: Integration loaded', {
          integrationId: integration.id,
          hasAccessToken: !!integration.access_token_encrypted,
          hasRefreshToken: !!integration.refresh_token_encrypted,
        });
      }

      toast.success('Аккаунт Avito подключён! Теперь введи ID объявления');
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
          toast.success('Аккаунт Avito подключён! Теперь введи номер аккаунта');
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
        setErrorDialog({
          title: 'Код авторизации недействителен',
          content: 'Код авторизации уже использован или истек. Пожалуйста, начните процесс подключения Avito заново. Нажмите "Подключить Avito" еще раз.',
          onOk: () => {
            clearConnectionProgress(property.id);
            setCurrentStep(0);
            setIsProcessingOAuth(false);
            setErrorDialog(null);
          },
        });
        return;
      }
      
      // Проверяем, не является ли это ошибкой 404 (Edge Function не развернута)
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        setErrorDialog({
          title: 'Edge Function не найдена',
          content: 'Функция avito_sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
        });
      } else {
        // Показываем детальное сообщение об ошибке, если есть детали от Avito API
        const displayMessage = errorDetails?.error_description || 
                              errorDetails?.details || 
                              errorMessage;
        toast.error(displayMessage);
      }
    } finally {
      setLoading(false);
      setIsProcessingOAuth(false);
    }
  }, [property.id, isProcessingOAuth]);

  // Load progress on open and reset success state
  useEffect(() => {
    if (isOpen) {
      if (initialShowAvitoSuccess && !hasShownRedirectSuccessRef.current) {
        hasShownRedirectSuccessRef.current = true;
        setShowSuccess(true);
        setCurrentStep(1);
        sessionStorage.removeItem('avito_oauth_pending');
        navigate(location.pathname, { replace: true, state: {} });
      }
      if (!initialShowAvitoSuccess) {
        setShowSuccess(false);
      }
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
          clearOAuthError();
          setErrorDialog({
            title: 'Ошибка авторизации',
            content: oauthError.error_description || oauthError.error || 'Неизвестная ошибка',
            onOk: () => {
              clearConnectionProgress(property.id);
              setCurrentStep(0);
              setErrorDialog(null);
            },
          });
          return;
        }

        const oauthSuccess = getOAuthSuccess();
        if (oauthSuccess) {
          if (oauthCodeConsumedRef.current) return;
          oauthCodeConsumedRef.current = true;
          clearOAuthSuccess();
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        } else {
          // No OAuth callback, starting from step 0
          setCurrentStep(0);
        }
      }
    } else {
      hasShownRedirectSuccessRef.current = false;
      oauthCodeConsumedRef.current = false;
      setCurrentStep(0);
      setOauthRedirecting(false);
      setIsProcessingOAuth(false);
      setShowSuccess(false);
    }
  }, [isOpen, property.id, handleOAuthCallback, initialShowAvitoSuccess, location.pathname, navigate]);

  // Check if user is returning from OAuth redirect (poll until code is consumed by main effect or here)
  useEffect(() => {
    if (isOpen && currentStep === 0 && !isProcessingOAuth) {
      const checkInterval = setInterval(() => {
        if (isProcessingOAuth || oauthCodeConsumedRef.current) return;
        const oauthSuccess = getOAuthSuccess();
        if (oauthSuccess) {
          clearInterval(checkInterval);
          oauthCodeConsumedRef.current = true;
          clearOAuthSuccess();
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

  const handleConnectClick = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Пожалуйста, войдите в систему');
        return;
      }
      const oauthUrl = generateOAuthUrl(property.id);
      const loginUrl = `https://www.avito.ru/login?next=${encodeURIComponent(oauthUrl)}`;
      sessionStorage.setItem('avito_oauth_pending', JSON.stringify({ propertyId: property.id }));
      saveConnectionProgress(property.id, 0, {});
      window.location.replace(loginUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при генерации OAuth URL');
    }
  };

  const handleSubmit = async () => {
    if (!userId) {
      toast.error('Введи номер аккаунта Avito');
      return;
    }

    if (!itemId) {
      toast.error('Введи ID объявления');
      return;
    }

    // Validate userId: must be 6-8 digits
    const trimmedUserId = userId.trim();
    if (!trimmedUserId || !/^[0-9]{6,8}$/.test(trimmedUserId)) {
      toast.error('Номер аккаунта должен содержать 6-8 цифр');
      return;
    }

    // Validate itemId: must be 10-12 digits before saving
    const trimmedItemId = itemId.trim();
    if (!trimmedItemId || !/^[0-9]{10,12}$/.test(trimmedItemId)) {
      toast.error('ID объявления должен содержать 10-12 цифр');
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
        toast.error('Ошибка: неверный формат номера аккаунта или ID объявления');
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

      // Show success toast
      toast.success('Цены обновлены в Avito 🚀');

      // Show success block instead of closing modal
      setShowSuccess(true);

      // Auto trigger sync after a short delay to ensure DB is updated
      setTimeout(async () => {
        try {
          const { syncAvitoIntegration } = await import('../services/apiSync');
          const syncResult = await syncAvitoIntegration(property.id);
          
          if (syncResult.success) {
            if (syncResult.pricesSuccess && syncResult.intervalsFailed) {
              toast.success('Цены обновлены в Avito');
            } else if (syncResult.errors && syncResult.errors.length > 0) {
              const errorMessages = syncResult.errors.map(e => e.message || 'Ошибка').join(', ');
              toast(`Частичная синхронизация: ${errorMessages}`, { icon: '⚠️' });
            } else {
              toast.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
            }
          } else {
            const errorMessage = syncResult.message || 'Ошибка синхронизации с Avito';
            if (syncResult.errors && syncResult.errors.length > 0) {
              showAvitoErrors(syncResult.errors, t).catch((err) => {
                console.error('showAvitoErrors failed:', err);
                toast.error(errorMessage);
              });
            } else if (errorMessage.includes('Объявление не найдено') || errorMessage.includes('404') || errorMessage.includes('не найдено')) {
              toast.error('Проверь ID объявления — это длинный номер из URL Avito (10-12 цифр)');
            } else {
              toast.error(errorMessage);
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
        setErrorDialog({
          title: 'Edge Function не найдена',
          content: 'Функция avito_sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
        });
      } else {
        toast.error(errorMessage);
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
        toast('Продолжаем подключение Avito');
      }
  };

  const handleCancel = () => {
    if (currentStep > 0) {
      setConfirmCloseOpen(true);
    } else {
      onClose();
    }
  };

  const confirmClose = () => {
    setConfirmCloseOpen(false);
    onClose();
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Show resume prompt if progress exists (check dynamically)
  const checkProgress = loadConnectionProgress(property.id);
  const showResumePrompt = checkProgress && checkProgress.step > 0 && currentStep === 0;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()} modal>
        <DialogContent className="max-w-[600px]" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => oauthRedirecting && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Подключение Avito</DialogTitle>
            <DialogDescription className="sr-only">Пошаговое подключение аккаунта Avito и объявления</DialogDescription>
          </DialogHeader>

          {showResumePrompt && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded-md">
              <p className="text-sm text-foreground mb-2 font-medium">
                Обнаружен сохранённый прогресс подключения
              </p>
              <Button onClick={handleResume}>
                Продолжить подключение Avito
              </Button>
            </div>
          )}

          {!showSuccess && (
            <div className="mb-6 flex gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${currentStep >= 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
              <div className="flex-1 flex items-center">
                <span className="text-sm font-medium">Подключить аккаунт Avito</span>
              </div>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${currentStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
              <div className="flex-1 flex items-center">
                <span className="text-sm font-medium">Номер аккаунта и ID объявления</span>
              </div>
            </div>
          )}

          <div className="min-h-[200px]">
            {currentStep === 0 && (
              <div className="text-center py-8">
                {oauthRedirecting ? (
                  <div>
                    <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">
                      Ждём, пока вы подтвердите доступ в Avito… Это займёт 10 секунд
                    </p>
                  </div>
                ) : (
                  <div>
                    {configError && (
                      <p className="text-destructive mb-4 text-sm" role="alert">
                        Неверный Client ID. Проверьте настройки интеграции в админке
                      </p>
                    )}
                    <p className="text-foreground mb-6 text-base">
                      Нажмите кнопку ниже, чтобы авторизоваться в Avito и предоставить доступ к вашему аккаунту
                    </p>
                    <Button
                      size="lg"
                      onClick={handleConnectClick}
                      disabled={loading || !!configError}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Подключить Avito
                    </Button>
                  </div>
                )}
              </div>
            )}

            {currentStep === 1 && !showSuccess && (
              <div>
                <div className="mb-6">
                  <p className="font-medium mb-2">Номер аккаунта Avito:</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Короткий номер аккаунта. Можно найти в настройках аккаунта Avito.
                  </p>
                  <Input
                    placeholder="Номер аккаунта"
                    value={userId}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setUserId(value);
                    }}
                    disabled={loading}
                    maxLength={8}
                  />
                  {!userId && <p className="text-xs text-destructive mt-1">Номер аккаунта обязателен</p>}
                  {userId && !/^[0-9]{6,8}$/.test(userId) && <p className="text-xs text-destructive mt-1">Номер аккаунта должен содержать 6-8 цифр</p>}
                </div>

                <div className="mb-6">
                  <p className="font-medium mb-2">ID объявления на Avito:</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    ID объявления — 10–12 цифр из URL объявления на Avito.
                  </p>
                  <Input
                    placeholder="ID объявления (10–12 цифр)"
                    value={itemId}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setItemId(value);
                    }}
                    disabled={loading}
                    maxLength={12}
                  />
                  {!itemId && <p className="text-xs text-destructive mt-1">ID объявления обязателен</p>}
                  {itemId && !/^[0-9]{10,12}$/.test(itemId) && <p className="text-xs text-destructive mt-1">ID объявления должен содержать 10-12 цифр</p>}
                </div>

                <div className="mb-6">
                  <p className="font-medium mb-2">Наценка для компенсации комиссии:</p>
                  <div className="flex gap-2 mb-2">
                    <SelectRoot value={markupType} onValueChange={(v) => v && setMarkupType(v as 'percent' | 'rub')}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="rub">Руб</SelectItem>
                      </SelectContent>
                    </SelectRoot>
                    <Input
                      type="number"
                      min={0}
                      max={markupType === 'percent' ? 100 : undefined}
                      value={markup}
                      onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)}
                      className="flex-1"
                    />
                  </div>
                  <div className="mt-3 p-3 rounded-md border border-border bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      <span>Base 5000</span>
                      {markupType === 'percent' ? (
                        <span> + {markup}% = <span className="font-semibold text-foreground">{Math.round(5000 * (1 + markup / 100))}</span></span>
                      ) : (
                        <span> + {markup} руб = <span className="font-semibold text-foreground">{5000 + markup}</span></span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleSubmit}
                    disabled={loading || !userId || !itemId || !/^[0-9]{6,8}$/.test(userId) || !/^[0-9]{10,12}$/.test(itemId)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Завершить подключение
                  </Button>
                </div>
              </div>
            )}

            {showSuccess && (
              <div className="py-4">
                <div className="mb-6 p-4 bg-success/10 border border-success/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <Check className="h-8 w-8 text-success" />
                    <h3 className="text-lg font-semibold">Интеграция Avito успешно подключена!</h3>
                  </div>
                  <div className="flex justify-end mt-6">
                    <Button onClick={onClose}>Закрыть</Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!showSuccess && (
            <DialogFooter className="flex justify-between sm:justify-between">
              <div>{currentStep > 0 && <Button variant="outline" onClick={handleBack} disabled={loading || oauthRedirecting}>Назад</Button>}</div>
              <Button variant="outline" onClick={handleCancel} disabled={loading && !oauthRedirecting}>Отмена</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm close */}
      <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Прервать подключение?</DialogTitle>
            <DialogDescription className="sr-only">Ваш прогресс будет сохранён. Вы сможете продолжить позже.</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground">Ваш прогресс будет сохранён. Вы сможете продолжить позже.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCloseOpen(false)}>Нет</Button>
            <Button onClick={confirmClose}>Да, закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error dialog */}
      <Dialog open={!!errorDialog} onOpenChange={(open) => !open && setErrorDialog(null)}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{errorDialog?.title}</DialogTitle>
            <DialogDescription className="sr-only">{errorDialog?.content}</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground">{errorDialog?.content}</p>
          <DialogFooter>
            <Button onClick={() => { errorDialog?.onOk?.(); setErrorDialog(null); }}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

