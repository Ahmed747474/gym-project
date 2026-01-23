-- Migration script for enforcing single active assignment per user
-- This script creates the partial unique index required for assignment queue logic

CREATE UNIQUE INDEX IF NOT EXISTS one_active_assignment_per_user
ON user_program_assignments(user_id)
WHERE state = 'active';
