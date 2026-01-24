-- =============================================
-- Fix Coach Role & Profile Sync
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Update handle_new_user function with validation and upsert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_coach_code TEXT;
BEGIN
  -- Validate role from metadata
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'trainee');
  IF v_role NOT IN ('admin', 'coach', 'trainee') THEN
    v_role := 'trainee';
  END IF;

  -- Generate coach_code if role is coach and code is missing
  v_coach_code := COALESCE(NEW.raw_user_meta_data->>'coach_code', NULL);
  IF v_role = 'coach' AND v_coach_code IS NULL THEN
     v_coach_code := UPPER(SUBSTRING(MD5(NEW.id::text || NOW()::text) FROM 1 FOR 6));
  END IF;

  INSERT INTO profiles (
    id, 
    email, 
    full_name, 
    role, 
    coach_id, 
    coach_code, 
    coach_accepting_new,
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
    (NEW.raw_user_meta_data->>'coach_id')::UUID,
    v_coach_code,
    (v_role = 'coach'), -- Default accepting new if coach
    COALESCE(NEW.raw_user_meta_data->>'gender', NULL),
    COALESCE(NEW.raw_user_meta_data->>'birth_date', NULL)::DATE,
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    -- Don't overwrite coach_id if already set, unless you want to? 
    -- Typically on signup conflict (re-signup?) we might want to keep existing state.
    -- But if this trigger firing on UPDATE of auth user? No, AFTER INSERT usually.
    -- However, the user asked for upsert.
    updated_at = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure Trigger is correct (Recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 3. Backfill / Fix existing users
-- Sync role from auth.users metadata to profiles
-- And generate coach_code for coaches who don't have one

DO $$
DECLARE
  r RECORD;
  meta_role TEXT;
  current_role TEXT;
  new_code TEXT;
BEGIN
  FOR r IN SELECT * FROM auth.users LOOP
    -- Extract role from metadata
    meta_role := COALESCE(r.raw_user_meta_data->>'role', 'trainee');
    
    -- Normalize role
    IF meta_role NOT IN ('admin', 'coach', 'trainee') THEN
      meta_role := 'trainee';
    END IF;

    -- Update profile if role doesn't match
    UPDATE profiles 
    SET role = meta_role
    WHERE id = r.id AND role != meta_role;
    
    -- If coach, ensure coach_code exists
    IF meta_role = 'coach' THEN
      UPDATE profiles
      SET coach_code = UPPER(SUBSTRING(MD5(id::text || NOW()::text) FROM 1 FOR 6)),
          coach_accepting_new = TRUE
      WHERE id = r.id AND coach_code IS NULL;
    END IF;
    
    -- If we missed creating a profile entirely for some user (rare but possible with errors)
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (
      r.id, 
      r.email, 
      COALESCE(r.raw_user_meta_data->>'full_name', ''),
      meta_role
    )
    ON CONFLICT (id) DO NOTHING;
    
  END LOOP;
END;
$$;
