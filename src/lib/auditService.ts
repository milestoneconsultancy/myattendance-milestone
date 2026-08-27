import { supabase } from './supabaseClient'
import type { Json } from '../types/database.types'

export interface LogAuditParams {
  actorId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  oldData?: Record<string, Json | unknown> | null
  newData?: Record<string, Json | unknown> | null
  remark?: string | null
}

export async function logAuditEvent({
  actorId,
  action,
  entityType,
  entityId,
  oldData,
  newData,
  remark
}: LogAuditParams): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: actorId ?? null,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      old_data: (oldData as Json) ?? null,
      new_data: (newData as Json) ?? null,
      remark: remark ?? null
    })

    if (error) {
      console.warn('[AuditService] Failed to record audit log:', error.message)
    }
  } catch (err) {
    console.warn('[AuditService] Unexpected error recording audit log:', err)
  }
}


