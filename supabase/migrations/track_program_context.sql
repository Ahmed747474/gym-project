-- ENHANCEMENT: Add Program Context to Audit Logs
-- Use JOINs to fetch Program Title when logging Day/Exercise changes.

-- 1. Trigger to log Day Changes (Enhanced)
CREATE OR REPLACE FUNCTION log_day_change()
RETURNS TRIGGER AS $$
DECLARE 
    v_program_id UUID;
    v_program_title TEXT;
    v_title TEXT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_program_id := NEW.program_id;
        v_title := NEW.title;
        -- Fetch Program Title
        SELECT title INTO v_program_title FROM programs WHERE id = v_program_id;
        
        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'CREATE_DAY', NEW.id, 'days', jsonb_build_object(
            'program_id', v_program_id, 
            'program_title', v_program_title,
            'title', v_title, 
            'day_number', NEW.day_number
        ));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_program_id := NEW.program_id;
        v_title := NEW.title;
         -- Fetch Program Title
        SELECT title INTO v_program_title FROM programs WHERE id = v_program_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'UPDATE_DAY', NEW.id, 'days', jsonb_build_object(
            'program_id', v_program_id, 
             'program_title', v_program_title,
            'title', v_title, 
            'day_number', NEW.day_number
        ));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        v_program_id := OLD.program_id;
        v_title := OLD.title;
         -- Fetch Program Title
        SELECT title INTO v_program_title FROM programs WHERE id = v_program_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'DELETE_DAY', OLD.id, 'days', jsonb_build_object(
            'program_id', v_program_id, 
            'program_title', v_program_title,
            'title', v_title, 
            'day_number', OLD.day_number
        ));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger to log Exercise Changes (Enhanced)
CREATE OR REPLACE FUNCTION log_exercise_change()
RETURNS TRIGGER AS $$
DECLARE 
    v_day_id UUID;
    v_program_id UUID;
    v_program_title TEXT;
    v_name TEXT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_day_id := NEW.day_id;
        v_name := NEW.name;
        -- Fetch Program Info via Day JOIN
        SELECT p.id, p.title INTO v_program_id, v_program_title 
        FROM days d -- Use custom_days or days? The table name is 'days'.
        JOIN programs p ON p.id = d.program_id
        WHERE d.id = v_day_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'CREATE_EXERCISE', NEW.id, 'exercises', jsonb_build_object(
            'day_id', v_day_id, 
            'name', v_name,
            'program_id', v_program_id,
            'program_title', v_program_title
        ));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_day_id := NEW.day_id;
        v_name := NEW.name;
        -- Fetch Program Info
        SELECT p.id, p.title INTO v_program_id, v_program_title 
        FROM days d
        JOIN programs p ON p.id = d.program_id
        WHERE d.id = v_day_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'UPDATE_EXERCISE', NEW.id, 'exercises', jsonb_build_object(
            'day_id', v_day_id, 
            'name', v_name,
             'program_id', v_program_id,
            'program_title', v_program_title
        ));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        v_day_id := OLD.day_id;
        v_name := OLD.name;
        -- Fetch Program Info
        SELECT p.id, p.title INTO v_program_id, v_program_title 
        FROM days d
        JOIN programs p ON p.id = d.program_id
        WHERE d.id = v_day_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (auth.uid(), 'DELETE_EXERCISE', OLD.id, 'exercises', jsonb_build_object(
            'day_id', v_day_id, 
            'name', v_name,
             'program_id', v_program_id,
            'program_title', v_program_title
        ));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
