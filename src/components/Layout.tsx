import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Dna, LayoutDashboard, Package, Building2, ClipboardList, LineChart,
  CalendarClock, Settings, LogOut, ChevronRight, Gauge, Newspaper, Layers, Radar
} from 'lucide-react';
import { fetchLatestBriefMeta, getLastSeenBriefSignature } from '../lib/weeklyBrief';

export type PageKey =
  | 'dashboard' | 'assets' | 'companies' | 'scoring' | 'changelog'
  | 'scorehistory' | 'catalysts' | 'weeklybrief' | 'abmaudience' | 'marketintelligence' | 'admin';

const NAV: { key: PageKey; label: string; icon: typeof Dna }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'weeklybrief', label: 'Weekly Brief', icon: Newspaper },
  { key: 'abmaudience', label: 'ABM Audience', icon: Layers },
  { key: 'marketintelligence', label: 'Market Intelligence', icon: Radar },
  { key: 'scoring', label: 'Scoring', icon: Gauge },
  { key: 'assets', label: 'Assets', icon: Package },
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'changelog', label: 'Change Log', icon: ClipboardList },
  { key: 'scorehistory', label: 'Score History', icon: LineChart },
  { key: 'catalysts', label: 'Upcoming Catalysts', icon: CalendarClock },
  { key: 'admin', label: 'Admin', icon: Settings },
];

interface LayoutProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
}

export function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const { profile, role, signOut } = useAuth();
  const roleColor = role === 'admin' ? 'bg-teal-100 text-teal-700'
    : role === 'analyst' ? 'bg-blue-100 text-blue-700'
    : 'bg-slate-100 text-slate-600';

  const [briefBadge, setBriefBadge] = useState<number>(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const { latestWeek, changeCount, scoreCount, signature } = await fetchLatestBriefMeta();
      if (!active) return;
      const lastSeen = getLastSeenBriefSignature();
      if (latestWeek && signature && signature !== lastSeen) {
        setBriefBadge(changeCount + scoreCount || 1);
      } else {
        setBriefBadge(0);
      }
    }
    refresh();
    const onSeen = () => setBriefBadge(0);
    window.addEventListener('cgt:weekly-brief-seen', onSeen);
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      active = false;
      window.removeEventListener('cgt:weekly-brief-seen', onSeen);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
              <Dna className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm leading-tight">CGT Intelligence</div>
              <div className="text-[11px] text-slate-500">Commercial tracker</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.key;
            const showBadge = item.key === 'weeklybrief' && briefBadge > 0;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                  active
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {showBadge && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-teal-600 text-white text-[10px] font-bold leading-none animate-pulse"
                    aria-label={`${briefBadge} new updates`}
                  >
                    {briefBadge > 99 ? '99+' : briefBadge}
                  </span>
                )}
                {active && !showBadge && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-slate-200">
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-slate-900 truncate">{profile?.name || profile?.email || 'User'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${roleColor}`}>
                {role}
              </span>
              <span className="text-xs text-slate-500 truncate">{profile?.email}</span>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-700"><Dna className="h-4 w-4 text-white" /></div>
          <span className="text-sm font-semibold text-slate-900">CGT Intelligence</span>
        </div>
        <select
          value={currentPage}
          onChange={(event) => onNavigate(event.target.value as PageKey)}
          aria-label="Navigate CGT Intelligence"
          className="max-w-[168px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
        >
          {NAV.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
