import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import JumpToInput from '../components/JumpToInput';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Day, Program } from '../lib/database.types';
import { supabase } from '../lib/supabase';

interface DayWithCompletion extends Day {
  completion: number;
  exerciseCount: number;
}

export default function ProgramDetailsPage() {
  const { programId } = useParams<{ programId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<DayWithCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProgramDetails = async () => {
      if (!programId || !user) return;

      // Fetch program
      const { data: programData, error: programError } = await supabase
        .from('programs')
        .select('*')
        .eq('id', programId)
        .single();

      if (programError) {
        setError('Program not found');
        setLoading(false);
        return;
      }

      setProgram(programData);

      // Fetch days with exercise counts
      const { data: daysData, error: daysError } = await supabase
        .from('days')
        .select(`
          *,
          exercises(id)
        `)
        .eq('program_id', programId)
        .order('day_number');

      if (daysError) {
        setError('Failed to load days');
        setLoading(false);
        return;
      }

      // Fetch progress for all exercises
      const { data: progressData } = await supabase
        .from('exercise_progress')
        .select('exercise_id')
        .eq('user_id', user.id);

      const completedExerciseIds = new Set((progressData as any[] || []).map((p: any) => p.exercise_id));

      // Calculate completion for each day
      const daysWithCompletion: DayWithCompletion[] = ((daysData || []) as any[]).map((day: any) => {
        const exercises = day.exercises || [];
        const exerciseCount = exercises.length;
        const completedCount = exercises.filter((e: any) => completedExerciseIds.has(e.id)).length;
        const completion = exerciseCount > 0 ? Math.round((completedCount / exerciseCount) * 100) : 0;
        
        return {
          ...day,
          exerciseCount,
          completion,
        };
      });

      setDays(daysWithCompletion);
      setLoading(false);
    };

    fetchProgramDetails();
  }, [programId, user]);

  const handleJumpToDay = (dayNumber: number) => {
    const day = days.find(d => d.day_number === dayNumber);
    if (day) {
      navigate(`/programs/${programId}/days/${day.id}`);
    }
  };

  if (loading) {
    return (
      <Layout title="Loading..." showBack>
        <LoadingSpinner />
      </Layout>
    );
  }

  if (error || !program) {
    return (
      <Layout title="Error" showBack>
        <div className="p-4 text-center">
          <p className="text-red-400">{error || 'Program not found'}</p>
          <Link to="/programs" className="text-blue-400 mt-4 inline-block">
            Back to Programs
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={program.title} showBack>
      <div className="p-4 pb-20">
        {program.description && (
          <p className="text-slate-400 mb-6">{program.description}</p>
        )}

        {days.length > 0 && (
          <div className="mb-6">
            <JumpToInput
              label="Jump to Day"
              max={Math.max(...days.map(d => d.day_number))}
              onJump={handleJumpToDay}
            />
          </div>
        )}

        {days.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No days in this program yet.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {days.map((day) => (
              <Link
                key={day.id}
                to={`/programs/${programId}/days/${day.id}`}
                className="block bg-slate-800 rounded-xl p-4 hover:bg-slate-750 transition-colors animate-slideUp"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center font-bold">
                      {day.day_number}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{day.title}</h3>
                      <p className="text-sm text-slate-500">{day.exerciseCount} exercises</p>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Progress</span>
                    <span className={day.completion === 100 ? 'text-green-400' : 'text-slate-400'}>
                      {day.completion}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        day.completion === 100 ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${day.completion}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
