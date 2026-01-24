-- =============================================
-- Performance Optimization
-- =============================================

-- 1. Index on assignment_exercise_progress(assignment_day_id)
-- Critical for: fetching progress for specific days (used in the slow query)
CREATE INDEX IF NOT EXISTS idx_assignment_exercise_progress_day_id
ON assignment_exercise_progress(assignment_day_id);

-- 2. Index on assignment_days(assignment_id)
-- Critical for: joining days to assignments (used in RLS policies)
CREATE INDEX IF NOT EXISTS idx_assignment_days_assignment_id
ON assignment_days(assignment_id);

-- 3. Index on user_program_assignments(user_id)
-- Critical for: fetching user's assignments and RLS checks
CREATE INDEX IF NOT EXISTS idx_user_program_assignments_user_id
ON user_program_assignments(user_id);

-- 4. Index on user_program_assignments(program_id)
CREATE INDEX IF NOT EXISTS idx_user_program_assignments_program_id
ON user_program_assignments(program_id);

-- 5. Index on profiles(coach_id)
-- Critical for: checking coach trainees
CREATE INDEX IF NOT EXISTS idx_profiles_coach_id
ON profiles(coach_id);

-- 6. Index on programs(owner_coach_id)
-- Critical for: coach program filtering
CREATE INDEX IF NOT EXISTS idx_programs_owner_coach_id
ON programs(owner_coach_id);
