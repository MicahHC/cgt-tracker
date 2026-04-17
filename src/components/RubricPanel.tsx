import { REGULATORY_RUBRIC, COMMERCIAL_INFRA_RUBRIC, MARKET_ATTRACTIVENESS_RUBRIC, CAPABILITY_GAP_RUBRIC } from '../lib/scoring';

export function RubricPanel() {
  return (
    <div className="space-y-5">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 text-sm mb-2">Scoring formulas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-teal-700 font-semibold">Commercial Readiness</div>
            <div className="mt-1 font-mono text-xs bg-white border border-teal-200 rounded p-2">
              (Regulatory × 0.40 + Commercial Infra × 0.35 + Market × 0.25) × 20
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div>· Clinical hold → cap at 30</div>
              <div>· No manufacturing pathway → cap at 40</div>
              <div>· Timeline &gt; 24 months → cap at 50</div>
              <div>· No US path → score 0 and exclude</div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-teal-700 font-semibold">Strategic Opportunity</div>
            <div className="mt-1 font-mono text-xs bg-white border border-teal-200 rounded p-2">
              (Regulatory × 0.40 + Market × 0.30 + Capability Gap × 0.30) × 20
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div>Tier 1: ≥ 80 · Tier 2: 65-79 · Watchlist: 50-64 · Deprioritized: &lt; 50</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Rubric title="Regulatory Score" rubric={REGULATORY_RUBRIC} />
        <Rubric title="Commercial Infrastructure Score" rubric={COMMERCIAL_INFRA_RUBRIC} />
        <Rubric title="Market Attractiveness Score" rubric={MARKET_ATTRACTIVENESS_RUBRIC} />
        <Rubric title="Capability Gap Leverage Score" rubric={CAPABILITY_GAP_RUBRIC} />
      </div>
    </div>
  );
}

function Rubric({ title, rubric }: { title: string; rubric: Record<number, string> }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-3 text-sm">{title}</h3>
      <div className="space-y-2">
        {Object.entries(rubric).sort(([a], [b]) => Number(b) - Number(a)).map(([score, desc]) => (
          <div key={score} className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
              {score}
            </div>
            <div className="text-sm text-slate-700 pt-0.5">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
