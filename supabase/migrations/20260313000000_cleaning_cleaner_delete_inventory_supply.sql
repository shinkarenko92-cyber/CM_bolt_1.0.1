-- Owner and cleaner: allow delete task's inventory_checks and supply_usage (for replace before re-insert)

DROP POLICY IF EXISTS "Owners can delete inventory checks for their tasks" ON inventory_checks;
CREATE POLICY "Owners can delete inventory checks for their tasks"
ON inventory_checks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = inventory_checks.task_id AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Cleaner can delete inventory checks for own tasks" ON inventory_checks;
CREATE POLICY "Cleaner can delete inventory checks for own tasks"
ON inventory_checks FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = inventory_checks.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Owners can delete supply usage for their tasks" ON supply_usage;
CREATE POLICY "Owners can delete supply usage for their tasks"
ON supply_usage FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM cleaning_tasks ct
    JOIN properties p ON p.id = ct.property_id
    WHERE ct.id = supply_usage.task_id AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Cleaner can delete supply usage for own tasks" ON supply_usage;
CREATE POLICY "Cleaner can delete supply usage for own tasks"
ON supply_usage FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_tasks ct
    JOIN cleaners c ON c.id = ct.cleaner_id
    WHERE ct.id = supply_usage.task_id
      AND c.user_id = auth.uid()
      AND c.is_active = true
  )
);
