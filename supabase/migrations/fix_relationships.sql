-- =============================================
-- Fix Relationships & Schema for API Functionality
-- =============================================

-- 0. Ensure assignment_exercise_progress has user_id for RLS
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'assignment_exercise_progress' 
                 AND column_name = 'user_id') THEN
    ALTER TABLE assignment_exercise_progress 
    ADD COLUMN user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 1. user_program_assignments -> profiles (user_id)
ALTER TABLE user_program_assignments 
  DROP CONSTRAINT IF EXISTS user_program_assignments_user_id_fkey;

ALTER TABLE user_program_assignments
  ADD CONSTRAINT user_program_assignments_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id)
  ON DELETE CASCADE;

-- 2. user_program_assignments -> programs (program_id)
ALTER TABLE user_program_assignments 
  DROP CONSTRAINT IF EXISTS user_program_assignments_program_id_fkey;

ALTER TABLE user_program_assignments
  ADD CONSTRAINT user_program_assignments_program_id_fkey 
  FOREIGN KEY (program_id) REFERENCES programs(id)
  ON DELETE CASCADE;

-- 3. user_program_assignments -> profiles (coach_id)
ALTER TABLE user_program_assignments 
  DROP CONSTRAINT IF EXISTS user_program_assignments_coach_id_fkey;

ALTER TABLE user_program_assignments
  ADD CONSTRAINT user_program_assignments_coach_id_fkey 
  FOREIGN KEY (coach_id) REFERENCES profiles(id)
  ON DELETE SET NULL;

-- 4. assignment_days -> user_program_assignments
ALTER TABLE assignment_days
  DROP CONSTRAINT IF EXISTS assignment_days_assignment_id_fkey;

ALTER TABLE assignment_days
  ADD CONSTRAINT assignment_days_assignment_id_fkey
  FOREIGN KEY (assignment_id) REFERENCES user_program_assignments(id)
  ON DELETE CASCADE;

-- 5. assignment_days -> days (template)
ALTER TABLE assignment_days
  DROP CONSTRAINT IF EXISTS assignment_days_program_day_id_fkey;

ALTER TABLE assignment_days
  ADD CONSTRAINT assignment_days_program_day_id_fkey
  FOREIGN KEY (program_day_id) REFERENCES days(id)
  ON DELETE SET NULL;

-- 6. assignment_exercise_progress -> assignment_days
ALTER TABLE assignment_exercise_progress
  DROP CONSTRAINT IF EXISTS assignment_exercise_progress_assignment_day_id_fkey;

ALTER TABLE assignment_exercise_progress
  ADD CONSTRAINT assignment_exercise_progress_assignment_day_id_fkey
  FOREIGN KEY (assignment_day_id) REFERENCES assignment_days(id)
  ON DELETE CASCADE;

-- 7. assignment_exercise_progress -> exercises
ALTER TABLE assignment_exercise_progress
  DROP CONSTRAINT IF EXISTS assignment_exercise_progress_exercise_id_fkey;

ALTER TABLE assignment_exercise_progress
  ADD CONSTRAINT assignment_exercise_progress_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  ON DELETE CASCADE;

-- 8. assignment_exercise_progress -> profiles (user_id)
-- Re-apply this constraint explicitly just in case
ALTER TABLE assignment_exercise_progress 
  DROP CONSTRAINT IF EXISTS assignment_exercise_progress_user_id_fkey;

ALTER TABLE assignment_exercise_progress
  ADD CONSTRAINT assignment_exercise_progress_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id)
  ON DELETE CASCADE;

-- 9. RLS Policies for Assignment Tables (Ensure they exist)
ALTER TABLE assignment_exercise_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own assignment progress" ON assignment_exercise_progress;
CREATE POLICY "Users can manage own assignment progress"
  ON assignment_exercise_progress
  FOR ALL
  USING (user_id = auth.uid());
  
-- Also ensure assignment_days is readable
ALTER TABLE assignment_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own assignment days" ON assignment_days;
CREATE POLICY "Users can view own assignment days"
  ON assignment_days
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_program_assignments
      WHERE user_program_assignments.id = assignment_days.assignment_id
      AND user_program_assignments.user_id = auth.uid()
    )
  );

-- Refresh schema cache reminder
