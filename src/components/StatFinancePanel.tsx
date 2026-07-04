import { useState, useCallback } from "react";
import { getWorkerPool } from "../lib/worker-pool";

type Tab = "finance" | "causal" | "power";

export function StatFinancePanel() {
  const [tab, setTab] = useState<Tab>("finance");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const executeCompute = useCallback(async (fn: string, args: any[]) => {
    setLoading(true);
    try {
      const pool = getWorkerPool();
      const result = await pool.enqueue({
        id: crypto.randomUUID(),
        type: "compute",
        payload: { fn, args },
      });
      setResults(result.result);
    } catch (error: any) {
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between bg-zinc-50">
        <span className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Stat & Finance Engine</span>
        <div className="flex gap-1">
          {([["finance", "Finance"], ["causal", "Causal"], ["power", "NIH Power"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${tab === id ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === "finance" && <FinanceTab execute={executeCompute} loading={loading} results={results} />}
        {tab === "causal" && <CausalTab execute={executeCompute} loading={loading} results={results} />}
        {tab === "power" && <PowerTab execute={executeCompute} loading={loading} results={results} />}
      </div>
    </div>
  );
}

function FinanceTab({ execute, loading, results }: { execute: (fn: string, args: any[]) => void, loading: boolean, results: any }) {
  const [heston, setHeston] = useState({ s0: 100, k: 100, v0: 0.04, kappa: 2.0, theta: 0.04, sigma: 0.3, rho: -0.7, tau: 0.5, r: 0.05 });
  const [sabr, setSabr] = useState({ f: 0.05, k: 0.05, t: 1.0, alpha: 0.2, beta: 0.5, rho: -0.3, nu: 0.4 });

  const runHeston = () => execute("heston", [heston.s0, heston.k, heston.v0, heston.kappa, heston.theta, heston.sigma, heston.rho, heston.tau, heston.r]);
  const runSabr = () => execute("sabr", [sabr.f, sabr.k, sabr.t, sabr.alpha, sabr.beta, sabr.rho, sabr.nu]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <div className="text-xs font-bold text-zinc-900 uppercase">Heston Stochastic Volatility</div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="S0 (Spot)" v={heston.s0} setV={v => setHeston({...heston, s0: v})} />
          <Input label="K (Strike)" v={heston.k} setV={v => setHeston({...heston, k: v})} />
          <Input label="v0 (Initial Var)" v={heston.v0} setV={v => setHeston({...heston, v0: v})} step={0.01} />
          <Input label="kappa (Mean Rev)" v={heston.kappa} setV={v => setHeston({...heston, kappa: v})} step={0.1} />
        </div>
        <button onClick={runHeston} disabled={loading} className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50">
          {loading ? "Computing..." : "Compute Heston Price"}
        </button>
        {results && !loading && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="text-xs font-bold text-zinc-500 uppercase mb-1">Heston Call Price</div>
            <div className="text-lg font-mono font-bold text-emerald-700">
              ${typeof results === "number" ? results.toFixed(4) : "Computation Error"}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-zinc-900 uppercase">SABR Volatility Smile</div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="F (Forward)" v={sabr.f} setV={v => setSabr({...sabr, f: v})} step={0.005} />
          <Input label="K (Strike)" v={sabr.k} setV={v => setSabr({...sabr, k: v})} step={0.005} />
          <Input label="alpha (Vol level)" v={sabr.alpha} setV={v => setSabr({...sabr, alpha: v})} step={0.01} />
          <Input label="nu (Vol-of-Vol)" v={sabr.nu} setV={v => setSabr({...sabr, nu: v})} step={0.05} />
        </div>
        <button onClick={runSabr} disabled={loading} className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50">
          {loading ? "Computing..." : "Compute SABR Vol"}
        </button>
        {results && !loading && (
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
            <div className="text-xs font-bold text-zinc-500 uppercase mb-1">SABR Implied Volatility</div>
            <div className="text-lg font-mono font-bold text-sky-700">
              {(typeof results === "number" ? results * 100 : 0).toFixed(2)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CausalTab({ execute, loading, results }: { execute: (fn: string, args: any[]) => void, loading: boolean, results: any }) {
  const [n, setN] = useState(200);
  const [ate, setAte] = useState(0.35);

  const runDML = () => execute("dml", [[], [], []]); // Simplified for demo

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold text-zinc-900 uppercase">Double Machine Learning (DML)</div>
      <p className="text-[11px] text-zinc-500">Estimates Average Treatment Effect (ATE) while partialing out high-dimensional confounders.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="Sample Size (N)" v={n} setV={setN} step={50} />
        <Input label="Target ATE" v={ate} setV={setAte} step={0.05} />
      </div>
      <button onClick={runDML} disabled={loading} className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50">
        {loading ? "Computing..." : "Run DML"}
      </button>
      {results && !loading && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs">
          <div className="font-bold text-zinc-500 uppercase mb-2">Double ML Results</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500">Estimated ATE:</span>
              <span className="font-mono font-bold text-indigo-700">{results.ate?.toFixed(4) || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">p-value:</span>
              <span className="font-mono font-bold text-indigo-700">{results.pValue?.toFixed(4) || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">95% CI:</span>
              <span className="font-mono font-bold text-indigo-700">[{results.ci?.[0]?.toFixed(4) || "N/A"}, {results.ci?.[1]?.toFixed(4) || "N/A"}]</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PowerTab({ execute, loading, results }: { execute: (fn: string, args: any[]) => void, loading: boolean, results: any }) {
  const [n, setN] = useState(400);
  const [m, setM] = useState(20);
  const [icc, setIcc] = useState(0.05);

  const runPower = () => execute("power", [n, m, icc, 0.5]);

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold text-zinc-900 uppercase">ICC-Adjusted Sample Size (NIH Fix)</div>
      <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">
        <strong>Red Team Note:</strong> Without adjusting for Intraclass Correlation (ICC) in multi-site designs, power is overestimated.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input label="Nominal N" v={n} setV={setN} step={50} />
        <Input label="Cluster Size (m)" v={m} setV={setM} step={5} />
        <Input label="ICC (rho)" v={icc} setV={setIcc} step={0.01} max={1} />
      </div>
      <button onClick={runPower} disabled={loading} className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50">
        {loading ? "Computing..." : "Calculate Power"}
      </button>
      {results && !loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-3">
            <div className="text-[10px] uppercase text-zinc-400 font-bold mb-1">Effective N</div>
            <div className="text-lg font-mono font-bold text-zinc-900">{results.nEffective?.toFixed(1) || "N/A"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-3">
            <div className="text-[10px] uppercase text-zinc-400 font-bold mb-1">Design Effect (DEFF)</div>
            <div className="text-lg font-mono font-bold text-zinc-900">{results.deff?.toFixed(2) || "N/A"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ label, v, setV, step = 1, max }: { label: string, v: number, setV: (n: number) => void, step?: number, max?: number }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-zinc-400 uppercase">{label}</span>
      <input type="number" value={v} step={step} max={max} onChange={e => setV(Number(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-mono" />
    </label>
  );
}
