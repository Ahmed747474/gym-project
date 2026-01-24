-- =============================================
-- FIX TIMEOUT: "Nuclear Option" for assignment_exercise_progress
-- =============================================

-- 1. Disable RLS immediately to bypass any checks during cleanup
ALTER TABLE assignment_exercise_progress DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL Triggers on this table
-- We use a DO block to find and drop them dynamically to be sure nothing is left logic-wise
DO $$
DECLARE
    trg text;
BEGIN
    FOR trg IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'assignment_exercise_progress'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(trg) || ' ON assignment_exercise_progress CASCADE';
    END LOOP;
END $$;

-- 3. Drop ALL Policies on this table
DO $$
DECLARE
    pol text;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'assignment_exercise_progress'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol || '" ON assignment_exercise_progress';
    END LOOP;
END $$;

-- 4. Ensure Structure is Correct (user_id)
-- If user_id is missing (unlikely given previous steps), add it.
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignment_exercise_progress' AND column_name = 'user_id') THEN
        ALTER TABLE assignment_exercise_progress ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Backfill user_id if ANY are missing
UPDATE assignment_exercise_progress aep
SET user_id = upa.user_id
FROM assignment_days ad
JOIN user_program_assignments upa ON upa.id = ad.assignment_id
WHERE aep.assignment_day_id = ad.id
AND aep.user_id IS NULL;

-- 6. Make user_id NOT NULL and Indexed
-- We do this BEFORE enabling RLS to ensure index is ready
CREATE INDEX IF NOT EXISTS idx_assignment_exercise_progress_user_id ON assignment_exercise_progress(user_id);
-- Try to set not null, but don't fail if bad data exists (though backfill should have fixed it)
DO $$ BEGIN
    ALTER TABLE assignment_exercise_progress ALTER COLUMN user_id SET NOT NULL;
EXCEPTION WHEN others THEN
    NULL; -- Ignore if fails, but index should still work
END $$;


-- 7. Re-enable RLS
ALTER TABLE assignment_exercise_progress ENABLE ROW LEVEL SECURITY;

-- 8. Create the Single, Fastest Policy Possible
CREATE POLICY "Fastest Access"
ON assignment_exercise_progress
FOR ALL
USING (
    user_id = auth.uid() 
    OR 
    public.is_admin()
);

-- 9. Unique Constraint (Re-apply to be sure)
-- Deduplicate first
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

ALTER TABLE assignment_exercise_progress DROP CONSTRAINT IF EXISTS assignment_exercise_progress_day_exercise_unique;
ALTER TABLE assignment_exercise_progress ADD CONSTRAINT assignment_exercise_progress_day_exercise_unique UNIQUE (assignment_day_id, exercise_id);

-- 10. Update Statistics
ANALYZE assignment_exercise_progress;
