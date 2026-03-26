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
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CleaningTask, CleaningPhotoType, CleaningComment, InventoryItem, InventoryCheckInput, SupplyUsageInput } from '@/types/cleaning';
import {
  getCleaningPhotos,
  getSignedPhotoUrl,
  uploadPhoto,
  getInventoryItems,
  getInventoryChecks,
  saveInventoryCheck,
  getSupplyUsageList,
  saveSupplyUsage,
  deleteSupplyUsage,
  getCleaningComments,
  createCleaningComment,
} from '@/services/cleaning';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { Camera, Loader2, MessageSquare, Send, Trash2, WifiOff } from 'lucide-react';
import { enqueuePhoto, getPendingCount } from '@/lib/photoQueue';

type SavedSupply = { id: string; supply_name: string; amount_used: number; unit: string };
type NewSupply = { supply_name: string; amount_used: number; unit: string };

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
  const [existingSupplies, setExistingSupplies] = useState<SavedSupply[]>([]);
  const [newSupplies, setNewSupplies] = useState<NewSupply[]>([]);
  const [supplyName, setSupplyName] = useState('');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [supplyUnit, setSupplyUnit] = useState('ml');
  const [suppliesSaving, setSuppliesSaving] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [comments, setComments] = useState<CleaningComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);

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
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
    } finally {
      setPhotosLoading(false);
    }
  }, [t]);

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
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
    }
  }, [t]);

  const loadSupplyUsage = useCallback(async (taskId: string) => {
    try {
      const list = await getSupplyUsageList(taskId);
      setExistingSupplies(
        list.map((s) => ({
          id: s.id,
          supply_name: s.supply_name ?? '',
          amount_used: s.amount_used != null ? Number(s.amount_used) : 0,
          unit: s.unit ?? 'ml',
        }))
      );
      setNewSupplies([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
    }
  }, [t]);

  const loadComments = useCallback(async (taskId: string) => {
    setCommentsLoading(true);
    try {
      const [{ data: u }, list] = await Promise.all([
        supabase.auth.getUser(),
        getCleaningComments(taskId),
      ]);
      setViewerUserId(u.user?.id ?? null);
      setComments(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open || !task) return;
    void loadPhotos(task.id);
    void loadInventory(task.id, task.property_id);
    void loadSupplyUsage(task.id);
    void loadComments(task.id);
    void getPendingCount().then(setPendingQueueCount);
    setCommentText('');
  }, [open, task, loadPhotos, loadInventory, loadSupplyUsage, loadComments]);

  const handlePhotoUpload = async (type: CleaningPhotoType, file: File | null) => {
    if (!task || !file) return;
    setUploading(type);
    try {
      if (!navigator.onLine) {
        await enqueuePhoto(task.id, file, type);
        const count = await getPendingCount();
        setPendingQueueCount(count);
        toast.success(
          t('cleaning.cleaner.photoQueued', {
            defaultValue: `Фото сохранено офлайн (в очереди: ${count})`,
            count,
          }),
          { icon: '📡' },
        );
      } else {
        await uploadPhoto(task.id, file, type);
        await loadPhotos(task.id);
        const count = await getPendingCount();
        setPendingQueueCount(count);
        toast.success(t('cleaning.cleaner.photoUploaded', { defaultValue: 'Фото загружено' }));
      }
    } catch (e) {
      try {
        await enqueuePhoto(task.id, file, type);
        const count = await getPendingCount();
        setPendingQueueCount(count);
        toast(t('cleaning.cleaner.photoQueuedFallback', { defaultValue: 'Ошибка сети — фото загрузится позже' }), { icon: '⏳' });
      } catch {
        toast.error(e instanceof Error ? e.message : t('common.loadError'));
      }
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
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
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
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
    } finally {
      setSuppliesSaving(false);
    }
  };

  const handleDeleteSupply = async (supplyId: string) => {
    if (!task) return;
    try {
      await deleteSupplyUsage(supplyId);
      void loadSupplyUsage(task.id);
      onTaskUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
    }
  };

  const handleSendComment = async () => {
    if (!task) return;
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setCommentSending(true);
    try {
      await createCleaningComment(task.id, trimmed);
      setCommentText('');
      await loadComments(task.id);
      toast.success(t('cleaning.cleaner.commentSent', { defaultValue: 'Сообщение отправлено' }));
      onTaskUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
    } finally {
      setCommentSending(false);
    }
  };

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
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">
                  {t('cleaning.cleaner.comments', { defaultValue: 'Сообщения' })}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {t('cleaning.cleaner.commentsHint', {
                  defaultValue: 'Пишите хозяину: вопросы, отчёт, что нужно купить.',
                })}
              </p>
              {commentsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : (
                <ul className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                  {comments.length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      {t('cleaning.cleaner.noComments', { defaultValue: 'Пока нет сообщений' })}
                    </li>
                  ) : (
                    comments.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                          <span className="font-medium text-foreground">
                            {c.author_id === viewerUserId
                              ? t('cleaning.cleaner.commentYou', { defaultValue: 'Вы' })
                              : t('cleaning.cleaner.commentAdmin', { defaultValue: 'Администратор' })}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {new Date(c.created_at).toLocaleString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{c.text}</p>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('cleaning.cleaner.commentPlaceholder', {
                  defaultValue: 'Ваше сообщение…',
                })}
                className="min-h-[88px] resize-y mb-2"
                disabled={commentSending}
              />
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={commentSending || !commentText.trim()}
                onClick={() => void handleSendComment()}
              >
                {commentSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t('cleaning.cleaner.sendComment', { defaultValue: 'Отправить' })}
              </Button>
            </Card>

            {/* Photos */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{t('cleaning.cleaner.photos', { defaultValue: 'Фото до/после' })}</h3>
                {pendingQueueCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-2 py-0.5 rounded-full">
                    <WifiOff className="h-3 w-3" />
                    {pendingQueueCount} в очереди
                  </span>
                )}
              </div>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : (
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
                {existingSupplies.map((s) => (
                  <div key={s.id} className="text-sm flex justify-between items-center">
                    <span>{s.supply_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {s.amount_used} {s.unit}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteSupply(s.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {newSupplies.map((s, i) => (
                  <div key={`new-${i}`} className="text-sm flex justify-between items-center text-muted-foreground">
                    <span>{s.supply_name}</span>
                    <span>
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
