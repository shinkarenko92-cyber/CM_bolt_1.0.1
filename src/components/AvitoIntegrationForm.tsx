/**
 * Avito integration management UI extracted from PropertyModal.
 * Handles: connect, item-id editing, markup editing, disconnect/delete.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import toast from 'react-hot-toast';
import { Property, PropertyIntegration } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { AvitoConnectModal } from '@/components/AvitoConnectModal';
import { getOAuthSuccess, getOAuthError, parseOAuthState } from '@/services/avito';

interface AvitoIntegrationFormProps {
  property: Property | null;
  /** Whether the parent modal is open (used to reset state on close). */
  isOpen: boolean;
  /** After OAuth redirect — show item-ID / markup form instead of success screen. */
  initialShowAvitoForm?: boolean;
  /** Called when user closes the Avito connect modal (prevents re-opening on re-render). */
  onAvitoConnectClose?: () => void;
  /** Base price from the property form (for markup preview when property not yet saved). */
  basePrice?: number;
}

export function AvitoIntegrationForm({
  property,
  isOpen,
  initialShowAvitoForm = false,
  onAvitoConnectClose,
  basePrice,
}: AvitoIntegrationFormProps) {
  const { t } = useTranslation();
  const location = useLocation();

  const [avitoIntegration, setAvitoIntegration] = useState<PropertyIntegration | null>(null);
  const [isAvitoModalOpen, setIsAvitoModalOpen] = useState(false);
  const [isEditMarkupModalOpen, setIsEditMarkupModalOpen] = useState(false);
  const [newMarkup, setNewMarkup] = useState<number>(0);
  const [newMarkupType, setNewMarkupType] = useState<'percent' | 'rub'>('percent');
  const [isEditingItemId, setIsEditingItemId] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string>('');
  const [apiIntegrationsOpen, setApiIntegrationsOpen] = useState(false);
  const [confirmAvito, setConfirmAvito] = useState<'disconnect' | 'delete' | null>(null);
  const [confirmAvitoLoading, setConfirmAvitoLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadAvitoIntegration = useCallback(async () => {
    if (!property) return;

    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('property_id', property.id)
      .eq('platform', 'avito')
      .maybeSingle();

    if (error) {
      console.error('Error loading Avito integration:', error);
    }
    setAvitoIntegration(data);
    if (data != null) {
      const m = data.avito_markup;
      if (m != null && m !== undefined) {
        if (m < 0) {
          setNewMarkupType('rub');
          setNewMarkup(Math.abs(m));
        } else {
          setNewMarkupType('percent');
          setNewMarkup(m);
        }
      } else {
        setNewMarkupType('percent');
        setNewMarkup(0);
      }
    } else {
      setNewMarkupType('percent');
      setNewMarkup(0);
    }
  }, [property]);

  // Reset Avito modal when parent modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsAvitoModalOpen(false);
    }
  }, [isOpen]);

  // Load integration when property changes
  useEffect(() => {
    loadAvitoIntegration();
  }, [loadAvitoIntegration]);

  // Open AvitoConnectModal after OAuth redirect
  useEffect(() => {
    if (!property || !isOpen) return;

    if (initialShowAvitoForm) {
      setIsAvitoModalOpen(true);
      return;
    }

    const state = location.state as { avitoConnected?: boolean; propertyId?: string } | null;
    if (state?.avitoConnected && state?.propertyId === property.id) {
      setIsAvitoModalOpen(true);
    }

    const oauthSuccess = getOAuthSuccess();
    const oauthError = getOAuthError();

    if (!oauthSuccess && !oauthError) return;
    if (isAvitoModalOpen) return;

    if (oauthSuccess) {
      try {
        const stateData = parseOAuthState(oauthSuccess.state);
        if (stateData && stateData.property_id === property.id) {
          setIsAvitoModalOpen(true);
        }
      } catch (error) {
        console.error('AvitoIntegrationForm: Error parsing OAuth state:', error);
      }
    } else if (oauthError) {
      setIsAvitoModalOpen(true);
    }
  }, [property, isOpen, isAvitoModalOpen, location.state, initialShowAvitoForm]);

  const isTokenExpired = useMemo(() => {
    if (!avitoIntegration?.token_expires_at) return false;
    let expiresAtString = avitoIntegration.token_expires_at;
    if (!expiresAtString.endsWith('Z') && !expiresAtString.includes('+') && !expiresAtString.includes('-', 10)) {
      expiresAtString = expiresAtString + 'Z';
    }
    return new Date(expiresAtString).getTime() <= Date.now();
  }, [avitoIntegration?.token_expires_at]);

  const avitoSynced = useMemo(() => {
    const isActive = avitoIntegration?.is_active;
    const tokenValid = !isTokenExpired;
    const hasItemId = avitoIntegration?.avito_item_id && String(avitoIntegration.avito_item_id).length >= 10;
    return !!(isActive && tokenValid && hasItemId);
  }, [avitoIntegration, isTokenExpired]);

  const runDisconnectAvito = async () => {
    if (!avitoIntegration) return;
    setConfirmAvitoLoading(true);
    try {
      await supabase
        .from('integrations')
        .update({ is_active: false })
        .eq('id', avitoIntegration.id);
      await supabase
        .from('avito_sync_queue')
        .delete()
        .eq('integration_id', avitoIntegration.id);
      toast.success('Avito отключён');
      loadAvitoIntegration();
      setConfirmAvito(null);
    } finally {
      setConfirmAvitoLoading(false);
    }
  };

  const runDeleteAvito = async () => {
    if (!avitoIntegration) return;
    setConfirmAvitoLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', avitoIntegration.id);
      if (error) {
        toast.error('Ошибка при удалении: ' + error.message);
        return;
      }
      toast.success('Интеграция Avito удалена');
      setAvitoIntegration(null);
      setConfirmAvito(null);
    } finally {
      setConfirmAvitoLoading(false);
    }
  };

  const handleDisconnectAvito = () => setConfirmAvito('disconnect');
  const handleDeleteAvito = () => setConfirmAvito('delete');

  const handleEditMarkup = () => setIsEditMarkupModalOpen(true);

  const handleSaveMarkup = async () => {
    if (!avitoIntegration) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ avito_markup: newMarkupType === 'rub' ? -newMarkup : newMarkup })
        .eq('id', avitoIntegration.id);
      if (error) throw error;
      toast.success(t('avito.integration.markupUpdated'));
      setIsEditMarkupModalOpen(false);
      loadAvitoIntegration();
    } catch (error) {
      console.error('Failed to update markup:', error);
      toast.error('Ошибка при обновлении наценки: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditItemId = () => {
    const currentItemId = avitoIntegration?.avito_item_id != null ? String(avitoIntegration.avito_item_id) : '';
    setEditingItemId(currentItemId);
    setIsEditingItemId(true);
  };

  const handleSaveItemId = async () => {
    if (!avitoIntegration || !editingItemId || !/^[0-9]{10,11}$/.test(String(editingItemId).trim())) {
      toast.error('ID объявления должен содержать 10-11 цифр');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ avito_item_id: String(editingItemId).trim(), is_active: true })
        .eq('id', avitoIntegration.id);
      if (error) throw error;
      toast.success('ID объявления обновлён');
      setIsEditingItemId(false);
      setEditingItemId('');
      loadAvitoIntegration();
    } catch (error) {
      console.error('Failed to update item_id:', error);
      toast.error('Ошибка при обновлении ID объявления');
    } finally {
      setLoading(false);
    }
  };

  if (!property) {
    return (
      <div className="border-t border-slate-700 pt-6">
        <h3 className="text-lg font-medium text-white mb-2">{t('avito.integration.apiIntegrations')}</h3>
        <p className="text-sm text-slate-400">{t('avito.integration.saveFirst')}</p>
      </div>
    );
  }

  return (
    <>
      {/* API интеграции */}
      <div className="border-t border-slate-700 pt-6 min-w-0">
        <h3 className="text-lg font-medium text-white mb-4">{t('avito.integration.apiIntegrations')}</h3>

        <div className="bg-slate-700/50 rounded-lg p-4 min-w-0 overflow-hidden">
          {!avitoIntegration ? (
            <Button type="button" onClick={() => setIsAvitoModalOpen(true)}>
              {t('avito.integration.connectAvito')}
            </Button>
          ) : (
            <Collapsible open={apiIntegrationsOpen} onOpenChange={setApiIntegrationsOpen}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-3 min-w-0 shrink">
                  <span className="text-white font-medium shrink-0">Avito</span>
                  {avitoSynced ? (
                    <span className="flex items-center gap-1.5 text-green-400 text-sm shrink-0">
                      <Check className="h-4 w-4" />
                      {t('avito.integration.synced')}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-sm shrink-0">{t('avito.integration.disabled')}</span>
                  )}
                </div>
                <CollapsibleTrigger asChild>
                  <Button size="sm" className="shrink-0" type="button">
                    {apiIntegrationsOpen ? t('avito.integration.collapse') : t('avito.integration.expand')}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="mt-4 space-y-4">
                  {!avitoIntegration.is_active && (
                    <Button type="button" onClick={() => setIsAvitoModalOpen(true)}>
                      {t('avito.integration.reconnect')}
                    </Button>
                  )}

                  {/* Warnings */}
                  {avitoIntegration.avito_item_id && String(avitoIntegration.avito_item_id).length < 10 && (
                    <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-3">
                      <p className="text-yellow-300 text-sm font-medium mb-1">{t('avito.integration.warningUpdateItemId')}</p>
                      <p className="text-yellow-200 text-xs">{t('avito.integration.warningUpdateItemIdHint')}</p>
                    </div>
                  )}
                  {!avitoIntegration.avito_item_id && (
                    <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-3">
                      <p className="text-yellow-300 text-sm font-medium mb-1">{t('avito.integration.warningUpdateItemId')}</p>
                      <p className="text-yellow-200 text-xs">{t('avito.integration.warningUpdateItemIdHint')}</p>
                    </div>
                  )}

                  {/* ID объявления */}
                  <div className="min-w-0">
                    <label className="block text-sm text-slate-400 mb-1">{t('avito.integration.itemId')}</label>
                    {isEditingItemId ? (
                      <div className="p-3 bg-slate-600/50 rounded border border-slate-500 space-y-2">
                        <Input
                          placeholder={t('avito.integration.itemIdPlaceholder')}
                          value={editingItemId}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                            setEditingItemId(value);
                          }}
                          maxLength={11}
                          className="min-w-0"
                        />
                        {editingItemId && !/^[0-9]{10,11}$/.test(editingItemId) && (
                          <p className="text-xs text-red-400">{t('avito.integration.itemIdInvalid')}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveItemId}
                            disabled={!editingItemId || !/^[0-9]{10,11}$/.test(editingItemId) || loading}
                          >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t('avito.integration.save')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => { setIsEditingItemId(false); setEditingItemId(''); }}
                            disabled={loading}
                          >
                            {t('avito.integration.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-white truncate min-w-0" title={avitoIntegration.avito_item_id || ''}>
                          {avitoIntegration.avito_item_id || '—'}
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={handleEditItemId} disabled={loading}>
                          {t('avito.integration.editItemId')}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Наценка */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t('avito.integration.markup')}</label>
                    <div className="flex items-center gap-2">
                      <span className="text-white">
                        {avitoIntegration.avito_markup != null
                          ? avitoIntegration.avito_markup < 0
                            ? `${Math.abs(avitoIntegration.avito_markup)} руб`
                            : `${avitoIntegration.avito_markup}%`
                          : '0%'}
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={handleEditMarkup}>
                        {t('avito.integration.editMarkup')}
                      </Button>
                    </div>
                  </div>

                  {/* Отключить */}
                  {avitoIntegration.is_active && (
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={avitoIntegration.is_active}
                        onCheckedChange={(checked) => { if (!checked) handleDisconnectAvito(); }}
                      />
                      <span className="text-sm text-slate-300">{t('avito.integration.disable')}</span>
                    </div>
                  )}

                  {/* Удалить */}
                  <Button type="button" variant="destructive" size="sm" onClick={handleDeleteAvito}>
                    {t('avito.integration.delete')}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>

      {/* Avito Connect Modal */}
      <AvitoConnectModal
        isOpen={isAvitoModalOpen}
        onClose={() => {
          setIsAvitoModalOpen(false);
          onAvitoConnectClose?.();
        }}
        property={property}
        onSuccess={() => { loadAvitoIntegration(); }}
        initialShowAvitoSuccess={
          initialShowAvitoForm ||
          Boolean(
            (location.state as { avitoConnected?: boolean; propertyId?: string })?.avitoConnected &&
            (location.state as { propertyId?: string })?.propertyId === property.id
          )
        }
      />

      {/* Confirm Avito disconnect / delete */}
      <Dialog open={!!confirmAvito} onOpenChange={(open) => !open && setConfirmAvito(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAvito === 'disconnect' ? t('avito.integration.disconnectConfirmTitle') : t('avito.integration.deleteConfirmTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {confirmAvito === 'disconnect' ? t('avito.integration.disconnectConfirmContent') : t('avito.integration.deleteConfirmContent')}
            </DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground">
            {confirmAvito === 'disconnect' ? t('avito.integration.disconnectConfirmContent') : t('avito.integration.deleteConfirmContent')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAvito(null)} disabled={confirmAvitoLoading}>
              {t('avito.integration.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmAvito === 'disconnect' ? runDisconnectAvito : runDeleteAvito}
              disabled={confirmAvitoLoading}
            >
              {confirmAvitoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmAvito === 'disconnect' ? t('avito.integration.disable') : t('avito.integration.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Markup Modal */}
      <Dialog open={isEditMarkupModalOpen} onOpenChange={setIsEditMarkupModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('avito.integration.editMarkup')}</DialogTitle>
            <DialogDescription className="sr-only">{t('avito.integration.markup')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm text-muted-foreground mb-2">{t('avito.integration.markup')}</label>
            <div className="flex gap-2 mb-2">
              <SelectRoot value={newMarkupType} onValueChange={(v) => v && setNewMarkupType(v as 'percent' | 'rub')}>
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
                max={newMarkupType === 'percent' ? 100 : undefined}
                value={newMarkup}
                onChange={(e) => setNewMarkup(parseFloat(e.target.value) || 0)}
                className="flex-1"
              />
            </div>
            <div className="mt-3 p-3 rounded-md border border-border bg-muted/30">
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const bp = basePrice ?? property.base_price ?? 0;
                  const withMarkup = newMarkupType === 'percent'
                    ? Math.round(bp * (1 + newMarkup / 100))
                    : Math.round(bp + newMarkup);
                  return (
                    <>
                      <span className="text-muted-foreground">База {bp}</span>
                      {newMarkupType === 'percent' ? (
                        <span> + {newMarkup}% = <span className="font-semibold text-foreground">{withMarkup}</span></span>
                      ) : (
                        <span> + {newMarkup} руб = <span className="font-semibold text-foreground">{withMarkup}</span></span>
                      )}
                    </>
                  );
                })()}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditMarkupModalOpen(false)}>
              {t('avito.integration.cancel')}
            </Button>
            <Button onClick={handleSaveMarkup} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('avito.integration.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
