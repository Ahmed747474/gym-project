-- ENHANCEMENT: Add Trainee Details to Assignment Logs
-- Fetch Trainee Email/Name when logging ASSIGN_PROGRAM events.

CREATE OR REPLACE FUNCTION log_assignment_event_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_coach_id UUID;
    v_trainee_email TEXT;
    v_trainee_name TEXT;
    v_program_title TEXT;
BEGIN
    v_actor_id := auth.uid();
    v_coach_id := NEW.coach_id;

    -- Fetch Trainee Details
    SELECT email, full_name INTO v_trainee_email, v_trainee_name 
    FROM profiles WHERE id = NEW.user_id;

    -- Fetch Program Title (Nice to have directly in log)
    SELECT title INTO v_program_title 
    FROM programs WHERE id = NEW.program_id;

    INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
    VALUES (
        v_actor_id,
        CASE WHEN v_actor_id = v_coach_id THEN 'ASSIGN_PROGRAM' ELSE 'ASSIGN_PROGRAM_ADMIN' END,
        NEW.id,
        'user_program_assignments',
        jsonb_build_object(
            'program_id', NEW.program_id, 
            'program_title', v_program_title,
            'user_id', NEW.user_id,
            'user_email', v_trainee_email,
            'user_full_name', v_trainee_name,
            'coach_id', v_coach_id,
            'start_date', NEW.start_date,
            'end_date', NEW.end_date
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
