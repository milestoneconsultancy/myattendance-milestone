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
          role: UserRole
          full_name: string
          username: string | null
          employee_code: string | null
          phone: string | null
          email: string | null
          is_active: boolean
          must_change_password: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: UserRole
          full_name: string
          username?: string | null
          employee_code?: string | null
          phone?: string | null
          email?: string | null
          is_active?: boolean
          must_change_password?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: UserRole
          full_name?: string
          username?: string | null
          employee_code?: string | null
          phone?: string | null
          email?: string | null
          is_active?: boolean
          must_change_password?: boolean
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
          name: string
          latitude: number
          longitude: number
          radius_meters: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          latitude: number
          longitude: number
          radius_meters: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          latitude?: number
          longitude?: number
          radius_meters?: number
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
          assigned_from: string
          assigned_to: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          project_id: string
          assigned_from?: string
          assigned_to?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          project_id?: string
          assigned_from?: string
          assigned_to?: string | null
          is_active?: boolean
          created_at?: string
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
      employee_geofence_assignments: {
        Row: {
          id: string
          employee_id: string
          geofence_id: string
          assigned_from: string
          assigned_to: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          geofence_id: string
          assigned_from?: string
          assigned_to?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          geofence_id?: string
          assigned_from?: string
          assigned_to?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'employee_geofence_assignments_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employee_geofence_assignments_geofence_id_fkey'
            columns: ['geofence_id']
            isOneToOne: false
            referencedRelation: 'geofences'
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
          geofence_id: string | null
          device_id: string | null
          event_type: AttendanceEventType
          event_time: string
          latitude: number | null
          longitude: number | null
          distance_meters: number | null
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          project_id: string
          geofence_id?: string | null
          device_id?: string | null
          event_type: AttendanceEventType
          event_time?: string
          latitude?: number | null
          longitude?: number | null
          distance_meters?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          project_id?: string
          geofence_id?: string | null
          device_id?: string | null
          event_type?: AttendanceEventType
          event_time?: string
          latitude?: number | null
          longitude?: number | null
          distance_meters?: number | null
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
          attendance_id: string
          changed_by: string
          old_status: string
          new_status: string
          old_sign_in_at: string | null
          new_sign_in_at: string | null
          old_sign_out_at: string | null
          new_sign_out_at: string | null
          remark: string
          changed_at: string
        }
        Insert: {
          id?: string
          attendance_id: string
          changed_by: string
          old_status: string
          new_status: string
          old_sign_in_at?: string | null
          new_sign_in_at?: string | null
          old_sign_out_at?: string | null
          new_sign_out_at?: string | null
          remark: string
          changed_at?: string
        }
        Update: {
          id?: string
          attendance_id?: string
          changed_by?: string
          old_status?: string
          new_status?: string
          old_sign_in_at?: string | null
          new_sign_in_at?: string | null
          old_sign_out_at?: string | null
          new_sign_out_at?: string | null
          remark?: string
          changed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_adjustments_attendance_id_fkey'
            columns: ['attendance_id']
            isOneToOne: false
            referencedRelation: 'daily_attendance'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_adjustments_changed_by_fkey'
            columns: ['changed_by']
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
          entity_type: string | null
          entity_id: string | null
          old_data: Json | null
          new_data: Json | null
          remark: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          remark?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          remark?: string | null
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
export type EmployeeGeofenceAssignment = Database['public']['Tables']['employee_geofence_assignments']['Row']
export type Device = Database['public']['Tables']['devices']['Row']
export type AttendanceEvent = Database['public']['Tables']['attendance_events']['Row']
export type DailyAttendance = Database['public']['Tables']['daily_attendance']['Row']
export type AttendanceAdjustment = Database['public']['Tables']['attendance_adjustments']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
