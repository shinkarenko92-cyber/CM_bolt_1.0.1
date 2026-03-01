-- Enable Realtime for avito_logs so the app can show sync errors immediately
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'avito_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE avito_logs;
  END IF;
END $$;
