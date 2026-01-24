-- 1. Add user_id column
ALTER TABLE assignment_exercise_progress
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Backfill user_id from existing relationships
UPDATE assignment_exercise_progress aep
SET user_id = upa.user_id
FROM assignment_days ad
JOIN user_program_assignments upa ON upa.id = ad.assignment_id
WHERE aep.assignment_day_id = ad.id
AND aep.user_id IS NULL;

-- 3. Make user_id NOT NULL (after backfill)
ALTER TABLE assignment_exercise_progress
ALTER COLUMN user_id SET NOT NULL;

-- 4. Create Index on user_id
CREATE INDEX IF NOT EXISTS idx_assignment_exercise_progress_user_id
ON assignment_exercise_progress(user_id);

-- 5. Auto-fill user_id on INSERT (Trigger)
-- This ensures that even if API doesn't send it, it gets inferred from the day/assignment relationship
CREATE OR REPLACE FUNCTION set_assignment_progress_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        SELECT upa.user_id INTO NEW.user_id
        FROM assignment_days ad
        JOIN user_program_assignments upa ON upa.id = ad.assignment_id
        WHERE ad.id = NEW.assignment_day_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_progress_user_id ON assignment_exercise_progress;
CREATE TRIGGER trigger_set_progress_user_id
    BEFORE INSERT ON assignment_exercise_progress
    FOR EACH ROW
    EXECUTE FUNCTION set_assignment_progress_user_id();


-- 6. Simplify RLS
-- Now we can use the direct user_id for extremely fast checks
DROP POLICY IF EXISTS "Coaches can manage exercise progress for their trainees" ON assignment_exercise_progress;
DROP POLICY IF EXISTS "Users can manage own progress" ON assignment_exercise_progress; -- if exists

CREATE POLICY "Coaches can manage exercise progress for their trainees"
ON assignment_exercise_progress
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = assignment_exercise_progress.user_id
        AND p.coach_id = auth.uid()
    )
    OR
    user_id = auth.uid() -- The user themselves
    OR
    public.is_admin()
);
