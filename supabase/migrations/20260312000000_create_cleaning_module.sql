-- Cleaning module: cleaners, cleaning tasks, photos, inventory, supplies, comments

-- 1) Extend user_role enum with 'cleaner'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'cleaner'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'cleaner';
  END IF;
END $$;

-- 2) Cleaners table
CREATE TABLE IF NOT EXISTS cleaners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  telegram_chat_id text,
  color text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;

-- Admins can see all cleaners
DROP POLICY IF EXISTS "Admins can view all cleaners" ON cleaners;
CREATE POLICY "Admins can view all cleaners"
ON cleaners FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

-- Cleaner can see only their own cleaner profile
DROP POLICY IF EXISTS "Cleaner can view own cleaner profile" ON cleaners;
CREATE POLICY "Cleaner can view own cleaner profile"
ON cleaners FOR SELECT
USING (user_id = auth.uid());

-- Admins can manage cleaners
DROP POLICY IF EXISTS "Admins can manage cleaners" ON cleaners;
CREATE POLICY "Admins can manage cleaners"
ON cleaners FOR ALL
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));


-- 3) Cleaning tasks
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties (id) ON DELETE RESTRICT,
  cleaner_id uuid REFERENCES cleaners (id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | in_progress | done | cancelled
  door_code text,
  address text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;

-- Property owner: full access to tasks for their properties
DROP POLICY IF EXISTS "Owners manage cleaning tasks for their properties" ON cleaning_tasks;
CREATE POLICY "Owners manage cleaning tasks for their properties"
ON cleaning_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = cleaning_tasks.property_id
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = cleaning_tasks.property_id
      AND p.owner_id = auth.uid()
  )
);

-- Cleaner: can view and update status of own tasks
DROP POLICY IF EXISTS "Cleaner can view own cleaning tasks" ON cleaning_tasks;
CREATE POLICY "Cleaner can view own cleaning tasks"
ON cleaning_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaners c
    WHERE c.id = cleaning_tasks.cleaner_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Cleaner can update status of own cleaning tasks" ON cleaning_tasks;
CREATE POLICY "Cleaner can update status of own cleaning tasks"
ON cleaning_tasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM cleaners c
    WHERE c.id = cleaning_tasks.cleaner_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cleaners c
    WHERE c.id = cleaning_tasks.cleaner_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);


-- 4) Cleaning photos
CREATE TABLE IF NOT EXISTS cleaning_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES cleaning_tasks (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  type text NOT NULL, -- 'before' | 'after'
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE cleaning_photos ENABLE ROW LEVEL SECURITY;

-- Property owner + cleaner associated with task can see photos
DROP POLICY IF EXISTS "Owners and cleaner can view cleaning photos" ON cleaning_photos;
CREATE POLICY "Owners and cleaner can view cleaning photos"
ON cleaning_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = cleaning_photos.task_id
      AND p.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = cleaning_photos.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);

-- Property owner can manage photos for their properties
DROP POLICY IF EXISTS "Owners manage cleaning photos for their properties" ON cleaning_photos;
CREATE POLICY "Owners manage cleaning photos for their properties"
ON cleaning_photos
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = cleaning_photos.task_id
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = cleaning_photos.task_id
      AND p.owner_id = auth.uid()
  )
);


-- 5) Inventory items per property
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  name text NOT NULL,
  expected_count int DEFAULT 1,
  category text
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage inventory items for their properties" ON inventory_items;
CREATE POLICY "Owners manage inventory items for their properties"
ON inventory_items
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = inventory_items.property_id
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = inventory_items.property_id
      AND p.owner_id = auth.uid()
  )
);


-- 6) Inventory checks per task
CREATE TABLE IF NOT EXISTS inventory_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES cleaning_tasks (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
  actual_count int,
  is_ok boolean,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and cleaner can view inventory checks" ON inventory_checks;
CREATE POLICY "Owners and cleaner can view inventory checks"
ON inventory_checks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = inventory_checks.task_id
      AND p.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = inventory_checks.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Cleaner can insert inventory checks for own tasks" ON inventory_checks;
CREATE POLICY "Cleaner can insert inventory checks for own tasks"
ON inventory_checks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = inventory_checks.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);


-- 7) Supply usage per task
CREATE TABLE IF NOT EXISTS supply_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES cleaning_tasks (id) ON DELETE CASCADE,
  supply_name text,
  amount_used numeric,
  unit text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE supply_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and cleaner can view supply usage" ON supply_usage;
CREATE POLICY "Owners and cleaner can view supply usage"
ON supply_usage
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = supply_usage.task_id
      AND p.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = supply_usage.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Cleaner can insert supply usage for own tasks" ON supply_usage;
CREATE POLICY "Cleaner can insert supply usage for own tasks"
ON supply_usage
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = supply_usage.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);


-- 8) Cleaning comments
CREATE TABLE IF NOT EXISTS cleaning_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES cleaning_tasks (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cleaning_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and cleaner can view cleaning comments" ON cleaning_comments;
CREATE POLICY "Owners and cleaner can view cleaning comments"
ON cleaning_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = cleaning_comments.task_id
      AND p.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = cleaning_comments.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Owners and cleaner can insert cleaning comments" ON cleaning_comments;
CREATE POLICY "Owners and cleaner can insert cleaning comments"
ON cleaning_comments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = cleaning_comments.task_id
      AND p.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = cleaning_comments.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);


-- 9) Private storage bucket for cleaning photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('cleaning-photos', 'cleaning-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects is usually done by Supabase; we just add policies for this bucket.

-- Authenticated users can upload cleaning photos; owner is auth.uid()
DROP POLICY IF EXISTS "Authenticated users can upload cleaning photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload cleaning photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cleaning-photos' AND owner = auth.uid());

-- Authenticated users can update their own cleaning photos
DROP POLICY IF EXISTS "Authenticated users can update their own cleaning photos" ON storage.objects;
CREATE POLICY "Authenticated users can update their own cleaning photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'cleaning-photos' AND owner = auth.uid());

-- Authenticated users can delete their own cleaning photos
DROP POLICY IF EXISTS "Authenticated users can delete their own cleaning photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete their own cleaning photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'cleaning-photos' AND owner = auth.uid());

-- Owners of properties and cleaners assigned to tasks can view related cleaning photos
DROP POLICY IF EXISTS "Owners and cleaners can view cleaning photos objects" ON storage.objects;
CREATE POLICY "Owners and cleaners can view cleaning photos objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'cleaning-photos'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM cleaning_photos cp
      JOIN cleaning_tasks ct ON ct.id = cp.task_id
      JOIN properties p ON p.id = ct.property_id
      WHERE cp.storage_path = storage.objects.name
        AND p.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM cleaning_photos cp
      JOIN cleaning_tasks ct ON ct.id = cp.task_id
      JOIN cleaners c ON c.id = ct.cleaner_id
      WHERE cp.storage_path = storage.objects.name
        AND c.user_id = auth.uid()
        AND c.is_active = true
    )
  )
);

