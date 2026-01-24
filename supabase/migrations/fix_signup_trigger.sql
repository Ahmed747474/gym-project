-- FIX SIGNUP 500 ERROR
-- The `log_registration_event_v2` function had a syntax error (too many values in INSERT).
-- This migration corrects the function and adds exception handling for robustness.

CREATE OR REPLACE FUNCTION log_registration_event_v2()
RETURNS TRIGGER AS $$
BEGIN
    -- Log if new user linked to coach
    IF NEW.coach_id IS NOT NULL AND (OLD IS NULL OR OLD.coach_id IS DISTINCT FROM NEW.coach_id) THEN
        BEGIN
            INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
            VALUES (
                NEW.id, -- Actor is the trainee registering
                'REGISTER_WITH_COACH_CODE',
                NEW.id, -- Target is the trainee profile itself
                'profiles',
                jsonb_build_object(
                    'coach_id', NEW.coach_id, 
                    'coach_code', NEW.coach_code
                )
            );
        EXCEPTION WHEN OTHERS THEN
            -- Capture and log error but do NOT fail the transaction
            -- usage of RAISE WARNING mimics console.error
            RAISE WARNING 'Audit Log Error during Registration: %', SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- No need to drop/create trigger, replacing function is enough as trigger points to it by name.
