import { useEffect, useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { getAssignmentProgress, getNextWorkoutDay, markMissedAssignmentDays } from '../lib/supabase';

export default function WorkoutHome() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workoutDay, setWorkoutDay] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      try {
        await markMissedAssignmentDays(user.id);
        const day = await getNextWorkoutDay(user.id);
        setWorkoutDay(day);
        if (day) {
          const prog = await getAssignmentProgress(day.assignment_id);
          setProgress(prog);
        }
        setError('');
      } catch (err: any) {
        setError(err.message || 'Error loading workout');
      }
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-4 text-red-500">{error}</div>;
  if (!workoutDay) return <div className="p-4">No scheduled workout found.</div>;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-2">Today's Workout</h2>
      <div className="mb-4">
        <div className="text-slate-400">Scheduled Date: {workoutDay.scheduled_date}</div>
        <div className="text-slate-400">Repeat: {workoutDay.repeat_no} / Day: {workoutDay.day_index}</div>
        {workoutDay.status === 'missed' && (
          <div className="bg-red-100 text-red-700 p-2 rounded mt-2">Missed workout from {workoutDay.scheduled_date}. This affects your overall progress.</div>
        )}
      </div>
      {/* Progress Circles */}
      {progress && (
        <div className="flex gap-8 mb-6">
          <ProgressCircle label="Cycle Progress" done={progress.cycle.done} missed={progress.cycle.missed} pending={progress.cycle.pending} total={progress.cycle.total} />
          <ProgressCircle label="Overall Progress" done={progress.overall.completedCycles} total={progress.overall.maxCycles} />
        </div>
      )}
      {/* TODO: List exercises for this day, with checkboxes */}
    </div>
  );
}

type ProgressCircleProps = {
  label: string;
  done: number;
  missed?: number;
  pending?: number;
  total: number;
};

function ProgressCircle({ label, done, missed = 0, pending = 0, total }: ProgressCircleProps) {
  const percentDone = total ? (done / total) * 100 : 0;
  const percentMissed = total ? (missed / total) * 100 : 0;
  const percentPending = total ? (pending / total) * 100 : 0;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24 mb-2">
        {/* Simple SVG circle progress */}
        <svg width="96" height="96" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="#f3f4f6" />
          {/* Done */}
          <circle cx="18" cy="18" r="16" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray={`${percentDone} ${100 - percentDone}`} strokeDashoffset="25" />
          {/* Missed */}
          {missed > 0 && <circle cx="18" cy="18" r="16" fill="none" stroke="#ef4444" strokeWidth="4" strokeDasharray={`${percentMissed} ${100 - percentMissed}`} strokeDashoffset={25 + percentDone} />}
          {/* Pending */}
          {pending > 0 && <circle cx="18" cy="18" r="16" fill="none" stroke="#a1a1aa" strokeWidth="4" strokeDasharray={`${percentPending} ${100 - percentPending}`} strokeDashoffset={25 + percentDone + percentMissed} />}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">
          {done}/{total}
        </div>
      </div>
      <div className="text-slate-500 text-sm">{label}</div>
    </div>
  );
}
