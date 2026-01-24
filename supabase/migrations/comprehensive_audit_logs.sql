-- Supersede coach_audit_logs and user_login_logs with a unified audit_logs table
-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL, -- Who performed the action
    action text NOT NULL, -- e.g., 'LOGIN', 'ASSIGN_PROGRAM', 'CREATE_PROGRAM'
    target_id uuid NULL, -- ID of the object affected (user_id, program_id, etc.)
    target_table text NULL, -- Table name of the target object
    meta jsonb DEFAULT '{}'::jsonb, -- Extra details (coach_id, snapshot data, etc.)
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- 2. Migrate existing data (Optional, best effort)
INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta, created_at)
SELECT 
    actor_id,
    action_type,
    COALESCE(assignment_id, trainee_id, program_id), 
    CASE 
        WHEN assignment_id IS NOT NULL THEN 'user_program_assignments'
        WHEN trainee_id IS NOT NULL THEN 'profiles'
        WHEN program_id IS NOT NULL THEN 'programs'
    END,
    meta || jsonb_build_object(
        'coach_id', coach_id,
        'trainee_id', trainee_id,
        'assignment_id', assignment_id,
        'program_id', program_id
    ),
    created_at
FROM coach_audit_logs;

INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta, created_at)
SELECT
    user_id,
    'LOGIN',
    user_id,
    'profiles',
    jsonb_build_object('ip', ip, 'user_agent', user_agent, 'email', email, 'role', role),
    created_at
FROM user_login_logs;

-- 3. Drop old tables
DROP TABLE IF EXISTS coach_audit_logs CASCADE;
DROP TABLE IF EXISTS user_login_logs CASCADE;

-- 4. RLS Policies for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin: View ALL
CREATE POLICY "Admins can view all logs"
    ON audit_logs FOR SELECT
    USING (public.is_admin());

-- Coach: View logs where they are the actor OR the log is about one of their trainees
-- We need a way to check if target_id is one of their trainees. 
-- For performance, we might just trust the 'meta->coach_id' if we log it, or do a join.
-- Simpler: Coach can view if actor_id = me OR meta->>'coach_id' = me.
CREATE POLICY "Coaches can view relevant logs"
    ON audit_logs FOR SELECT
    USING (
        actor_id = auth.uid() 
        OR (meta->>'coach_id')::uuid = auth.uid()
        -- Also check if target_id is a trainee of this coach? 
        -- Expensive to join 'profiles' here. 
        -- Let's rely on strictly stamping 'coach_id' in meta for actions involving a coach's trainee.
    );

-- Trainee: View their own logs (actor_id = me)
CREATE POLICY "Trainees can view own activity"
    ON audit_logs FOR SELECT
    USING (actor_id = auth.uid());

-- Insert Policy (for system triggers or client-side generic logging)
CREATE POLICY "Users can insert own logs"
    ON audit_logs FOR INSERT
    WITH CHECK (auth.uid() = actor_id);

-- 5. Triggers

-- A. Log Program Creation
CREATE OR REPLACE FUNCTION log_program_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
    VALUES (
        auth.uid(),
        'CREATE_PROGRAM',
        NEW.id,
        'programs',
        jsonb_build_object('title', NEW.title, 'owner_coach_id', NEW.owner_coach_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_program_created ON programs;
CREATE TRIGGER on_program_created
    AFTER INSERT ON programs
    FOR EACH ROW
    EXECUTE FUNCTION log_program_creation();


-- B. Log Assignment (Replaces old trigger)
CREATE OR REPLACE FUNCTION log_assignment_event_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_coach_id UUID;
BEGIN
    v_actor_id := auth.uid();
    v_coach_id := NEW.coach_id;

    INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
    VALUES (
        v_actor_id,
        CASE WHEN v_actor_id = v_coach_id THEN 'ASSIGN_PROGRAM' ELSE 'ASSIGN_PROGRAM_ADMIN' END,
        NEW.id,
        'user_program_assignments',
        jsonb_build_object(
            'program_id', NEW.program_id, 
            'user_id', NEW.user_id,
            'coach_id', v_coach_id,
            'start_date', NEW.start_date,
            'end_date', NEW.end_date
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_assignment_created ON user_program_assignments;
CREATE TRIGGER on_assignment_created
    AFTER INSERT ON user_program_assignments
    FOR EACH ROW
    EXECUTE FUNCTION log_assignment_event_v2();


-- C. Log Registration (Replaces old trigger)
CREATE OR REPLACE FUNCTION log_registration_event_v2()
RETURNS TRIGGER AS $$
BEGIN
    -- Log if new user linked to coach
    IF NEW.coach_id IS NOT NULL AND (OLD IS NULL OR OLD.coach_id IS DISTINCT FROM NEW.coach_id) THEN
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (
            NEW.id, -- Actor is the trainee registering
            'REGISTER_WITH_COACH_CODE',
            NEW.coach_id, -- Target is the coach? Or Generic. Let's say Target = Coach ID for this event? 
                          -- Actually, consistency: Target = Object Affected. 
                          -- Here, the relationship is the object. 
                          -- Let's set target_id = NEW.id (the profile) and put coach_id in meta.
            NEW.id,
            'profiles',
            jsonb_build_object('coach_id', NEW.coach_id, 'coach_code', NEW.coach_code)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trainee_linked ON profiles;
CREATE TRIGGER on_trainee_linked
    AFTER INSERT OR UPDATE OF coach_id ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION log_registration_event_v2();

