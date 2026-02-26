-- Grant admin to Molecular_Vel@yahoo.com (case-insensitive: Molecular_vel, Molecular_Vel, etc.)
UPDATE profiles
SET role = 'admin'
WHERE LOWER(email) = 'molecular_vel@yahoo.com';
