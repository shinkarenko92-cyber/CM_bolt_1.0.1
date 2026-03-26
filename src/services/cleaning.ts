import { supabase } from '@/lib/supabase';
import type {
  Cleaner,
  CleaningTask,
  CleaningStatus,
  CleaningPhoto,
  CleaningPhotoType,
  CleaningComment,
  InventoryItem,
  InventoryCheck,
  InventoryCheckInput,
  SupplyUsage,
  SupplyUsageInput,
  CreateCleaningTaskInput,
} from '@/types/cleaning';

const CLEANING_PHOTOS_BUCKET = 'cleaning-photos';
const SIGNED_URL_TTL_SECONDS = 3600;

export async function getTasks(weekStart: Date): Promise<CleaningTask[]> {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('cleaning_tasks')
    .select('*')
    .gte('scheduled_date', startStr)
    .lt('scheduled_date', endStr)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CleaningTask[];
}

export async function getCleanerTasks(cleanerId: string): Promise<CleaningTask[]> {
  const { data, error } = await supabase
    .from('cleaning_tasks')
    .select('*')
    .eq('cleaner_id', cleanerId)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CleaningTask[];
}

export async function createTask(input: CreateCleaningTaskInput): Promise<CleaningTask> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const payload = {
    property_id: input.property_id,
    cleaner_id: input.cleaner_id,
    scheduled_date: input.scheduled_date,
    scheduled_time: input.scheduled_time,
    door_code: input.door_code ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('cleaning_tasks')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data as CleaningTask;
}

export async function updateTaskStatus(taskId: string, status: CleaningStatus): Promise<CleaningTask> {
  const { data, error } = await supabase
    .from('cleaning_tasks')
    .update({ status })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw error;
  return data as CleaningTask;
}

export async function updateTaskSchedule(
  taskId: string,
  scheduled_date: string,
  scheduled_time: string
): Promise<CleaningTask> {
  const { data, error } = await supabase
    .from('cleaning_tasks')
    .update({ scheduled_date, scheduled_time })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw error;
  return data as CleaningTask;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('cleaning_tasks').delete().eq('id', taskId);
  if (error) throw error;
}

export async function getCleaningComments(taskId: string): Promise<CleaningComment[]> {
  const { data, error } = await supabase
    .from('cleaning_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CleaningComment[];
}

export async function createCleaningComment(taskId: string, text: string): Promise<CleaningComment> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty comment');

  const { data, error } = await supabase
    .from('cleaning_comments')
    .insert({ task_id: taskId, author_id: userId, text: trimmed })
    .select('*')
    .single();

  if (error) throw error;
  return data as CleaningComment;
}

const ASSIGN_CLEANER_FN = 'assign-cleaner-role';
const NOTIFY_CLEANER_FN = 'notify-cleaner';

export async function assignCleanerRole(payload: {
  full_name: string;
  phone: string;
  telegram_chat_id?: string | null;
  color?: string | null;
}): Promise<{ cleaner: Cleaner; magic_link?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${ASSIGN_CLEANER_FN}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    }
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return { cleaner: body.cleaner as Cleaner, magic_link: body.magic_link as string | undefined };
}

export async function notifyCleaner(taskId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${NOTIFY_CLEANER_FN}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ task_id: taskId }),
    }
  );
  // Не бросаем ошибку — уведомление не должно ломать основной флоу
}

/** Уборщица: получить свою запись в cleaners по user_id */
export async function getCurrentCleaner(): Promise<Cleaner | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) return null;

  const { data, error } = await supabase
    .from('cleaners')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) return null;
  return data as Cleaner | null;
}

export async function uploadPhoto(
  taskId: string,
  file: File,
  type: CleaningPhotoType,
): Promise<CleaningPhoto> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(CLEANING_PHOTOS_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('cleaning_photos')
    .insert({
      task_id: taskId,
      storage_path: path,
      type,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as CleaningPhoto;
}

export async function getSignedPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CLEANING_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Failed to create signed URL');
  }

  return data.signedUrl;
}

export async function getCleaningPhotos(taskId: string): Promise<CleaningPhoto[]> {
  const { data, error } = await supabase
    .from('cleaning_photos')
    .select('*')
    .eq('task_id', taskId)
    .order('uploaded_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CleaningPhoto[];
}

export async function getInventoryChecks(taskId: string): Promise<InventoryCheck[]> {
  const { data, error } = await supabase
    .from('inventory_checks')
    .select('*')
    .eq('task_id', taskId);

  if (error) throw error;
  return (data ?? []) as InventoryCheck[];
}

export async function getSupplyUsageList(taskId: string): Promise<SupplyUsage[]> {
  const { data, error } = await supabase
    .from('supply_usage')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SupplyUsage[];
}

export async function getInventoryItems(propertyId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('property_id', propertyId)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as InventoryItem[];
}

export async function saveInventoryCheck(taskId: string, checks: InventoryCheckInput[]): Promise<InventoryCheck[]> {
  const { error: deleteError } = await supabase.from('inventory_checks').delete().eq('task_id', taskId);
  if (deleteError) throw deleteError;

  if (checks.length === 0) return [];

  const payload = checks.map((check) => ({
    task_id: taskId,
    item_id: check.item_id,
    actual_count: check.actual_count,
    is_ok: check.is_ok,
    note: check.note ?? null,
  }));

  const { data, error } = await supabase
    .from('inventory_checks')
    .insert(payload)
    .select('*');

  if (error) throw error;
  return (data ?? []) as InventoryCheck[];
}

export async function saveSupplyUsage(taskId: string, supplies: SupplyUsageInput[]): Promise<SupplyUsage[]> {
  if (supplies.length === 0) return [];

  const payload = supplies.map((supply) => ({
    task_id: taskId,
    supply_name: supply.supply_name,
    amount_used: supply.amount_used,
    unit: supply.unit,
  }));

  const { data, error } = await supabase
    .from('supply_usage')
    .insert(payload)
    .select('*');

  if (error) throw error;
  return (data ?? []) as SupplyUsage[];
}

export async function deleteSupplyUsage(supplyId: string): Promise<void> {
  const { error } = await supabase
    .from('supply_usage')
    .delete()
    .eq('id', supplyId);

  if (error) throw error;
}

export async function getCleaners(): Promise<Cleaner[]> {
  const { data, error } = await supabase
    .from('cleaners')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Cleaner[];
}

