-- FIX: Strict Foreign Key existence check
-- The previous "minimal" script failed because it didn't check if coach_id EXISTED in DB.
-- Accessing a non-existent FK causes a hard 500 error.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_full_name TEXT;
  v_coach_id UUID;
  v_meta_coach_id TEXT;
BEGIN
  -- 1. Extract Metadata
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'trainee');
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  
  -- 2. Validate Coach ID (Strict Existence Check)
  v_meta_coach_id := NEW.raw_user_meta_data->>'coach_id';
  v_coach_id := NULL;
  
  IF v_meta_coach_id IS NOT NULL AND v_meta_coach_id != '' THEN
    BEGIN
        -- Cast
        v_coach_id := v_meta_coach_id::UUID;
        
        -- Check if acts as a valid FK
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_coach_id) THEN
           -- FK would fail. Set to NULL.
           v_coach_id := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_coach_id := NULL;
    END;
  END IF;

  -- 3. Insert
  INSERT INTO profiles (id, email, full_name, role, coach_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_role,
    v_coach_id
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
