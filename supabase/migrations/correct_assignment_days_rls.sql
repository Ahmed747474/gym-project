-- CORRECTION for assignment_days RLS
-- The previous optimization was too strict. It only checked `user_program_assignments.coach_id`.
-- But if an assignment was created by Admin (or system), coach_id might be null or different.
-- We MUST allow a coach to see `assignment_days` if the User belongs to them.

-- 1. Ensure Indexes for the profile join (Critical for performance of this "un-optimization")
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON user_program_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_coach_id_id ON profiles(id, coach_id); -- Composite index for fast check

-- 2. Update Policy
DROP POLICY IF EXISTS "Optimized Access Policy" ON assignment_days;
DROP POLICY IF EXISTS "Coaches can manage assignment days for their trainees" ON assignment_days;

CREATE POLICY "Correct Access Policy"
ON assignment_days
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_program_assignments upa
        WHERE upa.id = assignment_days.assignment_id
        AND (
            upa.user_id = auth.uid()   -- My assignment
            OR
            upa.coach_id = auth.uid()  -- I assigned it
            OR
            EXISTS (                  -- My trainee's assignment (Cross-check profile)
                SELECT 1 FROM profiles p
                WHERE p.id = upa.user_id
                AND p.coach_id = auth.uid()
            )
            OR
            public.is_admin()
        )
    )
);

-- 3. Analyze
ANALYZE assignment_days;
ANALYZE profiles;
