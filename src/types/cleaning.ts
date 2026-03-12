export type CleaningStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export type CleaningPhotoType = 'before' | 'after';

export interface Cleaner {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  telegram_chat_id: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CleaningTask {
  id: string;
  property_id: string;
  cleaner_id: string | null;
  scheduled_date: string; // ISO date (YYYY-MM-DD)
  scheduled_time: string; // HH:MM:SS
  status: CleaningStatus;
  door_code: string | null;
  address: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface CleaningPhoto {
  id: string;
  task_id: string;
  storage_path: string;
  type: CleaningPhotoType;
  uploaded_at: string;
}

export interface InventoryItem {
  id: string;
  property_id: string;
  name: string;
  expected_count: number;
  category: string | null;
}

export interface InventoryCheck {
  id: string;
  task_id: string;
  item_id: string;
  actual_count: number | null;
  is_ok: boolean | null;
  note: string | null;
  created_at: string;
}

export interface SupplyUsage {
  id: string;
  task_id: string;
  supply_name: string | null;
  amount_used: number | null;
  unit: string | null;
  created_at: string;
}

export interface CleaningComment {
  id: string;
  task_id: string;
  author_id: string;
  text: string;
  created_at: string;
}

export interface CreateCleaningTaskInput {
  property_id: string;
  cleaner_id: string | null;
  scheduled_date: string;
  scheduled_time: string;
  door_code?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateCleaningTaskStatusInput {
  id: string;
  status: CleaningStatus;
}

export interface InventoryCheckInput {
  item_id: string;
  actual_count: number | null;
  is_ok: boolean | null;
  note?: string | null;
}

export interface SupplyUsageInput {
  supply_name: string;
  amount_used: number;
  unit: string;
}

