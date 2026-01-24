-- DEBUG: Disable handle_new_user logic (No-Op)
-- We replace the function logic with an empty return.
-- If the trigger exists, it will run this safe code and succeed.
-- This confirms if the crash was inside the function logic.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- NO-OP to allow signup to proceed without profile creation
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
