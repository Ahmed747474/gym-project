-- ISOLATION STEP: Drop the registration trigger logic
-- We want to see if the signup 500 error persists WITHOUT this trigger.
-- If it persists, the issue is NOT in the audit log logic (likely invalid coach_id FK).
-- If it passes, the issue IS in the audit log logic.

DROP TRIGGER IF EXISTS on_trainee_linked ON profiles;
DROP FUNCTION IF EXISTS log_registration_event_v2();
