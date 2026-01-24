-- =============================================
-- Fix Coach Program RLS (Strict Scoping)
-- =============================================

-- Ensure Programs RLS enforces:
-- Admin: Full Access
-- Coach: OWN programs only (owner_coach_id = auth.uid())

-- Drop existing policies on programs to clean slate (or replace specific ones)
DROP POLICY IF EXISTS "Admins can do everything on programs" ON programs;
DROP POLICY IF EXISTS "Coaches can insert own programs" ON programs;
DROP POLICY IF EXISTS "Coaches can select own programs" ON programs;
DROP POLICY IF EXISTS "Coaches can update own programs" ON programs;
DROP POLICY IF EXISTS "Coaches can delete own programs" ON programs;
DROP POLICY IF EXISTS "Public programs are viewable by everyone" ON programs; 

-- 1. Admin Policy (Full Access)
CREATE POLICY "Admins can do everything on programs"
  ON programs FOR ALL
  USING (public.is_admin());

-- 2. Coach Policies (Own Programs Only)
CREATE POLICY "Coaches can select own programs"
  ON programs FOR SELECT
  USING (owner_coach_id = auth.uid());

CREATE POLICY "Coaches can insert own programs"
  ON programs FOR INSERT
  WITH CHECK (owner_coach_id = auth.uid());

CREATE POLICY "Coaches can update own programs"
  ON programs FOR UPDATE
  USING (owner_coach_id = auth.uid());

CREATE POLICY "Coaches can delete own programs"
  ON programs FOR DELETE
  USING (owner_coach_id = auth.uid());

-- 3. Trainee Policies (View Allowed Programs)
-- Trainees need to see programs they are assigned to, OR strictly speaking, if 'manage' context is separate from 'use' context.
-- If we lock down SELECT for programs to 'owner_coach_id = auth.uid()', then TRAINEES see nothing in 'programs' table unless we add a policy for them.
-- BUT, typically trainees fetch 'user_program_assignments' which joins 'programs'. RLS on joined table applies.
-- So we MUST allow trainees to SELECT programs if they are assigned to them.
-- OR if they are fetching public programs?
-- For now, let's allow:
-- Trainees can select programs if they have an assignment for it.
CREATE POLICY "Trainees can view assigned programs"
  ON programs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_program_assignments upa
      WHERE upa.program_id = programs.id
      AND upa.user_id = auth.uid()
    )
  );
  
-- Also, if there are "System" programs (no owner), maybe allow read?
-- User didn't specify, but often 'owner_coach_id IS NULL' means system/public.
-- Let's stick to the request: "Coach: select... only where owner_coach_id = auth.uid()".
-- The challenge is Trainees. The "Trainees can view assigned programs" policy handles them safely.

-- 4. Exercises/Days RLS (Ensure cascading access)
-- (We did some of this in previous step, but let's reinforce if needed. Previous step policies rely on "programs.owner_coach_id = auth.uid()", which is good).

