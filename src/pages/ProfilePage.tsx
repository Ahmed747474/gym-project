import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('male');
  const [birthDate, setBirthDate] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setGender(profile.gender || 'male');
      setBirthDate(profile.birth_date || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone || null,
          gender: gender || null,
          birth_date: birthDate || null,
          avatar_url: avatarUrl || null,
        })
        .eq('id', user.id);

      if (error) throw error;
      
      await refreshProfile();
      setMessage({ text: 'Profile updated successfully', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Error updating profile', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!user || !profile) return <Layout title="Profile"><LoadingSpinner /></Layout>;

  return (
    <Layout title="My Profile" showBack>
      <div className="p-4 max-w-lg mx-auto">
        <form onSubmit={handleSave} className="bg-slate-800 rounded-xl p-6 space-y-4">
          
          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {message.text}
            </div>
          )}

          <div>
             <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
             <input type="email" value={profile.email} disabled className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-500 cursor-not-allowed" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

           <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Role</label>
            <div className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-500 capitalize">
                {profile.role}
                 {profile.role === 'trainee' && profile.coach_id && <span className="text-xs ml-2 text-slate-600">(Linked to Coach)</span>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Birth Date</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Avatar URL</label>
            <input
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/me.jpg"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

        </form>
      </div>
    </Layout>
  );
}
