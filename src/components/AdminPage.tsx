import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtUser } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { Users, Upload, BookOpen, ShieldAlert } from 'lucide-react';
import { ImportWizard } from './ImportWizard';
import { RubricPanel } from './RubricPanel';

type AdminTab = 'import' | 'users' | 'rubric';

export function AdminPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState<AdminTab>('import');

  if (role !== 'admin') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Admin access required</h2>
        <p className="text-sm text-slate-500">You need the admin role to view this page. Ask an existing admin to promote your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="text-slate-500 text-sm mt-1">Data imports, user management, and scoring reference.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-1.5 inline-flex gap-1">
        <TabBtn active={tab === 'import'} onClick={() => setTab('import')} icon={Upload} label="Import" />
        <TabBtn active={tab === 'users'} onClick={() => setTab('users')} icon={Users} label="Users" />
        <TabBtn active={tab === 'rubric'} onClick={() => setTab('rubric')} icon={BookOpen} label="Scoring rubric" />
      </div>

      {tab === 'import' && <ImportWizard />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'rubric' && <RubricPanel />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Users; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<CgtUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('cgt_users').select('*').order('created_at', { ascending: false });
    setUsers((data as CgtUser[]) || []);
    setLoading(false);
  }

  async function updateRole(id: string, role: string) {
    await supabase.from('cgt_users').update({ role }).eq('id', id);
    load();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('cgt_users').update({ is_active: active }).eq('id', id);
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Users ({users.length})</div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Role</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map(u => (
            <tr key={u.id}>
              <td className="px-4 py-3 text-slate-900 font-medium">{u.name || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{u.email}</td>
              <td className="px-4 py-3">
                <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded bg-white">
                  <option value="admin">admin</option>
                  <option value="analyst">analyst</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggleActive(u.id, !u.is_active)}
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                    u.is_active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  {u.is_active ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
