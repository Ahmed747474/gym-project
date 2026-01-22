import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import JumpToInput from '../components/JumpToInput';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Day, ExerciseWithProgress } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export default function DayExercisesPage() {
  const { programId, dayId } = useParams<{ programId: string; dayId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [day, setDay] = useState<Day | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDayExercises = async () => {
      if (!dayId || !user) return;

      // Fetch day
      const { data: dayData, error: dayError } = await supabase
        .from('days')
        .select('*')
        .eq('id', dayId)
        .single();

      if (dayError) {
        setError('Day not found');
        setLoading(false);
        return;
      }

      setDay(dayData);

      // Fetch exercises
      const { data: exercisesData, error: exercisesError } = await supabase
        .from('exercises')
        .select('*')
        .eq('day_id', dayId)
        .order('exercise_number');

      if (exercisesError) {
        setError('Failed to load exercises');
        setLoading(false);
        return;
      }

      // Fetch progress
      const exercises = (exercisesData || []) as any[];
      const exerciseIds = exercises.map((e: any) => e.id);
      const { data: progressData } = await supabase
        .from('exercise_progress')
        .select('*')
        .eq('user_id', user.id)
        .in('exercise_id', exerciseIds);

      const progressMap = new Map((progressData as any[] || []).map((p: any) => [p.exercise_id, p]));

      const exercisesWithProgress: ExerciseWithProgress[] = exercises.map((exercise: any) => ({
        ...exercise,
        progress: progressMap.get(exercise.id) || null,
      }));

      setExercises(exercisesWithProgress);
      setLoading(false);
    };

    fetchDayExercises();
  }, [dayId, user]);

  const toggleExerciseDone = async (exerciseId: string, isDone: boolean) => {
    if (!user) return;

    if (isDone) {
      // Remove progress
      await supabase
        .from('exercise_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId);

      setExercises(exercises.map(e => 
        e.id === exerciseId ? { ...e, progress: null } : e
      ));
    } else {
      // Add progress
      const { data } = await supabase
        .from('exercise_progress')
        .insert({
          user_id: user.id,
          exercise_id: exerciseId,
        } as any)
        .select()
        .single();

      if (data) {
        setExercises(exercises.map(e => 
          e.id === exerciseId ? { ...e, progress: data as any } : e
        ));
      }
    }
  };

  const handleJumpToExercise = (exerciseNumber: number) => {
    const exercise = exercises.find(e => e.exercise_number === exerciseNumber);
    if (exercise) {
      navigate(`/programs/${programId}/days/${dayId}/exercises/${exercise.id}`);
    }
  };

  const completedCount = exercises.filter(e => e.progress).length;
  const completionPercent = exercises.length > 0 
    ? Math.round((completedCount / exercises.length) * 100) 
    : 0;

  if (loading) {
    return (
      <Layout title="Loading..." showBack>
        <LoadingSpinner />
      </Layout>
    );
  }

  if (error || !day) {
    return (
      <Layout title="Error" showBack>
        <div className="p-4 text-center">
          <p className="text-red-400">{error || 'Day not found'}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Day ${day.day_number}: ${day.title}`} showBack>
      <div className="p-4 pb-20">
        {/* Progress summary */}
        <div className="bg-slate-800 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400">Today's Progress</span>
            <span className={`font-bold ${completionPercent === 100 ? 'text-green-400' : 'text-white'}`}>
              {completedCount}/{exercises.length} done
            </span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                completionPercent === 100 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          {completionPercent === 100 && (
            <p className="text-green-400 text-sm mt-2 text-center font-medium">
              🎉 All exercises completed!
            </p>
          )}
        </div>

        {exercises.length > 0 && (
          <div className="mb-6">
            <JumpToInput
              label="Jump to Exercise"
              max={Math.max(...exercises.map(e => e.exercise_number))}
              onJump={handleJumpToExercise}
            />
          </div>
        )}

        {exercises.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No exercises in this day yet.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {exercises.map((exercise) => {
              const isDone = !!exercise.progress;
              return (
                <div
                  key={exercise.id}
                  className={`bg-slate-800 rounded-xl overflow-hidden transition-all ${
                    isDone ? 'opacity-75' : ''
                  }`}
                >
                  <div className="flex items-stretch">
                    {/* Checkbox area */}
                    <button
                      onClick={() => toggleExerciseDone(exercise.id, isDone)}
                      className={`w-14 flex items-center justify-center border-r border-slate-700 transition-colors ${
                        isDone 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-slate-700/50 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {isDone ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <div className="w-6 h-6 border-2 border-current rounded-md" />
                      )}
                    </button>

                    {/* Exercise details */}
                    <Link
                      to={`/programs/${programId}/days/${dayId}/exercises/${exercise.id}`}
                      className="flex-1 p-4 hover:bg-slate-750 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                              #{exercise.exercise_number}
                            </span>
                            <h3 className={`font-semibold truncate ${isDone ? 'text-slate-400 line-through' : 'text-white'}`}>
                              {exercise.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-slate-500">
                            <span>{exercise.sets} sets</span>
                            <span>×</span>
                            <span>{exercise.reps} reps</span>
                            {exercise.rest_seconds && (
                              <>
                                <span>•</span>
                                <span>{exercise.rest_seconds}s rest</span>
                              </>
                            )}
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-slate-500 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
