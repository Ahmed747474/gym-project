import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Profile, Program } from '../lib/database.types';
import { createUserProgramAssignment, supabase } from '../lib/supabase';

export default function CoachDashboard() {
  const { user, profile } = useAuth();
  const [trainees, setTrainees] = useState<Profile[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrainee, setSelectedTrainee] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [targetCycles, setTargetCycles] = useState(4);
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch trainees
        const { data: traineesData, error: traineesError } = await supabase
          .from('profiles')
          .select('*')
          .eq('coach_id', user.id);
        
        if (traineesError) throw traineesError;
        setTrainees(traineesData || []);

        // Fetch my programs
        const { data: programsData, error: programsError } = await supabase
          .from('programs')
          .select('*')
          .eq('owner_coach_id', user.id);

        if (programsError) throw programsError;
        setPrograms(programsData || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);


  
  const handleAssignProgram = async () => {
    if (!selectedTrainee || !selectedProgramId) return;
    setAssignLoading(true);
    try {
      // Use helper to create assignment AND generate schedule
      await createUserProgramAssignment({
        userId: selectedTrainee,
        programId: selectedProgramId,
        startDate: startDate,
        endDate: endDate,
        targetCycles: targetCycles,
      });

      alert('Program assigned successfully!');
      setAssignModalOpen(false);
      setSelectedTrainee(null);
      setSelectedProgramId('');
    } catch (error: any) {
      console.error('Error assigning program:', error);
      if (error.code === '23505') {
        alert('Program already assigned to this trainee.');
      } else {
        alert('Failed to assign program: ' + error.message);
      }
    } finally {
      setAssignLoading(false);
    }
  };

  const openAssignModal = (traineeId: string) => {
    setSelectedTrainee(traineeId);
    setAssignModalOpen(true);
  };

  if (loading) return <Layout title="Coach Dashboard"><LoadingSpinner /></Layout>;

  return (
    <Layout title="Coach Dashboard">
      <div className="p-4 space-y-6">
        {/* Stats / Header */}
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-xl font-bold text-white">My Trainees</h2>
                <p className="text-slate-400 text-sm">{trainees.length} active trainees</p>
            </div>
            <div className='flex gap-2'>
                <div className="px-4 py-2 bg-slate-800 rounded-lg text-slate-300 text-sm">
                    Code: <span className="font-mono text-white select-all">{profile?.coach_code || 'N/A'}</span>
                </div>
            </div>
        </div>

        {/* Trainees List */}
        <div className="grid gap-4">
          {trainees.length === 0 ? (
            <div className="text-center p-8 bg-slate-800 rounded-xl">
              <p className="text-slate-400 mb-2">You don't have any trainees yet.</p>
              <p className="text-sm text-slate-500">Share your coach code: <span className="text-white font-mono">{profile?.coach_code}</span></p>
            </div>
          ) : (
            trainees.map(trainee => (
              <div key={trainee.id} className="bg-slate-800 p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold uppercase">
                    {trainee.full_name?.[0] || trainee.email[0]}
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{trainee.full_name || 'Unnamed Trainee'}</h3>
                    <p className="text-slate-400 text-xs">{trainee.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => openAssignModal(trainee.id)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Assign Program
                </button>
              </div>
            ))
          )}
        </div>

        {/* Quick Links */}
        <div className="pt-4 border-t border-slate-800">
            <h3 className="text-lg font-bold text-white mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
                <Link to="/admin" state={{ tab: 'programs' }} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">
                    <div className="text-white font-medium mb-1">Manage Programs</div>
                    <p className="text-xs text-slate-400">Create and edit your programs</p>
                </Link>
                {/* <button className="p-4 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-left">
                    <div className="text-white font-medium mb-1">Invite Trainee</div>
                    <p className="text-xs text-slate-400">Send an invite link</p>
                </button> */}
            </div>
        </div>
      </div>

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl animate-scaleUp">
            <h3 className="text-xl font-bold text-white mb-4">Assign Program</h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Program</label>
              <select
                value={selectedProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose a program --</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono placeholder-slate-500"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">Repeats (Cycles)</label>
              <input
                type="number"
                min="1"
                max="12"
                value={targetCycles}
                onChange={(e) => setTargetCycles(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
              <p className="text-xs text-slate-400 mt-1">Number of times the program repeats (e.g. 4 weeks).</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignProgram}
                disabled={!selectedProgramId || assignLoading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {assignLoading ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
