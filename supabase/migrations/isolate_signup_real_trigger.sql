-- ISOLATION STEP 2: Drop the MAIN profile creation trigger
-- I previously dropped 'on_trainee_linked', but 'on_auth_user_created' is the one calling handle_new_user.
-- Dropping this will prevent Profile creation, but should allow Signup (auth.users) to succeed.
-- This confirms if the crash is inside handle_new_user.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- Also drop the function to be sure no one else calls it (though trigger drop is enough)
-- DROP FUNCTION IF EXISTS handle_new_user(); 
-- Keeping function for now to easily restore later, just dropping trigger.
