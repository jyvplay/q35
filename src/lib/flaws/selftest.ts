/**
 * Self-test harness (dev tool, not wired to UI).
 * Run from a scratch script:
 *   import { runFlawSelfTest } from "./flaws/selftest";
 *   console.table(runFlawSelfTest());
 *   console.log(runFlawSelfTest().filter(t => !t.pass));  // failures only
 */
import { ensureFlawsLoaded } from ".";
import { runFlawScan, runAutoFix, setPackEnabled, listPacks, type ScanContext } from "../flaw-registry";

function ctx(p: Partial<ScanContext>): ScanContext {
  return {
    prompt: p.prompt ?? "", answer: p.answer ?? "",
    lowerAnswer: (p.answer ?? "").toLowerCase(),
    computeRecords: p.computeRecords ?? [],
    constraints: p.constraints ?? ({ explicitComparisonTargets: [], exclusions: [], formatHints: [], namedEntities: [] } as any),
    sources: p.sources, anchorDateISO: p.anchorDateISO, domainTags: p.domainTags, templateId: p.templateId,
  };
}
const has = (i: { code: string }[], code: string) => i.some((x) => x.code === code);

export function runFlawSelfTest(): { name: string; pass: boolean }[] {
  ensureFlawsLoaded();
  const t: { name: string; pass: boolean }[] = [];
  const A = (name: string, pass: boolean) => t.push({ name, pass });

  // ── BUILTIN: Numeric / Constraint ─────────────────────────────────────────
  A("MISSING_UNITS", has(runFlawScan(ctx({ prompt: "calculate the cost", answer: "The total is 4200." })), "MISSING_UNITS"));
  A("COMPUTE_VALUE_MISSING", has(runFlawScan(ctx({ prompt: "calc", answer: "no numbers here", computeRecords: [{ ok: true, label: "x", formula: "a+b", result: { y: 1234.56 } } as any] })), "COMPUTE_VALUE_MISSING"));
  A("COMPUTE_VALUE tolerant (comma)", !has(runFlawScan(ctx({ prompt: "calc", answer: "result is 1,234.56 kg", computeRecords: [{ ok: true, label: "x", formula: "a+b", result: { y: 1234.56 } } as any] })), "COMPUTE_VALUE_MISSING"));
  A("COMPUTE_VALUE nested", !has(runFlawScan(ctx({ prompt: "calc mass", answer: "final mass 1,234.56 kg", computeRecords: [{ ok: true, label: "mass", formula: "a+b", result: { nested: { massKg: 1234.56 } } } as any] })), "COMPUTE_VALUE_MISSING"));
  A("COMPUTE_VALUE percent", !has(runFlawScan(ctx({ prompt: "calc rate", answer: "final rate is 50%", computeRecords: [{ ok: true, label: "rate", formula: "a/b", result: { rate: 0.5 } } as any] })), "COMPUTE_VALUE_MISSING"));
  A("COMPUTE_FAILED", has(runFlawScan(ctx({ prompt: "calc", answer: "x", computeRecords: [{ ok: false, label: "psy", error: "div0" } as any] })), "COMPUTE_FAILED"));
  A("OVERCONFIDENT_CERTAINTY", has(runFlawScan(ctx({ answer: "This is guaranteed to always work." })), "OVERCONFIDENT_CERTAINTY"));
  A("SERIALIZATION_LEAK object", has(runFlawScan(ctx({ prompt: "calc", answer: "The yield is [object Object] kg." })), "SERIALIZATION_LEAK"));
  A("SERIALIZATION_LEAK Infinity", has(runFlawScan(ctx({ prompt: "calc", answer: "Result: Infinity m/s" })), "SERIALIZATION_LEAK"));
  A("SERIALIZATION_LEAK lowercase infinity NOT flagged", !has(runFlawScan(ctx({ prompt: "calc", answer: "the series tends to infinity gradually" })), "SERIALIZATION_LEAK"));

  // ── BUILTIN: Citation / Format / Markup ───────────────────────────────────
  A("CITATION_INDEX_OOR", has(runFlawScan(ctx({ answer: "per [S7] this holds", sources: [{ url: "a" }, { url: "b" }] })), "CITATION_INDEX_OOR"));
  A("CITES_WITH_NO_SOURCES", has(runFlawScan(ctx({ answer: "supported by [Source 1].", sources: [] })), "CITES_WITH_NO_SOURCES"));
  A("CRITIQUE_JSON_LEAK", has(runFlawScan(ctx({ answer: 'ok {"clear": false, "errors": ["a"]}' })), "CRITIQUE_JSON_LEAK"));
  A("SYSTEM_MARKER_LEAK", has(runFlawScan(ctx({ answer: "intro\nREFERENCE OVERLAY\nbody" })), "SYSTEM_MARKER_LEAK"));
  A("PLACEHOLDER_LEAK", has(runFlawScan(ctx({ answer: "Aims: [list of aims]" })), "PLACEHOLDER_LEAK"));
  A("PERSONA_LEAKAGE", has(runFlawScan(ctx({ answer: "As an AI language model, I cannot fully answer." })), "PERSONA_LEAKAGE"));
  A("VERIFICATION_PLAN_LEAKAGE", has(runFlawScan(ctx({ answer: "VERIFICATION PLAN MODE\nHypotheses:\n- H1" })), "VERIFICATION_PLAN_LEAKAGE"));
  A("LAZY_TRUNCATION", has(runFlawScan(ctx({ answer: "Here is the start... rest of the code omitted for brevity." })), "LAZY_TRUNCATION"));
  A("CODE_FENCE_UNCLOSED", has(runFlawScan(ctx({ answer: "```ts\nconst x = 1;\n" })), "CODE_FENCE_UNCLOSED"));
  A("MATH_FENCE_UNCLOSED", has(runFlawScan(ctx({ answer: "Use $$ x^2 + y^2 = z^2 " })), "MATH_FENCE_UNCLOSED"));
  A("MARKDOWN_LINK_EMPTY", has(runFlawScan(ctx({ answer: "Read more [here]()." })), "MARKDOWN_LINK_EMPTY"));
  A("TABLE_COL_MISMATCH", has(runFlawScan(ctx({ answer: "| a | b | c |\n|---|---|---|\n| 1 | 2 |\n| 3 | 4 | 5 |" })), "TABLE_COL_MISMATCH"));
  A("INTERNAL_NEGATION_CONTRADICTION", has(runFlawScan(ctx({ answer: ("The Treatment is effective. ").padEnd(160, "x") + " The Treatment is not effective." })), "INTERNAL_NEGATION_CONTRADICTION"));
  A("TRUNCATED_OUTPUT", has(runFlawScan(ctx({ answer: "x".repeat(220) + " and" })), "TRUNCATED_OUTPUT"));
  A("TRUNCATED list-item NOT flagged", !has(runFlawScan(ctx({ answer: ("Summary of risks across the horizon, expanded across domains so the gate is exceeded. ").padEnd(220, "z") + "\n- supply chain delay\n- currency exposure" })), "TRUNCATED_OUTPUT"));
  A("REFUSAL_MIMICRY", has(runFlawScan(ctx({ answer: "The retrieved sources do not contain enough to propose anything.", sources: Array(9).fill({}) })), "REFUSAL_MIMICRY"));
  A("BASE_RATE_NEGLECT", has(runFlawScan(ctx({ prompt: "cancer risk", answer: "Everyone who smokes gets cancer. 100% guaranteed." })), "BASE_RATE_NEGLECT"));
  A("SYCOPHANCY_OUTPUT", has(runFlawScan(ctx({ prompt: "analyze data", answer: "Great question! The data shows..." })), "SYCOPHANCY_OUTPUT"));

  // ── STATISTICS pack ───────────────────────────────────────────────────────
  A("STAT_P_AS_PROB_NULL", has(runFlawScan(ctx({ prompt: "t-test", answer: "The p-value is the probability that the null hypothesis is true." })), "STAT_P_AS_PROB_NULL"));
  A("STAT_THRESHOLD_WORSHIP", has(runFlawScan(ctx({ prompt: "regression", answer: "marginally significant (p = 0.06), a trend toward significance." })), "STAT_THRESHOLD_WORSHIP"));
  A("STAT_NONSIG_AS_NO_EFFECT", has(runFlawScan(ctx({ prompt: "trial", answer: "p > 0.05, so there is no effect of the intervention." })), "STAT_NONSIG_AS_NO_EFFECT"));
  A("STAT_P_EQUALS_ZERO", has(runFlawScan(ctx({ prompt: "chi-square", answer: "the test gave p = 0.000." })), "STAT_P_EQUALS_ZERO"));
  A("STAT_SD_SE_CONFUSION", has(runFlawScan(ctx({ prompt: "trial outcome", answer: "The mean was 12.4 ± 0.8 SEM at baseline." })), "STAT_SD_SE_CONFUSION"));
  A("STAT_CORR_CAUSATION", has(runFlawScan(ctx({ prompt: "cohort study", answer: "Coffee is correlated with longevity and therefore causes longer life." })), "STAT_CORR_CAUSATION"));
  A("STAT_CORR_CAUSATION suppressed on disclaimer", !has(runFlawScan(ctx({ prompt: "pitfall", answer: "Correlation does not imply causation." })), "STAT_CORR_CAUSATION"));
  A("STAT_DICHOTOMANIA", has(runFlawScan(ctx({ prompt: "analysis", answer: "We dichotomized the continuous biomarker at the median." })), "STAT_DICHOTOMANIA"));
  A("STAT_CONTAMINATION", has(runFlawScan(ctx({ prompt: "LLM eval", answer: "GPT-4 achieved SOTA on the MMLU benchmark." })), "STAT_CONTAMINATION"));

  // ── STATISTICS ADVANCED pack ──────────────────────────────────────────────
  A("STAT_SOURCE_ACTIVITY", has(runFlawScan(ctx({ prompt: "forensic DNA", answer: "The likelihood ratio for the match proves he touched the weapon." })), "STAT_SOURCE_ACTIVITY"));
  A("STAT_LINKAGE_PERFECT", has(runFlawScan(ctx({ prompt: "record linkage", answer: "We linked records and analyzed the matched dataset as final." })), "STAT_LINKAGE_PERFECT"));
  A("STAT_CATE_OVERLAP_MISSING", has(runFlawScan(ctx({ prompt: "HTE", answer: "The causal forest found strong CATE variation across patients." })), "STAT_CATE_OVERLAP_MISSING"));
  A("STAT_POSITION_BIAS", has(runFlawScan(ctx({ prompt: "recommender", answer: "We evaluated CTR and NDCG on clicks." })), "STAT_POSITION_BIAS"));
  A("STAT_NEURO_DOUBLE_DIP", has(runFlawScan(ctx({ prompt: "fMRI", answer: "We selected voxels by the contrast and then tested them on the same contrast." })), "STAT_NEURO_DOUBLE_DIP"));
  A("STAT_FAIRNESS_IMPOSSIBILITY", has(runFlawScan(ctx({ prompt: "fairness audit", answer: "The model achieved perfect calibration and equalized odds." })), "STAT_FAIRNESS_IMPOSSIBILITY"));

  // ── SOFTWARE EXTENDED pack ────────────────────────────────────────────────
  A("NODE_EVENT_LOOP_BLOCKING", has(runFlawScan(ctx({ prompt: "Express handler", answer: "app.get('/data', (req, res) => { const d = fs.readFileSync('./d.json'); res.json(JSON.parse(d)); });" })), "NODE_EVENT_LOOP_BLOCKING"));
  A("NODE_PIPELINE_HTTP_DESTROY", has(runFlawScan(ctx({ prompt: "node stream", answer: "pipeline(fs.createReadStream(p), res, (err) => { if (err) res.end('error'); });" })), "NODE_PIPELINE_HTTP_DESTROY"));
  A("NODE_CJS_ESM_INTEROP", has(runFlawScan(ctx({ prompt: "ESM module", answer: 'import { Router } from "express";\nconst dir = __dirname;' })), "NODE_CJS_ESM_INTEROP"));
  A("NODE_FS_TOCTOU", has(runFlawScan(ctx({ prompt: "node fs", answer: "fs.access(p, fs.constants.F_OK, (e) => { if (!e) fs.readFile(p, cb); });" })), "NODE_FS_TOCTOU"));
  A("NODE_SETMAXLISTENERS_MASK", has(runFlawScan(ctx({ prompt: "fix warning", answer: "server.setMaxListeners(0);" })), "NODE_SETMAXLISTENERS_MASK"));
  A("NODE_HTTP_TIMEOUT_MISSING", has(runFlawScan(ctx({ prompt: "production server", answer: "const server = http.createServer(app); server.listen(3000);" })), "NODE_HTTP_TIMEOUT_MISSING"));
  A("NODE_ASYNC_CONTEXT_LOSS", has(runFlawScan(ctx({ prompt: "observability", answer: "const als = new AsyncLocalStorage(); emitter.on('data', (d) => als.getStore());" })), "NODE_ASYNC_CONTEXT_LOSS"));
  A("NODE_THEN_WITHOUT_CATCH", has(runFlawScan(ctx({ prompt: "node async", answer: "fetchData().then(data => process(data));" })), "NODE_THEN_WITHOUT_CATCH"));
  A("NODE_THEN_WITHOUT_CATCH suppressed by .catch", !has(runFlawScan(ctx({ prompt: "node async", answer: "fetchData().then(d => process(d)).catch(e => log(e));" })), "NODE_THEN_WITHOUT_CATCH"));
  A("TS_ANY_IO_BOUNDARY", has(runFlawScan(ctx({ prompt: "TS fetch", answer: "const data: any = await fetch('/api').then(r => r.json()); console.log(data.name);" })), "TS_ANY_IO_BOUNDARY"));
  A("TS_STRICT_DISABLED", has(runFlawScan(ctx({ prompt: "tsconfig", answer: '{ "compilerOptions": { "strictNullChecks": false } }' })), "TS_STRICT_DISABLED"));
  A("TS_STRICT_DISABLED suppressed when true", !has(runFlawScan(ctx({ prompt: "tsconfig", answer: '{ "compilerOptions": { "strict": true } }' })), "TS_STRICT_DISABLED"));
  A("TS_SWITCH_NONEXHAUSTIVE", has(runFlawScan(ctx({ prompt: "reducer", answer: "switch (action.type) { case 'SET_LOADING': return 1; case 'SET_ERROR': return 2; default: return 0; }" })), "TS_SWITCH_NONEXHAUSTIVE"));
  A("TS_MODULE_RESOLUTION_MISMATCH", has(runFlawScan(ctx({ prompt: "tsconfig", answer: '{ "type": "module", "compilerOptions": { "moduleResolution": "node", "module": "ESNext" } }' })), "TS_MODULE_RESOLUTION_MISMATCH"));
  A("SWIFT_FORCE_UNWRAP", has(runFlawScan(ctx({ prompt: "Swift", answer: "let u = currentUser!.name\nlet t = authToken!.value" })), "SWIFT_FORCE_UNWRAP"));
  A("SWIFT_GLOBAL_MUTABLE_STATE", has(runFlawScan(ctx({ prompt: "Swift Sendable", answer: "class Cache { static var shared: [String: Data] = [:] }" })), "SWIFT_GLOBAL_MUTABLE_STATE"));
  A("SWIFT_MAINACTOR_NONISOLATED", has(runFlawScan(ctx({ prompt: "SwiftUI VM", answer: "class VM: ObservableObject { @Published var x = 0; func load(){ DispatchQueue.main.async { self.x = 1 } } }" })), "SWIFT_MAINACTOR_NONISOLATED"));
  A("SWIFT_ACTOR_PROTOCOL_MISMATCH", has(runFlawScan(ctx({ prompt: "Swift protocol", answer: "protocol L { func load() }\n@MainActor final class VM: L { func load() {} }" })), "SWIFT_ACTOR_PROTOCOL_MISMATCH"));
  A("SWIFT_TASK_DETACHED_ISOLATION", has(runFlawScan(ctx({ prompt: "Swift concurrency", answer: "Task.detached { self.viewModel.count += 1 }" })), "SWIFT_TASK_DETACHED_ISOLATION"));
  A("SWIFT_NESTED_WEAK_SELF_NO_GUARDLET", has(runFlawScan(ctx({ prompt: "Swift Combine", answer: "publisher.sink { [weak self] _ in Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in self.update() } }" })), "SWIFT_NESTED_WEAK_SELF_NO_GUARDLET"));
  A("TAILWIND_CONTAINER_NOT_CENTERED", has(runFlawScan(ctx({ prompt: "tailwind", answer: '<div className="container py-8">x</div>' })), "TAILWIND_CONTAINER_NOT_CENTERED"));
  A("TAILWIND_DARK_MODE_FOUC", has(runFlawScan(ctx({ prompt: "dark mode", answer: "useEffect(() => { document.documentElement.classList.toggle('dark', localStorage.getItem('theme')==='dark'); }, []);" })), "TAILWIND_DARK_MODE_FOUC"));
  A("TAILWIND_MONOREPO_SOURCE_MISSING", has(runFlawScan(ctx({ prompt: "tailwind monorepo packages/ui", answer: "module.exports = { theme: { extend: {} } }" })), "TAILWIND_MONOREPO_SOURCE_MISSING"));
  A("TAILWIND_BREAKPOINT_UNIT_MISMATCH", has(runFlawScan(ctx({ prompt: "tailwind screens", answer: "screens: { sm: '640px', md: '48rem', lg: '1024px' }" })), "TAILWIND_BREAKPOINT_UNIT_MISMATCH"));
  A("TAILWIND_RUNTIME_SAFELIST_MISSING", has(runFlawScan(ctx({ prompt: "tailwind cms contentful", answer: "const c = cms.theme; return <div className={`bg-${c}-500`} />;" })), "TAILWIND_RUNTIME_SAFELIST_MISSING"));
  A("PY_EVAL_EXEC_UNTRUSTED", has(runFlawScan(ctx({ prompt: "flask", answer: "result = eval(request.form['expression'])" })), "PY_EVAL_EXEC_UNTRUSTED"));
  A("PY_SQL_INJECTION", has(runFlawScan(ctx({ prompt: "python db", answer: "cursor.execute(f'SELECT * FROM users WHERE id = {user_id}')" })), "PY_SQL_INJECTION"));
  A("PY_BARE_EXCEPT", has(runFlawScan(ctx({ prompt: "python", answer: "try:\n    do_work()\nexcept:\n    pass" })), "PY_BARE_EXCEPT"));
  A("PY_BARE_EXCEPT suppressed when named", !has(runFlawScan(ctx({ prompt: "python", answer: "try:\n    do_work()\nexcept Exception as e:\n    log(e)" })), "PY_BARE_EXCEPT"));
  A("GO_GOROUTINE_LEAK", has(runFlawScan(ctx({ prompt: "go worker", answer: "go func() { result := <-ch; process(result) }()" })), "GO_GOROUTINE_LEAK"));
  A("GO_GOROUTINE suppressed with ctx.Done", !has(runFlawScan(ctx({ prompt: "go worker", answer: "go func() { select { case r := <-ch: process(r); case <-ctx.Done(): return } }()" })), "GO_GOROUTINE_LEAK"));
  A("CPP_THREAD_NO_JOIN_DETACH", has(runFlawScan(ctx({ prompt: "C++ task", answer: "void run() { std::thread worker(processQueue); }" })), "CPP_THREAD_NO_JOIN_DETACH"));
  A("CPP_THREAD suppressed with join", !has(runFlawScan(ctx({ prompt: "C++ thread", answer: "std::thread t(work); t.join();" })), "CPP_THREAD_NO_JOIN_DETACH"));

  // ── SOFTWARE RN/WEBGL pack ────────────────────────────────────────────────
  A("RN_EXPO_MANAGED_NATIVE_MODULE_CONFUSION", has(runFlawScan(ctx({ prompt: "Expo app", answer: "import { RNCamera } from 'react-native-camera';" })), "RN_EXPO_MANAGED_NATIVE_MODULE_CONFUSION"));
  A("RN_TYPESCRIPT_PROP_TYPE_ERASURE", has(runFlawScan(ctx({ prompt: "React Native TurboModule TS", answer: "interface Props { x: any }; function Card(props: any) { return <View>{props.title}</View>; }" })), "RN_TYPESCRIPT_PROP_TYPE_ERASURE"));
  A("RN_NEW_ARCH_CODEGEN_DRIFT", has(runFlawScan(ctx({ prompt: "TurboModule New Architecture", answer: "export interface Spec extends TurboModule { getData(): Promise<any>; }" })), "RN_NEW_ARCH_CODEGEN_DRIFT"));
  A("RN_HERMES_ABI_MISMATCH", has(runFlawScan(ctx({ prompt: "RN New Architecture TurboModule", answer: "Set hermesEnabled: false to use JSC." })), "RN_HERMES_ABI_MISMATCH"));
  A("RN_EXPO_UPDATES_OTA_BROKEN", has(runFlawScan(ctx({ prompt: "Expo Updates OTA Podfile upgrade helper", answer: "use_react_native!(:hermes_enabled => false)" })), "RN_EXPO_UPDATES_OTA_BROKEN"));
  A("RN_NAVIGATION_VERSION_MIX", has(runFlawScan(ctx({ prompt: "RN nav", answer: "const S = createStackNavigator(); const N = createNativeStackNavigator();" })), "RN_NAVIGATION_VERSION_MIX"));
  A("RN_FLATLIST_PERF", has(runFlawScan(ctx({ prompt: "RN list", answer: "<FlatList data={items} renderItem={({item}) => <Row item={item}/>} />" })), "RN_FLATLIST_PERF"));
  A("RN_PLATFORM_OS_ASYMMETRY", has(runFlawScan(ctx({ prompt: "RN platform", answer: "if (Platform.OS === 'ios') { return <IosBtn/>; } return null;" })), "RN_PLATFORM_OS_ASYMMETRY"));
  A("RN_USEEFFECT_LEAK", has(runFlawScan(ctx({ prompt: "RN keyboard", answer: "useEffect(() => { Keyboard.addListener('keyboardDidShow', onShow); }, []);" })), "RN_USEEFFECT_LEAK"));
  A("RN_ABSOLUTEFILLOBJECT_REMOVED", has(runFlawScan(ctx({ prompt: "RN style", answer: "const o = { ...StyleSheet.absoluteFillObject };" })), "RN_ABSOLUTEFILLOBJECT_REMOVED"));
  A("RN_PRESSABLE_HIDDEN_ACTIVITY_LEAK", has(runFlawScan(ctx({ prompt: "RN conditionally rendered Pressable hidden", answer: "{visible && <Pressable onPress={fn}><Text>Tap</Text></Pressable>}" })), "RN_PRESSABLE_HIDDEN_ACTIVITY_LEAK"));
  A("RN_REANIMATED_RUNONJS_DEPRECATED", has(runFlawScan(ctx({ prompt: "Reanimated worklet", answer: "import { runOnJS, useSharedValue } from 'react-native-reanimated';" })), "RN_REANIMATED_RUNONJS_DEPRECATED"));
  A("RN_KEYBOARD_AVOIDING_ANDROID_BROKEN", has(runFlawScan(ctx({ prompt: "RN keyboard", answer: '<KeyboardAvoidingView behavior="padding">' })), "RN_KEYBOARD_AVOIDING_ANDROID_BROKEN"));
  A("WEBGL_NO_CTX_LOST_HANDLER", has(runFlawScan(ctx({ prompt: "Three.js", answer: "const renderer = new THREE.WebGLRenderer({ canvas });" })), "WEBGL_NO_CTX_LOST_HANDLER"));
  A("WEBGL_SHADER_LEAK", has(runFlawScan(ctx({ prompt: "WebGL", answer: "const s = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(s, src); gl.compileShader(s); gl.getShaderInfoLog(s);" })), "WEBGL_SHADER_LEAK"));
  A("WEBGL_NPOT", has(runFlawScan(ctx({ prompt: "webgl texture", answer: "const gl = canvas.getContext('webgl'); gl.generateMipmap(gl.TEXTURE_2D);" })), "WEBGL_NPOT"));
  A("WEBGL_INSTANCED_UNCHECKED", has(runFlawScan(ctx({ prompt: "instanced", answer: "gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);" })), "WEBGL_INSTANCED_UNCHECKED"));
  A("WEBGL_NO_GET_ERROR", has(runFlawScan(ctx({ prompt: "webgl draw", answer: "gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);" })), "WEBGL_NO_GET_ERROR"));
  A("WEBGL_SHADER_INJECTION", has(runFlawScan(ctx({ prompt: "user shader", answer: "gl.shaderSource(shader, req.body.userShaderCode); gl.compileShader(shader);" })), "WEBGL_SHADER_INJECTION"));
  A("WEBGL_SHADER_SILENT", has(runFlawScan(ctx({ prompt: "WebGL shader", answer: "const s = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);" })), "WEBGL_SHADER_SILENT"));
  A("WEBGPU_DESTROY_MISSING", has(runFlawScan(ctx({ prompt: "WebGPU", answer: "device.createBuffer({ size: 1024, usage: GPUBufferUsage.STORAGE });" })), "WEBGPU_DESTROY_MISSING"));

  // ── MEDICAL pack ──────────────────────────────────────────────────────────
  A("MED_PHI_SSN_LEAK", has(runFlawScan(ctx({ prompt: "patient chart note", answer: "Patient SSN 123-45-6789 was admitted with chest pain." })), "MED_PHI_SSN_LEAK"));
  A("MED_PHI_MRN_LEAK", has(runFlawScan(ctx({ prompt: "patient record", answer: "MRN: 4456721 admitted to the clinic." })), "MED_PHI_MRN_LEAK"));
  A("MED_DOSE_NO_PEDIATRIC_WEIGHT", has(runFlawScan(ctx({ prompt: "pediatric dosing", answer: "Give the child 500 mg amoxicillin every 8 hours." })), "MED_DOSE_NO_PEDIATRIC_WEIGHT"));
  A("MED_DOSE_NO_ROUTE", has(runFlawScan(ctx({ prompt: "prescribe medication", answer: "Administer 40 mg every 12 hours for the patient." })), "MED_DOSE_NO_ROUTE"));
  A("MED_OPIOID_NO_NALOXONE", has(runFlawScan(ctx({ prompt: "prescribe opioid", answer: "Prescribe oxycodone for outpatient discharge pain management." })), "MED_OPIOID_NO_NALOXONE"));
  A("MED_DDI_WARFARIN", has(runFlawScan(ctx({ prompt: "prescribe", answer: "Start warfarin and add fluconazole for the infection." })), "MED_DDI_WARFARIN"));
  A("MED_PREGNANCY_CATEGORY_MISSING", has(runFlawScan(ctx({ prompt: "prescribe", answer: "The patient is pregnant; initiate the medication as needed." })), "MED_PREGNANCY_CATEGORY_MISSING"));
  A("MED_DIAGNOSTIC_NO_RED_FLAG", has(runFlawScan(ctx({ prompt: "differential diagnosis", answer: "The chest pain is most likely musculoskeletal in origin." })), "MED_DIAGNOSTIC_NO_RED_FLAG"));
  A("MED_IMAGING_AS_DEFINITIVE", has(runFlawScan(ctx({ prompt: "interpret imaging", answer: "The CT shows a fracture of the distal radius." })), "MED_IMAGING_AS_DEFINITIVE"));
  A("MED_ADVICE_NO_CLINICIAN_CAVEAT", has(runFlawScan(ctx({ prompt: "I have a headache and fever", answer: "You probably have a viral infection. You should take ibuprofen." })), "MED_ADVICE_NO_CLINICIAN_CAVEAT"));
  A("MED_ANTIBIOTIC_VIRAL", has(runFlawScan(ctx({ prompt: "common cold treatment", answer: "Prescribe amoxicillin for the common cold symptoms." })), "MED_ANTIBIOTIC_VIRAL"));
  A("MED pack NOT firing on poem", !has(runFlawScan(ctx({ prompt: "poem about the sea", answer: "The patient tides return at dawn, a clinic of waves." })), "MED_DOSE_NO_ROUTE"));

  // ── LEGAL pack ────────────────────────────────────────────────────────────
  A("LEGAL_NO_ATTORNEY_DISCLAIMER", has(runFlawScan(ctx({ prompt: "Can I sue my landlord?", answer: "Yes, you should file a lawsuit and you can recover damages for the breach." })), "LEGAL_NO_ATTORNEY_DISCLAIMER"));
  A("LEGAL_JURISDICTION_AGNOSTIC", has(runFlawScan(ctx({ prompt: "legal question", answer: "The statute of limitations is 2 years for this claim." })), "LEGAL_JURISDICTION_AGNOSTIC"));
  A("LEGAL_CITATION_NO_REPORTER", has(runFlawScan(ctx({ prompt: "case law", answer: "As established in Smith v. Jones, the doctrine applies broadly here." })), "LEGAL_CITATION_NO_REPORTER"));
  A("LEGAL_STATUTE_NO_SECTION", has(runFlawScan(ctx({ prompt: "federal law", answer: "This is governed by the United States Code on civil rights." })), "LEGAL_STATUTE_NO_SECTION"));
  A("LEGAL_CONTRACT_NO_GOVERNING_LAW", has(runFlawScan(ctx({ prompt: "draft a contract", answer: "This Agreement: the parties hereby agree to the terms of service described herein." })), "LEGAL_CONTRACT_NO_GOVERNING_LAW"));
  A("LEGAL_GDPR_CCPA_CONFLATION", has(runFlawScan(ctx({ prompt: "privacy law", answer: "GDPR and CCPA are basically the same; CCPA is the US GDPR." })), "LEGAL_GDPR_CCPA_CONFLATION"));
  A("LEGAL_SOL_NO_JURISDICTION", has(runFlawScan(ctx({ prompt: "SOL", answer: "The statute of limitations is 3 years for this type of case." })), "LEGAL_SOL_NO_JURISDICTION"));
  A("LEGAL pack NOT firing on prose", !has(runFlawScan(ctx({ prompt: "story", answer: "The law of the jungle ruled the ancient forest." })), "LEGAL_NO_ATTORNEY_DISCLAIMER"));

  // ── FINANCE pack ──────────────────────────────────────────────────────────
  A("FIN_NO_ADVISER_DISCLAIMER", has(runFlawScan(ctx({ prompt: "what stock should I buy", answer: "You should invest in NVDA now; put your money in tech." })), "FIN_NO_ADVISER_DISCLAIMER"));
  A("FIN_GUARANTEED_RETURNS", has(runFlawScan(ctx({ prompt: "investment", answer: "This fund offers guaranteed returns with zero risk." })), "FIN_GUARANTEED_RETURNS"));
  A("FIN_GUARANTEED suppressed for Treasury", !has(runFlawScan(ctx({ prompt: "investment", answer: "A U.S. Treasury T-bill is risk-free with guaranteed return of principal." })), "FIN_GUARANTEED_RETURNS"));
  A("FIN_PAST_PERFORMANCE", has(runFlawScan(ctx({ prompt: "fund analysis", answer: "It returned 25% over the past 5 years and will continue to gain at that rate." })), "FIN_PAST_PERFORMANCE"));
  A("FIN_TAX_NO_JURISDICTION", has(runFlawScan(ctx({ prompt: "tax question", answer: "Your capital gains tax rate is 15% on this sale." })), "FIN_TAX_NO_JURISDICTION"));
  A("FIN_GAAP_IFRS_CONFLATION", has(runFlawScan(ctx({ prompt: "accounting", answer: "GAAP and IFRS are equivalent and interchangeable for reporting." })), "FIN_GAAP_IFRS_CONFLATION"));
  A("FIN_BACKTEST_NO_OOS", has(runFlawScan(ctx({ prompt: "trading strategy", answer: "The backtest returned 40% annually on historical data." })), "FIN_BACKTEST_NO_OOS"));
  A("FIN_SHARPE_NO_PERIOD", has(runFlawScan(ctx({ prompt: "portfolio metrics", answer: "The strategy has a Sharpe ratio of 2.3." })), "FIN_SHARPE_NO_PERIOD"));
  A("FIN_CRYPTO_HOWEY", has(runFlawScan(ctx({ prompt: "token launch", answer: "Our token is not a security and won't be regulated by SEC." })), "FIN_CRYPTO_HOWEY"));
  A("FIN_INSIDER_TRADING_MARKER", has(runFlawScan(ctx({ prompt: "trading", answer: "I got a tip from an insider; buy the stock before the announcement." })), "FIN_INSIDER_TRADING_MARKER"));
  A("FIN_DEFI_NO_IL", has(runFlawScan(ctx({ prompt: "DeFi yield", answer: "This liquidity pool offers an APY of 80% on Uniswap." })), "FIN_DEFI_NO_IL"));
  A("FIN pack NOT firing on prose", !has(runFlawScan(ctx({ prompt: "story", answer: "He invested his heart in the garden, yielding flowers each spring." })), "FIN_NO_ADVISER_DISCLAIMER"));

  // ── AUTO-FIX smoke tests ──────────────────────────────────────────────────
  const fx = runAutoFix('Real answer body sufficiently long to survive the safety floor of the auto fixer. {"clear":true,"errors":[]}');
  A("autofix:strip-critique-json", fx.applied.includes("strip-critique-json"));
  A("autofix:stat-fix-p-equals-zero", runAutoFix("The chi-square test gave p = 0.000 which was highly significant in this regression analysis.").applied.includes("stat-fix-p-equals-zero"));

  // ── PACK toggle / introspection ───────────────────────────────────────────
  A("setPackEnabled silences pack", (() => {
    setPackEnabled("medical", false);
    const fires = has(runFlawScan(ctx({ prompt: "patient chart", answer: "Patient SSN 123-45-6789." })), "MED_PHI_SSN_LEAK");
    setPackEnabled("medical", true);
    return !fires;
  })());
  A("listPacks includes all 8 packs", (() => {
    const packs = listPacks().map(p => p.pack);
    return ["builtin", "statistics", "statistics-advanced", "software-extended", "software-rn-webgl", "medical", "legal", "finance"].every(p => packs.includes(p));
  })());

  return t;
}

/** Convenience: throw if any assertion fails (CI gate). */
export function assertFlawSelfTest(): void {
  const results = runFlawSelfTest();
  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    throw new Error(`[selftest] ${failures.length}/${results.length} assertions FAILED:\n` + failures.map(f => `  ✗ ${f.name}`).join("\n"));
  }
}
