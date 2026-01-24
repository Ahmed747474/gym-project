import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AssignmentDetailsModal from '../components/AssignmentDetailsModal';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { supabase } from '../lib/supabase';

type Tab = 'summary' | 'trainees' | 'history';


export default function AdminCoachDetailsPage() {
  const { coachId } = useParams<{ coachId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [coach, setCoach] = useState<any>(null);
  const [trainees, setTrainees] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);

  useEffect(() => {
    if (coachId) fetchData();
  }, [coachId]);

  const fetchData = async () => {
    setLoading(true);
    // 1. Fetch Coach Profile
    const { data: coachData, error: coachError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', coachId)
      .single();
    
    if (coachError) {
        console.error(coachError);
        setLoading(false);
        return;
    }
    setCoach(coachData);

    // 2. Fetch Trainees
    const { data: traineesData } = await supabase
        .from('profiles')
        .select(`
            *,
            assignments:user_program_assignments!user_id(
                id, state, 
                program:programs(title),
                start_date, end_date,
                created_at, target_cycles
            )
        `)
        .eq('coach_id', coachId);
    
    // Process trainees to find active assignment
    const processedTrainees = (traineesData || []).map((t: any) => {
        const active = (t.assignments || []).find((a: any) => a.state === 'active');
        return { ...t, activeAssignment: active };
    });
    setTrainees(processedTrainees);

    // 3. Fetch Logs (Unified audit_logs)
    const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*, actor:profiles!actor_id(email, full_name)')
        .or(`actor_id.eq.${coachId},meta->>coach_id.eq.${coachId}`)
        .order('created_at', { ascending: false });
    setLogs(logsData || []);

    setLoading(false);
  };

  const toggleAcceptingNew = async () => {
      if (!coach) return;
      const newVal = !coach.coach_accepting_new;
      await supabase.from('profiles').update({ coach_accepting_new: newVal }).eq('id', coachId);
      setCoach({ ...coach, coach_accepting_new: newVal });
  };

  const toggleStatus = async () => {
    if (!coach) return;
    const newStatus = coach.coach_status === 'active' ? 'deactivated' : 'active';
      if (!confirm(`Switch status to ${newStatus}?`)) return;
      await supabase.from('profiles').update({ coach_status: newStatus }).eq('id', coachId);
      setCoach({ ...coach, coach_status: newStatus });
      
      // Log it
      await supabase.from('audit_logs').insert({
          actor_id: coachId, // technically admin acting?
          action: newStatus === 'active' ? 'ACTIVATE_COACH' : 'DEACTIVATE_COACH',
          target_id: coachId,
          target_table: 'profiles',
          meta: { by_admin: true }
      });
      fetchData(); // refresh logs
  };

  if (loading) return <Layout title="Coach Details"><LoadingSpinner /></Layout>;
  if (!coach) return <Layout title="Coach Details"><div className="p-4 text-white">Coach not found</div></Layout>;

  return (
    <Layout title="Coach Details" showBack>
      <div className="p-4 pb-20">
        <div className="mb-6 flex justify-between items-start">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">{coach.full_name}</h1>
                <p className="text-slate-400">{coach.email}</p>
                <div className="flex gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-sm font-mono">{coach.coach_code}</span>
                    <span className={`px-2 py-0.5 rounded text-sm font-bold ${coach.coach_status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {coach.coach_status?.toUpperCase() || 'ACTIVE'}
                    </span>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <button 
                  onClick={toggleAcceptingNew}
                  className={`px-4 py-2 rounded text-sm font-medium ${coach.coach_accepting_new ? 'bg-blue-600' : 'bg-slate-700 text-slate-400'}`}
                >
                    {coach.coach_accepting_new ? 'Accepting New' : 'Not Accepting'}
                </button>
                 <button 
                  onClick={toggleStatus}
                  className={`px-4 py-2 rounded text-sm font-medium border ${coach.coach_status === 'active' ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'}`}
                >
                    {coach.coach_status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                </button>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-700 mb-6">
            {(['summary', 'trainees', 'history'] as Tab[]).map(t => (
                <button 
                  key={t} 
                  onClick={() => setActiveTab(t)}
                  className={`pb-2 px-2 capitalize ${activeTab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
                >
                    {t}
                </button>
            ))}
        </div>

        {activeTab === 'summary' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800 p-4 rounded-xl">
                    <h3 className="text-slate-400 text-sm mb-2">Total Trainees</h3>
                    <p className="text-3xl font-bold text-white">{trainees.length}</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl">
                    <h3 className="text-slate-400 text-sm mb-2">Active Assignments</h3>
                    <p className="text-3xl font-bold text-white">{trainees.filter(t => t.activeAssignment).length}</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl">
                    <h3 className="text-slate-400 text-sm mb-2">Joined</h3>
                    <p className="text-xl text-white">{dayjs(coach.created_at).format('MMM D, YYYY')}</p>
                </div>
            </div>
        )}

        {activeTab === 'trainees' && (
            <div className="bg-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900/50 text-slate-400 text-sm">
                        <tr>
                            <th className="p-4">Trainee</th>
                            <th className="p-4">Active Program</th>
                            <th className="p-4">Joined</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {trainees.map(t => (
                            <tr key={t.id}>
                                <td className="p-4">
                                    <p className="text-white font-medium">{t.full_name}</p>
                                    <p className="text-slate-500 text-sm">{t.email}</p>
                                </td>
                                <td className="p-4">
                                    {t.activeAssignment ? (
                                        <div>
                                            <p className="text-blue-400">{t.activeAssignment.program?.title}</p>
                                            <p className="text-slate-500 text-xs">Ends {dayjs(t.activeAssignment.end_date).format('MMM D')}</p>
                                        </div>
                                    ) : <span className="text-slate-600">-</span>}
                                </td>
                                <td className="p-4 text-slate-400 text-sm">
                                    {dayjs(t.created_at).format('MMM D, YYYY')}
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <Link to={`/admin/trainees/${t.id}`} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors text-center">
                                            Profile & History
                                        </Link>
                                    </div>
                                    <div className="flex gap-2">
                                        {t.activeAssignment && (
                                            <button 
                                                onClick={() => setSelectedAssignment(t.activeAssignment)}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
                                            >
                                                Details / Progress
                                            </button>
                                        )}
                                        <Link to="/admin" state={{ tab: 'assignments', userId: t.id }} className="text-blue-400 hover:underline text-sm self-center">
                                            Manage Programs
                                        </Link>
                                    </div>
                                  </div>
                                </td>
                            </tr>
                        ))}
                         {trainees.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No trainees linked</td></tr>}
                    </tbody>
                </table>
            </div>
        )}

        {activeTab === 'history' && (
            <div className="space-y-4">
                <h3 className="text-white font-medium mb-2">Audit Logs</h3>
                {logs.map(log => (
                    <div key={log.id} className="bg-slate-800 p-4 rounded-lg flex items-start gap-4">
                        <div className="mt-1">
                           <div className={`w-2 h-2 rounded-full ${getActionColor(log.action)}`}></div>
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between">
                                <p className="text-white font-medium text-sm">{formatActionType(log.action)}</p>
                                <span className="text-slate-500 text-xs">{dayjs(log.created_at).format('MMM D, HH:mm')}</span>
                            </div>
                            <p className="text-slate-400 text-sm mt-1">
                                {renderLogDescription(log)}
                            </p>
                            {log.assignment_id && (
                                <Link to={`/admin/assignments/${log.assignment_id}`} className="inline-block mt-2 text-blue-400 text-xs hover:underline">View Assignment</Link>
                            )}
                        </div>
                    </div>
                ))}
                {logs.length === 0 && <p className="text-slate-500">No activity recorded yet.</p>}
            </div>
        )}

      </div>

      {selectedAssignment && (
        <AssignmentDetailsModal
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
        />
      )}
    </Layout>
  );
}

function getActionColor(type: string) {
    if (type.includes('ACTIVATE')) return 'bg-green-500';
    if (type.includes('DEACTIVATE')) return 'bg-red-500';
    if (type.includes('ASSIGN')) return 'bg-blue-500';
    if (type.includes('REGISTER')) return 'bg-purple-500';
    if (type.includes('LOGIN')) return 'bg-slate-500';
    if (type.includes('CREATE')) return 'bg-emerald-500';
    if (type.includes('UPDATE')) return 'bg-yellow-500';
    if (type.includes('DELETE')) return 'bg-red-400';
    return 'bg-slate-500';
}

function formatActionType(type: string) {
    return type.replace(/_/g, ' ');
}

function renderLogDescription(log: any) {
    if (log.action === 'REGISTER_WITH_COACH_CODE') {
        const coachCode = log.meta?.coach_code || '';
        return `Trainee registered with code ${coachCode}`;
    }
    if (log.action === 'ASSIGN_PROGRAM' || log.action === 'ASSIGN_PROGRAM_ADMIN') {
        const actor = log.actor?.full_name || 'Admin';
        const traineeName = log.meta?.user_full_name || log.meta?.user_email || 'a trainee';
        const programTitle = log.meta?.program_title || 'a program';
        return `${actor} assigned "${programTitle}" to ${traineeName}`;
    }
    if (log.action === 'LOGIN') {
        return `Login detected via ${log.meta?.user_agent || 'unknown device'}`;
    }
    if (log.action === 'ACTIVATE_COACH' || log.action === 'DEACTIVATE_COACH') {
        return `Coach status changed by ${log.actor?.full_name || 'Admin'}`;
    }
    
    // Program Changes
    if (log.action === 'UPDATE_PROGRAM') return `Updated program "${log.meta?.title}"`;
    if (log.action === 'DELETE_PROGRAM') return `Deleted program "${log.meta?.title}"`;
    
    // Day Changes
    if (log.action === 'CREATE_DAY') return `Added Day ${log.meta?.day_number} (${log.meta?.title}) to ${log.meta?.program_title ? `program "${log.meta.program_title}"` : 'program'}`;
    if (log.action === 'UPDATE_DAY') return `Updated Day ${log.meta?.day_number} (${log.meta?.title}) in ${log.meta?.program_title ? `program "${log.meta.program_title}"` : 'program'}`;
    if (log.action === 'DELETE_DAY') return `Deleted Day ${log.meta?.day_number} (${log.meta?.title}) from ${log.meta?.program_title ? `program "${log.meta.program_title}"` : 'program'}`;

    // Exercise Changes
    if (log.action === 'CREATE_EXERCISE') return `Added exercise "${log.meta?.name}" to ${log.meta?.program_title ? `program "${log.meta.program_title}"` : 'a program'}`;
    if (log.action === 'UPDATE_EXERCISE') return `Updated exercise "${log.meta?.name}" in ${log.meta?.program_title ? `program "${log.meta.program_title}"` : 'a program'}`;
    if (log.action === 'DELETE_EXERCISE') return `Deleted exercise "${log.meta?.name}" from ${log.meta?.program_title ? `program "${log.meta.program_title}"` : 'a program'}`;

    return JSON.stringify(log.meta);
}
