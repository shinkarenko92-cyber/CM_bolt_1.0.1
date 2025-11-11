/*
  # Add theme preference to profiles table

  1. Changes
    - Add `theme` column to profiles table
      - Type: text with values 'dark' or 'light'
      - Default: 'dark'
      - Not null
  
  2. Notes
    - Existing users will default to dark theme
    - Users can toggle between light and dark themes in their profile settings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme'
  ) THEN
    ALTER TABLE profiles ADD COLUMN theme text DEFAULT 'dark' NOT NULL;
  END IF;
END $$;
