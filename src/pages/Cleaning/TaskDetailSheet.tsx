import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CleaningTask, CleaningPhotoType, InventoryItem, InventoryCheckInput, SupplyUsageInput } from '@/types/cleaning';
import {
  getCleaningPhotos,
  getSignedPhotoUrl,
  uploadPhoto,
  getInventoryItems,
  getInventoryChecks,
  saveInventoryCheck,
  getSupplyUsageList,
  saveSupplyUsage,
} from '@/services/cleaning';
import toast from 'react-hot-toast';
import { Camera, Loader2 } from 'lucide-react';

type TaskDetailSheetProps = {
  task: CleaningTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
};

export function TaskDetailSheet({ task, open, onOpenChange, onTaskUpdated }: TaskDetailSheetProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<{ id: string; storage_path: string; type: CleaningPhotoType; url?: string }[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [checks, setChecks] = useState<Record<string, { actual_count: number | null; is_ok: boolean | null; note: string }>>({});
  const [checksSaving, setChecksSaving] = useState(false);
  const [existingSupplies, setExistingSupplies] = useState<{ supply_name: string; amount_used: number; unit: string }[]>([]);
  const [newSupplies, setNewSupplies] = useState<{ supply_name: string; amount_used: number; unit: string }[]>([]);
  const [supplyName, setSupplyName] = useState('');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [supplyUnit, setSupplyUnit] = useState('ml');
  const [suppliesSaving, setSuppliesSaving] = useState(false);

  const loadPhotos = useCallback(async (taskId: string) => {
    setPhotosLoading(true);
    try {
      const list = await getCleaningPhotos(taskId);
      const withUrls = await Promise.all(
        list.map(async (p) => {
          try {
            const url = await getSignedPhotoUrl(p.storage_path);
            return { ...p, url };
          } catch {
            return { ...p, url: undefined };
          }
        })
      );
      setPhotos(withUrls);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load photos');
    } finally {
      setPhotosLoading(false);
    }
  }, []);

  const loadInventory = useCallback(async (taskId: string, propertyId: string) => {
    try {
      const [items, existing] = await Promise.all([
        getInventoryItems(propertyId),
        getInventoryChecks(taskId),
      ]);
      setInventoryItems(items);
      const map: Record<string, { actual_count: number | null; is_ok: boolean | null; note: string }> = {};
      items.forEach((i) => {
        const c = existing.find((e) => e.item_id === i.id);
        map[i.id] = {
          actual_count: c?.actual_count ?? null,
          is_ok: c?.is_ok ?? null,
          note: c?.note ?? '',
        };
      });
      setChecks(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load inventory');
    }
  }, []);

  const loadSupplyUsage = useCallback(async (taskId: string) => {
    try {
      const list = await getSupplyUsageList(taskId);
      setExistingSupplies(
        list.map((s) => ({
          supply_name: s.supply_name ?? '',
          amount_used: s.amount_used != null ? Number(s.amount_used) : 0,
          unit: s.unit ?? 'ml',
        }))
      );
      setNewSupplies([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load supply usage');
    }
  }, []);

  useEffect(() => {
    if (!open || !task) return;
    void loadPhotos(task.id);
    void loadInventory(task.id, task.property_id);
    void loadSupplyUsage(task.id);
  }, [open, task, loadPhotos, loadInventory, loadSupplyUsage]);

  const handlePhotoUpload = async (type: CleaningPhotoType, file: File | null) => {
    if (!task || !file) return;
    setUploading(type);
    try {
      await uploadPhoto(task.id, file, type);
      await loadPhotos(task.id);
      toast.success(t('cleaning.cleaner.photoUploaded', { defaultValue: 'Фото загружено' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleSaveInventory = async () => {
    if (!task) return;
    setChecksSaving(true);
    try {
      const payload: InventoryCheckInput[] = inventoryItems.map((item) => ({
        item_id: item.id,
        actual_count: checks[item.id]?.actual_count ?? null,
        is_ok: checks[item.id]?.is_ok ?? null,
        note: checks[item.id]?.note || undefined,
      }));
      await saveInventoryCheck(task.id, payload);
      toast.success(t('common.save'));
      onTaskUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setChecksSaving(false);
    }
  };

  const handleAddSupply = () => {
    const name = supplyName.trim();
    const amount = parseFloat(supplyAmount);
    if (!name || !Number.isFinite(amount) || amount <= 0) return;
    setNewSupplies((prev) => [...prev, { supply_name: name, amount_used: amount, unit: supplyUnit }]);
    setSupplyName('');
    setSupplyAmount('');
  };

  const handleSaveSupplies = async () => {
    if (!task || newSupplies.length === 0) return;
    setSuppliesSaving(true);
    try {
      const payload: SupplyUsageInput[] = newSupplies.map((s) => ({
        supply_name: s.supply_name,
        amount_used: s.amount_used,
        unit: s.unit,
      }));
      await saveSupplyUsage(task.id, payload);
      toast.success(t('common.save'));
      void loadSupplyUsage(task.id);
      onTaskUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSuppliesSaving(false);
    }
  };

  const allSupplies = [...existingSupplies, ...newSupplies];

  if (!task) return null;

  const beforePhotos = photos.filter((p) => p.type === 'before');
  const afterPhotos = photos.filter((p) => p.type === 'after');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {task.address || t('common.unknown')} — {task.scheduled_date} {task.scheduled_time.slice(0, 5)}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-6 pb-4">
            {/* Photos */}
            <Card className="p-4">
              <h3 className="font-medium mb-3">{t('cleaning.cleaner.photos', { defaultValue: 'Фото до/после' })}</h3>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t('cleaning.cleaner.before', { defaultValue: 'До' })}</p>
                      <div className="flex flex-wrap gap-2">
                        {beforePhotos.map((p) => (
                          <div key={p.id} className="w-20 h-20 rounded overflow-hidden bg-muted">
                            {p.url ? (
                              <img src={p.url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs">—</div>
                            )}
                          </div>
                        ))}
                        <label className="w-20 h-20 rounded border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 touch-manipulation">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={uploading !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePhotoUpload('before', f);
                              e.target.value = '';
                            }}
                          />
                          {uploading === 'before' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6 text-muted-foreground" />}
                        </label>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t('cleaning.cleaner.after', { defaultValue: 'После' })}</p>
                      <div className="flex flex-wrap gap-2">
                        {afterPhotos.map((p) => (
                          <div key={p.id} className="w-20 h-20 rounded overflow-hidden bg-muted">
                            {p.url ? (
                              <img src={p.url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs">—</div>
                            )}
                          </div>
                        ))}
                        <label className="w-20 h-20 rounded border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 touch-manipulation">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={uploading !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePhotoUpload('after', f);
                              e.target.value = '';
                            }}
                          />
                          {uploading === 'after' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6 text-muted-foreground" />}
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* Inventory */}
            <Card className="p-4">
              <h3 className="font-medium mb-3">{t('cleaning.cleaner.inventory', { defaultValue: 'Инвентаризация' })}</h3>
              {inventoryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('cleaning.cleaner.noInventory', { defaultValue: 'Нет списка предметов для этого объекта' })}</p>
              ) : (
                <div className="space-y-3">
                  {inventoryItems.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-32 truncate">{item.name}</span>
                      <span className="text-muted-foreground">ожид. {item.expected_count}</span>
                      <Input
                        type="number"
                        placeholder="факт"
                        className="w-20 h-10"
                        value={checks[item.id]?.actual_count ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          const parsed = parseInt(v, 10);
                          setChecks((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              actual_count: v === '' ? null : Number.isNaN(parsed) ? 0 : parsed,
                            },
                          }));
                        }}
                      />
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={checks[item.id]?.is_ok ?? false}
                          onChange={(e) =>
                            setChecks((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], is_ok: e.target.checked },
                            }))
                          }
                        />
                        <span className="text-xs">OK</span>
                      </label>
                      <Input
                        placeholder={t('cleaning.cleaner.note', { defaultValue: 'Заметка' })}
                        className="flex-1 min-w-0 h-10 text-xs"
                        value={checks[item.id]?.note ?? ''}
                        onChange={(e) =>
                          setChecks((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], note: e.target.value },
                          }))
                        }
                      />
                    </div>
                  ))}
                  <Button size="sm" onClick={handleSaveInventory} disabled={checksSaving}>
                    {checksSaving ? t('common.loading') : t('common.save')}
                  </Button>
                </div>
              )}
            </Card>

            {/* Supply usage */}
            <Card className="p-4">
              <h3 className="font-medium mb-3">{t('cleaning.cleaner.supplies', { defaultValue: 'Расход средств' })}</h3>
              <div className="space-y-2">
                {allSupplies.map((s, i) => (
                  <div key={i} className="text-sm flex justify-between items-center">
                    <span>{s.supply_name}</span>
                    <span className="text-muted-foreground">
                      {s.amount_used} {s.unit}
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 items-end pt-2">
                  <Input
                    placeholder={t('cleaning.cleaner.supplyName', { defaultValue: 'Название' })}
                    value={supplyName}
                    onChange={(e) => setSupplyName(e.target.value)}
                    className="w-28"
                  />
                  <Input
                    type="number"
                    placeholder="Кол-во"
                    value={supplyAmount}
                    onChange={(e) => setSupplyAmount(e.target.value)}
                    className="w-20"
                  />
                  <Select value={supplyUnit} onValueChange={setSupplyUnit}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="piece">{t('cleaning.cleaner.piece', { defaultValue: 'шт' })}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddSupply}>
                    +
                  </Button>
                </div>
                <Button size="sm" onClick={handleSaveSupplies} disabled={suppliesSaving || newSupplies.length === 0} className="mt-2">
                  {suppliesSaving ? t('common.loading') : t('common.save')}
                </Button>
              </div>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
