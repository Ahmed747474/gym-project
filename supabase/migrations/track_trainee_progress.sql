-- TRACK TRAINEE PROGRESS: Exercises, Days, Repeats, Programs
-- Logs: EXERCISE_COMPLETED, EXERCISE_UNCOMPLETED, DAY_COMPLETED, REPEAT_COMPLETED, PROGRAM_COMPLETED

-- 1. Trigger: EXERCISE Progress (assignment_exercise_progress)
CREATE OR REPLACE FUNCTION log_exercise_progress()
RETURNS TRIGGER AS $$
DECLARE 
    v_program_title TEXT;
    v_day_title TEXT;
    v_day_number INT;
    v_exercise_name TEXT;
    v_assignment_day_id UUID;
    v_repeat_no INT;
BEGIN
    -- Only log if 'done' status changed
    IF (TG_OP = 'UPDATE' AND OLD.done IS DISTINCT FROM NEW.done) OR (TG_OP = 'INSERT') THEN
        v_assignment_day_id := NEW.assignment_day_id;
        
        -- Fetch Context (Join heavy but necessary for rich logs)
        SELECT 
            p.title as program_title,
            d.title as day_title,
            d.day_number,
            e.name as exercise_name,
            ad.repeat_no
        INTO v_program_title, v_day_title, v_day_number, v_exercise_name, v_repeat_no
        FROM assignment_days ad
        JOIN user_program_assignments upa ON upa.id = ad.assignment_id
        JOIN programs p ON p.id = upa.program_id
        JOIN days d ON d.id = ad.program_day_id -- Link to template day
        JOIN exercises e ON e.id = NEW.exercise_id
        WHERE ad.id = v_assignment_day_id;

        IF NEW.done THEN
            INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
            VALUES (NEW.user_id, 'EXERCISE_COMPLETED', NEW.exercise_id, 'exercises', jsonb_build_object(
                'exercise_name', v_exercise_name,
                'program_title', v_program_title,
                'day_title', v_day_title,
                'day_number', v_day_number,
                'repeat_no', v_repeat_no
            ));
        ELSE
            INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
            VALUES (NEW.user_id, 'EXERCISE_UNCOMPLETED', NEW.exercise_id, 'exercises', jsonb_build_object(
                'exercise_name', v_exercise_name,
                'program_title', v_program_title,
                'day_title', v_day_title,
                'day_number', v_day_number,
                'repeat_no', v_repeat_no
            ));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_exercise_progress ON assignment_exercise_progress;
CREATE TRIGGER on_exercise_progress
    AFTER INSERT OR UPDATE ON assignment_exercise_progress
    FOR EACH ROW
    EXECUTE FUNCTION log_exercise_progress();


-- 2. Trigger: DAY Progress (assignment_days)
-- Log when status becomes 'done'
CREATE OR REPLACE FUNCTION log_assignment_day_progress()
RETURNS TRIGGER AS $$
DECLARE 
    v_program_title TEXT;
    v_day_title TEXT;
    v_day_number INT;
    v_user_id UUID;
BEGIN
    IF (TG_OP = 'UPDATE' AND NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done') THEN
        
        -- Fetch Context
        SELECT 
            p.title,
            d.title,
            d.day_number,
            upa.user_id
        INTO v_program_title, v_day_title, v_day_number, v_user_id
        FROM user_program_assignments upa
        JOIN programs p ON p.id = upa.program_id
        JOIN days d ON d.id = NEW.program_day_id
        WHERE upa.id = NEW.assignment_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (v_user_id, 'DAY_COMPLETED', NEW.id, 'assignment_days', jsonb_build_object(
            'program_title', v_program_title,
            'day_title', v_day_title,
            'day_number', v_day_number,
            'repeat_no', NEW.repeat_no
        ));

        -- Check if REPEAT is completed? (All days in this repeat are done)
        -- Keep it simple: Just allow the UI to infer, or add a separate check here if strictly needed.
        -- User asked for "repeat completed". Let's check.
        IF NOT EXISTS (
            SELECT 1 FROM assignment_days 
            WHERE assignment_id = NEW.assignment_id 
            AND repeat_no = NEW.repeat_no 
            AND status != 'done'
        ) THEN
             INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
            VALUES (v_user_id, 'REPEAT_COMPLETED', NEW.assignment_id, 'assignment_days', jsonb_build_object(
                'program_title', v_program_title,
                'repeat_no', NEW.repeat_no
            ));
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_assignment_day_done ON assignment_days;
CREATE TRIGGER on_assignment_day_done
    AFTER UPDATE ON assignment_days
    FOR EACH ROW
    EXECUTE FUNCTION log_assignment_day_progress();

-- 3. Trigger: PROGRAM Progress (user_program_assignments)
-- Log when assignment status becomes 'completed' (assuming we use that status, or 'archived'?)
-- Schema says 'state': 'active' | 'archived' | 'completed'?
-- Looking at schemas, we seem to use 'active' and 'archived'. If 'completed' is not a state, we might rely on target_cycles logic application side.
-- Assuming user manually marks it or system marks it. Let's watch for 'completed' state if it exists, or 'archived' context.
-- Checking usage: src/lib/database.types.ts shows state is text. Ideally we should have a 'completed' state.
-- For now, let's assume if state updates to 'completed' or 'archived', we log it.
CREATE OR REPLACE FUNCTION log_program_completion()
RETURNS TRIGGER AS $$
DECLARE 
    v_program_title TEXT;
BEGIN
    IF (TG_OP = 'UPDATE' AND (NEW.state = 'completed' OR NEW.state = 'archived') AND OLD.state IS DISTINCT FROM NEW.state) THEN
        SELECT title INTO v_program_title FROM programs WHERE id = NEW.program_id;

        INSERT INTO audit_logs (actor_id, action, target_id, target_table, meta)
        VALUES (NEW.user_id, 'PROGRAM_COMPLETED', NEW.id, 'user_program_assignments', jsonb_build_object(
            'program_title', v_program_title,
            'start_date', NEW.start_date,
            'end_date', NEW.end_date
        ));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_program_completion ON user_program_assignments;
CREATE TRIGGER on_program_completion
    AFTER UPDATE ON user_program_assignments
    FOR EACH ROW
    EXECUTE FUNCTION log_program_completion();
