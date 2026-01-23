// --- Repeat Progress UI Components ---
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
// Removed duplicate useState import
import { useAuth } from '../contexts/AuthContext';
import type { Program } from '../lib/database.types';
import { supabase } from '../lib/supabase';
// Completion logic helpers


async function processProgramCompletion(assignment_id: string) {
  // Fetch assignment row
  const { data: assignment } = await supabase
    .from('user_program_assignments')
    .select('max_cycles, target_cycles, state, user_id, queued_at')
    .eq('id', assignment_id)
    .maybeSingle();
  if (!assignment) return;
  const maxCycles = assignment.target_cycles || assignment.max_cycles;
  // Fetch all assignment_days for assignment_id
  const { data: allDays } = await supabase
    .from('assignment_days')
    .select('repeat_no, status')
    .eq('assignment_id', assignment_id);
  // Compute completedRepeats
  let completedRepeats = 0;
  for (let r = 1; r <= maxCycles; r++) {
    const repeatDays = allDays?.filter(d => d.repeat_no === r) || [];
    if (repeatDays.length > 0 && repeatDays.every(d => d.status === 'done')) completedRepeats++;
  }
  // If completedRepeats == maxCycles, archive assignment and activate next queued
  if (completedRepeats === maxCycles && assignment.state !== 'archived') {
    await supabase
      .from('user_program_assignments')
      .update({ state: 'archived', archived_at: new Date().toISOString() })
      .eq('id', assignment_id);
    // Activate next queued assignment for user
    const { data: nextQueued } = await supabase
      .from('user_program_assignments')
      .select('id')
      .eq('user_id', assignment.user_id)
      .eq('state', 'queued')
      .order('queued_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextQueued) {
      await supabase
        .from('user_program_assignments')
        .update({ state: 'active', activated_at: new Date().toISOString(), archived_at: null })
        .eq('id', nextQueued.id);
      // Optionally regenerate assignment_days if needed
      // (Assume schedule is generated on activation elsewhere)
    }
  }
}

// Lightweight queue processor for startup
async function processQueueOnStartup(userId: string) {
  // Archive ended programs by date (if needed)
  // For each active assignment, check if all repeats are done and archive if needed
  const { data: activeAssignments } = await supabase
    .from('user_program_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('state', 'active');
  for (const assignment of activeAssignments || []) {
    await processProgramCompletion(assignment.id);
  }
}

function DualRingCircle({ size = 56, strokeWidth = 6, labelText, doneRatio, redoRatio }: { size?: number; strokeWidth?: number; labelText: string; doneRatio: number; redoRatio: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const doneLength = circumference * doneRatio;
  const redoLength = circumference * redoRatio;
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {/* Track */}
      <circle cx={size/2} cy={size/2} r={radius} fill="#222" stroke="#334155" strokeWidth={strokeWidth} />
      {/* Done ring */}
      <circle
        cx={size/2}
        cy={size/2}
        r={radius}
        fill="none"
        stroke="#22c55e"
        strokeWidth={strokeWidth}
        strokeDasharray={`${doneLength} ${circumference - doneLength}`}
        strokeDashoffset={circumference * 0.25}
        style={{ transition: 'stroke-dasharray 0.3s' }}
      />
      {/* Redo ring (on top, only if missed) */}
      {redoRatio > 0 && (
        <circle
          cx={size/2}
          cy={size/2}
          r={radius + strokeWidth/2}
          fill="none"
          stroke="#ef4444"
          strokeWidth={strokeWidth/2}
          strokeDasharray={`${redoLength} ${circumference - redoLength}`}
          strokeDashoffset={circumference * 0.25}
          style={{ transition: 'stroke-dasharray 0.3s' }}
        />
      )}
      {/* Centered label */}
      <text x="50%" y="54%" textAnchor="middle" fontSize={size/3.2} fill="#fff" fontWeight="bold" dominantBaseline="middle">{labelText}</text>
    </svg>
  );
}

function NumberCircle({ labelText, subLabel }: { labelText: string; subLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-lg font-bold text-white border-2 border-slate-600">{labelText}</div>
      {subLabel && <div className="text-xs text-slate-400 mt-1">{subLabel}</div>}
    </div>
  );
}

function RepeatBadgesRow({ totalRepeats, completedRepeats }: { totalRepeats: number; completedRepeats: number; currentRepeatNo: number }) {
  const badges = [];
  for (let i = 1; i <= totalRepeats; i++) {
    if (i <= completedRepeats) {
      badges.push(
        <span key={i} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white mx-0.5 border-2 border-green-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </span>
      );
    } else if (i === completedRepeats + 1) {
      badges.push(
        <span key={i} className="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-blue-400 text-blue-400 mx-0.5 bg-slate-900">
          <span className="font-bold">{i}</span>
        </span>
      );
    } else {
      badges.push(
        <span key={i} className="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-slate-600 text-slate-500 mx-0.5 bg-slate-800" />
      );
    }
  }
  return <div className="flex flex-row items-center mt-2">{badges}</div>;
}


export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, session } = useAuth();
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [progresses, setProgresses] = useState<Record<string, any>>({});
  const [queuedAssignments, setQueuedAssignments] = useState<any[]>([]);
  const [historyAssignments, setHistoryAssignments] = useState<any[]>([]);
  const [hasActiveAssignment, setHasActiveAssignment] = useState(false);
  const [reactivateModal, setReactivateModal] = useState<{ open: boolean; assignment?: any; error?: string } | null>(null);

  // Reactivate logic: check for active assignment, show popup, update state
  useEffect(() => {
    if (!reactivateModal?.open || !user || !reactivateModal.assignment) return;
    let cancelled = false;
    (async () => {
      // Check for active assignment
      const { data: active } = await supabase
        .from('user_program_assignments')
        .select('id')
        .eq('user_id', user.id)
        .eq('state', 'active')
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (active) {
        // Show modal: already active
        setReactivateModal({
          open: true,
          assignment: reactivateModal.assignment,
          error: 'You already have an active program. Finish/archive it first to reactivate this one.'
        });
      } else {
        // Reactivate assignment
        await supabase
          .from('user_program_assignments')
          .update({ state: 'active', activated_at: new Date().toISOString(), archived_at: null })
          .eq('id', reactivateModal.assignment.id);
        setReactivateModal(null);
        // Optionally navigate to active program view (could use react-router)
        window.location.reload();
      }
    })();
    return () => { cancelled = true; };
  }, [reactivateModal, user]);

  useEffect(() => {
    if (authLoading || !user || !session) {
      setLoading(false);
      return;
    }
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Run queue processor on startup
        await processQueueOnStartup(user.id);
        // ...existing code...
        // Fetch all programs
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const accessToken = session.access_token;
        const response = await fetch(`${supabaseUrl}/rest/v1/programs?select=*`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const programsData = await response.json();
        setPrograms(programsData || []);

        // Fetch history programs for user
        const { data: historyAssignments } = await supabase
          .from('user_program_assignments')
          .select('*, program:programs(*)')
          .eq('user_id', user.id)
          .in('state', ['archived', 'completed'])
          .order('archived_at', { ascending: false });
        setHistoryAssignments(historyAssignments || []);

        // Fetch all assignments for user (for active/queued)
        const { data: allAssignments } = await supabase
          .from('user_program_assignments')
          .select('*')
          .eq('user_id', user.id);
        // Find active, queued assignments
        const active = allAssignments?.find(a => a.state === 'active');
        setHasActiveAssignment(!!active);
        setQueuedAssignments((allAssignments || []).filter(a => a.state === 'queued'));

        // Fetch all assignment_days for user's assignments in one request
        const assignmentIds = (allAssignments || []).map(a => a.id);
        let allDays: any[] = [];
        if (assignmentIds.length > 0) {
          const { data: daysData } = await supabase
            .from('assignment_days')
            .select('*')
            .in('assignment_id', assignmentIds);
          allDays = daysData || [];
        }

        // Compute per-program assignment and progress
        const result: Record<string, any> = {};
        const progressResult: Record<string, any> = {};
        for (const program of programsData || []) {
          const assignment = (allAssignments || []).find(a => a.program_id === program.id && a.state === 'active');
          result[program.id] = assignment;
          if (assignment) {
            // Compute progress
            const today = dayjs().format('YYYY-MM-DD');
            const days = allDays.filter(d => d.assignment_id === assignment.id);
            const currentDay = days.find(
              d => (d.scheduled_date <= today && ['pending', 'missed'].includes(d.status))
            );
            const currentRepeatNo = currentDay ? currentDay.repeat_no : 1;
            const repeatDays = days.filter(d => d.repeat_no === currentRepeatNo);
            const repeatDayStatuses = repeatDays.map(d => ({ status: d.status }));
            // Repeat progress
            const maxCycles = assignment.target_cycles;
            const programDaysCount = assignment.program_days_count;
            let completedCycles = 0;
            for (let r = 1; r <= maxCycles; r++) {
              const repeatDaysR = days.filter(d => d.repeat_no === r);
              if (repeatDaysR.length === programDaysCount && repeatDaysR.every(d => d.status === 'done')) completedCycles++;
            }
            progressResult[program.id] = {
              cycle: { days: repeatDayStatuses, currentRepeatNo },
              overall: { completedCycles, maxCycles },
              assignment,
            };
          }
        }
        setAssignments(result);
        setProgresses(progressResult);
      } catch (err: any) {
        // Optionally handle error
      }
      setLoading(false);
    };
    fetchAll();
  }, [user, authLoading, session]);

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
        {/* Active Program View */}
        <h2 className="text-xl font-bold text-white mb-4">Active Program</h2>
        {assignments && Object.values(assignments).length === 0 && (
          <div className="text-slate-400 mb-6">No active program</div>
        )}
        <div className="grid gap-4">
          {Object.values(assignments)
            .filter(Boolean)
            .map((assignment: any) => {
              const progress = progresses[assignment.program_id];
              // --- Compute repeat progress data ---
              const totalRepeats = assignment.target_cycles || assignment.max_cycles || 1;
              const programDaysCount = assignment.program_days_count || 1;
              // Find current repeat info
              let currentRepeatNo = progress?.cycle?.currentRepeatNo || 1;
              let completedRepeats = progress?.overall?.completedCycles || 0;
              // Fallback: if all repeats done, current is last
              if (completedRepeats >= totalRepeats) currentRepeatNo = totalRepeats;
              // Find assignment_days for current repeat
              const allAssignmentDays = progress?.assignment?.assignment_days || [];
              const currentRepeatDays = allAssignmentDays.filter((d: any) => d.repeat_no === currentRepeatNo);
              const totalDays = currentRepeatDays.length || programDaysCount;
              const doneDays = currentRepeatDays.filter((d: any) => d.status === 'done').length;
              const missedDays = currentRepeatDays.filter((d: any) => d.status === 'missed').length;
              const redoRatio = totalDays > 0 ? missedDays / totalDays : 0;
              const doneRatio = totalDays > 0 ? doneDays / totalDays : 0;
              return (
                console.log(programs),
                <div key={assignment.id} className="relative">
                  <Link
                    to={`/programs/${assignment.program_id}`}
                    className="block bg-slate-800 rounded-xl p-4 hover:bg-slate-750 transition-colors animate-slideUp"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* DualRingCircle: repeat progress */}
                      <DualRingCircle
                        size={56}
                        strokeWidth={6}
                        labelText={`${doneDays}/${totalDays}`}
                        doneRatio={doneRatio}
                        redoRatio={redoRatio}
                      />
                      {/* NumberCircle: current repeat/total */}
                      <NumberCircle labelText={`${currentRepeatNo}/${totalRepeats}`} subLabel={`Repeat`} />
                      {/* RepeatBadgesRow: badges for repeats */}
                      <RepeatBadgesRow totalRepeats={totalRepeats} completedRepeats={completedRepeats} currentRepeatNo={currentRepeatNo} />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white truncate">
                          {programs.find(p => p.id === assignment.program_id)?.title}
                        </h3>
                        {progress && progress.assignment && (
                          <div className="text-xs text-slate-300 mb-1">
                            {progress.assignment.start_date} &rarr; {progress.assignment.end_date}
                          </div>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                </div>
              );
            })}
        </div>
        {/* Upcoming Program View */}
        {hasActiveAssignment && queuedAssignments.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-white mt-8 mb-4">Upcoming Program</h2>
            <div className="grid gap-4">
              {queuedAssignments.map((assignment) => {
                // Compute repeat progress for queued assignment (all gray/disabled)
                const totalRepeats = assignment.target_cycles || assignment.max_cycles || 1;
                const programDaysCount = assignment.program_days_count || 1;
                // No progress, so all zeros
                const doneDays = 0;
                const totalDays = programDaysCount;
                const redoRatio = 0;
                const doneRatio = 0;
                const completedRepeats = 0;
                const currentRepeatNo = 1;
                return (
                  <div key={assignment.id} className="relative opacity-60 grayscale pointer-events-none select-none bg-slate-700 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* DualRingCircle: repeat progress (gray) */}
                      <DualRingCircle
                        size={56}
                        strokeWidth={6}
                        labelText={`${doneDays}/${totalDays}`}
                        doneRatio={doneRatio}
                        redoRatio={redoRatio}
                      />
                      {/* NumberCircle: current repeat/total */}
                      <NumberCircle labelText={`${currentRepeatNo}/${totalRepeats}`} subLabel={`Repeat`} />
                      {/* RepeatBadgesRow: badges for repeats */}
                      <RepeatBadgesRow totalRepeats={totalRepeats} completedRepeats={completedRepeats} currentRepeatNo={currentRepeatNo} />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white truncate">
                          {programs.find(p => p.id === assignment.program_id)?.title || assignment.program_id}
                        </h3>
                        <div className="text-xs text-slate-300 mb-1">
                          {assignment.start_date} &rarr; {assignment.end_date}
                        </div>
                        <div className="text-slate-400 text-xs">Queued at: {assignment.queued_at}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {/* History View */}
        <h2 className="text-xl font-bold text-white mt-8 mb-4">Assignment History</h2>
        <div className="grid gap-4">
          {historyAssignments.length === 0 && (
            <div className="text-slate-400">No history assignments</div>
          )}
          {historyAssignments.map((assignment) => {
            const totalRepeats = assignment.target_cycles || assignment.max_cycles || 1;
            const completedRepeats = assignment.completed_repeats || totalRepeats;
            const isCompleted = (assignment.state === 'completed' || (assignment.state === 'archived' && completedRepeats === totalRepeats));
            const isEnded = assignment.state === 'archived' && completedRepeats < totalRepeats;
            return (
              <div key={assignment.id} className={`rounded-xl p-4 ${isCompleted ? 'bg-slate-900 opacity-80' : 'bg-slate-800'} relative`}>
                <div className="flex items-center gap-3 mb-2">
                  {isCompleted ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-600 text-white text-xs font-bold gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Completed
                    </span>
                  ) : isEnded ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-yellow-500 text-white text-xs font-bold gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01" /></svg>
                      Ended
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-400 ml-2">{assignment.archived_at ? `Archived: ${assignment.archived_at.slice(0,10)}` : ''}</span>
                </div>
                <div className="font-semibold text-white mb-1">{programs.find(p => p.id === assignment.program_id)?.title || assignment.program_id}</div>
                <div className="text-slate-300 text-sm mb-1">{assignment.start_date} &rarr; {assignment.end_date}</div>
                <div className="flex items-center gap-2 mb-2">
                  <DualRingCircle
                    size={40}
                    strokeWidth={5}
                    labelText={`${totalRepeats}/${totalRepeats}`}
                    doneRatio={1}
                    redoRatio={0}
                  />
                  <span className="text-xs text-green-500 font-bold">100% Complete</span>
                </div>
                {/* {isAdmin && (
                  <button
                    className={`mt-2 px-3 py-1 rounded bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition ${isCompleted ? '' : 'opacity-60 pointer-events-none'}`}
                    onClick={() => setReactivateModal({ open: true, assignment })}
                    disabled={!isCompleted}
                  >
                    Reactivate
                  </button>
                )} */}
              </div>
            );
          })}
        </div>
        {/* Reactivate Modal Popup */}
        {reactivateModal?.open && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold mb-2">Reactivate Program</h3>
              {reactivateModal.error ? (
                <>
                  <p className="mb-4 text-red-600">{reactivateModal.error}</p>
                  <div className="flex gap-2 justify-end">
                    <button className="px-3 py-1 rounded bg-gray-300 text-gray-700 font-bold" onClick={() => setReactivateModal(null)}>Cancel</button>
                    <button className="px-3 py-1 rounded bg-blue-600 text-white font-bold" onClick={() => {
                      setReactivateModal(null);
                      // Optionally navigate to active program view
                      window.location.reload();
                    }}>Go to Active</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4">Checking for active program...</p>
                  <div className="flex gap-2 justify-end">
                    <button className="px-3 py-1 rounded bg-gray-300 text-gray-700 font-bold" onClick={() => setReactivateModal(null)}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {/* ...existing code... */}
      </div>
    </Layout>
  );
}
