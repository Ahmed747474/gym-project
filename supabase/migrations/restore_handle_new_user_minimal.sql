-- RESTORE: Minimal Safe handle_new_user
-- No complex logic, no debug logging to tables.
-- Just insert the profile.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_full_name TEXT;
  v_coach_id UUID;
  v_meta_coach_id TEXT;
BEGIN
  -- Extract basic metadata
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'trainee');
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  
  -- Handle Coach ID safely
  v_meta_coach_id := NEW.raw_user_meta_data->>'coach_id';
  v_coach_id := NULL;
  
  IF v_meta_coach_id IS NOT NULL AND v_meta_coach_id != '' THEN
    BEGIN
        v_coach_id := v_meta_coach_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_coach_id := NULL;
    END;
  END IF;

  -- Minimal Insert
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
