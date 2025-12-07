import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Link2,
  ChevronDown,
  ChevronUp,
  Check,
  ExternalLink,
  Percent,
  DollarSign,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Property, PropertyIntegration, AGGREGATOR_PLATFORMS } from '../lib/supabase';
import { isAvitoConfigured } from '../services/avitoApi';

interface ApiIntegrationSettingsProps {
  property: Property;
  onIntegrationsChange?: (integrations: PropertyIntegration[]) => void;
}

type Platform = {
  id: string;
  name: string;
  hasApi: boolean;
};

export function ApiIntegrationSettings({ property, onIntegrationsChange }: ApiIntegrationSettingsProps) {
  const [showOthers, setShowOthers] = useState(false);
  const [integrations, setIntegrations] = useState<Record<string, PropertyIntegration>>({});
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Load integrations from localStorage
  useEffect(() => {
    const savedIntegrations: Record<string, PropertyIntegration> = {};
    const allPlatforms = [...AGGREGATOR_PLATFORMS.main, ...AGGREGATOR_PLATFORMS.others];
    
    allPlatforms.forEach(platform => {
      const key = `integration_${property.id}_${platform.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          savedIntegrations[platform.id] = JSON.parse(saved);
        } catch (e) {
          console.error('Error parsing integration:', e);
        }
      }
    });
    
    setIntegrations(savedIntegrations);
  }, [property.id]);

  const saveIntegration = (platformId: string, data: Partial<PropertyIntegration>) => {
    const key = `integration_${property.id}_${platformId}`;
    const existing = integrations[platformId] || {
      id: `${property.id}_${platformId}`,
      property_id: property.id,
      platform: platformId,
      external_id: '',
      markup_type: 'percent' as const,
      markup_value: 0,
      is_enabled: false,
      last_sync_at: null,
    };
    
    const updated = { ...existing, ...data };
    localStorage.setItem(key, JSON.stringify(updated));
    
    setIntegrations(prev => ({
      ...prev,
      [platformId]: updated,
    }));
    
    if (onIntegrationsChange) {
      const allIntegrations = Object.values({ ...integrations, [platformId]: updated });
      onIntegrationsChange(allIntegrations);
    }
  };

  const handleSync = async (platformId: string) => {
    if (platformId === 'avito' && !isAvitoConfigured()) {
      toast.error('Сначала настройте API ключи Avito в общих настройках');
      return;
    }
    
    setIsSyncing(platformId);
    
    // Simulate sync (in real implementation, call the actual sync function)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    saveIntegration(platformId, {
      last_sync_at: new Date().toISOString(),
    });
    
    setIsSyncing(null);
    toast.success(`Синхронизация с ${AGGREGATOR_PLATFORMS.main.find(p => p.id === platformId)?.name || platformId} завершена`);
  };

  const renderPlatformCard = (platform: Platform) => {
    const integration = integrations[platform.id];
    const isExpanded = expandedPlatform === platform.id;
    const isEnabled = integration?.is_enabled || false;
    const hasExternalId = !!integration?.external_id;
    
    return (
      <div
        key={platform.id}
        className={`bg-slate-700/50 rounded-lg overflow-hidden border ${
          isEnabled && hasExternalId ? 'border-green-500/50' : 'border-slate-600'
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-700/70 transition-colors"
          onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isEnabled && hasExternalId ? 'bg-green-500/20' : 'bg-slate-600'
            }`}>
              <Link2 className={`w-5 h-5 ${
                isEnabled && hasExternalId ? 'text-green-400' : 'text-slate-400'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{platform.name}</span>
                {platform.hasApi && (
                  <span className="text-xs px-1.5 py-0.5 bg-teal-500/20 text-teal-400 rounded">API</span>
                )}
              </div>
              {integration?.external_id && (
                <p className="text-xs text-slate-400">ID: {integration.external_id}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isEnabled && hasExternalId && (
              <Check className="w-4 h-4 text-green-400" />
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </div>
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="p-4 border-t border-slate-600 space-y-4">
            {/* External ID */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                ID объявления на {platform.name}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={integration?.external_id || ''}
                  onChange={(e) => saveIntegration(platform.id, { external_id: e.target.value })}
                  placeholder="Например: 123456789"
                  className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 text-sm"
                />
                <a
                  href={`https://${platform.id === 'avito' ? 'avito.ru' : platform.id === 'booking' ? 'booking.com' : platform.id === 'airbnb' ? 'airbnb.com' : 'cian.ru'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                  title="Открыть сайт"
                >
                  <ExternalLink className="w-5 h-5 text-slate-300" />
                </a>
              </div>
              
              {/* Helpful hint */}
              {platform.id === 'avito' && (
                <div className="mt-2 p-2 bg-slate-800 rounded text-xs">
                  <p className="text-slate-400 mb-1">Как найти ID:</p>
                  <div className="text-slate-300 font-mono text-xs">
                    avito.ru/moskva/kvartiry/<span className="text-teal-400 font-bold">123456789</span>
                  </div>
                  <p className="text-slate-500 mt-1">ID — это число в конце ссылки</p>
                </div>
              )}
              {platform.id === 'booking' && (
                <div className="mt-2 p-2 bg-slate-800 rounded text-xs">
                  <p className="text-slate-400 mb-1">Как найти ID:</p>
                  <div className="text-slate-300 font-mono text-xs">
                    booking.com/hotel/ru/<span className="text-teal-400 font-bold">hotel-name</span>.html
                  </div>
                </div>
              )}
              {platform.id === 'airbnb' && (
                <div className="mt-2 p-2 bg-slate-800 rounded text-xs">
                  <p className="text-slate-400 mb-1">Как найти ID:</p>
                  <div className="text-slate-300 font-mono text-xs">
                    airbnb.ru/rooms/<span className="text-teal-400 font-bold">12345678</span>
                  </div>
                </div>
              )}
              {platform.id === 'cian' && (
                <div className="mt-2 p-2 bg-slate-800 rounded text-xs">
                  <p className="text-slate-400 mb-1">Как найти ID:</p>
                  <div className="text-slate-300 font-mono text-xs">
                    cian.ru/rent/flat/<span className="text-teal-400 font-bold">123456789</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Markup */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Наценка для компенсации комиссии
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex">
                  <input
                    type="number"
                    value={integration?.markup_value || 0}
                    onChange={(e) => saveIntegration(platform.id, { markup_value: Number(e.target.value) })}
                    min="0"
                    className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded-l-lg text-white text-sm"
                  />
                  <div className="flex border border-l-0 border-slate-500 rounded-r-lg overflow-hidden">
                    <button
                      onClick={() => saveIntegration(platform.id, { markup_type: 'percent' })}
                      className={`px-3 py-2 flex items-center justify-center transition-colors ${
                        (integration?.markup_type || 'percent') === 'percent'
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      }`}
                      title="Процент"
                    >
                      <Percent className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => saveIntegration(platform.id, { markup_type: 'fixed' })}
                      className={`px-3 py-2 flex items-center justify-center transition-colors ${
                        integration?.markup_type === 'fixed'
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      }`}
                      title="Фиксированная сумма"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {(integration?.markup_type || 'percent') === 'percent'
                  ? `Цена на ${platform.name} = базовая цена + ${integration?.markup_value || 0}%`
                  : `Цена на ${platform.name} = базовая цена + ${integration?.markup_value || 0} ${property.currency}`
                }
              </p>
            </div>
            
            {/* Enable/Disable */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-300">Синхронизация включена</label>
              <button
                onClick={() => saveIntegration(platform.id, { is_enabled: !isEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isEnabled ? 'bg-teal-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    isEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            {/* Sync Button */}
            {platform.hasApi && isEnabled && hasExternalId && (
              <button
                onClick={() => handleSync(platform.id)}
                disabled={isSyncing === platform.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white rounded-lg transition-colors"
              >
                {isSyncing === platform.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {isSyncing === platform.id ? 'Синхронизация...' : 'Синхронизировать сейчас'}
              </button>
            )}
            
            {/* Last Sync */}
            {integration?.last_sync_at && (
              <p className="text-xs text-slate-500 text-center">
                Последняя синхронизация: {new Date(integration.last_sync_at).toLocaleString('ru-RU')}
              </p>
            )}
            
            {/* Warning for platforms without API */}
            {!platform.hasApi && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs text-yellow-300">
                  API интеграция для {platform.name} пока недоступна. 
                  Вы можете настроить наценку и ID для отслеживания.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className="w-5 h-5 text-teal-400" />
        <h3 className="text-lg font-semibold text-white">API интеграции</h3>
      </div>
      
      <p className="text-sm text-slate-400 mb-4">
        Настройте синхронизацию календаря с внешними площадками. 
        Для каждой площадки можно задать ID объявления и наценку.
      </p>
      
      {/* Main Platforms */}
      <div className="space-y-2">
        {AGGREGATOR_PLATFORMS.main.map(renderPlatformCard)}
      </div>
      
      {/* Show Others Button */}
      <button
        onClick={() => setShowOthers(!showOthers)}
        className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-white transition-colors"
      >
        {showOthers ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Скрыть другие площадки
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Показать другие площадки ({AGGREGATOR_PLATFORMS.others.length})
          </>
        )}
      </button>
      
      {/* Other Platforms */}
      {showOthers && (
        <div className="space-y-2">
          {AGGREGATOR_PLATFORMS.others.map(renderPlatformCard)}
        </div>
      )}
      
      {/* Global API Settings Note */}
      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Примечание:</strong> Глобальные API ключи (Client ID, Secret) настраиваются в разделе 
          <span className="font-medium"> Настройки → Avito API</span>
        </p>
      </div>
    </div>
  );
}

