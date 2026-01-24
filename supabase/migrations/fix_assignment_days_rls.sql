-- OPTIMIZATION for assignment_days RLS
-- The current policy likely joins `profiles`, which is slow.
-- We can check permissions using only `user_program_assignments` because it contains both `user_id` and `coach_id`.

-- 1. Ensure Indexes exist (Idempotent)
CREATE INDEX IF NOT EXISTS idx_assignment_days_assignment_id ON assignment_days(assignment_id);
-- Ensure user_program_assignments has indexes we rely on
CREATE INDEX IF NOT EXISTS idx_user_program_assignments_coach_id ON user_program_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_user_program_assignments_user_id ON user_program_assignments(user_id);

-- 2. Optimize assignment_days Policy
DROP POLICY IF EXISTS "Coaches can manage assignment days for their trainees" ON assignment_days;
DROP POLICY IF EXISTS "Users can view own assignment days" ON assignment_days; 
-- (Drop broadly to ensure we replace whatever is there)
DROP POLICY IF EXISTS "Enable read access for users" ON assignment_days;
DROP POLICY IF EXISTS "Enable insert for users" ON assignment_days;
DROP POLICY IF EXISTS "Enable update for users" ON assignment_days;
DROP POLICY IF EXISTS "Enable delete for users" ON assignment_days;

CREATE POLICY "Optimized Access Policy"
ON assignment_days
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_program_assignments upa
        WHERE upa.id = assignment_days.assignment_id
        AND (
            upa.user_id = auth.uid()   -- It is my assignment
            OR
            upa.coach_id = auth.uid()  -- I am the coach
            OR
            public.is_admin()          -- I am admin
        )
    )
);

-- 3. Verify assignment_exercise_progress index (Just in case)
CREATE INDEX IF NOT EXISTS idx_assignment_exercise_progress_day_id ON assignment_exercise_progress(assignment_day_id);

-- 4. Analyze
ANALYZE assignment_days;
ANALYZE user_program_assignments;
