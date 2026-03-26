import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CleaningTask, Cleaner, CleaningComment } from '@/types/cleaning';
import type { Property } from '@/lib/supabase';
import { deleteTask, getCleaningComments } from '@/services/cleaning';
import toast from 'react-hot-toast';
import { Loader2, MapPin, Clock, User, DoorOpen, MessageSquare, Trash2 } from 'lucide-react';

const STATUS_LABEL_KEY: Record<
  CleaningTask['status'],
  { key: string; defaultValue: string }
> = {
  pending: { key: 'cleaning.admin.statusPending', defaultValue: 'Ожидает' },
  in_progress: { key: 'cleaning.admin.statusInProgress', defaultValue: 'В работе' },
  done: { key: 'cleaning.admin.statusDone', defaultValue: 'Выполнено' },
  cancelled: { key: 'cleaning.admin.statusCancelled', defaultValue: 'Отменено' },
};

type AdminTaskDetailDialogProps = {
  task: CleaningTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cleaners: Cleaner[];
  properties: Property[];
  onDeleted?: () => void;
};

export function AdminTaskDetailDialog({
  task,
  open,
  onOpenChange,
  cleaners,
  properties,
  onDeleted,
}: AdminTaskDetailDialogProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<CleaningComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadComments = useCallback(async (taskId: string) => {
    setCommentsLoading(true);
    try {
      const list = await getCleaningComments(taskId);
      setComments(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.loadError'));
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open || !task) {
      setConfirmDelete(false);
      return;
    }
    void loadComments(task.id);
  }, [open, task, loadComments]);

  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      toast.success(t('cleaning.admin.taskDeleted', { defaultValue: 'Уборка удалена' }));
      onOpenChange(false);
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (!task) return null;

  const cleaner = task.cleaner_id ? cleaners.find((c) => c.id === task.cleaner_id) : null;
  const property = properties.find((p) => p.id === task.property_id);
  const propertyLabel = property?.name ?? property?.address ?? task.property_id;

  const commentAuthorLabel = (authorId: string) => {
    const c = cleaners.find((x) => x.user_id === authorId);
    if (c) return c.full_name;
    return t('cleaning.admin.commentAuthorOwner', { defaultValue: 'Администратор' });
  };

  const status = STATUS_LABEL_KEY[task.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg pr-8">
            {t('cleaning.admin.taskDetailTitle', { defaultValue: 'Уборка' })}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh] pr-3 -mr-1">
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {t('cleaning.admin.object', { defaultValue: 'Объект' })}
              </p>
              <p className="font-medium">{propertyLabel}</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-start gap-2 min-w-0">
                <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('cleaning.admin.dateTime', { defaultValue: 'Дата и время' })}
                  </p>
                  <p className="tabular-nums">
                    {task.scheduled_date} · {task.scheduled_time.slice(0, 5)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 min-w-0">
                <User className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('cleaning.admin.status', { defaultValue: 'Статус' })}
                  </p>
                  <p>{t(status.key, { defaultValue: status.defaultValue })}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {t('cleaning.admin.cleaner', { defaultValue: 'Уборщица' })}
                </p>
                <p>{cleaner?.full_name ?? '—'}</p>
              </div>
            </div>

            {task.address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t('cleaning.admin.address', { defaultValue: 'Адрес' })}
                  </p>
                  <p className="break-words">{task.address}</p>
                </div>
              </div>
            )}

            {task.door_code && (
              <div className="flex items-start gap-2">
                <DoorOpen className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('cleaning.admin.doorCode', { defaultValue: 'Код двери' })}
                  </p>
                  <p>{task.door_code}</p>
                </div>
              </div>
            )}

            {task.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t('cleaning.admin.notes', { defaultValue: 'Заметки' })}
                </p>
                <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2">{task.notes}</p>
              </div>
            )}

            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {t('cleaning.admin.cleanerMessages', { defaultValue: 'Комментарии и ответы' })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {t('cleaning.admin.cleanerMessagesHint', {
                  defaultValue: 'Сообщения уборщицы и администратора по этой уборке.',
                })}
              </p>
              {commentsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">
                  {t('cleaning.admin.noComments', { defaultValue: 'Пока нет комментариев' })}
                </p>
              ) : (
                <ul className="space-y-2">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground truncate">
                          {commentAuthorLabel(c.author_id)}
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
                      <p className="text-sm whitespace-pre-wrap break-words">{c.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {confirmDelete ? (
            <div className="flex flex-col gap-2 w-full">
              <p className="text-sm text-destructive">
                {t('cleaning.admin.confirmDeleteTask', {
                  defaultValue: 'Удалить эту уборку? Действие нельзя отменить.',
                })}
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('common.cancel', { defaultValue: 'Отмена' })}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 justify-between w-full flex-wrap">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t('cleaning.admin.deleteTask', { defaultValue: 'Удалить уборку' })}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                {t('common.close', { defaultValue: 'Закрыть' })}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
