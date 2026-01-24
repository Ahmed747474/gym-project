-- =============================================
-- Fix Coach Issues: Validation & Permissions
-- =============================================

-- 1. RPC to Resolve Coach (Security Definer to bypass RLS)
CREATE OR REPLACE FUNCTION resolve_coach(p_input TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  coach_code TEXT,
  coach_accepting_new BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.coach_code, p.coach_accepting_new
  FROM profiles p
  WHERE 
    (UPPER(p.coach_code) = UPPER(p_input) OR LOWER(p.email) = LOWER(p_input))
    AND p.role = 'coach'
    AND p.coach_status = 'active'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION resolve_coach(TEXT) TO authenticated, anon; -- Allow anon for signup

-- 2. Update RLS on Programs to allow Coach Management
-- Admins have full access (already existing policies likely exist, but let's ensure)
-- Coaches should CRUD their own programs (owner_coach_id = auth.uid())

-- Drop conflicting policies if any (to be safe, or just ADD new specific ones)

-- Ensure "Coaches can insert own programs"
DROP POLICY IF EXISTS "Coaches can insert own programs" ON programs;
CREATE POLICY "Coaches can insert own programs"
  ON programs FOR INSERT
  WITH CHECK (
    auth.uid() = owner_coach_id 
    OR 
    (owner_coach_id IS NULL AND exists(select 1 from profiles where id=auth.uid() and role='coach'))
  );
  -- Note: owner_coach_id should be set by client. If not, we might want a trigger? 
  -- Better to enforce client sends it.

-- Ensure "Coaches can update own programs"
DROP POLICY IF EXISTS "Coaches can update own programs" ON programs;
CREATE POLICY "Coaches can update own programs"
  ON programs FOR UPDATE
  USING (owner_coach_id = auth.uid());

-- Ensure "Coaches can delete own programs"
DROP POLICY IF EXISTS "Coaches can delete own programs" ON programs;
CREATE POLICY "Coaches can delete own programs"
  ON programs FOR DELETE
  USING (owner_coach_id = auth.uid());

-- Ensure "Coaches can select own programs"
-- (Existing policy "Coaches can view/update own programs" might exist? Check schema.sql earlier)
-- Earlier schema had: CREATE POLICY "Coaches can view/update own programs" ON programs FOR ALL USING (owner_coach_id = auth.uid());
-- If that exists, it covers select/update/delete.
-- But we need INSERT specifically with WITH CHECK.
-- Let's drop the generic ALL one and be specific to avoid conflicts or gaps.

DROP POLICY IF EXISTS "Coaches can view/update own programs" ON programs;

-- Re-create specifics
CREATE POLICY "Coaches can select own programs"
  ON programs FOR SELECT
  USING (owner_coach_id = auth.uid()); 
  -- Note: We also need Coaches to see ALL programs? Or just theirs? 
  -- Req says "Coach sees only their programs" (in management view).
  -- But they might need to see *public* programs if we have them? 
  -- For now, "owner_coach_id = auth.uid()" satisfies "sees only their programs".

-- 3. Also allow Coaches to view Days/Exercises for their programs to manage them
-- Days
CREATE POLICY "Coaches can insert days for own programs"
  ON days FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM programs 
      WHERE programs.id = days.program_id 
      AND programs.owner_coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update days for own programs"
  ON days FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM programs 
      WHERE programs.id = days.program_id 
      AND programs.owner_coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete days for own programs"
  ON days FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM programs 
      WHERE programs.id = days.program_id 
      AND programs.owner_coach_id = auth.uid()
    )
  );
  
CREATE POLICY "Coaches can select days for own programs"
  ON days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM programs 
      WHERE programs.id = days.program_id 
      AND programs.owner_coach_id = auth.uid()
    )
  );

-- Exercises
CREATE POLICY "Coaches can manage exercises for own programs"
  ON exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM days
      JOIN programs ON programs.id = days.program_id
      WHERE days.id = exercises.day_id
      AND programs.owner_coach_id = auth.uid()
    )
  );

