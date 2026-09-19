import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { auditActor } from "../schema";
import type { AuditAction, AuditEntityTable, FieldChange } from "./rules";

export type AuditActor = Infer<typeof auditActor>;

export type AuditEventInput = {
  /** Absent only for account-level events. */
  matchmakerId?: Id<"matchmakers">;
  candidateId?: Id<"candidates">;
  actor: AuditActor;
  action: AuditAction;
  entity: { table: AuditEntityTable; id: string };
  changes?: FieldChange[];
  relatedEntityId?: string;
  reason?: string;
};

/**
 * Appends one event to the audit trail.
 *
 * Call it from the mutation that makes the change, never from a scheduled
 * follow-up: the event and the change then commit or roll back together, so a
 * change without its audit record cannot exist. There is deliberately no
 * function that updates or deletes an audit event.
 */
export async function recordAudit(
  ctx: MutationCtx,
  event: AuditEventInput,
): Promise<Id<"auditEvents">> {
  return await ctx.db.insert("auditEvents", {
    matchmakerId: event.matchmakerId,
    candidateId: event.candidateId,
    actor: event.actor,
    action: event.action,
    entityTable: event.entity.table,
    entityId: event.entity.id,
    changes: event.changes?.map((change) => ({
      field: change.field,
      before: encode(change.before),
      after: encode(change.after),
    })),
    relatedEntityId: event.relatedEntityId,
    reason: event.reason,
  });
}

function encode(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}
