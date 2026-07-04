/**
 * React Native + WebGL/WebGPU Specific Failures — v15.1
 * Deduplicated. Added react.invalid-html-nesting, react.hydration-mismatch,
 * three.dispose-partial-with-texture (web-verified RN 0.85 / Reanimated 4).
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (s: FlawIssue["severity"], c: string, m: string, r: string): FlawIssue => ({ severity: s, code: c, message: m, remediation: r });

function T(c: ScanContext): string { return `${c.prompt}\n${c.answer}`; }
function isReact(c: ScanContext) { return /\b(React|Next\.js|JSX|TSX|useState|useEffect|export\s+default\s+function|<\w+[\s/>])/i.test(T(c)); }
function isRN(c: ScanContext) { return /\b(React Native|RN|Expo|Metro|Fabric|TurboModules|Reanimated|Hermes)\b/i.test(T(c)); }
function isRNNewArch(c: ScanContext) { return /\b(New Architecture|TurboModule|Codegen|Fabric|JSI|bridgeless|0\.7[6-9]|0\.8[0-5])\b/i.test(T(c)); }
function isWebGL(c: ScanContext) { return /\b(WebGL|WebGPU|Three\.js|GLSL|shader|GPU|canvas)\b/i.test(T(c)); }

export const SOFTWARE_RN_WEBGL_FLAWS: FlawDetector[] = [
  // ── React general ─────────────────────────────────────────────────────────
  {
    id: "react.invalid-html-nesting", domain: "domain",
    description: "Invalid HTML nesting — browser auto-corrects, breaks SSR hydration.",
    appliesTo: isReact,
    scan: c => {
      const divInP = /<p\b[^>]*>[\s\S]{0,400}<(?:div|section|article|main|header|footer|nav|aside|h[1-6]|ul|ol|li|table|form|hr)\b/i.test(c.answer);
      const aInA = /<a\b[^>]*>[\s\S]{0,400}<a\b[^>]*>/i.test(c.answer);
      const buttonInButton = /<button\b[^>]*>[\s\S]{0,400}<button\b[^>]*>/i.test(c.answer);
      const formInForm = /<form\b[^>]*>[\s\S]{0,400}<form\b[^>]*>/i.test(c.answer);
      return (divInP || aInA || buttonInButton || formInForm)
        ? [mk("major", "REACT_INVALID_HTML_NESTING", "Invalid HTML nesting (block in <p>, <a> in <a>, <button> in <button>, <form> in <form>) — browser auto-corrects the DOM, causing React hydration mismatch.", "Replace <p> with <div>/<span> when wrapping block content. Never nest <a> in <a> or <button> in <button>. HTML parser splits/reorders these, breaking SSR/RSC hydration.")]
        : [];
    },
  },
  {
    id: "react.hydration-mismatch", domain: "domain",
    description: "Math.random()/Date.now()/new Date() in component body — SSR hydration mismatch.",
    appliesTo: isReact,
    scan: c => /(?:const|let|var)\s+\w+\s*=\s*(?:Math\.random\(\)|Date\.now\(\)|new\s+Date\(\)|crypto\.randomUUID\(\))/i.test(c.answer)
      && !/\b(useEffect|useLayoutEffect|useMemo|useId\b|suppressHydrationWarning|'use client')\b/i.test(c.answer)
      ? [mk("major", "REACT_HYDRATION_MISMATCH", "Non-deterministic value (Math.random/Date/crypto.randomUUID) generated in component body causes server/client hydration mismatch.", "Move into useEffect (post-hydration), use useId() for stable IDs, or pass as a stable prop. Use suppressHydrationWarning only when the divergence is intentional.")]
      : [],
  },

  // ── React Native ──────────────────────────────────────────────────────────
  {
    id: "rn.expo-managed-native-module-confusion", domain: "domain",
    appliesTo: c => /\b(expo|managed workflow|app\.json)\b/i.test(T(c)),
    scan: c => /\b(react-native-camera|react-native-fs|react-native-permissions|react-native-sensor|react-native-contacts)\b/i.test(T(c)) && !/\b(expo-camera|expo-file-system|expo-contacts|dev client|prebuild|EAS Build)\b/i.test(T(c))
      ? [mk("major", "RN_EXPO_MANAGED_NATIVE_MODULE_CONFUSION", "Bare native module imported in what appears to be an Expo managed workflow. App will white-screen on launch.", "Use Expo equivalents (expo-camera, expo-file-system) or migrate to dev-client/prebuild for bare native modules.")]
      : [],
  },
  {
    id: "rn.typescript-prop-type-erasure", domain: "domain",
    appliesTo: c => isRN(c) && /\b(TypeScript|tsx)\b/i.test(T(c)),
    scan: c => /\b(?:interface\s+\w*Props\s*\{[\s\S]{0,300}:\s*any\b|props\s*:\s*any\b|PropTypes\.any)\b/i.test(T(c)) && /\b(NativeComponent|TurboModule|Codegen|native module|JSI)\b/i.test(T(c))
      ? [mk("major", "RN_TYPESCRIPT_PROP_TYPE_ERASURE", "Props typed as 'any' in React Native Codegen/JSI context — propagates into generated C++ stubs and disables type-safety across the JS/native boundary.", "Use concrete types only. Codegen-emitted stubs are derived from your TypeScript interfaces; 'any' produces untyped native bindings.")]
      : [],
  },
  {
    id: "rn.new-arch-codegen-drift", domain: "domain",
    appliesTo: isRNNewArch,
    scan: c => /\b(TurboModule|NativeModule.*Spec|interface.*Spec\b)\b/i.test(T(c)) && (/\bPromise\s*<\s*any\s*>|:\s*any\b.*(?:TurboModule|Spec)/i.test(T(c))) && !/\b(codegenConfig|supported Codegen types|String|Boolean|Number|Object|Array|null)\b/i.test(T(c))
      ? [mk("critical", "RN_NEW_ARCH_CODEGEN_DRIFT", "TurboModule/Codegen spec uses Promise<any> or unsupported union types — Codegen emits broken C++ stubs that crash at runtime ('NativeBinding is not a function').", "Use only Codegen-supported primitives (string, boolean, number, Object, Array, null). Validate with codegenConfig in package.json and run a native build.")]
      : [],
  },
  {
    id: "rn.hermes-abi-mismatch", domain: "domain",
    appliesTo: isRNNewArch,
    scan: c => (/\b(JavaScriptCore|JSC|hermesEnabled\s*[:=]\s*false|:hermes_enabled\s*=>\s*false|jscEnabled\s*[:=]\s*true)\b/i.test(T(c))) && !/\b(Bundled Hermes|Hermes required|JSI built on Hermes|legacy app only)\b/i.test(T(c))
      ? [mk("critical", "RN_HERMES_ABI_MISMATCH", "JSC enabled or Hermes disabled on a New Architecture project — instant SIGABRT crash with no JS stack trace.", "New Architecture requires Hermes. Set hermesEnabled: true / :hermes_enabled => true and use Bundled Hermes so JSI ABI matches.")]
      : [],
  },
  {
    id: "rn.expo-updates-ota-broken", domain: "domain",
    appliesTo: c => /\b(expo[-\s]updates|ota|over.?the.?air|Podfile)\b/i.test(T(c)),
    scan: c => /\b(Podfile|upgrade helper)\b/i.test(T(c)) && (/\bremov(?:e|ed|ing)\s+(?::?hermes[_-]?enabled|hermes flag)\b/i.test(T(c)) || /\b:hermes_enabled\s*=>\s*false\b/i.test(T(c))) && !/\b(keep\s+:hermes_enabled|preserve\s+hermes|OTA\s+(?:requires|needs))\b/i.test(T(c))
      ? [mk("major", "RN_EXPO_UPDATES_OTA_BROKEN", "Expo Updates OTA silently fails when :hermes_enabled is removed/set false during Podfile upgrade.", "Keep `:hermes_enabled => true` in Podfile for Expo Updates OTA. App compiles and ships fine, but OTA fails in production.")]
      : [],
  },
  {
    id: "rn.navigation-version-mixing", domain: "domain",
    appliesTo: isRN,
    scan: c => {
      const v5 = /\bcreateStackNavigator\s*\(/i.test(T(c));
      const v6 = /\bcreateNativeStackNavigator\b/i.test(T(c));
      const v7 = /\bcreateStaticNavigation\b/i.test(T(c));
      return [v5, v6, v7].filter(Boolean).length >= 2
        ? [mk("major", "RN_NAVIGATION_VERSION_MIX", "React Navigation v5, v6, and/or v7 API patterns mixed — navigation.navigate() silently fails to pass params; deep linking breaks.", "Standardize on one version (v7 recommended for New Architecture / RN 0.85+).")]
        : [];
    },
  },
  {
    id: "rn.flatlist-perf", domain: "domain",
    appliesTo: isRN,
    scan: c => /<FlatList\b[\s\S]{0,300}data\s*=\s*\{/i.test(T(c)) && !/\b(keyExtractor|getItemLayout|removeClippedSubviews|windowSize)\b/i.test(T(c))
      ? [mk("warning", "RN_FLATLIST_PERF", "FlatList declared without keyExtractor / getItemLayout / removeClippedSubviews.", "Add keyExtractor, getItemLayout, removeClippedSubviews, windowSize; wrap renderItem in useCallback. Without these, 1000-item lists drop to single-digit FPS.")]
      : [],
  },
  {
    id: "rn.platform-os-asymmetry", domain: "domain",
    appliesTo: isRN,
    scan: c => {
      const iosOnly = /\bPlatform\.OS\s*===?\s*['"]ios['"]/i.test(T(c)) && !/\bPlatform\.OS\s*===?\s*['"]android['"]/i.test(T(c));
      const androidOnly = /\bPlatform\.OS\s*===?\s*['"]android['"]/i.test(T(c)) && !/\bPlatform\.OS\s*===?\s*['"]ios['"]/i.test(T(c));
      return (iosOnly || androidOnly)
        ? [mk("warning", "RN_PLATFORM_OS_ASYMMETRY", `Platform.OS check covers only ${iosOnly ? "'ios'" : "'android'"} — the other platform has no handler and will silently misbehave.`, "Add the missing platform branch, or use Platform.select({ ios: ..., android: ..., default: ... }) for exhaustive coverage.")]
        : [];
    },
  },
  {
    id: "rn.no-error-boundary", domain: "domain",
    appliesTo: isRN,
    scan: c => /\b(production|app entry|main app|RootNavigator|<NavigationContainer)\b/i.test(T(c)) && /\b(component|export default)\b/i.test(T(c)) && !/\b(ErrorBoundary|componentDidCatch|getDerivedStateFromError)\b/i.test(T(c))
      ? [mk("warning", "RN_NO_ERROR_BOUNDARY", "Production RN app root without ErrorBoundary — a single render error white-screens everything.", "Wrap top-level navigators in an ErrorBoundary so child render errors don't kill the whole app.")]
      : [],
  },
  {
    id: "rn.useeffect-no-cleanup", domain: "domain",
    appliesTo: isRN,
    scan: c => /\b(AppState|Keyboard|NetInfo|DeviceEventEmitter|Linking)\.add(?:EventListener|Listener)\b/i.test(T(c)) && !/\bremove(?:EventListener|Listener|All)\b/i.test(T(c)) && !/\b\.remove\(\)/i.test(T(c))
      ? [mk("major", "RN_USEEFFECT_LEAK", "Native event emitter subscribed without cleanup (mobile memory leak).", "Return a cleanup function from useEffect that calls subscription.remove() or removeEventListener; on mobile these accumulate across hours-long sessions.")]
      : [],
  },
  {
    id: "rn.stylesheet-absolutefillobject-removed", domain: "domain",
    description: "RN 0.85 removed StyleSheet.absoluteFillObject (web-verified: reactnative.dev/blog/2026/04/07).",
    appliesTo: isRN,
    scan: c => /\bStyleSheet\.absoluteFillObject\b/i.test(c.answer)
      ? [mk("major", "RN_ABSOLUTEFILLOBJECT_REMOVED", "StyleSheet.absoluteFillObject was removed in React Native 0.85 (April 7, 2026). Code targeting current RN will produce TypeScript errors and runtime breakage.", "Replace with StyleSheet.absoluteFill: `{ ...StyleSheet.absoluteFill }`. Or inline: `{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }`.")]
      : [],
  },
  {
    id: "rn.pressable-hidden-activity-leak", domain: "domain",
    description: "RN 0.85: Pressable event listeners no longer auto-unmount in hidden Activity (web-verified).",
    appliesTo: isRN,
    scan: c => /<Pressable\b[\s\S]{0,300}\b(?:onPress|onLongPress|onPressIn|onPressOut)\s*=\s*\{/i.test(T(c))
      && /\b(?:hidden|backgrounded|Activity|conditionally\s+rendered|\bvisible\s*&&|\bif\s+\([^)]+\)\s*\{[\s\S]{0,100}Pressable)\b/i.test(T(c))
      && !/\b(?:useEffect.*return|remove(?:EventListener|Listener)?|cleanup|unsubscribe)\b/i.test(T(c))
      ? [mk("warning", "RN_PRESSABLE_HIDDEN_ACTIVITY_LEAK", "React Native 0.85 changed behavior: Pressable event listeners no longer auto-unmount when parent Activity is hidden. Manual cleanup is now required.", "Per RN 0.85 release notes: when using Pressable inside conditionally rendered/hidden views, manually remove event listeners during component unmount via useEffect cleanup return.")]
      : [],
  },
  {
    id: "rn.reanimated-runonjs-deprecated", domain: "domain",
    description: "Reanimated 4: runOnJS → scheduleOnRN (web-verified: docs.swmansion.com migration-from-3.x).",
    appliesTo: c => /\b(react-native-reanimated|react-native-worklets|Reanimated\s*4|runOnJS)\b/i.test(T(c)),
    scan: c => /\bimport\s+\{[^}]*\brunOnJS\b[^}]*\}\s+from\s+['"]react-native-reanimated['"]/i.test(T(c))
      && !/\b(scheduleOnRN|react-native-worklets|migrating-from-3|deprecated)\b/i.test(T(c))
      ? [mk("warning", "RN_REANIMATED_RUNONJS_DEPRECATED", "runOnJS from 'react-native-reanimated' is deprecated as of Reanimated 4 and will be removed in the next major release.", "Migrate: `import { scheduleOnRN } from 'react-native-worklets'`. Usage: `scheduleOnRN(fn, value)` (inline args) instead of `runOnJS(fn)(value)` (curried). Per docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x.")]
      : [],
  },
  {
    id: "rn.keyboard-avoiding-android", domain: "domain",
    appliesTo: c => /\b(react[-\s]?native|KeyboardAvoidingView)\b/i.test(T(c)),
    scan: c => /<KeyboardAvoidingView\b[\s\S]{0,200}\bbehavior\s*=\s*[{(]?\s*['"]padding['"]/i.test(c.answer) && !/\bPlatform\.(?:OS|select)\b/i.test(c.answer)
      ? [mk("major", "RN_KEYBOARD_AVOIDING_ANDROID_BROKEN", "KeyboardAvoidingView behavior='padding' is hardcoded — works on iOS but causes the keyboard to overlap content on Android, where 'height' is needed.", "Branch on platform: `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`.")]
      : [],
  },

  // ── Three.js ──────────────────────────────────────────────────────────────
  {
    id: "three.dispose-partial-with-texture", domain: "domain",
    description: "Three.js disposes geometry/material but textures/renderTargets/composers leak.",
    appliesTo: c => /\b(THREE\.|three\.js|@react-three|drei|r3f)\b/i.test(T(c)),
    scan: c => {
      const partialDispose = /\b(?:geometry|material)\.dispose\s*\(\s*\)/i.test(c.answer);
      const hasTexturedResource = /\b(?:Texture|EnvMap|CubeTexture|WebGLRenderTarget|EffectComposer|OrbitControls|composer\.|texture\.|renderTarget\.)\b/i.test(c.answer);
      const disposesTextured = /\b(?:texture|renderTarget|composer|controls|envMap)\.dispose\s*\(\s*\)/i.test(c.answer);
      return partialDispose && hasTexturedResource && !disposesTextured
        ? [mk("major", "THREE_DISPOSE_PARTIAL_WITH_TEXTURE", "Three.js cleanup disposes geometry/material but textures, render targets, composers, or controls leak GPU memory.", "Per Three.js docs: 'disposal of a material has no effect on textures'. Cascade ALL dispose calls: texture.dispose(), renderTarget.dispose(), composer.dispose(), controls.dispose().")]
        : [];
    },
  },

  // ── WebGL ─────────────────────────────────────────────────────────────────
  { id: "webgl.context-lost-handler", domain: "domain", appliesTo: isWebGL, scan: c => /\b(getContext\(['"]webgl['"]\)|new THREE\.WebGLRenderer)\b/i.test(T(c)) && !/\bwebglcontextlost\b/i.test(T(c)) ? [mk("major", "WEBGL_NO_CTX_LOST_HANDLER", "WebGL context created without 'webglcontextlost'/'webglcontextrestored' handlers.", "Add event listeners for context loss/restore. Context can be lost (GPU reset, background tab, memory pressure).")] : [] },
  { id: "webgl.delete-shader-program", domain: "domain", appliesTo: isWebGL, scan: c => /\bgl\.(?:createShader|createProgram)\(/i.test(T(c)) && !/\bgl\.delete(?:Shader|Program)\(/i.test(T(c)) ? [mk("major", "WEBGL_SHADER_LEAK", "gl.createShader/createProgram called without matching gl.deleteShader/deleteProgram.", "Call gl.deleteShader() after gl.linkProgram() and gl.deleteProgram() on cleanup. WebGL handles are not garbage collected.")] : [] },
  { id: "webgl.precision-highp", domain: "domain", appliesTo: isWebGL, scan: c => /precision\s+highp\s+float/i.test(T(c)) && /\bfragment\b/i.test(T(c)) && !/\b(mediump|GL_FRAGMENT_PRECISION_HIGH|getShaderPrecisionFormat)\b/i.test(T(c)) ? [mk("warning", "WEBGL_PRECISION_HIGHP", "precision highp float in fragment shader without checking mobile GPU support.", "Many Adreno/Mali GPUs silently downgrade highp to mediump. Query gl.getShaderPrecisionFormat() or use #ifdef GL_FRAGMENT_PRECISION_HIGH.")] : [] },
  { id: "webgl.npot-texture", domain: "domain", appliesTo: isWebGL, scan: c => /\bgl\.generateMipmap\(/i.test(T(c)) && /\bwebgl(?!2)\b/i.test(T(c)) && !/\b(isPowerOf2|POT|NPOT|WebGL2|gl\.TEXTURE_WRAP_S\s*=\s*gl\.CLAMP_TO_EDGE)\b/i.test(T(c)) ? [mk("warning", "WEBGL_NPOT", "gl.generateMipmap() on WebGL1 without verifying texture dimensions are power-of-two.", "On WebGL1, NPOT textures with generateMipmap silently render solid black. Resize to POT, use CLAMP_TO_EDGE + LINEAR, or upgrade to WebGL2.")] : [] },
  { id: "webgl.instanced-no-check", domain: "domain", appliesTo: isWebGL, scan: c => /\b(drawArraysInstanced|drawElementsInstanced|ANGLE_instanced_arrays)\b/i.test(T(c)) && !/\bgetExtension\(['"]ANGLE_instanced_arrays['"]\)|isWebGL2|version 2/i.test(T(c)) ? [mk("warning", "WEBGL_INSTANCED_UNCHECKED", "Instanced rendering used without support check.", "On WebGL1 query gl.getExtension('ANGLE_instanced_arrays'); on WebGL2 verify context creation. Without checks, pipeline breaks silently on unsupported hardware.")] : [] },
  { id: "webgl.get-error-missing", domain: "domain", appliesTo: isWebGL, scan: c => /\bgl\.(?:drawArrays|drawElements|texImage2D|bufferData|uniform)/i.test(T(c)) && !/\bgl\.getError\(\)/i.test(T(c)) ? [mk("warning", "WEBGL_NO_GET_ERROR", "WebGL draw/buffer/uniform calls without periodic gl.getError() polling.", "WebGL fails silently — errors accumulate and subsequent calls 'succeed' but produce no output. Poll gl.getError() in dev builds.")] : [] },
  { id: "webgl.shader-injection-flow", domain: "domain", appliesTo: isWebGL, scan: c => /\bgl\.shaderSource\s*\([\s\S]{0,80}\b(input|user|params|body|query|untrusted|req\.body|fetch|prompt)\b/i.test(T(c)) && !/\b(sanitize|ANGLE|validate|allowlist|approved)\b/i.test(T(c)) ? [mk("critical", "WEBGL_SHADER_INJECTION", "User input potentially flows into shader source compilation — driver-level DoS/RCE risk.", "Never let untrusted input reach gl.shaderSource(). Use pre-built shader node graphs.")] : [] },
  { id: "webgl.shader-silent", domain: "domain", appliesTo: isWebGL, scan: c => /\bgl\.compileShader\s*\(/i.test(T(c)) && !/\b(getShaderInfoLog|COMPILE_STATUS|getShaderParameter|getError)\b/i.test(T(c)) ? [mk("major", "WEBGL_SHADER_SILENT", "Shader compiled without checking COMPILE_STATUS / getShaderInfoLog — WebGL returns empty error string on many drivers, producing a black screen with no console signal.", "After compileShader, check `gl.getShaderParameter(shader, gl.COMPILE_STATUS)` and log `gl.getShaderInfoLog(shader)`.")] : [] },
  { id: "webgpu.destroy-missing", domain: "domain", appliesTo: isWebGL, scan: c => /\b(createBuffer|createTexture)\b/i.test(T(c)) && !/\b(destroy|dispose)\b/i.test(T(c)) ? [mk("critical", "WEBGPU_DESTROY_MISSING", "WebGPU buffers created without explicit .destroy() calls.", "GPU memory is not garbage collected; call .destroy() on every buffer.")] : [] },
];
