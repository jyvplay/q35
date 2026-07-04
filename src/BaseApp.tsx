import { useState } from "react";
import { ChatApp } from "./components/ChatApp";
import { GBSDashboard } from "./components/GBSDashboard";
import { ResourceEstimatorPage } from "./components/ResourceEstimatorPage";
import { ControlPlanePage } from "./components/ControlPlanePage";
import { AdaptersPage } from "./components/AdaptersPage";
import { TemplatesPage } from "./components/TemplatesPage";
import { ModulesPage } from "./components/ModulesPage";
import { AppStateProvider, useAppState } from "./lib/app-state";
import { MemoryInspector } from "./components/MemoryInspector";
import { AdversarialPanel } from "./components/AdversarialPanel";
import { LiveResourceHUD } from "./components/LiveResourceHUD";
import { extractConstraints, summarizeConstraints } from "./lib/constraints";

type Tab = "chat" | "gbse" | "estimator" | "control" | "adapters" | "templates" | "modules" | "memory" | "adversarial";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "gbse", label: "Dashboard", icon: "🔬" },
  { id: "estimator", label: "Estimator", icon: "📊" },
  { id: "templates", label: "Templates", icon: "📋" },
  { id: "modules", label: "Modules", icon: "🧩" },
  { id: "control", label: "Control", icon: "⚙️" },
  { id: "adapters", label: "Adapters", icon: "🔌" },
  { id: "adversarial", label: "Adversarial", icon: "⚔️" },
  { id: "memory", label: "Memory", icon: "🧠" },
];

function Shell() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [submitToken, setSubmitToken] = useState(0);
  const { input, setInput, lastRun, persona, busyState, settings } = useAppState();

  const triggerSubmit = () => {
    if (!input.trim()) return;
    setActiveTab("chat");
    setSubmitToken(t => t + 1);
  };

  const constraints = input.trim() ? extractConstraints(input) : null;

  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900 overflow-hidden">
      {/* Global header */}
      <header className="flex-none border-b border-zinc-200 bg-white shadow-sm z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 font-bold text-white text-sm">V</div>
            <div>
              <div className="text-base font-bold text-zinc-900">VeritasChat + GBSE</div>
              <div className="text-[11px] text-zinc-500">Shared state · constraints · 126 defenses · 4-stage pipeline</div>
            </div>
          </div>
          {/* Tab navigation */}
          <nav className="flex items-center gap-0.5 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === t.id ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                }`}
              >
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Global status bar */}
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-1">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>uninode: hybrid</span>
            </div>
            <span className="text-zinc-300">|</span>
            <span className="text-zinc-400">style:</span>
            <span className="font-semibold text-indigo-700">{persona.archetype.name}</span>
            {constraints && (
              <>
                <span className="text-zinc-300">|</span>
                <span className="text-zinc-400">constraints:</span>
                <span className="font-mono text-zinc-700">{summarizeConstraints(constraints)}</span>
              </>
            )}
            {lastRun && (
              <>
                <span className="text-zinc-300">|</span>
                <span className="text-zinc-400">last run:</span>
                <span className="font-mono text-zinc-700">
                  {lastRun.verifiedClaims}/{lastRun.totalClaims} verified · {lastRun.sources} sources · {(lastRun.elapsedMs / 1000).toFixed(1)}s
                </span>
              </>
            )}
            {settings.deepResearch && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-bold text-indigo-800">4-Stage ON</span>
            )}
          </div>
            {busyState && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                {busyState}
              </span>
            )}
          </div>
        </div>

        {/* Global shared input bar (visible on all non-chat pages) */}
        {activeTab !== "chat" && (
          <div className="border-t border-zinc-200 bg-white px-4 py-3">
            <div className="mx-auto max-w-7xl">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) triggerSubmit(); }}
                  placeholder="Shared input — type here or in Chat. ⌘↩ to submit and switch to Chat tab."
                  className="min-h-[40px] flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={triggerSubmit}
                  disabled={!input.trim() || busyState !== null}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-30 whitespace-nowrap"
                >
                  Ground & Answer
                </button>
              </div>
              {constraints && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {constraints.timeHorizon && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-800">
                      horizon: {constraints.timeHorizon.value} {constraints.timeHorizon.unit}
                    </span>
                  )}
                  {constraints.explicitComparisonTargets.map(t => (
                    <span key={t} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-800">focus: {t}</span>
                  ))}
                  {constraints.domain && constraints.domain !== "general" && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-mono font-bold text-violet-800">domain: {constraints.domain}</span>
                  )}
                  {constraints.isShortHorizon && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-800">tactical · 1yr targets excluded</span>
                  )}
                  {constraints.formatHints.map(h => (
                    <span key={h} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-700">fmt: {h}</span>
                  ))}
                </div>
              )}
              <div className="mt-1 text-[11px] text-zinc-400">
                Same input shared with Dashboard · Estimator · Control Plane. Submitting here routes to Chat.
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "chat" && <ChatApp onSubmitFromShared={submitToken} />}
        {activeTab === "gbse" && (
          <div className="mx-auto max-w-7xl px-4 py-6">
            <LiveResourceHUD />
            <div className="mt-4">
              <GBSDashboard />
            </div>
          </div>
        )}
        {activeTab === "estimator" && (
          <div className="mx-auto max-w-7xl px-4 py-6">
            <LiveResourceHUD />
            <div className="mt-4">
              <ResourceEstimatorPage />
            </div>
          </div>
        )}
        {activeTab === "templates" && <TemplatesPage />}
        {activeTab === "modules" && <ModulesPage />}
        {activeTab === "control" && <ControlPlanePage />}
        {activeTab === "adapters" && <AdaptersPage />}
        {activeTab === "adversarial" && (
          <div className="mx-auto max-w-7xl px-4 py-6">
            <AdversarialPanel />
          </div>
        )}
        {activeTab === "memory" && (
          <div className="mx-auto max-w-7xl px-4 py-6">
            <MemoryInspector />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
