-- Backfill guests from existing bookings (idempotent, safe to run multiple times)
-- Use when guests table exists but was empty at migration time or new bookings added without guest_id
DO $$
DECLARE
    item RECORD;
    new_guest_id UUID;
BEGIN
    FOR item IN
        SELECT DISTINCT
            p.owner_id,
            COALESCE(NULLIF(TRIM(b.guest_name), ''), 'Гость') AS guest_name,
            b.guest_email,
            b.guest_phone
        FROM bookings b
        JOIN properties p ON b.property_id = p.id
        WHERE b.guest_id IS NULL
    LOOP
        SELECT id INTO new_guest_id FROM guests
        WHERE owner_id = item.owner_id
        AND (
            (phone IS NOT NULL AND phone = item.guest_phone) OR
            (phone IS NULL AND item.guest_phone IS NULL AND name = item.guest_name)
        )
        LIMIT 1;

        IF new_guest_id IS NULL THEN
            INSERT INTO guests (owner_id, name, email, phone)
            VALUES (item.owner_id, item.guest_name, item.guest_email, item.guest_phone)
            RETURNING id INTO new_guest_id;
        END IF;

        UPDATE bookings
        SET guest_id = new_guest_id
        WHERE property_id IN (SELECT id FROM properties WHERE owner_id = item.owner_id)
        AND COALESCE(NULLIF(TRIM(guest_name), ''), 'Гость') = item.guest_name
        AND (
            (guest_phone IS NOT NULL AND guest_phone = item.guest_phone) OR
            (guest_phone IS NULL AND item.guest_phone IS NULL)
        );
    END LOOP;
END $$;
