/**
 * UniNode Local Orchestrator (Browser-Side Sidecar)
 * Implements the Hub/Worker orchestration logic in TypeScript.
 * Provides mDNS-style discovery via BroadcastChannel and Task Dispatch via Web Workers.
 */

export interface NodeInfo {
  nodeId: string;
  role: "hub" | "worker" | "hybrid";
  capabilities: string[];
  load: number;
}

export interface TaskRequest {
  taskId: string;
  toolName: string;
  inputJson: string;
  timeoutMs: number;
}

export interface TaskResponse {
  taskId: string;
  resultJson?: any;
  errorMessage?: string;
}

export class UniNode {
  private nodeId: string = crypto.randomUUID();
  private role: "hub" | "worker" | "hybrid";
  private discoveryChannel = new BroadcastChannel("uninode_discovery");
  private taskChannel = new BroadcastChannel("uninode_tasks");
  private peers = new Map<string, NodeInfo>();

  constructor(role: "hub" | "worker" | "hybrid" = "hybrid") {
    this.role = role;
    this.initDiscovery();
    this.initTaskHandling();
  }

  private initDiscovery() {
    this.discoveryChannel.onmessage = (e) => {
      const { type, node } = e.data;
      if (type === "HEARTBEAT") {
        this.peers.set(node.nodeId, node);
      }
    };

    // Heartbeat loop
    setInterval(() => {
      this.discoveryChannel.postMessage({
        type: "HEARTBEAT",
        node: {
          nodeId: this.nodeId,
          role: this.role,
          capabilities: ["web_search", "quant_engine", "logic_gate"],
          load: 0, // In real env, track worker pool load
        }
      });
    }, 5000);
  }

  private initTaskHandling() {
    this.taskChannel.onmessage = async (e) => {
      const { type, request, targetNodeId } = e.data;
      if (type === "DISPATCH" && (targetNodeId === this.nodeId || this.role !== "hub")) {
        // Execute task (delegate to WorkerPool)
        console.log(`[UniNode] Executing task ${request.taskId}: ${request.toolName}`);
        // Result would be posted back via response channel
      }
    };
  }

  public getPeers(): NodeInfo[] {
    return Array.from(this.peers.values());
  }

  public getIdentity() {
    return { nodeId: this.nodeId, role: this.role };
  }
}

let nodeInstance: UniNode | null = null;
export function getUniNode() {
  if (!nodeInstance) nodeInstance = new UniNode();
  return nodeInstance;
}
