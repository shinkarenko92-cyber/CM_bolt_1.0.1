-- Re-enable account and ensure admin for molecular_vel@yahoo.com (e.g. if is_active was false)
UPDATE profiles
SET role = 'admin', is_active = true
WHERE LOWER(email) = 'molecular_vel@yahoo.com';
