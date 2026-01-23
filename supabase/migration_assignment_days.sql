-- Migration: Add program_day_id to assignment_days and enforce unique progress
ALTER TABLE assignment_days ADD COLUMN IF NOT EXISTS program_day_id UUID REFERENCES days(id);
ALTER TABLE assignment_days RENAME COLUMN cycle_no TO repeat_no;
-- Optionally drop day_index if not needed
-- ALTER TABLE assignment_days DROP COLUMN IF EXISTS day_index;

-- Ensure assignment_exercise_progress is keyed by (assignment_day_id, exercise_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='assignment_exercise_progress' AND constraint_type='UNIQUE'
    ) THEN
        ALTER TABLE assignment_exercise_progress ADD CONSTRAINT assignment_exercise_progress_unique UNIQUE (assignment_day_id, exercise_id);
    END IF;
END$$;
