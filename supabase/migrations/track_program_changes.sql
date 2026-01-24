-- Trigger to log Program Changes
CREATE OR REPLACE FUNCTION log_program_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (
            auth.uid(),
            'UPDATE_PROGRAM',
            NEW.id,
            'programs',
            jsonb_build_object('title', NEW.title, 'owner_coach_id', NEW.owner_coach_id)
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (
            auth.uid(),
            'DELETE_PROGRAM',
            OLD.id,
            'programs',
            jsonb_build_object('title', OLD.title, 'owner_coach_id', OLD.owner_coach_id)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_program_change ON programs;
CREATE TRIGGER on_program_change
    AFTER UPDATE OR DELETE ON programs
    FOR EACH ROW
    EXECUTE FUNCTION log_program_change();


-- Trigger to log Day Changes
CREATE OR REPLACE FUNCTION log_day_change()
RETURNS TRIGGER AS $$
DECLARE 
    v_program_id UUID;
    v_title TEXT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_program_id := NEW.program_id;
        v_title := NEW.title;
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'CREATE_DAY', NEW.id, 'days', jsonb_build_object('program_id', v_program_id, 'title', v_title, 'day_number', NEW.day_number));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_program_id := NEW.program_id;
        v_title := NEW.title;
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'UPDATE_DAY', NEW.id, 'days', jsonb_build_object('program_id', v_program_id, 'title', v_title, 'day_number', NEW.day_number));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        v_program_id := OLD.program_id;
        v_title := OLD.title;
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'DELETE_DAY', OLD.id, 'days', jsonb_build_object('program_id', v_program_id, 'title', v_title, 'day_number', OLD.day_number));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_day_change ON days;
CREATE TRIGGER on_day_change
    AFTER INSERT OR UPDATE OR DELETE ON days
    FOR EACH ROW
    EXECUTE FUNCTION log_day_change();


-- Trigger to log Exercise Changes
CREATE OR REPLACE FUNCTION log_exercise_change()
RETURNS TRIGGER AS $$
DECLARE 
    v_day_id UUID;
    v_name TEXT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_day_id := NEW.day_id;
        v_name := NEW.name;
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'CREATE_EXERCISE', NEW.id, 'exercises', jsonb_build_object('day_id', v_day_id, 'name', v_name));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_day_id := NEW.day_id;
        v_name := NEW.name;
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'UPDATE_EXERCISE', NEW.id, 'exercises', jsonb_build_object('day_id', v_day_id, 'name', v_name));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        v_day_id := OLD.day_id;
        v_name := OLD.name;
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'DELETE_EXERCISE', OLD.id, 'exercises', jsonb_build_object('day_id', v_day_id, 'name', v_name));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_exercise_change ON exercises;
CREATE TRIGGER on_exercise_change
    AFTER INSERT OR UPDATE OR DELETE ON exercises
    FOR EACH ROW
    EXECUTE FUNCTION log_exercise_change();
