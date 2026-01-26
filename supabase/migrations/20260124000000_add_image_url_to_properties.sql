-- Add image_url column to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create a new storage bucket for property images
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the bucket (optional, but good practice if not enabled by default for public buckets)
-- storage.objects usually has RLS enabled by default in Supabase

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload property images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-images' AND owner = auth.uid());

-- Policy: Allow authenticated users to update their own files
CREATE POLICY "Authenticated users can update their own property images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'property-images' AND owner = auth.uid());

-- Policy: Allow authenticated users to delete their own files
CREATE POLICY "Authenticated users can delete their own property images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-images' AND owner = auth.uid());

-- Policy: Allow public access to view images (it's a public bucket, but policies might restrict)
CREATE POLICY "Public can view property images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'property-images');
