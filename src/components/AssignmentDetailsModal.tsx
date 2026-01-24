import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AssignmentDetailsModalProps {
  assignment: any;
  onClose: () => void;
}

export default function AssignmentDetailsModal({ assignment, onClose }: AssignmentDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    days: any[];
    daysMap: Record<string, any>;
    stats: any;
  } | null>(null);
  
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<any[]>([]);

  useEffect(() => {
    fetchDetails();
  }, [assignment.id]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const { data: assignmentDaysData } = await supabase
        .from('assignment_days')
        .select('id,scheduled_date,repeat_no,day_index,status,program_day_id')
        .eq('assignment_id', assignment.id)
        .order('scheduled_date', { ascending: true });

      const assignmentDays = (assignmentDaysData || []) as any[];
      const programDayIds = Array.from(new Set(assignmentDays.map(d => d.program_day_id).filter(Boolean)));

      let daysMap: Record<string, any> = {};
      if (programDayIds.length > 0) {
        const { data: daysData } = await supabase
          .from('days')
          .select('id,title,day_number')
          .in('id', programDayIds as string[]);
        for (const d of daysData || []) daysMap[d.id] = d;
      }

      // Compute stats
      const maxCycles = assignment.max_cycles || assignment.target_cycles || 1;
      const byRepeat: Record<number, any[]> = {};
      for (const d of assignmentDays) {
        const r = d.repeat_no || 1;
        byRepeat[r] = byRepeat[r] || [];
        byRepeat[r].push(d);
      }

      let completedRepeats = 0;
      for (let r = 1; r <= maxCycles; r++) {
        const repeatDays = byRepeat[r] || [];
        if (repeatDays.length > 0 && repeatDays.every((x: any) => x.status === 'done')) completedRepeats++;
      }

      // currentRepeatNo
      let currentRepeatNo = maxCycles;
      for (let r = 1; r <= maxCycles; r++) {
        const repeatDays = byRepeat[r] || [];
        if (repeatDays.length === 0) {
          currentRepeatNo = r;
          break;
        }
        if (!repeatDays.every((x: any) => x.status === 'done')) {
          currentRepeatNo = r;
          break;
        }
      }

      const currentRepeatDays = byRepeat[currentRepeatNo] || [];
      const currentDone = currentRepeatDays.filter((d:any)=>d.status==='done').length;
      const currentMissed = currentRepeatDays.filter((d:any)=>d.status==='missed').length;
      const currentTotal = currentRepeatDays.length;

      const stats = {
        maxCycles,
        completedRepeats,
        currentRepeatNo,
        currentDone,
        currentMissed,
        currentTotal,
        byRepeat,
      };

      setData({ days: assignmentDays, daysMap, stats });
      setLoading(false);
    } catch (err) {
      console.error('Error loading details:', err);
      setLoading(false);
    }
  };

  const fetchExercises = async (assignmentDayId: string, programDayId: string) => {
    setSelectedDayId(assignmentDayId);
    setExercises([]);
    
    const { data: exercisesData } = await supabase
      .from('exercises')
      .select('*')
      .eq('day_id', programDayId)
      .order('exercise_number');

    const { data: progressData } = await supabase
      .from('assignment_exercise_progress')
      .select('*')
      .eq('assignment_day_id', assignmentDayId);

    const progressMap: Record<string, any> = {};
    for (const p of (progressData || [])) progressMap[p.exercise_id] = p;

    const merged = (exercisesData || []).map((ex: any) => ({ ...ex, progress: progressMap[ex.id] || null }));
    setExercises(merged);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 rounded-2xl p-6 text-white">Loading details...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10">
            <div>
              <h3 className="text-xl font-bold text-white">Assignment Details</h3>
              <p className="text-slate-400 text-sm">
                Started: {new Date(assignment.start_date || assignment.created_at).toLocaleDateString()}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">✕ Close</button>
          </div>

          <div className="p-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 p-3 rounded-xl">
                <div className="text-slate-400 text-xs uppercase mb-1">Status</div>
                <div className="text-white font-bold">{assignment.state}</div>
              </div>
              <div className="bg-slate-800 p-3 rounded-xl">
                <div className="text-slate-400 text-xs uppercase mb-1">Cycles Completed</div>
                <div className="text-white font-bold">{data.stats.completedRepeats} / {data.stats.maxCycles}</div>
              </div>
              <div className="bg-slate-800 p-3 rounded-xl">
                <div className="text-slate-400 text-xs uppercase mb-1">Current Cycle</div>
                <div className="text-white font-bold">#{data.stats.currentRepeatNo}</div>
              </div>
               <div className="bg-slate-800 p-3 rounded-xl">
                <div className="text-slate-400 text-xs uppercase mb-1">Current Progress</div>
                <div className="text-white font-bold">{data.stats.currentDone} / {data.stats.currentTotal} days</div>
              </div>
            </div>

            <div className="bg-slate-800 rounded p-4">
              <h4 className="text-sm text-slate-300 mb-2">Repeats & Days</h4>
              <div className="space-y-3">
                {Object.keys(data.stats.byRepeat || {}).sort((a,b)=>Number(a)-Number(b)).map((rKey: any) => (
                  <div key={rKey} className="bg-slate-700/40 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-slate-300">Repeat {rKey}</div>
                      <div className="text-xs text-slate-400">{(data.stats.byRepeat?.[rKey] || []).length} days</div>
                    </div>
                    <div className="grid gap-2">
                      {(data.stats.byRepeat?.[rKey] || []).map((d: any) => (
                        <div key={d.id} className="flex items-center justify-between bg-slate-800 rounded p-2">
                          <div>
                            <div className="text-white text-sm">{d.scheduled_date ? new Date(d.scheduled_date).toLocaleDateString() : '-'}</div>
                            <div className="text-slate-400 text-xs">Day index: {d.day_index || '-' } • {data.daysMap?.[d.program_day_id]?.title || 'Template day'}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button onClick={() => fetchExercises(d.id, d.program_day_id)} className={`text-sm px-2 py-1 rounded transition-colors ${selectedDayId === d.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
                                {selectedDayId === d.id ? 'Viewing' : 'View Exercises'}
                            </button>
                            <span className={`px-3 py-1 rounded text-xs ${d.status === 'done' ? 'bg-green-600 text-white' : d.status === 'missed' ? 'bg-red-600 text-white' : 'bg-slate-600 text-slate-200'}`}>{d.status || 'pending'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedDayId && (
              <div className="bg-slate-800 rounded p-4 animate-fadeIn">
                <h4 className="text-sm text-slate-300 mb-2">Exercises for selected day</h4>
                {exercises.length > 0 ? (
                  <div className="space-y-2">
                    {exercises.map((ex: any) => (
                      <div key={ex.id} className="flex items-center justify-between bg-slate-700/50 rounded p-2">
                        <div>
                          <div className="text-white">#{ex.exercise_number} {ex.name}</div>
                          <div className="text-slate-400 text-xs">{ex.sets}×{ex.reps}</div>
                        </div>
                        <div className="text-sm">
                          {ex.progress?.done ? <span className="text-green-400">Done</span> : <span className="text-slate-500">Pending</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400">No exercises found.</div>
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
