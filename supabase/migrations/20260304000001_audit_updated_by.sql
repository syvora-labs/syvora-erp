-- Add updated_by to track who last modified each record
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE releases ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
