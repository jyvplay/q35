/**
 * Global shared state — single source of truth for ALL pages.
 *
 * Persistence strategy:
 *  - keys, model, searchDepth, personaSeed → localStorage (survive refresh)
 *  - messages, lastRun, pipelineTrace → sessionStorage (survive tab switch, clear on new session)
 *  - busyState, statuses → in-memory only
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ModelId, ProviderId } from "./models";
import { generatePersona, newSessionSeed, type WilliamsPersona } from "./williams-style";
import type { ExtractedConstraints } from "./constraints";
import type { PipelineTrace } from "./pipeline";
import { emptyTelemetry, type LiveTelemetry } from "./live-telemetry";
import { OMEGA_TEMPLATES, type OmegaTemplate } from "./omega-templates";
import type { SSCPReceipt } from "./sscp";
import type { BeliefState } from "./gbse/types";
import type { RelevanceGraph } from "./gbse/graph";

export type ConnectionStatus = "idle" | "testing" | "connected" | "error";

export interface ApiKeys {
  gemini: string;
  claude: string;
  grok: string;
  deepseek: string;
  jina: string;
  serpapi: string;
  serpapiProxy: string;
  marketData: string;
}

export interface ToolResult {
  title: string;
  url: string;
  content: string;
  phase?: "initial" | "second-pass";
  hypothesis?: string;
  provider?: "jina" | "prismafetch-local" | "browser-scraper";
  tier?: string;
}

export interface GroundedClaim {
  id: string;
  text: string;
  status: "VERIFIED" | "UNVERIFIED";
  sourceIndex?: number;
  failureClass: string;
  solution: string;
}

export interface HypothesisEvidence {
  claim: string;
  searchQuery: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  status: "CONFIRMED" | "UNCONFIRMED";
  sources: ToolResult[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  model?: ModelId;
  injection?: { blocked: boolean; patterns: string[] };
  toolResults?: ToolResult[];
  verificationPlan?: HypothesisEvidence[];
  claims?: GroundedClaim[];
  coherence?: { contradictions: string[]; drifts: string[] };
  constraints?: ExtractedConstraints;
  sanitizerRemovedSegments?: number;
  usedMultiPass?: boolean;
  pipelineTrace?: PipelineTrace[];
  computeRecords?: import("./compute-sandbox").ComputeRecord[];
  entitySheet?: import("./entity-resolver").EntitySheet;
  artifactResponse?: import("./artifacts").ArtifactResponse;
  qualityReport?: import("./quality-score").QualityReport;
  adversarialPasses?: import("./n-deep").NDeepPassSummary[];
}

export interface LastRunSnapshot {
  query: string;
  model: ModelId;
  finalAnswer: string;
  totalTokens: number;
  elapsedMs: number;
  sources: number;
  verifiedClaims: number;
  totalClaims: number;
  constraints?: ExtractedConstraints;
  startedAt: number;
  finishedAt: number;
  pipelineTrace?: PipelineTrace[];
  tier?: number | null;
  artifactResponse?: import("./artifacts").ArtifactResponse;
  measuredCoverage?: number;
  coverageNumerator?: number;
  coverageDenominator?: number;
}

export interface AppSettings {
  deepResearch: boolean; // enable 4-stage multi-pass pipeline
  searchDepth: number;
  showDebugTrace: boolean;
  autoAuditConnectors: boolean;
  templateEnabled: boolean;      // apply an OMEGA template to outputs
  activeTemplateId: string;      // which OMEGA / custom template
  styleMode: string;             // "OMEGA-DEFAULT" or override token
  unifiedMemory: Record<string, any>; // Persistent shared context
  prismafetchEnabled: boolean;
  prismafetchAutoFallback: boolean;
  prismafetchUrl: string;
  prismafetchReadMode: "auto" | "fast_static" | "render_headless" | "visual_only";
  prismafetchOcr: boolean;
  nDeepEnabled: boolean;
  nDeepMaxPasses: number;
  nDeepConvergenceThreshold: number;
  clusterSearch: boolean;        // run all hypothesis searches in one parallel cluster
  clusterSize: number;           // max parallel searches per cluster wave
  forceSloop: boolean;           // SLOOP long-form multi-page report mode
  sloopPages: number;            // target pages for SLOOP long-form mode
}

const DEFAULT_SETTINGS: AppSettings = {
  deepResearch: false,
  searchDepth: 5,
  showDebugTrace: false,
  autoAuditConnectors: false,
  templateEnabled: false,
  activeTemplateId: "OMEGA-STRATEGY",
  styleMode: "OMEGA-DEFAULT",
  unifiedMemory: {},
  prismafetchEnabled: false,
  prismafetchAutoFallback: true,
  prismafetchUrl: "http://127.0.0.1:8080",
  prismafetchReadMode: "auto",
  prismafetchOcr: false,
  nDeepEnabled: false,
  nDeepMaxPasses: 4,
  nDeepConvergenceThreshold: 0.94,
  clusterSearch: true,
  clusterSize: 8,
  forceSloop: false,
  sloopPages: 8,
};

interface AppStateValue {
  messages: ChatMessage[];
  pushMessage: (m: ChatMessage) => void;
  updateLastMessage: (updater: (m: ChatMessage) => ChatMessage) => void;
  clearMessages: () => void;
  input: string;
  setInput: (v: string) => void;
  keys: ApiKeys;
  setKeys: (updater: ApiKeys | ((prev: ApiKeys) => ApiKeys)) => void;
  statuses: Record<ProviderId | "jina" | "prismafetch", ConnectionStatus>;
  setStatus: (provider: ProviderId | "jina" | "prismafetch", status: ConnectionStatus) => void;
  model: ModelId;
  setModel: (m: ModelId) => void;
  persona: WilliamsPersona;
  reseedPersona: (seed?: number) => void;
  personaPinned: boolean;
  setPersonaPinned: (pinned: boolean) => void;
  lastRun: LastRunSnapshot | null;
  setLastRun: (run: LastRunSnapshot | null) => void;
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
  searchDepth: number;
  setSearchDepth: (n: number) => void;
  busyState: string | null;
  setBusyState: (s: string | null) => void;
  debugEvents: string[];
  pushDebugEvent: (msg: string) => void;
  clearDebugEvents: () => void;
  reasoningTrace: any[];
  pushTraceEntry: (entry: any) => void;
  telemetry: LiveTelemetry;
  patchTelemetry: (p: Partial<LiveTelemetry>) => void;
  resetTelemetry: () => void;
  memory: Record<string, any>;
  updateMemory: (patch: Record<string, any>) => void;
  templates: OmegaTemplate[];
  addTemplate: (t: OmegaTemplate) => void;
  deleteTemplate: (id: string) => void;
  sscpReceipt: SSCPReceipt | null;
  setSscpReceipt: (r: SSCPReceipt | null) => void;
  beliefState: BeliefState | null;
  setBeliefState: (s: BeliefState | null) => void;
  relevanceGraph: RelevanceGraph | null;
  setRelevanceGraph: (g: RelevanceGraph | null) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const LS_KEYS = "veritas.keys.v3";
const LS_MODEL = "veritas.model.v3";
const LS_SETTINGS = "veritas.settings.v2";
const LS_SEED = "veritas.persona.seed.v1";
const LS_CUSTOM_TEMPLATES = "veritas.custom.templates.v1";
const SS_MESSAGES = "veritas.messages.v1";
const SS_LASTRUN = "veritas.lastrun.v1";

function ls<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function lsSet(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /**/ } }
function ss<T>(key: string, fallback: T): T {
  try { const raw = sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function ssSet(key: string, v: unknown) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /**/ } }

const DEFAULT_KEYS: ApiKeys = { gemini: "", claude: "", grok: "", deepseek: "", jina: "", serpapi: "", serpapiProxy: "", marketData: "" };

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => ss(SS_MESSAGES, []));
  const [input, setInput] = useState("");
  const [keys, _setKeys] = useState<ApiKeys>(() => ({ ...DEFAULT_KEYS, ...ls<Partial<ApiKeys>>(LS_KEYS, {}) }));
  const [statuses, setStatuses] = useState<Record<ProviderId | "jina" | "prismafetch", ConnectionStatus>>({
    gemini: "idle", claude: "idle", grok: "idle", deepseek: "idle", jina: "idle", prismafetch: "idle",
  });
  const [model, _setModel] = useState<ModelId>(() => ls(LS_MODEL, "gemma-4-31b-it") as ModelId);
  const [personaSeed, setPersonaSeed] = useState<number>(() => ls<number>(LS_SEED, newSessionSeed()));
  const [personaPinned, setPersonaPinned] = useState(false);
  const [lastRun, _setLastRun] = useState<LastRunSnapshot | null>(() => ss(SS_LASTRUN, null));
  const [settings, _setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS, ...ls<Partial<AppSettings>>(LS_SETTINGS, {}) }));
  const [busyState, setBusyState] = useState<string | null>(null);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [reasoningTrace, setReasoningTrace] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(() => emptyTelemetry());
  const [customTemplates, setCustomTemplates] = useState<OmegaTemplate[]>(() => ls<OmegaTemplate[]>(LS_CUSTOM_TEMPLATES, []));
  const [sscpReceipt, setSscpReceipt] = useState<SSCPReceipt | null>(null);
  const [beliefState, setBeliefState] = useState<BeliefState | null>(null);
  const [relevanceGraph, setRelevanceGraph] = useState<RelevanceGraph | null>(null);
  const [memory, setMemory] = useState<Record<string, any>>(() => ls("veritas.memory.v1", {}));

  const persona = useMemo(() => generatePersona(personaSeed), [personaSeed]);

  const templates = useMemo(() => [...OMEGA_TEMPLATES, ...customTemplates], [customTemplates]);

  const patchTelemetry = useCallback((p: Partial<LiveTelemetry>) => {
    setTelemetry(prev => ({ ...prev, ...p }));
  }, []);
  const resetTelemetry = useCallback(() => setTelemetry(emptyTelemetry()), []);

  const addTemplate = useCallback((t: OmegaTemplate) => {
    setCustomTemplates(prev => {
      const next = [...prev.filter(x => x.id !== t.id), t];
      lsSet(LS_CUSTOM_TEMPLATES, next);
      return next;
    });
  }, []);
  const deleteTemplate = useCallback((id: string) => {
    setCustomTemplates(prev => {
      const next = prev.filter(x => x.id !== id);
      lsSet(LS_CUSTOM_TEMPLATES, next);
      return next;
    });
  }, []);

  const updateMemory = useCallback((patch: Record<string, any>) => {
    setMemory(prev => {
      const next = { ...prev, ...patch };
      lsSet("veritas.memory.v1", next);
      return next;
    });
  }, []);

  // Persist messages to sessionStorage — trim heavy fields to prevent OOM
  useEffect(() => {
    try {
      const trimmed = messages.map(m => ({
        ...m,
        toolResults: m.toolResults?.map(tr => ({
          ...tr,
          content: tr.content?.slice(0, 200) ?? "",
        })),
        pipelineTrace: undefined,
        entitySheet: undefined,
        computeRecords: undefined,
      }));
      ssSet(SS_MESSAGES, trimmed);
    } catch {
      try {
        ssSet(SS_MESSAGES, messages.slice(-6).map(m => ({
          id: m.id, role: m.role, content: m.content.slice(0, 2000),
          ts: m.ts, model: m.model,
        })));
      } catch { /* give up on persistence */ }
    }
  }, [messages]);

  useEffect(() => {
    if (!telemetry.running) return;
    const id = window.setInterval(() => {
      setTelemetry(prev => prev.running ? { ...prev, elapsedMs: Date.now() - prev.startedAt } : prev);
    }, 200);
    return () => {
      window.clearInterval(id);
    };
  }, [telemetry.running]);

  const setKeys = useCallback((updater: ApiKeys | ((prev: ApiKeys) => ApiKeys)) => {
    _setKeys(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      lsSet(LS_KEYS, next);
      return next;
    });
  }, []);

  const setModel = useCallback((m: ModelId) => { _setModel(m); lsSet(LS_MODEL, m); }, []);

  const setStatus = useCallback((provider: ProviderId | "jina" | "prismafetch", status: ConnectionStatus) => {
    setStatuses(prev => ({ ...prev, [provider]: status }));
  }, []);

  const pushMessage = useCallback((m: ChatMessage) => {
    setMessages(prev => [...prev, m]);
  }, []);

  const updateLastMessage = useCallback((updater: (m: ChatMessage) => ChatMessage) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);

  const clearMessages = useCallback(() => { setMessages([]); ssSet(SS_MESSAGES, []); }, []);

  const reseedPersona = useCallback((seed?: number) => {
    if (personaPinned && seed === undefined) return;
    const s = seed ?? newSessionSeed();
    setPersonaSeed(s);
    lsSet(LS_SEED, s);
  }, [personaPinned]);

  const setLastRun = useCallback((run: LastRunSnapshot | null) => {
    _setLastRun(run);
    ssSet(SS_LASTRUN, run);
  }, []);

  const setSetting = useCallback(<K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    _setSettings(prev => { const next = { ...prev, [k]: v }; lsSet(LS_SETTINGS, next); return next; });
  }, []);

  const pushDebugEvent = useCallback((msg: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${String(msg)}`;
    setDebugEvents(prev => {
      const next = [...prev.slice(-199), line];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
    setReasoningTrace([]);
  }, []);

  const pushTraceEntry = useCallback((entry: any) => {
    const safeEntry = JSON.parse(JSON.stringify(entry));
    setReasoningTrace(prev => {
      const next = [...prev, { ...safeEntry, ts: Date.now() }];
      return next.length > 300 ? next.slice(-300) : next;
    });
  }, []);

  const searchDepth = settings.searchDepth;
  const setSearchDepth = useCallback((n: number) => setSetting("searchDepth", n), [setSetting]);

  const value = useMemo<AppStateValue>(() => ({
    messages, pushMessage, updateLastMessage, clearMessages,
    input, setInput,
    keys, setKeys,
    statuses, setStatus,
    model, setModel,
    persona, reseedPersona, personaPinned, setPersonaPinned,
    lastRun, setLastRun,
    settings, setSetting,
    searchDepth, setSearchDepth,
    busyState, setBusyState,
    debugEvents, pushDebugEvent, clearDebugEvents,
    reasoningTrace, pushTraceEntry,
    telemetry, patchTelemetry, resetTelemetry,
    templates, addTemplate, deleteTemplate,
    sscpReceipt, setSscpReceipt,
    beliefState, setBeliefState, relevanceGraph, setRelevanceGraph,
    memory, updateMemory,
  }), [
    messages, pushMessage, updateLastMessage, clearMessages,
    input,
    keys, setKeys,
    statuses, setStatus,
    model, setModel,
    persona, reseedPersona, personaPinned,
    lastRun, setLastRun,
    settings, setSetting,
    searchDepth, setSearchDepth,
    busyState,
    debugEvents, pushDebugEvent, clearDebugEvents,
    reasoningTrace, pushTraceEntry,
    telemetry, patchTelemetry, resetTelemetry,
    templates, addTemplate, deleteTemplate,
    sscpReceipt,
    beliefState, relevanceGraph,
    memory, updateMemory,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be inside AppStateProvider");
  return ctx;
}
