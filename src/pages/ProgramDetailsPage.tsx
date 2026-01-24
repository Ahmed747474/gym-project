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

      // Fetch all assignment_days for this assignment, with program days and exercises nested!
      // This matches the user request for (days + exercises) in one query, but anchored on assignment_days
      const { data: assignmentDays, error: daysError } = await supabase
        .from('assignment_days')
        .select(`
          *,
          program_day:days (
            id, day_number, title, description,
            exercises (
              id, exercise_number, name, sets, reps, rest_seconds, notes, video_url
            )
          ),
          progress:assignment_exercise_progress(
             exercise_id, done
          )
        `)
        .eq('assignment_id', assignmentData.id)
        .order('scheduled_date', { ascending: true });

      if (daysError) {
          console.error('Error fetching days:', daysError);
          setLoading(false);
          return;
      }

      if (!assignmentDays || assignmentDays.length === 0) {
        setRepeatGroups([]);
        setStatusMsg('Assignment days not generated yet.');
        setCompletedCycles(0);
        return;
      }

      // Pre-process Data
      // Map exercises from the nested program_day, and attach progress
      const processedGroups: any[] = [];
      
      // Group by repeat_no
      const repeatMap = new Map();
      for (const ad of assignmentDays) {
        if (!repeatMap.has(ad.repeat_no)) repeatMap.set(ad.repeat_no, []);
        
        // Prepare exercises with progress
        // ad.program_day might be an array or object depending on One-to-One vs Many
        // It's a foreign key, so it should be an object (single).
        // ad.progress is array of progress rows for this day
        const pDay = Array.isArray(ad.program_day) ? ad.program_day[0] : ad.program_day;
        const rawExercises = pDay?.exercises || [];
        
        // Sort exercises
        rawExercises.sort((a: any, b: any) => a.exercise_number - b.exercise_number);

        const exercisesWithProgress = rawExercises.map((ex: any) => {
            const prog = (ad.progress || []).find((p: any) => p.exercise_id === ex.id);
            return {
                ...ex,
                progress: prog || null
            };
        });

        const dayObj = {
            assignment_day: ad,
            program_day: pDay,
            exercises: exercisesWithProgress
        };
        repeatMap.get(ad.repeat_no).push(dayObj);
      }

      // Build groups array
      for (let i = 1; i <= (assignmentData.target_cycles || 0); i++) {
         const daysArr = repeatMap.get(i) || [];
         processedGroups.push({ repeat_no: i, days: daysArr });
      }

      // Compute completed cycles
      let completed = 0;
      for (const group of processedGroups) {
          if (group.days.length > 0 && group.days.every((d: any) => d.assignment_day.status === 'done')) {
              completed++;
          }
      }
      setCompletedCycles(completed);
      setRepeatGroups(processedGroups);
      
      // Build days list for JumpTo (unique template days)
      const uniqueTemplateDays = new Map();
      for (const ad of assignmentDays) {
          // extract pDay again
          const pDay = Array.isArray(ad.program_day) ? ad.program_day[0] : ad.program_day;
          if (pDay && !uniqueTemplateDays.has(pDay.id)) {
              uniqueTemplateDays.set(pDay.id, {
                  ...pDay,
                  exerciseCount: (pDay.exercises || []).length,
                  completion: 0
              });
          }
      }
      setDays(Array.from(uniqueTemplateDays.values()).sort((a: any, b: any) => a.day_number - b.day_number));
      
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

