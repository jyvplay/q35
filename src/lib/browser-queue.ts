/**
 * Browser-based Redis-like Queue using IndexedDB + BroadcastChannel.
 * Provides distributed queue functionality for browser environments.
 * Works in both online and iOS environments.
 */

const DB_NAME = "browser-queue-db";
const DB_VERSION = 1;
const STORE_NAME = "queue";

export interface QueueItem<T = any> {
  id: string;
  data: T;
  priority: number;
  timestamp: number;
  ttl?: number;
}

export class BrowserQueue {
  private db: IDBDatabase | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Map<string, (item: QueueItem) => void> = new Map();

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("priority", "priority", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.broadcastChannel = new BroadcastChannel("browser-queue-channel");
        this.broadcastChannel.onmessage = (event) => {
          const item = event.data as QueueItem;
          const listener = this.listeners.get("*");
          if (listener) listener(item);
        };
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async enqueue<T>(data: T, priority = 0, ttl?: number): Promise<string> {
    if (!this.db) throw new Error("Queue not initialized");

    const id = crypto.randomUUID();
    const item: QueueItem<T> = {
      id,
      data,
      priority,
      timestamp: Date.now(),
      ttl,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => {
        this.broadcastChannel?.postMessage(item);
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async dequeue<T>(): Promise<QueueItem<T> | null> {
    if (!this.db) throw new Error("Queue not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("priority");
      const request = index.openCursor(null, "prev");

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value as QueueItem<T>;
          // Check TTL
          if (item.ttl && Date.now() > item.timestamp + item.ttl) {
            cursor.delete();
            this.dequeue<T>().then(resolve).catch(reject);
          } else {
            cursor.delete();
            resolve(item);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async peek<T>(): Promise<QueueItem<T> | null> {
    if (!this.db) throw new Error("Queue not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("priority");
      const request = index.openCursor(null, "prev");

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        resolve(cursor ? (cursor.value as QueueItem<T>) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async length(): Promise<number> {
    if (!this.db) throw new Error("Queue not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error("Queue not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  subscribe(listener: (item: QueueItem) => void): () => void {
    this.listeners.set("*", listener);
    return () => this.listeners.delete("*");
  }

  async close(): Promise<void> {
    this.broadcastChannel?.close();
    this.db?.close();
    this.db = null;
    this.broadcastChannel = null;
  }
}

// Singleton instance
let queueInstance: BrowserQueue | null = null;

export function getBrowserQueue(): BrowserQueue {
  if (!queueInstance) {
    queueInstance = new BrowserQueue();
  }
  return queueInstance;
}

/**
 * mDNS-like Discovery using BroadcastChannel.
 * Enables browser-to-browser discovery in local network.
 */
export class BrowserDiscovery {
  private channel: BroadcastChannel;
  private peers: Map<string, { id: string; timestamp: number; data: any }> = new Map();
  private heartbeatInterval: number | null = null;

  constructor(nodeId: string) {
    this.channel = new BroadcastChannel("browser-mdns-channel");
    this.channel.onmessage = (event) => {
      const message = event.data as { type: string; nodeId: string; data?: any };
      if (message.type === "discovery") {
        this.peers.set(message.nodeId, {
          id: message.nodeId,
          timestamp: Date.now(),
          data: message.data,
        });
      }
    };

    // Send heartbeat every 5 seconds
    this.heartbeatInterval = window.setInterval(() => {
      this.announce({ nodeId });
    }, 5000);
  }

  announce(data?: any): void {
    this.channel.postMessage({ type: "discovery", nodeId: crypto.randomUUID(), data });
  }

  getPeers(): Array<{ id: string; timestamp: number; data: any }> {
    const now = Date.now();
    // Remove peers that haven't sent heartbeat in 15 seconds
    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.timestamp > 15000) {
        this.peers.delete(id);
      }
    }
    return Array.from(this.peers.values());
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.channel.close();
  }
}
