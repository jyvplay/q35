import { VERITAS_SYSTEM_DIRECTIVES, type OrchestrationResponse } from "./tier";

export class ContextSynthesisEngine {
  private apiEndpoint: string;

  constructor(endpoint = "/api/v1/context/orchestrate") {
    this.apiEndpoint = endpoint;
  }

  public async synthesizeSecureContext(
    userQuery: string,
    rawLargeContext: string,
    sessionId?: string,
  ): Promise<{ finalizedPrompt: string; telemetry: OrchestrationResponse }> {
    const response = await fetch(this.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: userQuery, large_context: rawLargeContext, session_id: sessionId }),
    });
    if (!response.ok) throw new Error(`Orchestrator returned bad server status: ${response.status}`);
    const telemetryData = (await response.json()) as OrchestrationResponse;
    let analyticalContext = telemetryData.compiled_evidence;
    if (analyticalContext.includes("0x") || analyticalContext.length > 50_000) {
      analyticalContext = `${VERITAS_SYSTEM_DIRECTIVES.ECHO_CHAMBER_PENALTY}\n\n${analyticalContext}`;
    }
    return {
      finalizedPrompt: VERITAS_SYSTEM_DIRECTIVES.COV_WRAPPER(analyticalContext),
      telemetry: telemetryData,
    };
  }
}