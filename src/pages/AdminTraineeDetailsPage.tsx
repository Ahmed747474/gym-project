import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AssignmentDetailsModal from '../components/AssignmentDetailsModal';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { supabase } from '../lib/supabase';

export default function AdminTraineeDetailsPage() {
  const { traineeId } = useParams<{ traineeId: string }>();
  const [trainee, setTrainee] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'programs' | 'history'>('programs');

  useEffect(() => {
    if (traineeId) fetchData();
  }, [traineeId]);

  const fetchData = async () => {
    setLoading(true);
    // 1. Fetch Trainee Profile
    const { data: traineeData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', traineeId)
      .single();

    if (error) {
       console.error(error);
       setLoading(false);
       return;
    }
    setTrainee(traineeData);

    // 2. Fetch Assignments History
    const { data: assignmentsData } = await supabase
        .from('user_program_assignments')
        .select(`
            *,
            program:programs(title),
            coach:profiles!coach_id(full_name)
        `)
        .eq('user_id', traineeId)
        .order('created_at', { ascending: false });
    
    setAssignments(assignmentsData || []);

    // 3. Fetch Audit Logs
    const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*, actor:profiles!actor_id(email, full_name)')
        .or(`actor_id.eq.${traineeId},target_id.eq.${traineeId}`)
        .order('created_at', { ascending: false });
    setLogs(logsData || []);

    setLoading(false);
  };

  if (loading) return <Layout title="Trainee Details"><LoadingSpinner /></Layout>;
  if (!trainee) return <Layout title="Trainee Details"><div className="p-4 text-white">Trainee not found</div></Layout>;

  return (
    <Layout title="Trainee Details" showBack>
      <div className="p-4 pb-20">
         <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">{trainee.full_name}</h1>
            <p className="text-slate-400">{trainee.email}</p>
            <div className="mt-2 text-sm text-slate-500">
                Joined: {dayjs(trainee.created_at).format('MMM D, YYYY')}
            </div>
         </div>

         {/* Tabs */}
         <div className="flex gap-4 border-b border-slate-700 mb-6">
            <button 
                onClick={() => setActiveTab('programs')}
                className={`pb-2 px-2 capitalize ${activeTab === 'programs' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
            >
                Programs
            </button>
            <button 
                onClick={() => setActiveTab('history')}
                className={`pb-2 px-2 capitalize ${activeTab === 'history' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
            >
                Activity Log
            </button>
         </div>

         {activeTab === 'programs' && (
             <div className="space-y-4">
                <h2 className="text-xl font-bold text-white mb-4">Program History</h2>
                {assignments.map(assign => (
                    <div key={assign.id} className="bg-slate-800 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">{assign.program?.title || 'Unknown Program'}</h3>
                                <p className="text-sm text-slate-500">Assigned by: {assign.coach?.full_name || 'System'}</p>
                                <div className="flex gap-2 mt-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                        assign.state === 'active' ? 'bg-blue-500/20 text-blue-400' : 
                                        assign.state === 'completed' ? 'bg-green-500/20 text-green-400' : 
                                        'bg-slate-700 text-slate-400'
                                    }`}>
                                        {assign.state}
                                    </span>
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-sm text-slate-400">
                                    {dayjs(assign.start_date || assign.created_at).format('MMM D, YYYY')} 
                                    {' - '}
                                    {dayjs(assign.end_date).format('MMM D, YYYY')}
                                 </p>
                            </div>
                        </div>
                        
                        <div className="border-t border-slate-700 pt-4 flex justify-end">
                            <button 
                                onClick={() => setSelectedAssignment(assign)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                            >
                                View Progress / Details
                            </button>
                        </div>
                    </div>
                ))}
                {assignments.length === 0 && (
                    <p className="text-slate-500">No program history found.</p>
                )}
             </div>
         )}

         {activeTab === 'history' && (
             <div className="space-y-4">
                 <h3 className="text-white font-medium mb-2">Activity Log</h3>
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
    if (type.includes('COMPLETED')) return 'bg-green-500';
    if (type.includes('UNCOMPLETED')) return 'bg-yellow-500';
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
        return `${actor} assigned a program`;
    }
    if (log.action === 'LOGIN') {
        return `Login detected via ${log.meta?.user_agent || 'unknown device'}`;
    }
    if (log.action === 'EXERCISE_COMPLETED') {
        const { exercise_name, day_title, day_number } = log.meta || {};
        return `Completed exercise "${exercise_name}" in Day ${day_number}: ${day_title}`;
    }
    if (log.action === 'EXERCISE_UNCOMPLETED') {
        const { exercise_name, day_number } = log.meta || {};
        return `Unmarked exercise "${exercise_name}" in Day ${day_number}`;
    }
    if (log.action === 'DAY_COMPLETED') {
        const { day_number, day_title, program_title } = log.meta || {};
        return `Completed Day ${day_number}: ${day_title} in "${program_title}"`;
    }
    if (log.action === 'REPEAT_COMPLETED') {
        const { repeat_no, program_title } = log.meta || {};
        return `Completed Repeat #${repeat_no} of "${program_title}"`;
    }
    if (log.action === 'PROGRAM_COMPLETED') {
        const { program_title } = log.meta || {};
        return `Completed Program "${program_title}"`;
    }
    return JSON.stringify(log.meta);
}
