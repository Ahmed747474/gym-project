-- RESTORE REGISTRATION LOGGING
-- 1. Restore log_registration_event_v2 (Dropped during debug).
-- 2. Add COACH_REGISTERED handling.
-- 3. Robust Exception Handling (swallows errors to prevent 500s).

CREATE OR REPLACE FUNCTION log_registration_event_v2()
RETURNS TRIGGER AS $$
BEGIN
    BEGIN
        -- 1. Trainee linked to Coach (INSERT or UPDATE)
        IF NEW.coach_id IS NOT NULL AND (OLD IS NULL OR OLD.coach_id IS DISTINCT FROM NEW.coach_id) THEN
            INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
            VALUES (
                NEW.id,
                'REGISTER_WITH_COACH_CODE',
                NEW.id,
                'profiles',
                jsonb_build_object('coach_id', NEW.coach_id, 'coach_code', NEW.coach_code)
            );
        END IF;

        -- 2. Coach Registered (INSERT only usually)
        IF NEW.role = 'coach' AND (OLD IS NULL OR OLD.role != 'coach') THEN
             INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
            VALUES (
                NEW.id,
                'COACH_REGISTERED',
                NEW.id,
                'profiles',
                jsonb_build_object('email', NEW.email)
            );
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        -- Swallow errors to ensure Signup never fails due to Logging
        RAISE WARNING 'Audit Log Error (Registration): %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trainee_linked ON profiles;
CREATE TRIGGER on_trainee_linked
    AFTER INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION log_registration_event_v2();
