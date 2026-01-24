-- DEBUG: Add Logging to handle_new_user
-- This will insert into audit_logs what the trigger received / decided.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_coach_code TEXT;
  v_coach_id UUID;
  v_birth_date DATE;
  v_meta_coach_id TEXT;
  v_debug_msg TEXT;
BEGIN
  -- 1. Validate Role
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'trainee');
  IF v_role NOT IN ('admin', 'coach', 'trainee') THEN
    v_role := 'trainee';
  END IF;

  -- 2. Validate Coach ID
  v_meta_coach_id := NEW.raw_user_meta_data->>'coach_id';
  v_coach_id := NULL;
  v_debug_msg := 'Starting validation for coach_id: ' || COALESCE(v_meta_coach_id, 'NULL');
  
  IF v_meta_coach_id IS NOT NULL AND v_meta_coach_id != '' THEN
      BEGIN
          v_coach_id := v_meta_coach_id::UUID;
          -- Check existence
          IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_coach_id) THEN
              v_debug_msg := v_debug_msg || ' -> NOT FOUND in profiles';
              v_coach_id := NULL; 
          ELSE
              v_debug_msg := v_debug_msg || ' -> FOUND and Valid';
          END IF;
      EXCEPTION WHEN OTHERS THEN
          v_debug_msg := v_debug_msg || ' -> EXCEPTION casting UUID: ' || SQLERRM;
          v_coach_id := NULL;
      END;
  ELSE
      v_debug_msg := v_debug_msg || ' -> No Coach ID provided';
  END IF;

  -- 3. Generate Coach Code
  v_coach_code := COALESCE(NEW.raw_user_meta_data->>'coach_code', NULL);
  IF v_role = 'coach' AND v_coach_code IS NULL THEN
     v_coach_code := UPPER(SUBSTRING(MD5(NEW.id::text || NOW()::text) FROM 1 FOR 6));
  END IF;

  -- 4. Safe Date Cast
  BEGIN
      v_birth_date := (NEW.raw_user_meta_data->>'birth_date')::DATE;
  EXCEPTION WHEN OTHERS THEN
      v_birth_date := NULL;
  END;

  -- 5. Insert
  BEGIN
      INSERT INTO profiles (
        id, email, full_name, role, coach_id, coach_code, coach_accepting_new, coach_status, gender, birth_date, phone, avatar_url
      )
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        v_role,
        v_coach_id,
        v_coach_code,
        (v_role = 'coach'), 
        CASE WHEN v_role = 'coach' THEN 'active' ELSE NULL END,
        COALESCE(NEW.raw_user_meta_data->>'gender', NULL),
        v_birth_date,
        COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        coach_id = EXCLUDED.coach_id, -- FORCE UPDATE coach_id if verified!
        updated_at = NOW();

       -- LOG DEBUG SUCCESS
       INSERT INTO audit_logs (actor_id, action, meta)
       VALUES (NULL, 'DEBUG_SIGNUP', jsonb_build_object('user_id', NEW.id, 'msg', v_debug_msg, 'final_coach_id', v_coach_id, 'meta_coach_id', v_meta_coach_id));

   EXCEPTION WHEN OTHERS THEN
       -- LOG ERROR
       INSERT INTO audit_logs (actor_id, action, meta)
       VALUES (NULL, 'DEBUG_SIGNUP_ERROR', jsonb_build_object('user_id', NEW.id, 'error', SQLERRM, 'msg', v_debug_msg));
       
       RAISE WARNING 'PROFILE INSERT FAILED: %', SQLERRM;
   END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
