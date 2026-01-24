-- =============================================
-- Fix RLS for Coach Assignments
-- =============================================

-- Allow coaches to Assign Programs to their Trainees
-- The previous error "new row violates row-level security policy for table user_program_assignments" 
-- indicates coaches don't have INSERT permission.

-- 1. user_program_assignments
DROP POLICY IF EXISTS "Coaches can manage assignments of their trainees" ON user_program_assignments;

CREATE POLICY "Coaches can manage assignments of their trainees"
ON user_program_assignments
FOR ALL
USING (
  -- For SELECT/UPDATE/DELETE: The assignment's user must be a trainee of the auth user (coach)
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_id
    AND profiles.coach_id = auth.uid()
  )
  OR
  -- Also allow if currentUser is the user (trainee themselves) - usually separate policy, but good to ensure
  user_id = auth.uid()
  OR
  public.is_admin()
)
WITH CHECK (
  -- For INSERT: The target user must be a trainee of the auth user (coach)
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_id
    AND profiles.coach_id = auth.uid()
  )
  OR
  public.is_admin()
);

-- 2. assignment_days
DROP POLICY IF EXISTS "Coaches can manage assignment days for their trainees" ON assignment_days;

CREATE POLICY "Coaches can manage assignment days for their trainees"
ON assignment_days
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_program_assignments upa
    JOIN profiles p ON p.id = upa.user_id
    WHERE upa.id = assignment_id
    AND (p.coach_id = auth.uid() OR upa.user_id = auth.uid() OR public.is_admin())
  )
);

-- 3. assignment_exercise_progress
DROP POLICY IF EXISTS "Coaches can manage exercise progress for their trainees" ON assignment_exercise_progress;

CREATE POLICY "Coaches can manage exercise progress for their trainees"
ON assignment_exercise_progress
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM assignment_days ad
    JOIN user_program_assignments upa ON upa.id = ad.assignment_id
    JOIN profiles p ON p.id = upa.user_id
    WHERE ad.id = assignment_day_id
    AND (p.coach_id = auth.uid() OR upa.user_id = auth.uid() OR public.is_admin())
  )
);
