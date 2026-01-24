import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type Role = 'trainee' | 'coach';

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('trainee');
  const [gender, setGender] = useState('male');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [coachIdentifier, setCoachIdentifier] = useState(''); // Code or Email
  const [coachError, setCoachError] = useState('');
  const [verifiedCoachId, setVerifiedCoachId] = useState<string | null>(null);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleVerifyCoach = async () => {
    if (!coachIdentifier) return;
    setLoading(true);
    setCoachError('');
    
    try {
      // Use RPC to securely resolve coach (bypassing RLS issues for unauth users)
      const { data, error } = await supabase.rpc('resolve_coach', { p_input: coachIdentifier });

      if (error) {
        console.error('Error verifying coach:', error);
        setCoachError('Error verifying trainer.');
        return;
      }

      // RPC returns an array (setof table) or single object depending on definition?
      // "RETURNS TABLE" returns rows. We used LIMIT 1 but it's still a list.
      // Supabase JS .rpc usually returns data as T[] or T.
      // Let's assume list because returns table.
      
      const coach = Array.isArray(data) ? data[0] : data;

      if (coach) {
        if (!coach.coach_accepting_new) {
           setCoachError(`Trainer ${coach.full_name} is not accepting new trainees.`);
           setVerifiedCoachId(null);
        } else {
           setVerifiedCoachId(coach.id);
        }
      } else {
         setCoachError('Trainer not found or not accepting new trainees.');
         setVerifiedCoachId(null);
      }
    } catch (err) {
      setCoachError('Error verifying trainer.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }; // End handleVerifyCoach (replaces huge block)

  const generateCoachCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const coachCode = role === 'coach' ? generateCoachCode() : undefined;
      const finalCoachId = role === 'trainee' && verifiedCoachId ? verifiedCoachId : undefined;

      const { data: authData, error } = await signUp(email, password, {
        fullName,
        role,
        coachId: finalCoachId,
        coachCode,
        gender,
        birthDate,
        phone,
      });
      
      if (error) throw error;

      // If we got a session, redirect immediately
      if (authData?.session) {
          navigate(role === 'coach' ? '/coach' : '/');
          return;
      }
      
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ... Update trigger for coach_id!
  // I will execute another tool call to update the trigger before this file write effectively runs 
  // (actually I am writing this file now, I should update the trigger in the next step to be sure).

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-900">
        <div className="w-full max-w-md text-center animate-slideUp">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
          <p className="text-slate-400">Please check your email to verify your account.</p>
          <p className="text-slate-500 text-sm mt-4">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-900 py-12">
      <div className="w-full max-w-md animate-slideUp">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Create Account</h1>
          <p className="text-slate-400 mt-2">Join Workout Player</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">I am a...</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    className={`p-4 rounded-xl border-2 transition-all ${
                      role === 'trainee'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-slate-600 hover:border-slate-500 text-slate-400'
                    }`}
                    onClick={() => setRole('trainee')}
                  >
                    <div className="font-bold mb-1">Trainee</div>
                    <div className="text-xs opacity-80">I want to follow programs</div>
                  </button>
                  <button
                    type="button"
                    className={`p-4 rounded-xl border-2 transition-all ${
                      role === 'coach'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-slate-600 hover:border-slate-500 text-slate-400'
                    }`}
                    onClick={() => setRole('coach')}
                  >
                    <div className="font-bold mb-1">Coach</div>
                    <div className="text-xs opacity-80">I want to create programs</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Account Info</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white mb-3"
                  placeholder="Full Name"
                  required
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white mb-3"
                  placeholder="Email Address"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white mb-3"
                  placeholder="Password (min 6 chars)"
                  required
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Confirm Password"
                  required
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!fullName || !email || !password || password !== confirmPassword}
                className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                Next Step
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">Personal Details</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Phone Number"
                />
              </div>

              {role === 'trainee' && (
                <div className="pt-4 border-t border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Connect with Coach (Optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={coachIdentifier}
                      onChange={(e) => setCoachIdentifier(e.target.value)}
                      className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      placeholder="Coach Code or Email"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCoach}
                      disabled={loading || !coachIdentifier}
                      className="px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-lg disabled:opacity-50"
                    >
                      Verify
                    </button> // Verify button
                  </div>
                  {coachError && <p className="text-red-400 text-sm mt-1">{coachError}</p>}
                  {verifiedCoachId && <p className="text-green-400 text-sm mt-1">✓ Coach Verified</p>}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || (role === 'trainee' && !!coachIdentifier && !verifiedCoachId)}
                  className="flex-1 py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </>
          )}

          <p className="text-center text-slate-400 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
