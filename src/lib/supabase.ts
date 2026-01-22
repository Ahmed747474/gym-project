// Toggle exercise done for assignment-based model
export async function toggleAssignmentExerciseDone(assignmentDayId: string, exerciseId: string, done: boolean, userId: string) {
  // 1. Upsert progress row
  const doneAt = done ? new Date().toISOString() : null;
  await supabase
    .from('assignment_exercise_progress')
    .upsert({ assignment_day_id: assignmentDayId, exercise_id: exerciseId, done, done_at: doneAt }, { onConflict: 'assignment_day_id,exercise_id' });

  // 2. Recompute assignment day status
  // Fetch assignment_day row
  const { data: dayRow } = await supabase
    .from('assignment_days')
    .select('id, assignment_id, program_day_id')
    .eq('id', assignmentDayId)
    .maybeSingle();
  if (!dayRow) return;
  // Fetch template exercises for this program_day_id
  const { data: templateExercises } = await supabase
    .from('program_day_exercises')
    .select('exercise_id')
    .eq('program_day_id', dayRow.program_day_id);
  // Fetch progress for this assignment_day_id
  const { data: progressRows } = await supabase
    .from('assignment_exercise_progress')
    .select('exercise_id, done')
    .eq('assignment_day_id', assignmentDayId);
  // allDone = every template exercise has done=true
  const allDone = templateExercises && templateExercises.length > 0 &&
    templateExercises.every(ex => progressRows?.find(p => p.exercise_id === ex.exercise_id && p.done));
  // Update assignment_days.status
  await supabase
    .from('assignment_days')
    .update({
      status: allDone ? 'done' : 'pending',
      completed_at: allDone ? new Date().toISOString() : null
    })
    .eq('id', assignmentDayId);

  // 3. After day status update, call processQueue to auto-archive/activate next
  await processQueue(userId);
}
// Auto-archive finished active program and activate next queued
export async function processQueue(userId: string) {
  const today = dayjs().format('YYYY-MM-DD');
  // 1. Find active assignment
  const { data: active } = await supabase
    .from('user_program_assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('state', 'active')
    .limit(1)
    .maybeSingle();
  if (active) {
    // Get assignment_days for this assignment
    const { data: days } = await supabase
      .from('assignment_days')
      .select('status,repeat_no')
      .eq('assignment_id', active.id);
    const maxCycles = active.target_cycles || active.max_cycles || 1;
    let completedRepeats = 0;
    if (days) {
      for (let r = 1; r <= maxCycles; r++) {
        const repeatDays = days.filter(d => d.repeat_no === r);
        if (repeatDays.length > 0 && repeatDays.every(d => d.status === 'done')) completedRepeats++;
      }
    }
    const finished = (completedRepeats === maxCycles) || (today > active.end_date);
    if (finished) {
      // Archive active assignment
      await supabase
        .from('user_program_assignments')
        .update({ state: 'archived', archived_at: new Date().toISOString() })
        .eq('id', active.id);
      // Activate next queued assignment
      const { data: nextQueued } = await supabase
        .from('user_program_assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('state', 'queued')
        .order('queued_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextQueued) {
        // Check if assignment_days already exist for this queued assignment
        const { data: existingDays } = await supabase
          .from('assignment_days')
          .select('id')
          .eq('assignment_id', nextQueued.id);

        if (!existingDays || existingDays.length === 0) {
          const maxCycles = nextQueued.target_cycles || nextQueued.max_cycles || 1;
          const programDaysCount = nextQueued.program_days_count || 1;
          const totalDays = maxCycles * programDaysCount;
          const daysToInsert = [];
          for (let i = 0; i < totalDays; i++) {
            const repeat_no = Math.floor(i / programDaysCount) + 1;
            const day_index = (i % programDaysCount) + 1;
            const scheduledDate = dayjs(nextQueued.start_date).add(i, 'day').format('YYYY-MM-DD');
            daysToInsert.push({
              assignment_id: nextQueued.id,
              scheduled_date: scheduledDate,
              repeat_no,
              day_index,
              status: 'pending',
            });
          }
          await supabase.from('assignment_days').insert(daysToInsert);
        }
      }
    }
  }
}
// --- Assignment Scheduling Logic ---

import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';

// Admin: Create assignment and schedule days
export async function createUserProgramAssignment({
  userId,
  programId,
  startDate,
  endDate,
  targetCycles,
}: {
  userId: string;
  programId: string;
  startDate: string;
  endDate: string;
  targetCycles: number;
}) {
  // Fetch all program days for this program
  const { data: programDays } = await supabase
    .from('days')
    .select('id, day_number, title')
    .eq('program_id', programId)
    .order('day_number');
  if (!programDays) throw new Error('No program days found');

  // For each program day, check if it has exercises
  const workoutDays: any[] = [];
  for (const day of programDays) {
    const { count } = await supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true })
      .eq('day_id', day.id);
    if ((count || 0) > 0) {
      workoutDays.push(day);
    }
  }
  const workoutDaysCount = workoutDays.length;
  if (workoutDaysCount === 0) throw new Error('No workout days with exercises found');
  const totalAssignmentDays = targetCycles * workoutDaysCount;

  // Check for existing assignment for this user/program (active)
    const { data: existingAssignment } = await supabase
      .from('user_program_assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('program_id', programId)
      .eq('state', 'active')
      .maybeSingle();

  let assignment;
  if (existingAssignment) {
    // If max_cycles/target_cycles changed, update and regenerate assignment_days
    if (existingAssignment.target_cycles !== targetCycles) {
      await supabase
        .from('user_program_assignments')
        .update({ target_cycles: targetCycles })
        .eq('id', existingAssignment.id);
      // Delete all assignment_days for this assignment
      await supabase
        .from('assignment_days')
        .delete()
        .eq('assignment_id', existingAssignment.id);
      // Recreate assignment_days
      const days = [];
      for (let i = 0; i < totalAssignmentDays; i++) {
        const repeat_no = Math.floor(i / workoutDaysCount) + 1;
        const programDay = workoutDays[i % workoutDaysCount];
        const scheduledDate = dayjs(startDate).add(i, 'day').format('YYYY-MM-DD');
        days.push({
          assignment_id: existingAssignment.id,
          scheduled_date: scheduledDate,
          repeat_no,
          program_day_id: programDay.id,
            state: 'pending',
        });
      }
      const { error: daysError } = await supabase.from('assignment_days').insert(days);
      if (daysError) throw daysError;
    }
    assignment = existingAssignment;
  } else {
    // Insert new assignment
    const now = new Date().toISOString();
    const { data: newAssignment, error } = await supabase
      .from('user_program_assignments')
      .insert({
        user_id: userId,
        program_id: programId,
        start_date: startDate,
        end_date: endDate,
        program_days_count: workoutDaysCount,
        target_cycles: targetCycles,
          state: 'active',
        activated_at: now,
      })
      .select('*')
      .single();
    if (error) throw error;
    assignment = newAssignment;
    // Create assignment_days
    const days = [];
    for (let i = 0; i < totalAssignmentDays; i++) {
      const repeat_no = Math.floor(i / workoutDaysCount) + 1;
      const programDay = workoutDays[i % workoutDaysCount];
      const scheduledDate = dayjs(startDate).add(i, 'day').format('YYYY-MM-DD');
      days.push({
        assignment_id: assignment.id,
        scheduled_date: scheduledDate,
        repeat_no,
        program_day_id: programDay.id,
          state: 'pending',
      });
    }
    const { error: daysError } = await supabase.from('assignment_days').insert(days);
    if (daysError) throw daysError;
  }
  return assignment;
}

// Mark missed days (should be called on app open)
export async function markMissedAssignmentDays(userId: string) {
  const today = dayjs().format('YYYY-MM-DD');
  // Only consider active assignments
  const { data: activeAssignments } = await supabase
    .from('user_program_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('state', 'active');
  const assignmentIds = activeAssignments?.map(a => a.id) || [];
  if (assignmentIds.length === 0) return;
  // Find all pending days before today for active assignments
  const { data: missedDays, error } = await supabase
    .from('assignment_days')
    .select('id')
    .in('assignment_id', assignmentIds)
    .lt('scheduled_date', today)
    .eq('status', 'pending');
  if (error) throw error;
  if (missedDays && missedDays.length > 0) {
    await supabase
      .from('assignment_days')
      .update({ status: 'missed' })
      .in('id', missedDays.map(d => d.id));
  }
}

// Find the next workout day to show
export async function getNextWorkoutDay(userId: string) {
  const today = dayjs().format('YYYY-MM-DD');
  // Only consider active assignments
  const { data: activeAssignments } = await supabase.from('user_program_assignments').select('id').eq('user_id', userId).eq('state', 'active');
  const assignmentIds = activeAssignments?.map(a => a.id) || [];
  if (assignmentIds.length === 0) return null;
  // 1. Earliest missed or pending day <= today
  const { data: days } = await supabase
    .from('assignment_days')
    .select('*')
    .in('assignment_id', assignmentIds)
    .lte('scheduled_date', today)
    .in('status', ['pending', 'missed'])
    .order('scheduled_date', { ascending: true })
    .limit(1);
  if (days && days.length > 0) return days[0];
  // 2. Next future pending assignment day
  const { data: futurePending } = await supabase
    .from('assignment_days')
    .select('*')
    .in('assignment_id', assignmentIds)
    .gt('scheduled_date', today)
    .eq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .limit(1);
  if (futurePending && futurePending.length > 0) return futurePending[0];
  return null;
}

// Progress calculation
export async function getAssignmentProgress(assignmentId: string) {
  // Get all assignment_days for this assignment (only if assignment is active)
  const { data: assignment } = await supabase.from('user_program_assignments').select('state').eq('id', assignmentId).maybeSingle();
  if (!assignment || assignment.state !== 'active') return null;
  const { data: days } = await supabase.from('assignment_days').select('*').eq('assignment_id', assignmentId);
  if (!days || days.length === 0) return null;
  const maxRepeats = Math.max(...days.map(d => d.repeat_no));
  // Current repeat progress
  const currentRepeatNo = Math.max(...days.filter(d => d.status !== 'pending').map(d => d.repeat_no));
  const currentRepeatDays = days.filter(d => d.repeat_no === currentRepeatNo);
  const repeatDone = currentRepeatDays.filter(d => d.status === 'done').length;
  const repeatMissed = currentRepeatDays.filter(d => d.status === 'missed').length;
  const repeatPending = currentRepeatDays.filter(d => d.status === 'pending').length;
  const repeatDayStatuses = currentRepeatDays.map(d => ({ status: d.status }));
  // Overall progress
  let completedRepeats = 0;
  for (let r = 1; r <= maxRepeats; r++) {
    const repeatDays = days.filter(d => d.repeat_no === r);
    if (repeatDays.length > 0 && repeatDays.every(d => d.status === 'done')) completedRepeats++;
  }
  return {
    repeat: {
      done: repeatDone,
      missed: repeatMissed,
      pending: repeatPending,
      total: currentRepeatDays.length,
      days: repeatDayStatuses,
    },
    overall: {
      completedRepeats,
      maxRepeats,
    },
  };
}
// --- Legacy cycle_* logic removed for assignment-based model ---

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nniavjhivwnrgimotrit.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IFP1WBbwCGmTGOLA4p-Dmw_8xvfZQai';

// Supabase anon key is safe to expose - it's designed for client-side use with RLS
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Auth helpers
export const signUp = async (email: string, password: string, fullName?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Assign program to user (admin)
export async function assignProgramToUser(userId: string, programId: string, startDate: string, endDate: string, programDaysCount: number) {
  // Check for active assignment
  const { data: active } = await supabase
    .from('user_program_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('state', 'active')
    .limit(1)
  const now = new Date().toISOString();
  if (!active) {
    // Create active assignment and generate schedule
    const durationDays = dayjs(endDate).diff(dayjs(startDate), 'day') + 1;
    const maxCycles = Math.floor(durationDays / programDaysCount);
    const { data: assignment, error } = await supabase
      .from('user_program_assignments')
      .insert({
        user_id: userId,
        program_id: programId,
        start_date: startDate,
        end_date: endDate,
        program_days_count: programDaysCount,
        max_cycles: maxCycles,
        state: 'active',
        activated_at: now,
        queued_at: now,
      })
      .select('*')
      .single();
    if (error) throw error;
    // Generate assignment_days
    const totalDays = maxCycles * programDaysCount;
    const days = [];
    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
      const repeat_no = Math.floor(dayOffset / programDaysCount) + 1;
      const day_index = (dayOffset % programDaysCount) + 1;
      const scheduledDate = dayjs(startDate).add(dayOffset, 'day').format('YYYY-MM-DD');
      days.push({
        assignment_id: assignment.id,
        scheduled_date: scheduledDate,
        repeat_no,
        day_index,
        state: 'pending',
      });
    }
    const { error: daysError } = await supabase.from('assignment_days').insert(days);
    if (daysError) throw daysError;
    return assignment;
  } else {
    // Create queued assignment, do NOT generate schedule
    const durationDays = dayjs(endDate).diff(dayjs(startDate), 'day') + 1;
    const maxCycles = Math.floor(durationDays / programDaysCount);
    const { data: assignment, error } = await supabase
      .from('user_program_assignments')
      .insert({
        user_id: userId,
        program_id: programId,
        start_date: startDate,
        end_date: endDate,
        program_days_count: programDaysCount,
        max_cycles: maxCycles,
        state: 'queued',
        queued_at: now,
      })
      .select('*')
      .single();
    if (error) throw error;
    return assignment;
  }
}
