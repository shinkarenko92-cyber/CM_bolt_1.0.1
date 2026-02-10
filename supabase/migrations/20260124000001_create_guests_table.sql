-- Create guests table
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add guest_id to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES guests(id) ON DELETE SET NULL;

-- Create unique index for lookup by phone per owner
CREATE UNIQUE INDEX IF NOT EXISTS guests_owner_phone_idx ON guests(owner_id, phone) WHERE phone IS NOT NULL;

-- Enable RLS on guests
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

-- Policies for guests (idempotent)
DROP POLICY IF EXISTS "Users can view their own guests" ON guests;
CREATE POLICY "Users can view their own guests"
ON guests FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own guests" ON guests;
CREATE POLICY "Users can create their own guests"
ON guests FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own guests" ON guests;
CREATE POLICY "Users can update their own guests"
ON guests FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own guests" ON guests;
CREATE POLICY "Users can delete their own guests"
ON guests FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Backfill data: Extract guests from existing bookings
-- We use a temporary table to deduplicate by (owner_id, phone/name)
DO $$
DECLARE
    item RECORD;
    new_guest_id UUID;
BEGIN
    FOR item IN 
        SELECT DISTINCT 
            p.owner_id, 
            b.guest_name, 
            b.guest_email, 
            b.guest_phone
        FROM bookings b
        JOIN properties p ON b.property_id = p.id
        WHERE b.guest_id IS NULL
    LOOP
        -- Check if guest already exists (by phone or name if phone is null)
        SELECT id INTO new_guest_id FROM guests 
        WHERE owner_id = item.owner_id 
        AND (
            (phone IS NOT NULL AND phone = item.guest_phone) OR 
            (phone IS NULL AND item.guest_phone IS NULL AND name = item.guest_name)
        )
        LIMIT 1;

        -- If not exists, create
        IF new_guest_id IS NULL THEN
            INSERT INTO guests (owner_id, name, email, phone)
            VALUES (item.owner_id, item.guest_name, item.guest_email, item.guest_phone)
            RETURNING id INTO new_guest_id;
        END IF;

        -- Link bookings
        UPDATE bookings 
        SET guest_id = new_guest_id 
        WHERE guest_name = item.guest_name 
        AND (guest_phone IS NOT NULL AND guest_phone = item.guest_phone OR guest_phone IS NULL AND item.guest_phone IS NULL)
        AND property_id IN (SELECT id FROM properties WHERE owner_id = item.owner_id);
    END LOOP;
END $$;
