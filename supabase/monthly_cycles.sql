-- 1. program_cycles
CREATE TABLE IF NOT EXISTS program_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  month text NOT NULL,
  target_weeks int NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS program_cycles_unique_user_program_month ON program_cycles(user_id, program_id, month);

-- 2. cycle_weeks
CREATE TABLE IF NOT EXISTS cycle_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES program_cycles(id) ON DELETE CASCADE,
  week_no int NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cycle_weeks_unique_cycle_week ON cycle_weeks(cycle_id, week_no);
CREATE INDEX IF NOT EXISTS cycle_weeks_cycle_id_idx ON cycle_weeks(cycle_id);

-- 3. cycle_day_status
CREATE TABLE IF NOT EXISTS cycle_day_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES cycle_weeks(id) ON DELETE CASCADE,
  program_day_id uuid NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cycle_day_status_unique_week_day ON cycle_day_status(week_id, program_day_id);
CREATE INDEX IF NOT EXISTS cycle_day_status_week_id_idx ON cycle_day_status(week_id);

-- 4. cycle_exercise_progress
CREATE TABLE IF NOT EXISTS cycle_exercise_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES cycle_weeks(id) ON DELETE CASCADE,
  program_day_id uuid NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cycle_exercise_progress_unique ON cycle_exercise_progress(week_id, exercise_id, user_id);
CREATE INDEX IF NOT EXISTS cycle_exercise_progress_week_day_idx ON cycle_exercise_progress(week_id, program_day_id);
CREATE INDEX IF NOT EXISTS cycle_exercise_progress_user_id_idx ON cycle_exercise_progress(user_id);

-- RLS Policies
ALTER TABLE program_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own cycles" ON program_cycles
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE cycle_exercise_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own exercise progress" ON cycle_exercise_progress
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE cycle_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own weeks" ON cycle_weeks
  FOR ALL USING (EXISTS (SELECT 1 FROM program_cycles pc WHERE pc.id = cycle_weeks.cycle_id AND pc.user_id = auth.uid()));

ALTER TABLE cycle_day_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can access own day status" ON cycle_day_status
  FOR ALL USING (EXISTS (SELECT 1 FROM cycle_weeks cw JOIN program_cycles pc ON cw.cycle_id = pc.id WHERE cw.id = cycle_day_status.week_id AND pc.user_id = auth.uid()));
