/**
 * Avito Connect Modal - OAuth flow with 3-step stepper
 * Uses Ant Design v5 components
 */

import { useState, useEffect } from 'react';
import { Modal, Steps, Button, Input, InputNumber, Select, Spin, message } from 'antd';
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
  exchangeCodeForToken,
  getUserAccounts,
  validateItemId,
  performInitialSync,
} from '../services/avito';
import type { AvitoAccount } from '../types/avito';

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
  const [accounts, setAccounts] = useState<AvitoAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [markup, setMarkup] = useState<number>(15);
  const [accessToken, setAccessToken] = useState<string>('');
  const [validatingItemId, setValidatingItemId] = useState(false);

  // Load progress on open
  useEffect(() => {
    if (isOpen) {
      const progress = loadConnectionProgress(property.id);
      if (progress && progress.step > 0) {
        setCurrentStep(progress.step);
        if (progress.data.accountId) setSelectedAccountId(progress.data.accountId);
        if (progress.data.itemId) setItemId(progress.data.itemId);
        if (progress.data.markup) setMarkup(progress.data.markup);
        if (progress.data.accessToken) setAccessToken(progress.data.accessToken);
      } else {
        // Check for OAuth callback results
        const oauthError = getOAuthError();
        if (oauthError) {
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
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        } else {
          setCurrentStep(0);
        }
      }
    } else {
      // Reset on close
      setCurrentStep(0);
      setOauthRedirecting(false);
    }
  }, [isOpen, property.id]);

  // Check if user is returning from OAuth redirect
  useEffect(() => {
    if (isOpen && currentStep === 0) {
      const checkInterval = setInterval(() => {
        const oauthSuccess = getOAuthSuccess();
        if (oauthSuccess) {
          clearInterval(checkInterval);
          handleOAuthCallback(oauthSuccess.code, oauthSuccess.state);
        }
      }, 500);

      return () => clearInterval(checkInterval);
    }
  }, [isOpen, currentStep]);

  const handleOAuthCallback = async (code: string, state: string) => {
    setLoading(true);
    try {
      const stateData = parseOAuthState(state);
      if (!stateData || stateData.property_id !== property.id) {
        throw new Error('Invalid state parameter');
      }

      // Используем тот же redirect_uri, что и в OAuth URL
      // Должен совпадать с настройками в Avito: https://app.roomi.pro/auth/avito-callback
      const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';
      
      // Exchange code for token
      const tokenResponse = await exchangeCodeForToken(code, redirectUri);
      setAccessToken(tokenResponse.access_token);

      // Get user accounts
      const userAccounts = await getUserAccounts(tokenResponse.access_token);
      setAccounts(userAccounts);

      // Auto-select if only one account
      if (userAccounts.length === 1) {
        setSelectedAccountId(userAccounts[0].id);
        saveConnectionProgress(property.id, 2, {
          accountId: userAccounts[0].id,
          accessToken: tokenResponse.access_token,
        });
        setCurrentStep(2); // Skip to Item ID step
      } else {
        saveConnectionProgress(property.id, 1, {
          accessToken: tokenResponse.access_token,
        });
        setCurrentStep(1); // Go to account selection
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при обработке авторизации';
      
      // Проверяем, не является ли это ошибкой 404 (Edge Function не развернута)
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        Modal.error({
          title: 'Edge Function не найдена',
          content: 'Функция avito-sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
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

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
    saveConnectionProgress(property.id, 1, {
      accountId,
      accessToken,
    });
    setCurrentStep(2);
  };

  const handleItemIdValidate = async () => {
    if (!itemId || !selectedAccountId || !accessToken) {
      message.error('Заполните все поля');
      return;
    }

    setValidatingItemId(true);
    try {
      const validation = await validateItemId(selectedAccountId, itemId, accessToken);
      
      if (!validation.available) {
        Modal.error({
          title: 'ID уже используется',
          content: validation.error || 'Этот ID уже подключен к другому объекту',
          okText: 'Выбрать другой ID',
        });
        return;
      }

      // Item ID is valid, proceed to markup step
      saveConnectionProgress(property.id, 2, {
        accountId: selectedAccountId,
        itemId,
        accessToken,
      });
      setCurrentStep(3);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при проверке ID';
      
      // Проверяем ошибку 404
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        Modal.error({
          title: 'Edge Function не найдена',
          content: 'Функция avito-sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
          okText: 'Понятно',
          width: 500,
        });
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

    setLoading(true);
    try {
      // Encrypt tokens via Edge Function (Vault encryption)
      const { data: integration, error } = await supabase.functions.invoke('avito-sync', {
        body: {
          action: 'save-integration',
          property_id: property.id,
          avito_account_id: selectedAccountId,
          avito_item_id: parseInt(itemId, 10),
          avito_markup: markup,
          access_token: accessToken,
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
      onSuccess?.();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при сохранении интеграции';
      
      // Проверяем ошибку 404
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
        Modal.error({
          title: 'Edge Function не найдена',
          content: 'Функция avito-sync не развернута. Пожалуйста, разверните её в Supabase Dashboard → Edge Functions или обратитесь к администратору.',
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

  // Show resume prompt if progress exists (check dynamically)
  const checkProgress = loadConnectionProgress(property.id);
  const showResumePrompt = checkProgress && checkProgress.step > 0 && currentStep === 0;

  return (
    <Modal
      title="Подключение Avito"
      open={isOpen}
      onCancel={handleCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      {showResumePrompt && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
          <p className="text-sm text-blue-300 mb-2">
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
          { title: 'Авторизация' },
          { title: 'Выбор аккаунта' },
          { title: 'ID объявления' },
          { title: 'Наценка' },
        ]}
      />

      <div className="min-h-[200px]">
        {/* Step 0: OAuth Redirect */}
        {currentStep === 0 && (
          <div className="text-center py-8">
            {oauthRedirecting ? (
              <div>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <p className="mt-4 text-slate-400">
                  Ждём, пока вы подтвердите доступ в Avito… Это займёт 10 секунд
                </p>
              </div>
            ) : (
              <div>
                <p className="text-slate-300 mb-6">
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

        {/* Step 1: Account Selection */}
        {currentStep === 1 && (
          <div>
            <p className="text-slate-300 mb-4">Выберите аккаунт Avito:</p>
            <Select
              style={{ width: '100%' }}
              placeholder="Выберите аккаунт"
              value={selectedAccountId || undefined}
              onChange={handleAccountSelect}
              loading={loading}
            >
              {accounts.map((account) => (
                <Select.Option key={account.id} value={account.id}>
                  {account.name} {account.is_primary && '(Основной)'}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}

        {/* Step 2: Item ID Input */}
        {currentStep === 2 && (
          <div>
            <p className="text-slate-300 mb-2">Введите ID объявления на Avito:</p>
            <p className="text-xs text-slate-500 mb-4">
              ID можно найти в URL объявления: avito.ru/moskva/kvartiry/
              <span className="text-teal-400 font-bold">123456789</span>
            </p>
            <Input
              placeholder="Например: 123456789"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              onPressEnter={handleItemIdValidate}
              disabled={validatingItemId}
            />
            <Button
              type="primary"
              className="mt-4"
              onClick={handleItemIdValidate}
              loading={validatingItemId}
            >
              Проверить ID
            </Button>
          </div>
        )}

        {/* Step 3: Markup Configuration */}
        {currentStep === 3 && (
          <div>
            <p className="text-slate-300 mb-2">Наценка для компенсации комиссии:</p>
            <p className="text-xs text-slate-500 mb-4">
              Цена на Avito = базовая цена + наценка (%)
            </p>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={100}
              value={markup}
              onChange={(value) => setMarkup(value || 15)}
              formatter={(value) => `${value}%`}
              parser={(value) => parseFloat(value?.replace('%', '') || '0')}
            />
            <Button
              type="primary"
              className="mt-6 w-full"
              onClick={handleSubmit}
              loading={loading}
              icon={<CheckCircleOutlined />}
            >
              Завершить подключение
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

