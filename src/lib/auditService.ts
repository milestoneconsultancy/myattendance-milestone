import { supabase } from './supabaseClient'
import type { Json } from '../types/database.types'

export interface LogAuditParams {
  actorId?: string | null
  action: string
  targetEntity: string
  targetId?: string | null
  details?: Record<string, Json | unknown> | null
}

export async function logAuditEvent({
  actorId,
  action,
  targetEntity,
  targetId,
  details
}: LogAuditParams): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: actorId ?? null,
      action,
      target_entity: targetEntity,
      target_id: targetId ?? null,
      details: (details as Json) ?? null
    })

    if (error) {
      console.warn('[AuditService] Failed to record audit log:', error.message)
    }
  } catch (err) {
    console.warn('[AuditService] Unexpected error recording audit log:', err)
  }
}

