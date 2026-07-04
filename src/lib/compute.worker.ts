/**
 * Compute Worker — Isolated computation thread.
 * Handles Pyodide execution, crypto operations, and heavy computation.
 */

import { hestonCallPrice, sabrImpliedVol, doubleMachineLearning, calculateAdjustedPower } from "./advanced-math";
import { runSandbox } from "./py-sandbox";

let pyodideInstance: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    let result: any;

    switch (type) {
      case "compute":
        result = await handleCompute(payload.fn, payload.args);
        break;
      case "pyodide":
        result = await handlePyodide(payload.code, payload.timeout);
        break;
      case "crypto":
        result = await handleCrypto(payload.operation, payload.data);
        break;
      case "scrape":
        result = await handleScrape(payload.urls, payload.maxConcurrency);
        break;
      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    self.postMessage({ taskId: id, success: true, result });
  } catch (error: any) {
    self.postMessage({ taskId: id, success: false, error: error.message });
  }
};

async function handleCompute(fn: string, args: any[]): Promise<any> {
  switch (fn) {
    case "heston":
      return hestonCallPrice(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8]);
    case "sabr":
      return sabrImpliedVol(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    case "dml":
      return doubleMachineLearning(args[0], args[1], args[2]);
    case "power":
      return calculateAdjustedPower(args[0], args[1], args[2], args[3]);
    case "sandbox":
      return runSandbox(args[0]);
    default:
      throw new Error(`Unknown compute function: ${fn}`);
  }
}

async function handlePyodide(code: string, timeout?: number): Promise<any> {
  // Initialize Pyodide if not already loaded
  if (!pyodideInstance) {
    // @ts-ignore
    const pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
    });
    pyodideInstance = pyodide;
  }

  // Execute with timeout protection
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Pyodide execution timeout")), timeout || 5000)
  );

  const execPromise = (async () => {
    await pyodideInstance.loadPackagesFromImports(code);
    return await pyodideInstance.runPythonAsync(code);
  })();

  return Promise.race([execPromise, timeoutPromise]);
}

async function handleCrypto(operation: string, data: string): Promise<any> {
  switch (operation) {
    case "hash": {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    case "sign": {
      // mTLS-like signing simulation
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const key = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key.privateKey,
        dataBuffer
      );
      return {
        signature: Array.from(new Uint8Array(signature))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
        publicKey: await crypto.subtle.exportKey("jwk", key.publicKey),
      };
    }
    default:
      throw new Error(`Unknown crypto operation: ${operation}`);
  }
}

async function handleScrape(urls: string[], maxConcurrency?: number): Promise<any[]> {
  // Parallel scraping with concurrency limit
  const results: any[] = [];
  const queue = [...urls];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < (maxConcurrency || 4) && queue.length > 0) {
      const url = queue.shift()!;
      const promise = (async () => {
        try {
          const response = await fetch(url);
          const text = await response.text();
          results.push({ url, success: true, content: text });
        } catch (error: any) {
          results.push({ url, success: false, error: error.message });
        }
      })();
      active.push(promise);
    }

    if (active.length > 0) {
      await Promise.race(active);
      const completedIndex = active.findIndex((p) => {
        const idx = active.indexOf(p);
        if (idx !== -1) {
          active.splice(idx, 1);
          return true;
        }
        return false;
      });
      if (completedIndex !== -1) {
        active.splice(completedIndex, 1);
      }
    }
  }

  return results;
}
