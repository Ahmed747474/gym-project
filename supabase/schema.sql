-- =============================================
-- Workout Player Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'trainee' CHECK (role IN ('admin', 'coach', 'trainee')),
  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  coach_code TEXT UNIQUE,
  coach_accepting_new BOOLEAN DEFAULT FALSE,
  gender TEXT,
  birth_date DATE,
  phone TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT FALSE, -- Deprecated in favor of role='admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programs table
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Original creator
  owner_coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Coach who owns this program
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Program Assignments (many-to-many)
CREATE TABLE user_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Coach who assigned this
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, program_id)
);

-- Days table (each program has multiple days)
CREATE TABLE days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, day_number)
);

-- Exercises table
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  exercise_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL DEFAULT 3,
  reps TEXT NOT NULL DEFAULT '10', -- Can be "10" or "8-12" or "AMRAP"
  rest_seconds INTEGER DEFAULT 60,
  notes TEXT,
  video_url TEXT, -- Google Drive share link
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day_id, exercise_number)
);

-- Exercise Progress table (tracks user completion)
CREATE TABLE exercise_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  done_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, exercise_id)
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_user_programs_user_id ON user_programs(user_id);
CREATE INDEX idx_user_programs_program_id ON user_programs(program_id);
CREATE INDEX idx_days_program_id ON days(program_id);
CREATE INDEX idx_exercises_day_id ON exercises(day_id);
CREATE INDEX idx_exercise_progress_user_id ON exercise_progress(user_id);
CREATE INDEX idx_exercise_progress_exercise_id ON exercise_progress(exercise_id);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE days ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_progress ENABLE ROW LEVEL SECURITY;

-- Profiles policies
-- Users can always view and update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR 
    (EXISTS ( -- Coaches can view their trainees
      SELECT 1 FROM profiles AS p 
      WHERE p.id = profiles.id AND p.coach_id = auth.uid()
    ))
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can view all profiles (using a security definer function to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND (is_admin = TRUE OR role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

-- Programs policies
CREATE POLICY "Users can view assigned programs"
  ON programs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_programs
      WHERE user_programs.program_id = programs.id
      AND user_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all programs"
  ON programs FOR SELECT
  USING (public.is_admin() OR role = 'admin'); -- Assuming we migrate is_admin function to check role too

CREATE POLICY "Coaches can view/update own programs"
  ON programs FOR ALL
  USING (owner_coach_id = auth.uid());

CREATE POLICY "Admins can create programs"
  ON programs FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update programs"
  ON programs FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete programs"
  ON programs FOR DELETE
  USING (public.is_admin());

-- User Programs policies
CREATE POLICY "Users can view own assignments"
  ON user_programs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all assignments"
  ON user_programs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Coaches can CRUD own assignments"
  ON user_programs FOR ALL
  USING (coach_id = auth.uid());

CREATE POLICY "Admins can create assignments"
  ON user_programs FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete assignments"
  ON user_programs FOR DELETE
  USING (public.is_admin());

-- Days policies
CREATE POLICY "Users can view days of assigned programs"
  ON days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_programs
      WHERE user_programs.program_id = days.program_id
      AND user_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all days"
  ON days FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can create days"
  ON days FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update days"
  ON days FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete days"
  ON days FOR DELETE
  USING (public.is_admin());

-- Exercises policies
CREATE POLICY "Users can view exercises of assigned programs"
  ON exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM days
      JOIN user_programs ON user_programs.program_id = days.program_id
      WHERE days.id = exercises.day_id
      AND user_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all exercises"
  ON exercises FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can create exercises"
  ON exercises FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update exercises"
  ON exercises FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete exercises"
  ON exercises FOR DELETE
  USING (public.is_admin());

-- Exercise Progress policies
CREATE POLICY "Users can view own progress"
  ON exercise_progress FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own progress"
  ON exercise_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own progress"
  ON exercise_progress FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own progress"
  ON exercise_progress FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all progress"
  ON exercise_progress FOR SELECT
  USING (public.is_admin());

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, coach_id, coach_code, gender, birth_date, phone, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'trainee'),
    (NEW.raw_user_meta_data->>'coach_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'coach_code', NULL),
    COALESCE(NEW.raw_user_meta_data->>'gender', NULL),
    COALESCE(NEW.raw_user_meta_data->>'birth_date', NULL)::DATE,
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_days_updated_at
  BEFORE UPDATE ON days
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_exercises_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to get day completion percentage
CREATE OR REPLACE FUNCTION get_day_completion(p_user_id UUID, p_day_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_exercises INTEGER;
  completed_exercises INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_exercises
  FROM exercises WHERE day_id = p_day_id;
  
  IF total_exercises = 0 THEN
    RETURN 0;
  END IF;
  
  SELECT COUNT(*) INTO completed_exercises
  FROM exercise_progress ep
  JOIN exercises e ON e.id = ep.exercise_id
  WHERE ep.user_id = p_user_id AND e.day_id = p_day_id;
  
  RETURN ROUND((completed_exercises::NUMERIC / total_exercises::NUMERIC) * 100, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================

-- Uncomment below to insert sample data after creating an admin user

/*
-- First, make a user admin (replace with actual user ID)
-- UPDATE profiles SET is_admin = TRUE WHERE email = 'admin@example.com';

-- Insert sample program
INSERT INTO programs (id, title, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Beginner Strength', 'A 4-week program for beginners');

-- Insert sample days
INSERT INTO days (program_id, day_number, title) VALUES
  ('11111111-1111-1111-1111-111111111111', 1, 'Push Day'),
  ('11111111-1111-1111-1111-111111111111', 2, 'Pull Day'),
  ('11111111-1111-1111-1111-111111111111', 3, 'Legs Day');

-- Insert sample exercises (get day IDs first)
*/
