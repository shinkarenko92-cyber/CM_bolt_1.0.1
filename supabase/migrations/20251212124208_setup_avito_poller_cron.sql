-- Setup Avito Poller Cron Job
-- This migration prepares the database for automatic synchronization
-- 
-- IMPORTANT: After running this migration, you need to set up the cron job
-- via Supabase Dashboard → Database → Cron Jobs
--
-- Steps:
-- 1. Go to Supabase Dashboard → Database → Cron Jobs
-- 2. Click "New Cron Job"
-- 3. Fill in:
--    - Name: avito_poller_cron
--    - Schedule: */10 * * * * * (every 10 seconds)
--    - Function: avito-poller
--    - Enabled: Yes
-- 4. Save

-- Enable pg_cron extension if not already enabled
-- This is required for cron jobs in Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Note: The actual cron job setup should be done via Supabase Dashboard
-- because it requires Edge Function invocation which is better handled
-- through the Dashboard UI rather than SQL

