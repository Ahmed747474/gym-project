CREATE TABLE IF NOT EXISTS user_program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  program_days_count int NOT NULL,
  max_cycles int NOT NULL,
  status text NOT NULL DEFAULT 'active',
  state text NOT NULL DEFAULT 'queued', -- queued|active|archived|cancelled
  queued_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  archived_at timestamptz,
  queue_position int,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_program_assignments_user_id_idx ON user_program_assignments(user_id);
CREATE INDEX IF NOT EXISTS user_program_assignments_program_id_idx ON user_program_assignments(program_id);

-- Enforce only one active assignment per user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'one_active_assignment_per_user'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX one_active_assignment_per_user ON user_program_assignments(user_id) WHERE state = ''active'';';
  END IF;
END$$;

-- Table: assignment_days
CREATE TABLE IF NOT EXISTS assignment_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES user_program_assignments(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  cycle_no int NOT NULL,
  day_index int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS assignment_days_assignment_id_idx ON assignment_days(assignment_id);
CREATE INDEX IF NOT EXISTS assignment_days_scheduled_date_idx ON assignment_days(scheduled_date);

-- Table: assignment_exercise_progress
CREATE TABLE IF NOT EXISTS assignment_exercise_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_day_id uuid NOT NULL REFERENCES assignment_days(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS assignment_exercise_progress_day_idx ON assignment_exercise_progress(assignment_day_id);
CREATE INDEX IF NOT EXISTS assignment_exercise_progress_exercise_idx ON assignment_exercise_progress(exercise_id);

ALTER TABLE user_program_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own assignments" ON user_program_assignments
  FOR SELECT USING (user_id = auth.uid());
-- Admin can manage all assignments (if admin role exists)
CREATE POLICY "Admin can manage all assignments" ON user_program_assignments
  FOR ALL USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.is_admin));

ALTER TABLE assignment_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own assignment days" ON assignment_days
  FOR ALL USING (EXISTS (SELECT 1 FROM user_program_assignments a WHERE a.id = assignment_days.assignment_id AND a.user_id = auth.uid()));

ALTER TABLE assignment_exercise_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own assignment exercise progress" ON assignment_exercise_progress
  FOR ALL USING (EXISTS (SELECT 1 FROM assignment_days ad JOIN user_program_assignments a ON ad.assignment_id = a.id WHERE ad.id = assignment_exercise_progress.assignment_day_id AND a.user_id = auth.uid()));
