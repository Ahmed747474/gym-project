-- =============================================
-- FIX RLS POLICIES - Run this in Supabase SQL Editor
-- This fixes the infinite recursion issue
-- =============================================

-- Step 1: Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view assigned programs" ON programs;
DROP POLICY IF EXISTS "Admins can view all programs" ON programs;
DROP POLICY IF EXISTS "Admins can create programs" ON programs;
DROP POLICY IF EXISTS "Admins can update programs" ON programs;
DROP POLICY IF EXISTS "Admins can delete programs" ON programs;
DROP POLICY IF EXISTS "Users can view own assignments" ON user_programs;
DROP POLICY IF EXISTS "Admins can view all assignments" ON user_programs;
DROP POLICY IF EXISTS "Admins can create assignments" ON user_programs;
DROP POLICY IF EXISTS "Admins can delete assignments" ON user_programs;
DROP POLICY IF EXISTS "Users can view days of assigned programs" ON days;
DROP POLICY IF EXISTS "Admins can view all days" ON days;
DROP POLICY IF EXISTS "Admins can create days" ON days;
DROP POLICY IF EXISTS "Admins can update days" ON days;
DROP POLICY IF EXISTS "Admins can delete days" ON days;
DROP POLICY IF EXISTS "Users can view exercises of assigned programs" ON exercises;
DROP POLICY IF EXISTS "Admins can view all exercises" ON exercises;
DROP POLICY IF EXISTS "Admins can create exercises" ON exercises;
DROP POLICY IF EXISTS "Admins can update exercises" ON exercises;
DROP POLICY IF EXISTS "Admins can delete exercises" ON exercises;
DROP POLICY IF EXISTS "Users can view own progress" ON exercise_progress;
DROP POLICY IF EXISTS "Users can create own progress" ON exercise_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON exercise_progress;
DROP POLICY IF EXISTS "Users can delete own progress" ON exercise_progress;
DROP POLICY IF EXISTS "Admins can view all progress" ON exercise_progress;

-- Step 2: Drop old is_admin function if exists
DROP FUNCTION IF EXISTS public.is_admin();

-- Step 3: Create the is_admin function with SECURITY DEFINER (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Step 4: Recreate ALL policies using the new function

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

-- Programs policies
CREATE POLICY "Users can view assigned programs"
  ON programs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_programs
      WHERE user_programs.program_id = programs.id
      AND user_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all programs"
  ON programs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can create programs"
  ON programs FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update programs"
  ON programs FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete programs"
  ON programs FOR DELETE
  USING (public.is_admin());

-- User Programs policies
CREATE POLICY "Users can view own assignments"
  ON user_programs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all assignments"
  ON user_programs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can create assignments"
  ON user_programs FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete assignments"
  ON user_programs FOR DELETE
  USING (public.is_admin());

-- Days policies
CREATE POLICY "Users can view days of assigned programs"
  ON days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_programs
      WHERE user_programs.program_id = days.program_id
      AND user_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all days"
  ON days FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can create days"
  ON days FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update days"
  ON days FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete days"
  ON days FOR DELETE
  USING (public.is_admin());

-- Exercises policies
CREATE POLICY "Users can view exercises of assigned programs"
  ON exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM days
      JOIN user_programs ON user_programs.program_id = days.program_id
      WHERE days.id = exercises.day_id
      AND user_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all exercises"
  ON exercises FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can create exercises"
  ON exercises FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update exercises"
  ON exercises FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete exercises"
  ON exercises FOR DELETE
  USING (public.is_admin());

-- Exercise Progress policies
CREATE POLICY "Users can view own progress"
  ON exercise_progress FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own progress"
  ON exercise_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own progress"
  ON exercise_progress FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own progress"
  ON exercise_progress FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all progress"
  ON exercise_progress FOR SELECT
  USING (public.is_admin());
