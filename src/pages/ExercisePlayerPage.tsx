import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Day, Exercise } from '../lib/database.types';
import { supabase } from '../lib/supabase';

// Helper to convert Google Drive share link to embed URL
function getDriveEmbedUrl(shareUrl: string): string | null {
  if (!shareUrl) return null;
  // Extract file ID from various Google Drive URL formats
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];


  for (const pattern of patterns) {
    const match = shareUrl.match(pattern);
    if (match) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
  }
  return null;
}

function getDriveOpenUrl(shareUrl: string): string {
  // Return original URL or clean it up for opening
  const embedUrl = getDriveEmbedUrl(shareUrl);
  if (embedUrl) {
    return embedUrl.replace('/preview', '/view');
  }
  return shareUrl;
}

export default function ExercisePlayerPage() {
  // Expect programId, assignmentDayId, exerciseId in route
  const { programId, assignmentDayId, exerciseId } = useParams<{ 
    programId: string;
    assignmentDayId: string;
    exerciseId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [progress, setProgress] = useState<any | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchExercise = async () => {
      if (!exerciseId || !assignmentDayId || !user) return;

      // Fetch assignment_day
      const { data: assignmentDay, error: adError } = await supabase
        .from('assignment_days')
        .select('*')
        .eq('id', assignmentDayId)
        .single();
      if (adError || !assignmentDay) {
        setError('Assignment day not found');
        setLoading(false);
        return;
      }

      // Fetch day (program_day)
      const { data: dayData } = await supabase
        .from('days')
        .select('*')
        .eq('id', assignmentDay.program_day_id)
        .single();
      setDay(dayData);

      // Fetch exercise
      const { data: exerciseData, error: exerciseError } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .single();
      if (exerciseError) {
        setError('Exercise not found');
        setLoading(false);
        return;
      }
      setExercise(exerciseData);

      // Fetch all exercises in this day for navigation
      const { data: allExercisesData } = await supabase
        .from('exercises')
        .select('*')
        .eq('day_id', assignmentDay.program_day_id)
        .order('exercise_number');
      setAllExercises(allExercisesData || []);

      // Fetch progress for this assignment_day and exercise
      let progressData = null;
      const { data: progressRow } = await supabase
        .from('assignment_exercise_progress')
        .select('*')
        .eq('assignment_day_id', assignmentDayId)
        .eq('exercise_id', exerciseId)
        .maybeSingle();
      progressData = progressRow;
      setProgress(progressData);
      setLoading(false);
    };
    fetchExercise();
  }, [exerciseId, assignmentDayId, user]);

  const toggleDone = async () => {
    if (!user || !exercise || !assignmentDayId) return;

    // Toggle progress for this assignment_day and exercise

    // Actually, usually we just want to mark done or not done. 
    // If "done" is true, upsert. If "done" is false, we can delete or update 'done' to false.
    // The current UI button says "Done!" or "Mark as Done".
    
    if (progress) {
       // Toggle to off -> Delete row or set done=false
       // User prompt said "Insert/upsert policy is missing... Always upsert with correct onConflict".
       // If we want to "undo", we can delete.
       await supabase
        .from('assignment_exercise_progress')
        .delete()
        .eq('id', progress.id);
       setProgress(null);
    } else {
       // Toggle to on -> Upsert
       const { data, error } = await supabase
        .from('assignment_exercise_progress')
        .upsert({
          assignment_day_id: assignmentDayId,
          exercise_id: exercise.id,
          user_id: user.id, // Explicitly send user_id for RLS
          done: true,
          done_at: new Date().toISOString(),
        }, { onConflict: 'assignment_day_id,exercise_id' })
        .select()
        .single();
        
       if (error) {
           console.error('Error marking done:', error);
           setError('Failed to save progress');
       } else {
           setProgress(data);
       }
    }

    // After toggling, check if all exercises for this assignment_day are done
    const { data: exercises } = await supabase
      .from('exercises')
      .select('id')
      .eq('day_id', day?.id);
    if (!exercises) return;
    const exerciseIds = exercises.map((e: any) => e.id);
    const { data: allProgress } = await supabase
      .from('assignment_exercise_progress')
      .select('exercise_id')
      .eq('assignment_day_id', assignmentDayId);
    const doneIds = new Set((allProgress || []).map((p: any) => p.exercise_id));
    const allDone = exerciseIds.length > 0 && exerciseIds.every((id: string) => doneIds.has(id));
    await supabase
      .from('assignment_days')
      .update({ status: allDone ? 'done' : 'pending' })
      .eq('id', assignmentDayId);
  };


  const navigateToExercise = (direction: 'prev' | 'next') => {
    if (!exercise) return;
    const currentIndex = allExercises.findIndex(e => e.id === exercise.id);
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < allExercises.length) {
      navigate(`/programs/${programId}/days/${assignmentDayId}/exercises/${allExercises[newIndex].id}`);
    }
  };

  const currentIndex = exercise ? allExercises.findIndex(e => e.id === exercise.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allExercises.length - 1;

  if (loading) {
    return (
      <Layout title="Loading..." showBack>
        <LoadingSpinner />
      </Layout>
    );
  }

  if (error || !exercise) {
    return (
      <Layout title="Error" showBack>
        <div className="p-4 text-center">
          <p className="text-red-400">{error || 'Exercise not found'}</p>
        </div>
      </Layout>
    );
  }

  const embedUrl = exercise.video_url ? getDriveEmbedUrl(exercise.video_url) : null;
  const openUrl = exercise.video_url ? getDriveOpenUrl(exercise.video_url) : null;

  return (
    <Layout title={exercise.name} showBack>
      <div className="pb-32">
        {/* Video section */}
        {embedUrl ? (
          <div className="aspect-video bg-black">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title={exercise.name}
            />
          </div>
        ) : (
          <div className="aspect-video bg-slate-800 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <svg className="w-16 h-16 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p>No video available</p>
            </div>
          </div>
        )}

        {/* Open in Drive button */}
        {openUrl && (
          <div className="p-4 border-b border-slate-700">
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zm-.33 1h9.24l5.4 10h-4.6l-2.48-4-2.48 4H7.86l-2.48-4-2.48 4h-4.6l5.4-10zm4.62 5L9.52 14H5.44L8 9.5zm4 0L18.56 14h-4.08L12 9.5z"/>
              </svg>
              Open in Google Drive
            </a>
          </div>
        )}

        {/* Exercise details */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-blue-400 bg-blue-500/20 px-2 py-1 rounded">
              Exercise #{exercise.exercise_number}
            </span>
            {day && (
              <span className="text-sm text-slate-500">
                Day {day.day_number}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">{exercise.name}</h1>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{exercise.sets}</div>
              <div className="text-sm text-slate-500">Sets</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{exercise.reps}</div>
              <div className="text-sm text-slate-500">Reps</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{exercise.rest_seconds || '-'}</div>
              <div className="text-sm text-slate-500">Rest (s)</div>
            </div>
          </div>

          {/* Notes */}
          {exercise.notes && (
            <div className="bg-slate-800 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Notes</h3>
              <p className="text-white whitespace-pre-wrap">{exercise.notes}</p>
            </div>
          )}

          {/* Completion status */}
          {progress && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-green-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Completed</span>
              </div>
              <p className="text-sm text-green-400/70 mt-1">
                {new Date(progress.done_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 safe-area-bottom">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {/* Prev button */}
          <button
            onClick={() => navigateToExercise('prev')}
            disabled={!hasPrev}
            className="p-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Mark done button */}
          <button
            onClick={toggleDone}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
              progress
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {progress ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Done!
              </>
            ) : (
              'Mark as Done'
            )}
          </button>

          {/* Next button */}
          <button
            onClick={() => navigateToExercise('next')}
            disabled={!hasNext}
            className="p-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </Layout>
  );
}
