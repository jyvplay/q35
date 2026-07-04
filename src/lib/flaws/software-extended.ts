/**
 * Software Engineering & AI Codegen Pack — v15.1
 * - Deduplicated soft.swift-actor-protocol-mismatch (was declared twice)
 * - Added V13-V15 web-verified detectors: CORS wildcard, debug endpoint leak,
 *   Rust tokio::select cancel-unsafe, Rust blocking-in-async, npm prod sourcemap.
 * - Added soft.node-then-without-catch (V14 distinct from unhandled-promise).
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (s: FlawIssue["severity"], c: string, m: string, r: string): FlawIssue => ({ severity: s, code: c, message: m, remediation: r });

function T(c: ScanContext): string { return `${c.prompt}\n${c.answer}`; }
function isNode(c: ScanContext) { return /\b(Node\.js|Express|Fastify|Koa|http\.createServer|app\.get|app\.post|router)\b/i.test(T(c)); }
function isPython(c: ScanContext) { return /\b(python|flask|django|fastapi|\.py\b|def\s+\w+\s*\()\b/i.test(T(c)); }
function isGo(c: ScanContext) { return /\b(go\s+func|goroutine|chan\s+\w+|<-\s*\w+|make\s*\(\s*chan)\b/i.test(T(c)); }
function isRust(c: ScanContext) { return /\b(rust|tokio|\.await|async\s+fn|cargo|impl|trait)\b/i.test(T(c)); }
function isSwift(c: ScanContext) { return /\b(Swift|SwiftUI|UIKit|@MainActor|Actor|Sendable)\b/i.test(T(c)); }
function isTailwind(c: ScanContext) { return /\b(tailwind|className|class=)\b/i.test(T(c)); }
function isWebContext(c: ScanContext) { return /\b(cors|Access-Control-Allow-Origin|express|fastify|koa|fetch|api endpoint|http server|route)\b/i.test(T(c)); }

export const SOFTWARE_EXTENDED_FLAWS: FlawDetector[] = [
  // ── Node.js ───────────────────────────────────────────────────────────────
  { id: "soft.node-event-loop-blocking", domain: "domain", appliesTo: isNode, scan: c => /\b(app\.(?:get|post|put|delete|patch)|router\.(?:get|post)|server\.on\(['"]request)\b[\s\S]{0,500}\b(fs\.(?:readFileSync|writeFileSync|existsSync)|execSync|spawnSync|child_process\.execSync)\b/i.test(T(c)) ? [mk("major", "NODE_EVENT_LOOP_BLOCKING", "Synchronous blocking call inside a request handler — stalls the entire event loop.", "Move CPU/blocking I/O to worker_threads or libuv pool (async fs).")] : [] },
  { id: "soft.node-pipeline-http-destroy", domain: "domain", appliesTo: isNode, scan: c => /\bpipeline\s*\([\s\S]{0,300}\b(?:res|response)\b[\s\S]{0,200}(?:err|error)\s*(?:=>|\))/i.test(T(c)) && /\b(?:res|response)\.(?:end|send|status|writeHead|json)\s*\(/i.test(T(c)) && !/\b(?:source|file|readStream)\.on\s*\(\s*['"]error['"]/i.test(T(c)) ? [mk("major", "NODE_PIPELINE_HTTP_DESTROY", "stream.pipeline() destroys the destination socket on error — fallback res.end() is unreachable.", "Handle source stream errors separately before pipeline().")] : [] },
  { id: "soft.node-cjs-esm-interop", domain: "domain", appliesTo: isNode, scan: c => { const esm = /"type"\s*:\s*"module"|\.mjs\b/i.test(T(c)); const cjs = /\b(__dirname|__filename|module\.exports\s*=|require\s*\()\b/i.test(T(c)); return esm && cjs ? [mk("major", "NODE_CJS_ESM_INTEROP", "CJS globals (__dirname, require, module.exports) used in ESM context.", "Use import.meta.url + fileURLToPath() for __dirname, import for require, export for module.exports.")] : []; } },
  { id: "soft.node-toctou-fs", domain: "domain", appliesTo: isNode, scan: c => /\bfs\.(?:access|exists|existsSync)\s*\([\s\S]{0,200}\bfs\.(?:open|readFile|writeFile|appendFile|createWriteStream|createReadStream)\b/i.test(T(c)) ? [mk("major", "NODE_FS_TOCTOU", "fs.access()/exists() check before open/read/write — TOCTOU race condition.", "Open/read/write directly and handle ENOENT/EACCES atomically.")] : [] },
  { id: "soft.node-unhandled-promise", domain: "domain", appliesTo: isNode, scan: c => /\b(Promise\.all|Promise\.race|Promise\.allSettled)\s*\([\s\S]{0,300}\)\s*;/i.test(T(c)) && !/\.(catch|finally)\s*\(/.test(T(c)) && !/\bawait\b[\s\S]{0,50}\bPromise\.\b/i.test(T(c)) ? [mk("major", "NODE_UNHANDLED_PROMISE_REJECTION", "Promise combinator launched without .catch() or await.", "Await the Promise combinator or append .catch().")] : [] },
  { id: "soft.node-then-without-catch", domain: "domain", appliesTo: isNode, scan: c => { const thenChain = /\.then\s*\(\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>[\s\S]{0,200}\)\s*(?:;|\n|$)/i.test(c.answer); const hasCatch = /\.catch\s*\(|\.then\s*\([^,]+,\s*(?:async\s*)?(?:\(|\w+\s*=>)|\bawait\s+/i.test(c.answer); const global = /\bprocess\.on\s*\(\s*['"]unhandledRejection['"]/i.test(c.answer); return thenChain && !hasCatch && !global ? [mk("major", "NODE_THEN_WITHOUT_CATCH", ".then() chain has no .catch() handler — rejected promises become unhandledRejection.", "Append .catch(err => ...) or convert to async/await with try/catch.")] : []; } },
  { id: "soft.node-setmaxlisteners-mask", domain: "domain", appliesTo: isNode, scan: c => /\.setMaxListeners\s*\(\s*(?:0|Infinity)\s*\)/i.test(T(c)) ? [mk("major", "NODE_SETMAXLISTENERS_MASK", "setMaxListeners(0/Infinity) silences the EventEmitter leak warning without fixing the underlying leak.", "Fix listener ownership/cleanup; never disable the warning.")] : [] },
  { id: "soft.node-http-timeout-missing", domain: "domain", appliesTo: isNode, scan: c => /\b(http\.createServer|https\.createServer|app\.listen)\b/i.test(T(c)) && /\b(?:production|prod|server|api|express|fastify|koa)\b/i.test(T(c)) && !/\b(?:requestTimeout|headersTimeout|keepAliveTimeout|server\.timeout\s*=)/i.test(T(c)) ? [mk("warning", "NODE_HTTP_TIMEOUT_MISSING", "HTTP server without explicit timeout policy.", "Set server.requestTimeout, headersTimeout, keepAliveTimeout deliberately.")] : [] },
  { id: "soft.node-async-context-loss", domain: "domain", appliesTo: isNode, scan: c => /\bAsyncLocalStorage\b/i.test(T(c)) && /\b(?:\.on\s*\(\s*['"]|EventEmitter|setImmediate|setTimeout|callback)\b/i.test(T(c)) && !/\b(?:AsyncResource|util\.promisify|\.bind\s*\()\b/i.test(T(c)) ? [mk("major", "NODE_ASYNC_CONTEXT_LOSS", "AsyncLocalStorage across callback/EventEmitter without AsyncResource.", "Wrap callbacks with `new AsyncResource('name').bind(fn)`.")] : [] },

  // ── TypeScript ────────────────────────────────────────────────────────────
  { id: "soft.ts-any-io-boundary", domain: "domain", appliesTo: c => /\b(TypeScript|fetch|axios|JSON\.parse|req\.body)\b/i.test(T(c)), scan: c => /\b(?:const|let|var)\s+\w+\s*:\s*any\s*=\s*(?:await\s+)?(?:fetch|res\.json\(\)|JSON\.parse|req\.body|response\.json)/i.test(T(c)) && !/\b(zod|joi|valibot|io-ts|safeParse|validate|schema\.parse)\b/i.test(T(c)) ? [mk("major", "TS_ANY_IO_BOUNDARY", "External I/O value typed as `any` without runtime schema validation.", "Use Zod/Valibot/io-ts schema validation.")] : [] },
  { id: "soft.ts-strict-disabled", domain: "domain", appliesTo: c => /\b(tsconfig|TypeScript)\b/i.test(T(c)), scan: c => /["\s](?:strict|strictNullChecks|noUncheckedIndexedAccess|exactOptionalPropertyTypes)["']?\s*:\s*false/i.test(T(c)) ? [mk("critical", "TS_STRICT_DISABLED", "TypeScript strictness flag disabled.", "Enable strict: true. Fix underlying type errors instead of disabling.")] : [] },
  { id: "soft.ts-discriminated-union-nonexhaustive", domain: "domain", appliesTo: c => /\b(TypeScript|switch)\b/i.test(T(c)), scan: c => /\bswitch\s*\([^)]+\)\s*\{[\s\S]{0,800}\bdefault\s*:\s*(?![\s\S]{0,60}\bconst\s+_:\s*never\b)/i.test(T(c)) && /\bcase\s+['"][A-Z_]+['"]\s*:/i.test(T(c)) ? [mk("warning", "TS_SWITCH_NONEXHAUSTIVE", "Discriminated union switch lacks never-based exhaustiveness check.", "Add `default: { const _: never = x; return _; }`.")] : [] },
  { id: "soft.ts-module-resolution-mismatch", domain: "domain", appliesTo: c => /\b(tsconfig|moduleResolution|package\.json)\b/i.test(T(c)), scan: c => /"moduleResolution"\s*:\s*"node(?:10)?"/i.test(T(c)) && /"type"\s*:\s*"module"|import\.meta|\.mjs\b|"module"\s*:\s*"(?:node16|nodenext|esnext|es20\d\d)"/i.test(T(c)) ? [mk("major", "TS_MODULE_RESOLUTION_MISMATCH", "Legacy moduleResolution 'node' (Node10) with ESM context — runtime resolution will fail.", "Set moduleResolution to 'node16', 'nodenext', or 'bundler'.")] : [] },
  { id: "soft.ts-no-unchecked-index", domain: "domain", appliesTo: c => /\b(Record<string,|Map<)\b/i.test(T(c)), scan: c => /\b\w+\s*\[(?:key|id|name|type|kind|prop|\w+)\s*\]\s*\.\s*\w+/i.test(T(c)) && !/\b(noUncheckedIndexedAccess|\?\?|if\s*\(\s*\w+\[)/i.test(T(c)) ? [mk("warning", "TS_NO_UNCHECKED_INDEX_MISSING", "Index lookup result used directly without null/undefined guard.", "Enable noUncheckedIndexedAccess; use optional chaining.")] : [] },

  // ── Swift ─────────────────────────────────────────────────────────────────
  { id: "soft.swift-force-unwrap", domain: "domain", appliesTo: isSwift, scan: c => { const m = T(c).match(/\btry!|\bas!|\b[A-Za-z_]\w*!(?=[.\s),;\]])/g) ?? []; const forced = m.filter(x => x !== "!=").length; return forced >= 2 ? [mk("warning", "SWIFT_FORCE_UNWRAP", `Swift code uses force-unwrap / try! / as! ${forced} time(s).`, "Replace with guard let / if let / do-catch.")] : []; } },
  { id: "soft.swift-global-mutable-state", domain: "domain", appliesTo: isSwift, scan: c => /\bstatic\s+var\s+\w+/i.test(T(c)) && !/\b(@MainActor|actor\s+\w+|nonisolated\(unsafe\)|Mutex|NSLock|DispatchQueue)\b/i.test(T(c)) ? [mk("major", "SWIFT_GLOBAL_MUTABLE_STATE", "Mutable static var without actor isolation under Swift Concurrency.", "Isolate to an actor or mark @MainActor.")] : [] },
  { id: "soft.swift-mainactor-nonisolated", domain: "domain", appliesTo: isSwift, scan: c => /\bDispatchQueue\.main\.async\s*\{/i.test(T(c)) && /\b(ViewModel|ObservableObject|@Published|objectWillChange)\b/i.test(T(c)) && !/\b(@MainActor|await\s+MainActor\.run)\b/i.test(T(c)) ? [mk("major", "SWIFT_MAINACTOR_NONISOLATED", "DispatchQueue.main.async used for UI updates instead of @MainActor/MainActor.run.", "Use `await MainActor.run { ... }` or annotate the type with @MainActor.")] : [] },
  { id: "soft.swift-actor-protocol-mismatch", domain: "domain", appliesTo: isSwift, scan: c => /\bprotocol\s+\w+/i.test(T(c)) && /@MainActor\s+(?:final\s+)?class\s+\w+\s*:\s*\w+/i.test(T(c)) && !/\b@preconcurrency\b/i.test(T(c)) ? [mk("major", "SWIFT_ACTOR_PROTOCOL_MISMATCH", "@MainActor type conforms to a non-isolated protocol without @preconcurrency — Swift 6 compile error.", "Add @preconcurrency to the conformance, or annotate the protocol with @MainActor.")] : [] },
  { id: "soft.swift-nested-weak-self-no-guardlet", domain: "domain", appliesTo: isSwift, scan: c => { const nested = /\[weak\s+self\][\s\S]{0,250}(?:Timer\.scheduledTimer|\.sink\s*\{|\.map\s*\{|\.receive\s*on\s*:|\.scheduledTimer|withTimeInterval)[\s\S]{0,200}\bself\.\w+/i.test(T(c)); const hasGuard = /\bguard\s+let\s+self\s*=\s*self\b|\bguard\s+let\s+self\s+else\b/i.test(T(c)); return nested && !hasGuard ? [mk("major", "SWIFT_NESTED_WEAK_SELF_NO_GUARDLET", "Outer [weak self] but nested Combine/Timer closure references self directly — retain cycle persists.", "Add `guard let self = self else { return }` inside each closure.")] : []; } },
  { id: "soft.swift-task-detached-isolation", domain: "domain", appliesTo: isSwift, scan: c => /\bTask\.detached\s*\{/i.test(T(c)) && /\b(self\.|@MainActor|@Published|DispatchQueue\.main|viewModel\.)/i.test(T(c)) && !/\bawait MainActor\.run\b/i.test(T(c)) ? [mk("major", "SWIFT_TASK_DETACHED_ISOLATION", "Task.detached captures self/MainActor state, losing actor isolation.", "Use `Task { ... }` (inherits actor) unless explicitly leaving the actor context.")] : [] },

  // ── Tailwind ──────────────────────────────────────────────────────────────
  { id: "soft.tw-container-no-center", domain: "domain", appliesTo: isTailwind, scan: c => /\bclass(?:Name)?\s*=\s*['"`][^'"`]*\bcontainer\b[^'"`]*['"`]/i.test(T(c)) && !/\bmx-auto\b/i.test(T(c)) ? [mk("warning", "TAILWIND_CONTAINER_NOT_CENTERED", "Tailwind `container` used without `mx-auto` — does not center automatically.", "Add `mx-auto` alongside `container`.")] : [] },
  { id: "soft.tw-dark-mode-fouc", domain: "domain", appliesTo: isTailwind, scan: c => /\b(?:dark\s*mode|dark:)\b/i.test(T(c)) && /\b(?:useEffect|onMount|componentDidMount)\b[\s\S]{0,300}\b(?:localStorage|classList\.(?:add|toggle)|data-theme|documentElement\.classList)\b/i.test(T(c)) && !/\b(?:<head>|beforeInteractive|next\/script|dangerouslySetInnerHTML|suppressHydrationWarning)\b/i.test(T(c)) ? [mk("warning", "TAILWIND_DARK_MODE_FOUC", "Dark mode toggled in useEffect/onMount — flash of wrong theme.", "Inject a blocking <script> in <head> that sets the dark class synchronously.")] : [] },
  { id: "soft.tw-monorepo-source", domain: "domain", appliesTo: isTailwind, scan: c => /\b(?:monorepo|workspace|packages\/|apps\/|libs\/|ui-library|design-system)\b/i.test(T(c)) && /\b(?:tailwind|tw)\b/i.test(T(c)) && !/\b(?:@source|content\s*:\s*\[|source\s*\()\b/i.test(T(c)) ? [mk("major", "TAILWIND_MONOREPO_SOURCE_MISSING", "Tailwind in monorepo without @source directive for cross-package paths.", "Add @source or extend content[] to include all monorepo package paths.")] : [] },
  { id: "soft.tw-breakpoint-unit-mismatch", domain: "domain", appliesTo: isTailwind, scan: c => /\bscreens\s*:\s*\{[\s\S]{0,400}(?:\d+px[\s\S]{0,100}\d+rem|\d+rem[\s\S]{0,100}\d+px)/i.test(T(c)) ? [mk("warning", "TAILWIND_BREAKPOINT_UNIT_MISMATCH", "Custom Tailwind screens mix px and rem — sorting anomalies.", "Use one consistent unit for all screens values.")] : [] },
  { id: "soft.tw-runtime-safelist", domain: "domain", appliesTo: isTailwind, scan: c => /\b(?:cms|contentful|sanity|prismic|strapi|database|db\.|fetched\s+from|api\s+response)\b/i.test(T(c)) && /\$\{[\s\S]{0,80}(?:bg-|text-|border-|p-|m-|grid-cols-)/i.test(T(c)) && !/\b(?:@source\s+inline|safelist\s*:)\b/i.test(T(c)) ? [mk("major", "TAILWIND_RUNTIME_SAFELIST_MISSING", "CMS/DB-driven Tailwind classes without safelist — JIT purges them.", "Add `@source inline(...)` (v4) or safelist (v3).")] : [] },

  // ── Python ────────────────────────────────────────────────────────────────
  { id: "soft.py-eval-exec-untrusted", domain: "domain", appliesTo: isPython, scan: c => { if (/\b(never.*eval.*untrusted|eval.*dangerous|avoid.*eval.*user)\b/i.test(T(c))) return []; const evalExec = /\b(eval|exec)\s*\(/i.test(T(c)); const untrusted = /\b(request\.|req\.|user_input|stdin|input\(\)|sys\.argv|environ|query|params|form\[)\b/i.test(T(c)); return evalExec && untrusted ? [mk("critical", "PY_EVAL_EXEC_UNTRUSTED", "eval()/exec() on untrusted external input — arbitrary code execution.", "Use ast.literal_eval() or JSON.loads. eval/exec on user input is RCE.")] : []; } },
  { id: "soft.py-sql-fstring", domain: "domain", appliesTo: isPython, scan: c => /\bcursor\.execute\s*\(\s*f?[`'"]\s*SELECT[\s\S]{0,200}\{|\bcursor\.execute\s*\(\s*[`'"][^`'"]*%\s*\(?[a-zA-Z_]/i.test(T(c)) ? [mk("critical", "PY_SQL_INJECTION", "SQL query built with f-string or %-formatting — SQL injection (CWE-89).", "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = ?', (uid,)).")] : [] },
  { id: "soft.py-bare-except", domain: "domain", appliesTo: isPython, scan: c => { if (/\b(bare\s+except|avoid.*except\s*:|use.*specific exception)\b/i.test(T(c))) return []; const bare = /\bexcept\s*:/i.test(T(c)) && !/\bexcept\s+(?:Exception|[A-Z]\w*Error|[A-Z]\w*Exception)\b/i.test(T(c)); const inTry = /\btry\s*:/i.test(T(c)); return bare && inTry ? [mk("major", "PY_BARE_EXCEPT", "Bare `except:` catches SystemExit/KeyboardInterrupt — masks bugs, blocks Ctrl-C.", "Use `except Exception:` or name specific exceptions.")] : []; } },

  // ── Go ────────────────────────────────────────────────────────────────────
  { id: "soft.go-goroutine-leak", domain: "domain", appliesTo: isGo, scan: c => { if (/\b(goroutine leak|context\.Done|select.*case.*<-ctx)\b/i.test(T(c))) return []; const g = /\bgo\s+func\s*\(/i.test(T(c)); const w = /<-\s*\w+\b/i.test(T(c)); const ctx = /\bcontext\.(WithCancel|WithTimeout|WithDeadline)|ctx\.Done\(\)|select\s*\{[\s\S]*case\s*<-\s*ctx/i.test(T(c)); return g && w && !ctx ? [mk("major", "GO_GOROUTINE_LEAK", "Goroutine waits on a channel without context cancellation — silent memory leak.", "Add `case <-ctx.Done():` to all select statements; pass context.WithCancel/WithTimeout.")] : []; } },

  // ── C++ ───────────────────────────────────────────────────────────────────
  { id: "soft.cpp-thread-no-join-detach", domain: "domain", appliesTo: c => /\b(C\+\+|std::thread|pthread|thread)\b/i.test(T(c)), scan: c => /\bstd::thread\s+\w+\s*[\({]/i.test(T(c)) && !/\.(?:join|detach)\(\)/i.test(T(c)) ? [mk("critical", "CPP_THREAD_NO_JOIN_DETACH", "std::thread created without .join() or .detach() — calls std::terminate().", "Every std::thread must be joined or detached before going out of scope. Use std::jthread (C++20).")] : [] },

  // ── V15: Rust async (web-verified) ────────────────────────────────────────
  {
    id: "soft.rust-tokio-select-cancel-unsafe", domain: "domain",
    description: "tokio::select! branch uses non-cancellation-safe future — data loss on drop.",
    appliesTo: isRust,
    scan: c => {
      if (/\b(cancel[-\s]?saf|cancellation safety|cancel correctness|not cancel safe)\b/i.test(c.answer)) return [];
      return /\btokio::select!\s*\{[\s\S]{0,600}\b(?:\.send\s*\(|read_line\s*\(|read_to_end\s*\(|read_to_string\s*\(|read_buf\s*\()/i.test(c.answer)
        ? [mk("major", "RUST_TOKIO_SELECT_CANCEL_UNSAFE", "tokio::select! branch contains a non-cancellation-safe future (mpsc send, read_line). When another branch wins, this future is dropped mid-operation and data is silently lost.", "Use only cancel-safe futures in select! branches (mpsc Receiver::recv, AsyncReadExt::read, interval.tick). For sends, reserve a permit first. Source: Oxide RFD 0400.")]
        : [];
    },
  },
  {
    id: "soft.rust-blocking-in-async", domain: "domain",
    description: "Blocking call inside async fn — stalls the Tokio worker thread.",
    appliesTo: c => /\basync\s+fn\b/i.test(c.answer) && /\b(tokio|rust|\.await)\b/i.test(T(c)),
    scan: c => {
      if (/\bspawn_blocking\b|\bblock_in_place\b/i.test(c.answer)) return [];
      return /\basync\s+fn\b[\s\S]{0,500}\b(?:std::thread::sleep\s*\(|std::fs::(?:read|write|File::open|read_to_string)\s*\()/i.test(c.answer)
        ? [mk("major", "RUST_BLOCKING_IN_ASYNC", "Blocking call (std::thread::sleep or sync std::fs) inside an async fn stalls the Tokio worker thread — starves every other task on that worker.", "Use tokio::time::sleep and tokio::fs (or async clients). For unavoidable CPU work, offload via tokio::task::spawn_blocking.")]
        : [];
    },
  },

  // ── V15: Web security (web-verified) ──────────────────────────────────────
  {
    id: "soft.web-cors-wildcard", domain: "domain",
    description: "Over-permissive CORS — AI's reflexive 'fix' for CORS errors.",
    appliesTo: isWebContext,
    scan: c => {
      if (/\b(?:vulnerab|insecure|avoid|never use|do not use|don't use|risk|dangerous|should not)\b[\s\S]{0,80}(?:cors|wildcard|allow-origin|\*)/i.test(c.answer)) return [];
      const wildcardHeader = /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]/i.test(c.answer);
      const corsWildcard = /\bcors\s*\(\s*\{[^}]*\borigin\s*:\s*(?:['"]\*['"]|true)/i.test(c.answer);
      return wildcardHeader || corsWildcard
        ? [mk("major", "WEB_CORS_WILDCARD_ORIGIN", "Over-permissive CORS (Access-Control-Allow-Origin: '*' or cors origin:'*') — exposes API to any website.", "Allowlist explicit trusted origins. Never combine wildcard with credentials:true.")]
        : [];
    },
  },
  {
    id: "soft.web-debug-endpoint-leak", domain: "domain",
    description: "Unprotected debug route returning process.env/internal config.",
    appliesTo: isWebContext,
    scan: c => /\b(?:app|router|server)\.(?:get|use|all|post)\s*\(\s*['"]\/(?:debug|__debug|internal|admin\/debug|_debug|env)\b[\s\S]{0,200}(?:process\.env\b|res\.json\s*\(\s*process|res\.send\s*\(\s*(?:process\b|config\b|JSON\.stringify\s*\(\s*process))/i.test(c.answer)
      ? [mk("major", "WEB_DEBUG_ENDPOINT_LEAK", "Debug/internal route exposes process.env or internal config — leaks secrets and connection strings.", "Remove debug endpoints from production or gate behind authentication + environment check.")]
      : [],
  },

  // ── V15: npm packaging (web-verified Claude Code leak Mar 31 2026) ────────
  {
    id: "soft.npm-sourcemap-production-leak", domain: "domain",
    description: "Production source maps enabled — ships original source publicly.",
    appliesTo: c => /\b(next\.config|webpack|vite|rollup|esbuild|package\.json|source\s?map|devtool|build config)\b/i.test(T(c)),
    scan: c => {
      if (/\b(?:disable.*source\s?map|sourcemap.*leak|strip.*source|do not ship source|hidden-source-map)\b/i.test(c.answer)) return [];
      return /\bproductionBrowserSourceMaps\s*:\s*true\b/i.test(c.answer) || /\bsourcesContent\s*:\s*true\b/i.test(c.answer)
        ? [mk("warning", "NPM_SOURCEMAP_PRODUCTION_LEAK", "Production source maps enabled (productionBrowserSourceMaps:true / sourcesContent:true) — ships original source publicly. Same vector as Claude Code source leak (Mar 31 2026).", "Disable production source maps or upload them privately to Sentry. Add .map to .npmignore so they never reach npm.")]
        : [];
    },
  },
];
