-- 1. Deduplicate assignment_exercise_progress table
-- Always safe to run: keeps the latest record for each (assignment_day_id, exercise_id) pair
DELETE FROM assignment_exercise_progress a
USING (
    SELECT id, assignment_day_id, exercise_id, 
           ROW_NUMBER() OVER (
               PARTITION BY assignment_day_id, exercise_id 
               ORDER BY done_at DESC NULLS LAST, id DESC
           ) as rn
    FROM assignment_exercise_progress
) duplicates
WHERE a.id = duplicates.id
AND duplicates.rn > 1;

-- 2. Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assignment_exercise_progress_day_exercise_unique'
    ) THEN
        ALTER TABLE assignment_exercise_progress
        ADD CONSTRAINT assignment_exercise_progress_day_exercise_unique 
        UNIQUE (assignment_day_id, exercise_id);
    END IF;
END $$;

-- 3. Analyze to update stats
ANALYZE assignment_exercise_progress;
