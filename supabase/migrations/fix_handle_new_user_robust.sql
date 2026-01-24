-- FIX: Robust handle_new_user
-- 1. Validate coach_id exists before inserting (avoids FK violation 500s).
-- 2. Safe cast birth_date.
-- 3. Explicitly handle coach_status.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_coach_code TEXT;
  v_coach_id UUID;
  v_birth_date DATE;
  v_meta_coach_id TEXT;
BEGIN
  -- 1. Validate Role
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'trainee');
  IF v_role NOT IN ('admin', 'coach', 'trainee') THEN
    v_role := 'trainee';
  END IF;

  -- 2. Validate Coach ID (Foreign Key Check)
  v_meta_coach_id := NEW.raw_user_meta_data->>'coach_id';
  v_coach_id := NULL;
  
  IF v_meta_coach_id IS NOT NULL AND v_meta_coach_id != '' THEN
      BEGIN
          -- Try cast to UUID
          v_coach_id := v_meta_coach_id::UUID;
          
          -- Check if exists in profiles AND is a coach (optional business rule, but good for data integrity)
          -- Actually, just checking existence is enough to prevent FK error.
          IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_coach_id) THEN
              -- Log warning? 
              RAISE WARNING 'Signup with invalid coach_id: %', v_meta_coach_id;
              v_coach_id := NULL; -- Reset to NULL to allow signup to proceed
          END IF;
      EXCEPTION WHEN OTHERS THEN
          v_coach_id := NULL; -- Cast failed
      END;
  END IF;

  -- 3. Generate Coach Code if needed
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
  INSERT INTO profiles (
    id, 
    email, 
    full_name, 
    role, 
    coach_id, 
    coach_code, 
    coach_accepting_new,
    coach_status, -- Explicitly handling
    gender, 
    birth_date, 
    phone, 
    avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_role,
    v_coach_id,
    v_coach_code,
    (v_role = 'coach'), -- Default accepting new if coach
    CASE WHEN v_role = 'coach' THEN 'active' ELSE NULL END, -- Default status
    COALESCE(NEW.raw_user_meta_data->>'gender', NULL),
    v_birth_date,
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
