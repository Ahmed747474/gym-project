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
  // State for days with completion info
  const [days, setDays] = useState<DayWithCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignment, setAssignment] = useState<any>(null);
  // assignmentDaysWithExercises: [{ assignment_day, template_day, exercises, progress: [{exercise, done}] }]
  const [repeatGroups, setRepeatGroups] = useState<any[]>([]);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [targetCycles, setTargetCycles] = useState(0);
  const [templateCache, setTemplateCache] = useState<Record<string, { programDay?: any; exercises?: any[] }>>({});
  // progress is not used, remove it
  const [statusMsg, setStatusMsg] = useState<string>('');

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

      // Don't fetch program template days here — we'll derive days from the
      // generated `assignment_days` for the active assignment below. Only
      // set the program metadata.
      // (Loading state will be resolved after assignment/day processing.)
    };

    const fetchAssignmentAndDays = async () => {
      if (!programId || !user) return;
      // Fetch active assignment
      const { data: assignmentData } = await supabase
        .from('user_program_assignments')
        .select('*')
        .eq('user_id', user.id)
        .eq('program_id', programId)
        .eq('state', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setAssignment(assignmentData);
      if (!assignmentData) {
        setLoading(false);
        setStatusMsg('No active assignment for this program.');
        return;
      }
      setTargetCycles(assignmentData.target_cycles || 0);

      // Fetch all assignment_days for this assignment, ordered by scheduled_date
      const { data: assignmentDays } = await supabase
        .from('assignment_days')
        .select('*')
        .eq('assignment_id', assignmentData.id)
        .order('scheduled_date', { ascending: true });
      if (!assignmentDays || assignmentDays.length === 0) {
        setRepeatGroups([]);
        setStatusMsg('Assignment days not generated yet.');
        setCompletedCycles(0);
        return;
      }

      // Determine template program_day_ids referenced by the generated assignment_days
      const programDayIds = Array.from(new Set((assignmentDays || []).map((ad: any) => ad.program_day_id).filter(Boolean)));
      // Fetch template days referenced by the assignment days
      let allProgramDays: any[] = [];
      if (programDayIds.length > 0) {
        const { data: pd } = await supabase
          .from('days')
          .select('*')
          .in('id', programDayIds);
        allProgramDays = pd || [];
      }
      const programDayMap = new Map((allProgramDays || []).map((d: any) => [d.id, d]));

      // Fetch all exercises for the referenced program days
      let allExercises: any[] = [];
      if (programDayIds.length > 0) {
        const { data: exs } = await supabase
          .from('exercises')
          .select('*')
          .in('day_id', programDayIds);
        allExercises = exs || [];
      }
      // Map day_id to exercises
      const exercisesByDay = new Map();
      for (const ex of allExercises) {
        if (!exercisesByDay.has(ex.day_id)) exercisesByDay.set(ex.day_id, []);
        exercisesByDay.get(ex.day_id).push(ex);
      }

      // Fetch all assignment_exercise_progress for these assignment_days in one query
      const assignmentDayIds = assignmentDays.map((ad: any) => ad.id);
      let allProgress: any[] = [];
      if (assignmentDayIds.length > 0) {
        const { data: progress } = await supabase
          .from('assignment_exercise_progress')
          .select('*')
          .in('assignment_day_id', assignmentDayIds);
        allProgress = progress || [];
      }
      const progressMap = new Map(
        (allProgress || []).map((p: any) => [`${p.assignment_day_id}_${p.exercise_id}`, p])
      );

      // Build `days` (template days list) for JumpToInput based on template days referenced
      const daysWithInfo: DayWithCompletion[] = (allProgramDays || []).map((d: any) => {
        const exercises = (allExercises || []).filter((ex: any) => ex.day_id === d.id) || [];
        const exerciseCount = exercises.length;
        return { ...d, exerciseCount, completion: 0 } as DayWithCompletion;
      });
      setDays(daysWithInfo);

      // Group assignment_days by repeat_no
      const repeatMap = new Map();
      for (const ad of assignmentDays) {
        if (!repeatMap.has(ad.repeat_no)) repeatMap.set(ad.repeat_no, []);
        repeatMap.get(ad.repeat_no).push(ad);
      }

      // Compute completed cycles: a cycle is complete if all assignment_days in that repeat_no have status 'done'
      let completed = 0;
      for (let i = 1; i <= (assignmentData.target_cycles || 0); i++) {
        const daysForRepeat = repeatMap.get(i) || [];
        if (daysForRepeat.length > 0 && daysForRepeat.every((d: any) => d.status === 'done')) {
          completed++;
        }
      }
      setCompletedCycles(completed);

      // For each repeat, build group with days and exercises (all in-memory)
      const repeatGroupsArr = [];
      for (let i = 1; i <= (assignmentData.target_cycles || 0); i++) {
        const daysArr = repeatMap.get(i) || [];
        const group = daysArr.map((ad: any) => {
          if (!ad.program_day_id) {
            return { assignment_day: ad, program_day: null, exercises: [] };
          }
          const programDay = programDayMap.get(ad.program_day_id) || null;
          const exercises = exercisesByDay.get(ad.program_day_id) || [];
          const exercisesWithProgress = (exercises || []).map((ex: any) => ({
            ...ex,
            progress: progressMap.get(`${ad.id}_${ex.id}`) || null,
          }));
          return {
            assignment_day: ad,
            program_day: programDay,
            exercises: exercisesWithProgress,
          };
        });
        // Do not filter out days here — include all scheduled days so exercises
        // or the lack thereof are visible for debugging and UX.
        const filtered = group; // keep empty exercises arrays for visibility
        repeatGroupsArr.push({ repeat_no: i, days: filtered });
      }
      console.log('ProgramDetails: repeatGroupsArr=', repeatGroupsArr);
      setRepeatGroups(repeatGroupsArr);
      setLoading(false);
    };
    fetchProgramDetails();
    fetchAssignmentAndDays();
  }, [programId, user]);

  async function loadTemplateForAssignmentDay(assignmentDayId: string, programDayId: string) {
    if (!programDayId) return;
    try {
      const { data: pd } = await supabase.from('days').select('*').eq('id', programDayId).maybeSingle();
      const { data: exs } = await supabase.from('exercises').select('*').eq('day_id', programDayId);
      setTemplateCache(prev => ({ ...prev, [assignmentDayId]: { programDay: pd || null, exercises: exs || [] } }));
      console.log('Loaded template for', assignmentDayId, pd, exs);
    } catch (e) {
      console.error('Error loading template for', programDayId, e);
    }
  }

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
        {/* Header: Title + Assigned date range + Progress */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">{program.title}</h1>
          {assignment && (
            <div className="text-slate-300 text-sm mb-2">
              {assignment.start_date} &rarr; {assignment.end_date}
            </div>
          )}
          {targetCycles > 0 && (
            <div className="text-lg font-semibold text-blue-400 mt-2">
              Progress: {completedCycles}/{targetCycles} repeats
            </div>
          )}
        </div>
        {/* Status message for edge cases */}
        {statusMsg && (
          <div className="mb-4 p-2 bg-yellow-900 text-yellow-300 rounded">{statusMsg}</div>
        )}
        {/* Progress Circles: responsive layout */}
        {/* Progress circles removed: progress variable is not defined */}

        {days.length > 0 && (
          <div className="mb-6">
            <JumpToInput
              label="Jump to Day"
              max={Math.max(...days.map(d => d.day_number))}
              onJump={handleJumpToDay}
            />
          </div>
        )}

        {repeatGroups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No scheduled days for this assignment yet.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {repeatGroups.map((group) => (
              <div key={group.repeat_no}>
                <div className="flex items-center gap-2 my-4">
                  <div className="flex-1 border-t border-slate-700" />
                  <div className="text-slate-400 text-xs font-bold px-2">Repeat #{group.repeat_no}</div>
                  <div className="flex-1 border-t border-slate-700" />
                </div>
                <div className="grid gap-3">
                  {group.days.map((dayItem: { assignment_day: any, program_day: any, exercises: any[] }) => {
                    const { assignment_day, program_day, exercises } = dayItem;
                    const cached = templateCache[assignment_day.id] || {};
                    const displayProgramDay = program_day || cached.programDay || null;
                    const displayExercises = (cached.exercises && cached.exercises.length > 0) ? cached.exercises : (exercises || []);
                    return (
                      <div
                        key={assignment_day.id}
                        className="block bg-slate-800 rounded-xl p-4 mb-2 animate-slideUp cursor-pointer hover:bg-slate-700 transition-colors"
                        onClick={() => navigate(`/programs/${programId}/days/${assignment_day.id}`)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center font-bold">
                              {displayProgramDay ? displayProgramDay.day_number : '?'}
                            </div>
                            <div>
                              <h3 className="font-semibold text-white">{displayProgramDay ? displayProgramDay.title : 'Day'}</h3>
                              <p className="text-sm text-slate-500">{assignment_day.scheduled_date}</p>
                            </div>
                          </div>
                        </div>

                        {!displayProgramDay && (
                          <div className="text-xs text-yellow-300 mb-2">program_day_id: {String(assignment_day.program_day_id)}</div>
                        )}
                        {!displayProgramDay && !cached.programDay && (
                          <div className="mb-2">
                            <button
                              className="px-2 py-1 text-xs bg-blue-600 rounded text-white"
                              onClick={e => { e.stopPropagation(); loadTemplateForAssignmentDay(assignment_day.id, assignment_day.program_day_id); }}
                            >
                              Load template
                            </button>
                          </div>
                        )}

                        <div className="mt-3 space-y-2">
                          {displayExercises.length === 0 && (
                            <div className="text-slate-500 text-sm">No exercises found for this day.</div>
                          )}
                          {displayExercises.map((ex: any) => (
                            <div key={ex.id} className="flex items-center gap-3"
                              onClick={e => { e.stopPropagation(); navigate(`/programs/${programId}/days/${assignment_day.id}/exercises/${ex.id}`); }}
                              style={{ cursor: 'pointer' }}
                            >
                              <input
                                type="checkbox"
                                checked={!!ex.progress && ex.progress.done}
                                readOnly
                                className="form-checkbox h-5 w-5 text-green-500 bg-slate-700 border-slate-600 rounded"
                              />
                              <span className="text-white">{ex.name}</span>
                              <span className="text-slate-500 text-xs ml-2">{ex.sets}×{ex.reps}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

