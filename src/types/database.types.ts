export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'employee'
export type AttendanceEventType = 'SIGN_IN' | 'SIGN_OUT'
export type AttendanceStatus = 'present' | 'absent'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: UserRole
          phone: string | null
          employee_code: string | null
          must_change_password: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role?: UserRole
          phone?: string | null
          employee_code?: string | null
          must_change_password?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: UserRole
          phone?: string | null
          employee_code?: string | null
          must_change_password?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          name: string
          code: string | null
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          code?: string | null
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          code?: string | null
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      geofences: {
        Row: {
          id: string
          project_id: string
          latitude: number
          longitude: number
          radius: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          latitude: number
          longitude: number
          radius: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          latitude?: number
          longitude?: number
          radius?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'geofences_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      employee_project_assignments: {
        Row: {
          id: string
          employee_id: string
          project_id: string
          assigned_at: string
          assigned_by: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          project_id: string
          assigned_at?: string
          assigned_by?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          project_id?: string
          assigned_at?: string
          assigned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'employee_project_assignments_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employee_project_assignments_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      devices: {
        Row: {
          id: string
          employee_id: string
          device_id: string
          device_name: string | null
          is_active: boolean
          bound_at: string
          last_used_at: string | null
          unbound_at: string | null
          unbound_by: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          device_id: string
          device_name?: string | null
          is_active?: boolean
          bound_at?: string
          last_used_at?: string | null
          unbound_at?: string | null
          unbound_by?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          device_id?: string
          device_name?: string | null
          is_active?: boolean
          bound_at?: string
          last_used_at?: string | null
          unbound_at?: string | null
          unbound_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'devices_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      attendance_events: {
        Row: {
          id: string
          employee_id: string
          project_id: string
          event_type: AttendanceEventType
          timestamp: string
          latitude: number
          longitude: number
          is_inside_geofence: boolean
          device_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          project_id: string
          event_type: AttendanceEventType
          timestamp?: string
          latitude: number
          longitude: number
          is_inside_geofence: boolean
          device_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          project_id?: string
          event_type?: AttendanceEventType
          timestamp?: string
          latitude?: number
          longitude?: number
          is_inside_geofence?: boolean
          device_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_events_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_events_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      daily_attendance: {
        Row: {
          id: string
          employee_id: string
          project_id: string | null
          attendance_date: string
          status: AttendanceStatus
          sign_in_at: string | null
          sign_out_at: string | null
          working_minutes: number | null
          attendance_source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          project_id?: string | null
          attendance_date?: string
          status?: AttendanceStatus
          sign_in_at?: string | null
          sign_out_at?: string | null
          working_minutes?: number | null
          attendance_source?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          project_id?: string | null
          attendance_date?: string
          status?: AttendanceStatus
          sign_in_at?: string | null
          sign_out_at?: string | null
          working_minutes?: number | null
          attendance_source?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'daily_attendance_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_attendance_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      attendance_adjustments: {
        Row: {
          id: string
          daily_attendance_id: string
          adjusted_by: string
          previous_value: Json
          new_value: Json
          remark: string
          created_at: string
        }
        Insert: {
          id?: string
          daily_attendance_id: string
          adjusted_by: string
          previous_value: Json
          new_value: Json
          remark: string
          created_at?: string
        }
        Update: {
          id?: string
          daily_attendance_id?: string
          adjusted_by?: string
          previous_value?: Json
          new_value?: Json
          remark?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_adjustments_daily_attendance_id_fkey'
            columns: ['daily_attendance_id']
            isOneToOne: false
            referencedRelation: 'daily_attendance'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_adjustments_adjusted_by_fkey'
            columns: ['adjusted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          target_entity: string
          target_id: string | null
          details: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          target_entity: string
          target_id?: string | null
          details?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          target_entity?: string
          target_id?: string | null
          details?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
      attendance_event_type: AttendanceEventType
      attendance_status: AttendanceStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenient type aliases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Geofence = Database['public']['Tables']['geofences']['Row']
export type EmployeeProjectAssignment = Database['public']['Tables']['employee_project_assignments']['Row']
export type Device = Database['public']['Tables']['devices']['Row']
export type AttendanceEvent = Database['public']['Tables']['attendance_events']['Row']
export type DailyAttendance = Database['public']['Tables']['daily_attendance']['Row']
export type AttendanceAdjustment = Database['public']['Tables']['attendance_adjustments']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
