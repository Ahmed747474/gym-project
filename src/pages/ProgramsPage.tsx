import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Program } from '../lib/database.types';

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, loading: authLoading, session } = useAuth();

  useEffect(() => {
    // Don't fetch until auth is done loading
    if (authLoading) {
      return;
    }

    if (!user || !session) {
      setLoading(false);
      return;
    }

    const fetchPrograms = async () => {
      setLoading(true);
      
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const accessToken = session.access_token;
        
        const response = await fetch(`${supabaseUrl}/rest/v1/programs?select=*`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setPrograms(data || []);
        setError('');
      } catch (err: any) {
        console.error('ProgramsPage: Error:', err);
        setError('Failed to load programs: ' + err.message);
      }
      
      setLoading(false);
    };

    fetchPrograms();
  }, [user?.id, authLoading, session]);

  if (loading || authLoading) {
    return (
      <Layout title="My Programs">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="My Programs">
      <div className="p-4 pb-20">
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {programs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-300 mb-2">No Programs Yet</h3>
            <p className="text-slate-500">Programs assigned to you will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {programs.map((program) => (
              <Link
                key={program.id}
                to={`/programs/${program.id}`}
                className="block bg-slate-800 rounded-xl p-4 hover:bg-slate-750 transition-colors animate-slideUp"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {program.title}
                    </h3>
                    {program.description && (
                      <p className="text-sm text-slate-400 line-clamp-2 mt-1">
                        {program.description}
                      </p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
