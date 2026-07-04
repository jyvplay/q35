export interface SafetyTelemetry {
  zero_width_cleared: boolean;
  obfuscation_neutralized: boolean;
  injection_heuristic_tripped: boolean;
  initial_bytes: number;
  final_bytes: number;
}

export interface HardwareTelemetry {
  allocated_fp16_outliers: number;
  allocated_int4_ambient: number;
  outlier_ratio: number;
  vram_savings_est_mb: number;
}

export interface OrchestrationResponse {
  success: boolean;
  primary_safety: SafetyTelemetry;
  evidence_blocks_count: number;
  compiled_evidence: string;
  hardware_telemetry: HardwareTelemetry;
  map_efficiency_pct: number;
  session_id: string;
}

export const VERITAS_SYSTEM_DIRECTIVES = {
  COV_WRAPPER: (sanitizedContext: string): string => `<System_Directive>
You are executing a High-Fidelity Extraction protocol under strict Sandbox Epistemology constraints.
1. Scan the provided <Target_Context> block exclusively.
2. Do not rely on internal parametric memory dimensions or historical patterns.
3. Execute a complete Chain of Verification before outputting any final response.
4. If internal knowledge contradicts <Source_Data>, <Source_Data> overrides internal weights.
</System_Directive>

<Target_Context>
${sanitizedContext}
</Target_Context>

<Execution_Protocol>
Step 1: Quote all sentences from <Target_Context> relevant to the user query verbatim.
Step 2: Review the quotes. Do they directly and logically answer the query without assumption? (Yes/No)
Step 3: If Yes, format the final response including strict citations. If No, state "Insufficient Data in Source."
</Execution_Protocol>`,
  ECHO_CHAMBER_PENALTY: "You are strictly forbidden from mirroring repetitive input syntax. Output analytical breakdowns in continuous, clear prose.",
};