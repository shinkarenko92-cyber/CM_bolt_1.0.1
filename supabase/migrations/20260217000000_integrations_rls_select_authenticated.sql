-- RLS for integrations: authenticated users can SELECT/CRUD integrations for their properties.
-- Table integrations has no user_id; ownership is via properties.owner_id (= auth.uid() on properties).

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own integrations" ON integrations;
CREATE POLICY "Users own integrations" ON integrations
  FOR ALL
  TO authenticated
  USING (
    property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
  );
