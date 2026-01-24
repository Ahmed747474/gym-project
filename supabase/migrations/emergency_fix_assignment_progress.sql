-- EMERGENCY FIX for assignment_exercise_progress timeout
-- 1. Ensure user_id column exists (Idempotent)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignment_exercise_progress' AND column_name = 'user_id') THEN
        ALTER TABLE assignment_exercise_progress ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Ensure Index on user_id exists (Critical for RLS)
CREATE INDEX IF NOT EXISTS idx_assignment_exercise_progress_user_id ON assignment_exercise_progress(user_id);

-- 3. DROP ALL KNOWN POLICIES on this table to remove expensive joins
DROP POLICY IF EXISTS "Coaches can manage exercise progress for their trainees" ON assignment_exercise_progress;
DROP POLICY IF EXISTS "Coaches can manage assignment days for their trainees" ON assignment_exercise_progress; -- Name mismatch safety
DROP POLICY IF EXISTS "Users can manage own progress" ON assignment_exercise_progress;
DROP POLICY IF EXISTS "Trainees can update own progress" ON assignment_exercise_progress;
DROP POLICY IF EXISTS "Enable read access for users" ON assignment_exercise_progress;
DROP POLICY IF EXISTS "Enable insert for users" ON assignment_exercise_progress;
DROP POLICY IF EXISTS "Enable update for users" ON assignment_exercise_progress;

-- 4. Create ONE Simple, Fast Policy
-- This relies ONLY on the new user_id column, avoiding all joins.
CREATE POLICY "Simple Access Policy"
ON assignment_exercise_progress
FOR ALL
USING (
    user_id = auth.uid() -- Fast check: Is it my data?
    OR
    EXISTS ( -- Coach check: Is it my trainee's data? (Indexed check on profiles)
        SELECT 1 FROM profiles 
        WHERE id = assignment_exercise_progress.user_id 
        AND coach_id = auth.uid()
    )
    OR
    public.is_admin() -- Admin check
);

-- 5. Backfill user_id if any are NULL (Run in batches if possible, but simplest for now)
-- This might take time but is necessary
UPDATE assignment_exercise_progress aep
SET user_id = upa.user_id
FROM assignment_days ad
JOIN user_program_assignments upa ON upa.id = ad.assignment_id
WHERE aep.assignment_day_id = ad.id
AND aep.user_id IS NULL;

-- 6. Ensure Unique Constraint for ON CONFLICT
-- Drop first to be safe
ALTER TABLE assignment_exercise_progress DROP CONSTRAINT IF EXISTS assignment_exercise_progress_day_exercise_unique;

-- Remove duplicates again just in case
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

-- Re-add constraint
ALTER TABLE assignment_exercise_progress
ADD CONSTRAINT assignment_exercise_progress_day_exercise_unique 
UNIQUE (assignment_day_id, exercise_id);

-- 7. Analyze to update stats
ANALYZE assignment_exercise_progress;
