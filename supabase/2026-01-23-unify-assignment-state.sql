-- Migration: unify assignment state
-- Set state = status for all existing rows
UPDATE user_program_assignments SET state = status WHERE status IS NOT NULL;
-- (Optional) You may later drop the status column if not needed
-- ALTER TABLE user_program_assignments DROP COLUMN status;