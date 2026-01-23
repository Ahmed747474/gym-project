import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Day, Exercise, Profile, Program } from '../lib/database.types';
import { createUserProgramAssignment, supabase } from '../lib/supabase';

type Tab = 'programs' | 'users' | 'assignments' | 'manage-assignments';

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('programs');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Program form
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [programTitle, setProgramTitle] = useState('');
  const [programDescription, setProgramDescription] = useState('');

  // Day form
  const [showDayForm, setShowDayForm] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [dayNumber, setDayNumber] = useState('');
  const [dayTitle, setDayTitle] = useState('');

  // Exercise form (unused in main admin, but keeping for consistency)
  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [_selectedDayId, _setSelectedDayId] = useState<string | null>(null);
  const [exerciseNumber, setExerciseNumber] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseSets, setExerciseSets] = useState('3');
  const [exerciseReps, setExerciseReps] = useState('10');
  const [exerciseRest, setExerciseRest] = useState('60');
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [exerciseVideoUrl, setExerciseVideoUrl] = useState('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [programMap, setProgramMap] = useState<Record<string, Program>>({});
  const [showQueued, setShowQueued] = useState(false);
  const [removeModal, setRemoveModal] = useState<{ open: boolean; assignment?: any; user?: Profile; error?: string } | null>(null);
  const [reactivateModal, setReactivateModal] = useState<{ open: boolean; assignment?: any; error?: string } | null>(null);
  

  // Assignment
  const [assignUserId, setAssignUserId] = useState('');
  const [assignProgramId, setAssignProgramId] = useState('');
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().add(28, 'day').format('YYYY-MM-DD'));
  const [programDaysCount, setProgramDaysCount] = useState(4);
  // (Removed unused selectedProgramDaysCount state)

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin]);
useEffect(() => {
    if (!isAdmin) return;
    const fetchUsers = async () => {
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*');
      setUsers((usersData as Profile[]) || []);
    };
    fetchUsers();
    fetchAssignments();
  }, [isAdmin, showQueued]);
  // Fetch days count when assignProgramId changes
  useEffect(() => {
    
    const fetchDaysCount = async () => {
      if (!assignProgramId) {
        setProgramDaysCount(4);
        return;
      }
      const { count } = await supabase
        .from('days')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', assignProgramId);
      setProgramDaysCount(count || 4);
    };
    fetchDaysCount();
  }, [assignProgramId]);


  // Hard delete assignment
  const hardDeleteAssignment = async (assignmentId: string) => {
    // 1. Get all assignment_days for this assignment
    const { data: days } = await supabase
      .from('assignment_days')
      .select('id')
      .eq('assignment_id', assignmentId);
    const dayIds = (days || []).map((d: any) => d.id);
    // 2. Delete assignment_exercise_progress for those days
    if (dayIds.length > 0) {
      await supabase
        .from('assignment_exercise_progress')
        .delete()
        .in('assignment_day_id', dayIds);
    }
    // 3. Delete assignment_days
    await supabase
      .from('assignment_days')
      .delete()
      .eq('assignment_id', assignmentId);
    // 4. Delete assignment
    await supabase
      .from('user_program_assignments')
      .delete()
      .eq('id', assignmentId);
    setRemoveModal(null);
    fetchAssignments();
  };
  // Soft delete assignment
  const softDeleteAssignment = async (assignmentId: string) => {
    await supabase
      .from('user_program_assignments')
      .update({ state: 'archived', archived_at: new Date().toISOString() })
      .eq('id', assignmentId);
    setRemoveModal(null);
    fetchAssignments();
  };

  // Reactivate archived assignment
  const reactivateAssignment = async (assignmentId: string) => {
    await supabase
      .from('user_program_assignments')
      .update({ state: 'active', activated_at: new Date().toISOString(), archived_at: null })
      .eq('id', assignmentId);
    fetchAssignments();
  };
  const fetchAssignments = async () => {
    // Fetch assignments (active or queued)
    const { data: assignmentsData } = await supabase
      .from('user_program_assignments')
      .select('*')
      .in('state', showQueued ? ['active', 'queued'] : ['active','archived']);
    setAssignments(assignmentsData || []);
    // Fetch programs
    const { data: programsData } = await supabase
      .from('programs')
      .select('*');
    const map: Record<string, Program> = {};
    for (const p of programsData || []) map[p.id] = p;
    setProgramMap(map);
  };

  
  const fetchData = async () => {
    setLoading(true);
    // Fetch programs
    const { data: programsData } = await supabase
      .from('programs')
      .select('*')
      .order('title');
    setPrograms((programsData as Program[]) || []);

    // Fetch users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('email');
    setUsers((usersData as Profile[]) || []);

    setLoading(false);
  };

  const deleteProgram = async (id: string) => {
    if (!confirm('Delete this program and all its days/exercises?')) return;
    await supabase.from('programs').delete().eq('id', id);
    fetchData();
  };

  // Day CRUD
  const saveDay = async () => {
    if (!selectedProgramId) return;
    await supabase.from('days').insert({
      program_id: selectedProgramId,
      day_number: parseInt(dayNumber),
      title: dayTitle,
    } as any);
    setShowDayForm(false);
    setDayNumber('');
    setDayTitle('');
    fetchData();
  };

  // Exercise CRUD
  const saveExercise = async () => {
    if (!_selectedDayId) return;
    await supabase.from('exercises').insert({
      day_id: _selectedDayId,
      exercise_number: parseInt(exerciseNumber),
      name: exerciseName,
      sets: parseInt(exerciseSets),
      reps: exerciseReps,
      rest_seconds: parseInt(exerciseRest) || null,
      notes: exerciseNotes || null,
      video_url: exerciseVideoUrl || null,
    } as any);
    setShowExerciseForm(false);
    resetExerciseForm();
    fetchData();
  };

  const resetExerciseForm = () => {
    setExerciseNumber('');
    setExerciseName('');
    setExerciseSets('3');
    setExerciseReps('10');
    setExerciseRest('60');
    setExerciseNotes('');
    setExerciseVideoUrl('');
  };

  // Assignment
  // No-op: assignProgram is not used, logic is inline in the button handler.

  // Program Form Save
  const saveProgram = async () => {
    if (!programTitle) return;
    if (editingProgram) {
      await supabase
        .from('programs')
        .update({
          title: programTitle,
          description: programDescription || null,
        })
        .eq('id', editingProgram.id);
    } else {
      await supabase.from('programs').insert({
        title: programTitle,
        description: programDescription || null,
      });
    }
    setShowProgramForm(false);
    setEditingProgram(null);
    setProgramTitle('');
    setProgramDescription('');
    fetchData();
  };

  if (!isAdmin) {
    return (
      <Layout title="Admin" showBack>
        <div className="p-4 text-center">
          <p className="text-red-400">Access denied. Admin privileges required.</p>
          <Link to="/programs" className="text-blue-400 mt-4 inline-block">
            Back to Programs
          </Link>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="Admin">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="Admin Panel">
        <Link to="/programs" className="text-blue-400 mt-4 inline-block">
            Back to Programs
          </Link>
      <div className="p-4 pb-20">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {(['programs', 'users', 'assignments','manage-assignments'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium capitalize whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Programs Tab */}
        {activeTab === 'programs' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Programs</h2>
              <button
                onClick={() => setShowProgramForm(true)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                + New Program
              </button>
            </div>

            {programs.map((program) => (
              <div key={program.id} className="bg-slate-800 rounded-xl p-4 mb-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{program.title}</h3>
                    <p className="text-sm text-slate-500">{program.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingProgram(program);
                        setProgramTitle(program.title);
                        setProgramDescription(program.description || '');
                        setShowProgramForm(true);
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteProgram(program.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      setSelectedProgramId(program.id);
                      setShowDayForm(true);
                    }}
                    className="text-sm px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                  >
                    + Add Day
                  </button>
                  <Link
                    to={`/admin/programs/${program.id}/days`}
                    className="text-sm px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                  >
                    Manage Days
                  </Link>
                </div>
              </div>
            ))}

            {programs.length === 0 && (
              <p className="text-center text-slate-500 py-8">No programs yet</p>
            )}
          </div>
        )}
{activeTab === 'manage-assignments' && (

  <div>
      <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Assignments</h2>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={showQueued} onChange={() => setShowQueued(v => !v)} />
            Show queued
          </label>
        </div>
          <div className="overflow-auto bg-slate-800 rounded-lg p-2">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-slate-400 text-sm">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Program</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Assigned</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a: any) => (
                <tr key={a.id} className="border-t border-slate-700">
                  <td className="px-4 py-2">
                    {users.find(u => u.id === a.user_id)?.email || a.user_email || a.user_id}
                  </td>
                  <td className="px-4 py-2">{programMap[a.program_id]?.title || '—'}</td>
                  <td className="px-4 py-2">{a.state}</td>
                  <td className="px-4 py-2">{a.assigned_at ? new Date(a.assigned_at).toLocaleString() : a.created_at ? new Date(a.created_at).toLocaleString() : '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      {a.state === 'archived' ? (
                        <button onClick={() => setReactivateModal({ open: true, assignment: a })} className="px-3 py-1 bg-green-600 text-white rounded">Reactivate</button>
                      ) : (
                        <button onClick={() => setRemoveModal({ open: true, assignment: a })} className="px-3 py-1 bg-yellow-600 text-white rounded">Archive</button>
                      )}
                      <button onClick={() => setRemoveModal({ open: true, assignment: a, error: undefined })} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  </div>
  

)}     
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Users</h2>
            {users.map((user) => (
              <div key={user.id} className="bg-slate-800 rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{user.email}</p>
                    <p className="text-sm text-slate-500">
                      {user.full_name || 'No name'} {user.is_admin && '(Admin)'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-center text-slate-500 py-8">No users yet</p>
            )}
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Assign Program to User</h2>
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">User</label>
                <select
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Program</label>
                <select
                  value={assignProgramId}
                  onChange={(e) => setAssignProgramId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select a program</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Target Repeats (Cycles)</label>
                <input
                  type="number"
                  min={1}
                  value={programDaysCount}
                  onChange={e => setProgramDaysCount(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <button
                onClick={async () => {
                  if (!assignUserId || !assignProgramId || !startDate || !endDate || !programDaysCount) return;
                  try {
                    await createUserProgramAssignment({
                      userId: assignUserId,
                      programId: assignProgramId,
                      startDate,
                      endDate,
                      targetCycles: programDaysCount,
                    });
                    setAssignUserId('');
                    setAssignProgramId('');
                    setStartDate(dayjs().format('YYYY-MM-DD'));
                    setEndDate(dayjs().add(28, 'day').format('YYYY-MM-DD'));
                    setProgramDaysCount(4);
                    alert('Program assigned successfully!');
                  } catch (err) {
                    alert('Error assigning program: ' + (err instanceof Error ? err.message : 'Unknown error'));
                  }
                }}
                disabled={!assignUserId || !assignProgramId || !startDate || !endDate || !programDaysCount}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                Assign Program
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Program Form Modal */}
      {showProgramForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md animate-slideUp">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingProgram ? 'Edit Program' : 'New Program'}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Title</label>
              <input
                type="text"
                value={programTitle}
                onChange={(e) => setProgramTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
              <textarea
                value={programDescription}
                onChange={(e) => setProgramDescription(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white h-24 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowProgramForm(false);
                  setEditingProgram(null);
                  setProgramTitle('');
                  setProgramDescription('');
                }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveProgram}
                disabled={!programTitle}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Form Modal */}
      {showDayForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md animate-slideUp">
            <h3 className="text-xl font-bold text-white mb-4">Add Day</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Day Number</label>
              <input
                type="number"
                value={dayNumber}
                onChange={(e) => setDayNumber(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                min="1"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Title</label>
              <input
                type="text"
                value={dayTitle}
                onChange={(e) => setDayTitle(e.target.value)}
                placeholder="e.g., Push Day"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDayForm(false);
                  setDayNumber('');
                  setDayTitle('');
                }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveDay}
                disabled={!dayNumber || !dayTitle}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
              >
                Add Day
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exercise Form Modal */}
      {showExerciseForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md animate-slideUp my-8">
            <h3 className="text-xl font-bold text-white mb-4">Add Exercise</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Exercise #</label>
                <input
                  type="number"
                  value={exerciseNumber}
                  onChange={(e) => setExerciseNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Name</label>
                <input
                  type="text"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  placeholder="e.g., Bench Press"
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Sets</label>
                  <input
                    type="number"
                    value={exerciseSets}
                    onChange={(e) => setExerciseSets(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Reps</label>
                  <input
                    type="text"
                    value={exerciseReps}
                    onChange={(e) => setExerciseReps(e.target.value)}
                    placeholder="10"
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Rest (s)</label>
                  <input
                    type="number"
                    value={exerciseRest}
                    onChange={(e) => setExerciseRest(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Video URL (Google Drive)</label>
                <input
                  type="url"
                  value={exerciseVideoUrl}
                  onChange={(e) => setExerciseVideoUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Notes</label>
                <textarea
                  value={exerciseNotes}
                  onChange={(e) => setExerciseNotes(e.target.value)}
                  placeholder="Optional notes for this exercise"
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white h-20 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowExerciseForm(false);
                  resetExerciseForm();
                }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveExercise}
                disabled={!exerciseNumber || !exerciseName}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
              >
                Add Exercise
              </button>
            </div>
          </div>
        </div>
      )}
      {removeModal?.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Remove Assignment</h3>
            <p className="text-slate-300 mb-4">Choose "Archive" to soft-delete (recommended) or "Delete" to permanently remove assignment and its data.</p>
            <div className="flex gap-3">
              <button onClick={() => { if (removeModal.assignment) softDeleteAssignment(removeModal.assignment.id); }} className="flex-1 py-2 bg-yellow-600 text-white rounded">Archive</button>
              <button onClick={() => { if (removeModal.assignment) hardDeleteAssignment(removeModal.assignment.id); }} className="flex-1 py-2 bg-red-600 text-white rounded">Delete</button>
              <button onClick={() => setRemoveModal(null)} className="flex-1 py-2 bg-slate-700 text-white rounded">Cancel</button>
            </div>
            {removeModal.error && <p className="text-red-400 mt-3">{removeModal.error}</p>}
          </div>
        </div>
      )}
      {reactivateModal?.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Reactivate Assignment</h3>
            <p className="text-slate-300 mb-4">Reactivating will set this assignment back to active for the user. Continue?</p>
            <div className="flex gap-3">
              <button onClick={() => { if (reactivateModal.assignment) { reactivateAssignment(reactivateModal.assignment.id); setReactivateModal(null); } }} className="flex-1 py-2 bg-green-600 text-white rounded">Reactivate</button>
              <button onClick={() => setReactivateModal(null)} className="flex-1 py-2 bg-slate-700 text-white rounded">Cancel</button>
            </div>
            {reactivateModal.error && <p className="text-red-400 mt-3">{reactivateModal.error}</p>}
          </div>
        </div>
      )}

    </Layout>
  );
}

// Admin Days Management Page (nested)
export function AdminDaysPage() {
  const { programId } = useParams<{ programId: string }>();
  const { isAdmin } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<(Day & { exercises: Exercise[] })[]>([]);
  const [loading, setLoading] = useState(true);

  // Day form
  const [showDayForm, setShowDayForm] = useState(false);
  const [editingDay, setEditingDay] = useState<Day | null>(null);
  const [dayNumber, setDayNumber] = useState('');
  const [dayTitle, setDayTitle] = useState('');
  const [dayDescription, setDayDescription] = useState('');

  // Exercise form
  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [exerciseNumber, setExerciseNumber] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseSets, setExerciseSets] = useState('3');
  const [exerciseReps, setExerciseReps] = useState('10');
  const [exerciseRest, setExerciseRest] = useState('60');
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [exerciseVideoUrl, setExerciseVideoUrl] = useState('');

  useEffect(() => {
    if (!isAdmin || !programId) return;
    fetchData();
  }, [isAdmin, programId]);

  const fetchData = async () => {
    setLoading(true);

    const { data: programData } = await supabase
      .from('programs')
      .select('*')
      .eq('id', programId as string)
      .single();
    setProgram(programData as Program | null);

    const { data: daysData } = await supabase
      .from('days')
      .select(`*, exercises(*)`)
      .eq('program_id', programId as string)
      .order('day_number');

    // Sort exercises within each day
    const sortedDays = ((daysData || []) as any[]).map((day: any) => ({
      ...day,
      exercises: (day.exercises || []).sort((a: Exercise, b: Exercise) => a.exercise_number - b.exercise_number)
    }));

    setDays(sortedDays as (Day & { exercises: Exercise[] })[]);
    setLoading(false);
  };

  const saveDay = async () => {
    if (editingDay) {
      await supabase
        .from('days')
        .update({
          day_number: parseInt(dayNumber),
          title: dayTitle,
          description: dayDescription || null,
        } as any)
        .eq('id', editingDay.id);
    } else {
      await supabase.from('days').insert({
        program_id: programId,
        day_number: parseInt(dayNumber),
        title: dayTitle,
        description: dayDescription || null,
      } as any);
    }
    setShowDayForm(false);
    setEditingDay(null);
    setDayNumber('');
    setDayTitle('');
    setDayDescription('');
    fetchData();
  };

  const deleteDay = async (id: string) => {
    if (!confirm('Delete this day and all its exercises?')) return;
    await supabase.from('days').delete().eq('id', id);
    fetchData();
  };

  const saveExercise = async () => {
    const exerciseData = {
      day_id: selectedDayId!,
      exercise_number: parseInt(exerciseNumber),
      name: exerciseName,
      sets: parseInt(exerciseSets),
      reps: exerciseReps,
      rest_seconds: parseInt(exerciseRest) || null,
      notes: exerciseNotes || null,
      video_url: exerciseVideoUrl || null,
    };

    if (editingExercise) {
      await supabase
        .from('exercises')
        .update(exerciseData as any)
        .eq('id', editingExercise.id);
    } else {
      await supabase.from('exercises').insert(exerciseData as any);
    }

    setShowExerciseForm(false);
    setEditingExercise(null);
    resetExerciseForm();
    fetchData();
  };

  const deleteExercise = async (id: string) => {
    if (!confirm('Delete this exercise?')) return;
    await supabase.from('exercises').delete().eq('id', id);
    fetchData();
  };

  const resetExerciseForm = () => {
    setExerciseNumber('');
    setExerciseName('');
    setExerciseSets('3');
    setExerciseReps('10');
    setExerciseRest('60');
    setExerciseNotes('');
    setExerciseVideoUrl('');
  };

  if (!isAdmin) {
    return (
      <Layout title="Admin" showBack>
        <div className="p-4 text-center">
          <p className="text-red-400">Access denied.</p>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="Loading..." showBack>
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title={program?.title || 'Program'} showBack backTo="/admin">
      <div className="p-4 pb-20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Days & Exercises</h2>
          <button
            onClick={() => setShowDayForm(true)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            + Add Day
          </button>
        </div>

        {days.map((day) => (
          <div key={day.id} className="bg-slate-800 rounded-xl mb-4 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-white">
                    Day {day.day_number}: {day.title}
                  </h3>
                  {day.description && (
                    <p className="text-sm text-slate-500 mt-1">{day.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingDay(day);
                      setDayNumber(day.day_number.toString());
                      setDayTitle(day.title);
                      setDayDescription(day.description || '');
                      setShowDayForm(true);
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteDay(day.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {/* Exercises list */}
            <div className="p-4">
              {day.exercises.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {day.exercises.map((exercise: Exercise) => (
                    <div
                      key={exercise.id}
                      className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3"
                    >
                      <div>
                        <span className="text-xs text-blue-400 mr-2">#{exercise.exercise_number}</span>
                        <span className="text-white">{exercise.name}</span>
                        <span className="text-slate-500 text-sm ml-2">
                          {exercise.sets}×{exercise.reps}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingExercise(exercise);
                            setSelectedDayId(day.id);
                            setExerciseNumber(exercise.exercise_number.toString());
                            setExerciseName(exercise.name);
                            setExerciseSets(exercise.sets.toString());
                            setExerciseReps(exercise.reps);
                            setExerciseRest(exercise.rest_seconds?.toString() || '60');
                            setExerciseNotes(exercise.notes || '');
                            setExerciseVideoUrl(exercise.video_url || '');
                            setShowExerciseForm(true);
                          }}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteExercise(exercise.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm mb-4">No exercises yet</p>
              )}

              <button
                onClick={() => {
                  setSelectedDayId(day.id);
                  setShowExerciseForm(true);
                }}
                className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                + Add Exercise
              </button>
            </div>
          </div>
        ))}

        {days.length === 0 && (
          <p className="text-center text-slate-500 py-8">No days yet</p>
        )}
      </div>

      {/* Day Form Modal */}
      {showDayForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md animate-slideUp">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingDay ? 'Edit Day' : 'Add Day'}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Day Number</label>
              <input
                type="number"
                value={dayNumber}
                onChange={(e) => setDayNumber(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                min="1"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Title</label>
              <input
                type="text"
                value={dayTitle}
                onChange={(e) => setDayTitle(e.target.value)}
                placeholder="e.g., Push Day"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
              <textarea
                value={dayDescription}
                onChange={(e) => setDayDescription(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white h-20 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDayForm(false);
                  setEditingDay(null);
                  setDayNumber('');
                  setDayTitle('');
                  setDayDescription('');
                }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveDay}
                disabled={!dayNumber || !dayTitle}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exercise Form Modal */}
      {showExerciseForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md animate-slideUp my-8">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingExercise ? 'Edit Exercise' : 'Add Exercise'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Exercise #</label>
                <input
                  type="number"
                  value={exerciseNumber}
                  onChange={(e) => setExerciseNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Name</label>
                <input
                  type="text"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  placeholder="e.g., Bench Press"
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Sets</label>
                  <input
                    type="number"
                    value={exerciseSets}
                    onChange={(e) => setExerciseSets(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Reps</label>
                  <input
                    type="text"
                    value={exerciseReps}
                    onChange={(e) => setExerciseReps(e.target.value)}
                    placeholder="10"
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Rest (s)</label>
                  <input
                    type="number"
                    value={exerciseRest}
                    onChange={(e) => setExerciseRest(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Video URL (Google Drive)</label>
                <input
                  type="url"
                  value={exerciseVideoUrl}
                  onChange={(e) => setExerciseVideoUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Notes</label>
                <textarea
                  value={exerciseNotes}
                  onChange={(e) => setExerciseNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white h-20 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowExerciseForm(false);
                  setEditingExercise(null);
                  resetExerciseForm();
                }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveExercise}
                disabled={!exerciseNumber || !exerciseName}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
