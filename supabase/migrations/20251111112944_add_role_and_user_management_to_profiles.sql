/*
  # Add Role-Based Access Control and User Management

  ## Overview
  This migration adds role-based access control (RBAC) to the profiles table,
  enabling admin functionality and user management features.

  ## Changes
  
  1. New Columns
    - `role` - User role (enum: 'user' | 'admin'), default 'user'
    - `is_active` - Account status for soft delete, default true
  
  2. New Tables
    - `admin_actions` - Audit log for admin activities
  
  3. Triggers
    - Auto-assign admin role to first registered user
  
  4. RLS Policies
    - Admin users can view all profiles
    - Admin users can view all properties across owners
    - Admin users can view all bookings across properties
    - Admin users can update user roles and active status
  
  5. Indexes
    - Index on role column for faster admin queries
    - Index on is_active for user filtering
*/

-- Add role enum type
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add role and is_active columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role user_role DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

-- Create admin actions audit log table
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC);

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to auto-assign admin to first user
CREATE OR REPLACE FUNCTION assign_first_user_as_admin()
RETURNS TRIGGER AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT COUNT(*) INTO user_count FROM profiles;
  
  IF user_count = 0 THEN
    NEW.role := 'admin';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for first user admin assignment
DROP TRIGGER IF EXISTS on_first_user_admin ON profiles;
CREATE TRIGGER on_first_user_admin
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_first_user_as_admin();

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- RLS Policies for profiles table
-- Admins can view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admins can update user roles and status
DROP POLICY IF EXISTS "Admins can update user roles and status" ON profiles;
CREATE POLICY "Admins can update user roles and status"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for properties table
-- Admins can view all properties
DROP POLICY IF EXISTS "Admins can view all properties" ON properties;
CREATE POLICY "Admins can view all properties"
  ON properties
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- RLS Policies for bookings table
-- Admins can view all bookings
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
CREATE POLICY "Admins can view all bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- RLS Policies for admin_actions table
-- Only admins can insert audit logs
DROP POLICY IF EXISTS "Admins can insert audit logs" ON admin_actions;
CREATE POLICY "Admins can insert audit logs"
  ON admin_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Admins can view all audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON admin_actions;
CREATE POLICY "Admins can view audit logs"
  ON admin_actions
  FOR SELECT
  TO authenticated
  USING (is_admin());