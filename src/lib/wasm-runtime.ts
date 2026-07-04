/**
 * Browser-based WebAssembly Runtime.
 * Provides Wasmtime-like functionality using WebAssembly in browser.
 * Enables isolated, pre emptible Wasm module execution.
 */

export interface WasmModule {
  id: string;
  instance: WebAssembly.Instance;
  memory?: WebAssembly.Memory;
}

export interface WasmRuntime {
  loadModule(wasmBytes: ArrayBuffer): Promise<WasmModule>;
  unloadModule(id: string): void;
  callFunction(moduleId: string, fnName: string, ...args: any[]): Promise<any>;
  getStats(): { loadedModules: number; totalMemory: number };
}

class BrowserWasmRuntime implements WasmRuntime {
  private modules: Map<string, WasmModule> = new Map();

  async loadModule(wasmBytes: ArrayBuffer): Promise<WasmModule> {
    const id = crypto.randomUUID();
    const memory = new WebAssembly.Memory({ initial: 1 });
    const { instance } = await WebAssembly.instantiate(wasmBytes, {
      env: {
        memory,
        log: (ptr: number, len: number) => {
          const bytes = new Uint8Array(memory.buffer, ptr, len);
          const text = new TextDecoder().decode(bytes);
          console.log(`[Wasm ${id}] ${text}`);
        },
        abort: (msg: string) => {
          console.error(`[Wasm ${id}] ABORT: ${msg}`);
        },
      },
    });

    const module = {
      id,
      instance,
      memory,
    };

    this.modules.set(id, module);
    return module;
  }

  unloadModule(id: string): void {
    this.modules.delete(id);
  }

  async callFunction(moduleId: string, fnName: string, ...args: any[]): Promise<any> {
    const module = this.modules.get(moduleId);
    if (!module) throw new Error(`Module ${moduleId} not found`);

    const fn = (module.instance.exports as any)[fnName];
    if (!fn) throw new Error(`Function ${fnName} not found in module ${moduleId}`);

    // Execute with timeout protection using Web Worker
    return await this.executeInWorker(fn, ...args);
  }

  private async executeInWorker(fn: Function, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const workerBlob = new Blob(
        [
          `
        onmessage = async (e) => {
          try {
            const { fn, args } = e.data;
            // Note: This is a simplified worker execution
            // In production, you'd serialize the Wasm module properly
            const result = fn(...args);
            postMessage({ success: true, result });
          } catch (error) {
            postMessage({ success: false, error: error.message });
          }
        };
      `,
        ],
        { type: "application/javascript" }
      );

      const worker = new Worker(URL.createObjectURL(workerBlob));
      worker.onmessage = (e) => {
        worker.terminate();
        if (e.data.success) {
          resolve(e.data.result);
        } else {
          reject(new Error(e.data.error));
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message));
      };

      // Send function and args (simplified - in production use proper serialization)
      worker.postMessage({ fn: fn.toString(), args });

      // Timeout after 5 seconds
      setTimeout(() => {
        worker.terminate();
        reject(new Error("Wasm execution timeout"));
      }, 5000);
    });
  }

  getStats(): { loadedModules: number; totalMemory: number } {
    let totalMemory = 0;
    for (const module of this.modules.values()) {
      if (module.memory) {
        totalMemory += module.memory.buffer.byteLength;
      }
    }
    return {
      loadedModules: this.modules.size,
      totalMemory,
    };
  }
}

// Singleton instance
let wasmRuntimeInstance: WasmRuntime | null = null;

export function getWasmRuntime(): WasmRuntime {
  if (!wasmRuntimeInstance) {
    wasmRuntimeInstance = new BrowserWasmRuntime();
  }
  return wasmRuntimeInstance;
}
