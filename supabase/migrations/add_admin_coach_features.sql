-- =============================================
-- Admin Coach Management & Audit Logs
-- =============================================

-- 1. Add coach_status to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_status TEXT DEFAULT 'active' CHECK (coach_status IN ('active', 'deactivated'));

-- Backfill existing coaches
UPDATE profiles SET coach_status = 'active' WHERE role = 'coach' AND coach_status IS NULL;

-- 2. Create coach_audit_logs table
CREATE TABLE IF NOT EXISTS coach_audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL, -- admin or coach or trainee
  action_type text NOT NULL, -- 'ASSIGN_PROGRAM','REGISTER_WITH_COACH_CODE','LOGIN', 'DEACTIVATE_COACH', 'ACTIVATE_COACH'
  trainee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES user_program_assignments(id) ON DELETE SET NULL,
  program_id uuid REFERENCES programs(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_audit_logs_coach_id ON coach_audit_logs(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_audit_logs_created_at ON coach_audit_logs(created_at);

-- 3. Create user_login_logs table
CREATE TABLE IF NOT EXISTS user_login_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  email text,
  role text,
  coach_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ip text NULL,
  user_agent text NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON user_login_logs(user_id);

-- 4. RLS Policies

-- coach_audit_logs
ALTER TABLE coach_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin: Full Access
CREATE POLICY "Admins can view all coach logs"
  ON coach_audit_logs FOR SELECT
  USING (public.is_admin());

-- Coach: View own logs (actions they did or actions involving them)
CREATE POLICY "Coaches can view own logs"
  ON coach_audit_logs FOR SELECT
  USING (coach_id = auth.uid() OR actor_id = auth.uid());

-- System/Triggers: Allow inserts (usually handled by service role or triggers, but if client does it...)
-- Let's restrict INSERT to authenticated users, but realistically these are mostly system generated.
-- If we use client-side logging for some things:
CREATE POLICY "Users can insert logs"
  ON coach_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- user_login_logs
ALTER TABLE user_login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all login logs"
  ON user_login_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Users can insert own login logs"
  ON user_login_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Triggers for Automatic Logging

-- Trigger: Log Registration with Coach Code
CREATE OR REPLACE FUNCTION log_new_trainee_event()
RETURNS TRIGGER AS $$
BEGIN
  -- If a new profile is created with a coach_id, log it
  IF NEW.coach_id IS NOT NULL AND (OLD IS NULL OR OLD.coach_id IS DISTINCT FROM NEW.coach_id) THEN
    INSERT INTO coach_audit_logs (coach_id, actor_id, action_type, trainee_id, meta)
    VALUES (
      NEW.coach_id, 
      NEW.id, -- The trainee is the actor
      'REGISTER_WITH_COACH_CODE', 
      NEW.id,
      jsonb_build_object('coach_code', NEW.coach_code) -- might be null if they didn't have one themselves
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trainee_linked ON profiles;
CREATE TRIGGER on_trainee_linked
  AFTER INSERT OR UPDATE OF coach_id ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION log_new_trainee_event();

-- Trigger: Log Program Assignment
CREATE OR REPLACE FUNCTION log_assignment_event()
RETURNS TRIGGER AS $$
DECLARE
  v_coach_id UUID;
  v_actor_id UUID;
BEGIN
  -- Determine coach (owner of the assignment context? Or explicitly set)
  -- user_program_assignments has `coach_id` column (coach who assigned it).
  -- If implicit, use current auth user as actor.
  
  v_coach_id := NEW.coach_id;
  v_actor_id := auth.uid(); -- Might be admin or coach
  
  -- If coach_id is null (self-assigned?), ignore or log generic?
  -- Requirement says "Coach assigned program"
  
  IF v_coach_id IS NOT NULL THEN
    INSERT INTO coach_audit_logs (coach_id, actor_id, action_type, trainee_id, assignment_id, program_id, meta)
    VALUES (
      v_coach_id,
      v_actor_id,
      CASE WHEN v_actor_id = v_coach_id THEN 'ASSIGN_PROGRAM' ELSE 'ASSIGN_PROGRAM_ADMIN' END,
      NEW.user_id,
      NEW.id,
      NEW.program_id,
      jsonb_build_object('start_date', NEW.start_date, 'end_date', NEW.end_date, 'target_cycles', NEW.target_cycles)
    );
  END IF;
  return NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_assignment_created ON user_program_assignments;
CREATE TRIGGER on_assignment_created
  AFTER INSERT ON user_program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION log_assignment_event();
