/**
 * Web Worker Pool — Parallel computation engine.
 * Spawns workers based on navigator.hardwareConcurrency.
 * Enables parallel scraping, computation, and Pyodide execution.
 */

export interface WorkerTask {
  id: string;
  type: "compute" | "scrape" | "pyodide" | "crypto";
  payload: any;
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ task: WorkerTask; resolve: (r: WorkerResult) => void }> = [];
  private active = 0;
  private maxWorkers: number;

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || navigator.hardwareConcurrency || 4;
    this.initWorkers();
  }

  private initWorkers() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e) => this.handleMessage(e.data);
      this.workers.push(worker);
    }
  }

  private handleMessage(data: WorkerResult & { workerId?: number }) {
    this.active--;
    const item = this.queue.shift();
    if (item) {
      this.active++;
      item.resolve(data);
      this.processQueue();
    }
  }

  private processQueue() {
    while (this.active < this.maxWorkers && this.queue.length > 0) {
      const { task } = this.queue.shift()!;
      const worker = this.workers.find((_, i) => i < this.maxWorkers);
      if (worker) {
        this.active++;
        worker.postMessage(task);
      }
    }
  }

  public async enqueue(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.processQueue();
    });
  }

  public async enqueueAll(tasks: WorkerTask[]): Promise<WorkerResult[]> {
    return Promise.all(tasks.map((t) => this.enqueue(t)));
  }

  public terminate() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.queue = [];
    this.active = 0;
  }

  public getStats() {
    return {
      maxWorkers: this.maxWorkers,
      active: this.active,
      queued: this.queue.length,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  }
}

// Singleton instance
let poolInstance: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!poolInstance) {
    poolInstance = new WorkerPool();
  }
  return poolInstance;
}
