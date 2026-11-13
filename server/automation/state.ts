import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  initialAutomation,
  type AutomationState,
} from "../../shared/automation.js";
export interface Snapshot {
  revision: number;
  value: AutomationState;
}
export interface AutomationStore {
  read(): Promise<Snapshot>;
  compareAndSwap(revision: number, value: AutomationState): Promise<boolean>;
}
export class MemoryAutomationStore implements AutomationStore {
  private snapshot: Snapshot = { revision: 0, value: initialAutomation() };
  async read() {
    return structuredClone(this.snapshot);
  }
  async compareAndSwap(revision: number, value: AutomationState) {
    if (revision !== this.snapshot.revision) return false;
    this.snapshot = { revision: revision + 1, value: structuredClone(value) };
    return true;
  }
}
export class SupabaseAutomationStore implements AutomationStore {
  constructor(private db: SupabaseClient) {}
  async read(): Promise<Snapshot> {
    const { data, error } = await this.db
      .from("growth_runtime")
      .select("revision,state")
      .eq("id", 1)
      .single();
    if (error || !data)
      throw new Error(
        "Automation storage unavailable; check the new migration",
      );
    return {
      revision: data.revision,
      value: data.state ?? initialAutomation(),
    };
  }
  async compareAndSwap(revision: number, value: AutomationState) {
    const { data, error } = await this.db.rpc("growth_compare_and_swap", {
      expected_revision: revision,
      next_state: value,
    });
    if (error) throw new Error("Automation transaction failed");
    return data === true;
  }
}
export async function mutate<T>(
  store: AutomationStore,
  change: (state: AutomationState) => T,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const snapshot = await store.read();
    const result = change(snapshot.value);
    if (await store.compareAndSwap(snapshot.revision, snapshot.value))
      return result;
  }
  throw new Error("Workspace busy; retry shortly");
}
export function audit(
  s: AutomationState,
  action: string,
  entityId: string,
  detail: string,
  now = new Date(),
) {
  s.audit.push({
    id: randomUUID(),
    at: now.toISOString(),
    action,
    entityId,
    detail,
  });
  s.audit = s.audit.slice(-300); // PostgreSQL retains the complete append-only audit history.
}
export function alert(s: AutomationState, message: string, now = new Date()) {
  if (!s.alerts.some((a) => !a.acknowledged && a.message === message))
    s.alerts.push({
      id: randomUUID(),
      at: now.toISOString(),
      message,
      acknowledged: false,
    });
}
