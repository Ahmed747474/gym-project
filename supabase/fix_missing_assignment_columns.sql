-- Migration script to add missing columns to user_program_assignments
-- Add queued_at column if it does not exist
ALTER TABLE user_program_assignments ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT now();
-- Add state column if it does not exist
ALTER TABLE user_program_assignments ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'queued';
-- Add activated_at column if it does not exist
ALTER TABLE user_program_assignments ADD COLUMN IF NOT EXISTS activated_at timestamptz;
-- Add archived_at column if it does not exist
ALTER TABLE user_program_assignments ADD COLUMN IF NOT EXISTS archived_at timestamptz;
-- Add queue_position column if it does not exist
ALTER TABLE user_program_assignments ADD COLUMN IF NOT EXISTS queue_position int;
