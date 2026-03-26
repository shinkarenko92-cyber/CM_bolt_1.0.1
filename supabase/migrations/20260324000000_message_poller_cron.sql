-- Add last_push_unread column to track when we last sent a push notification
-- so the server-side poller doesn't re-notify for the same unread messages.
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_push_unread integer DEFAULT 0;

-- The cron job for avito-message-poller should be set up via Supabase Dashboard:
-- 1. Go to Database → Cron Jobs
-- 2. Create a new cron job:
--    - Name: avito_message_poller
--    - Schedule: */2 * * * * (every 2 minutes)
--    - Type: Edge Function → avito-message-poller
-- 3. Enable and save
