-- ==============================================================================
-- MILESTONE CONSULTANCY ATTENDANCE SYSTEM
-- COMPLETE DATABASE SCHEMA INTROSPECTION QUERY
-- Run this in Supabase SQL Editor to see all existing tables, columns, constraints & foreign keys
-- ==============================================================================

-- 1. All Columns across all 9 tables
SELECT 
    table_schema,
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles',
    'projects',
    'geofences',
    'employee_project_assignments',
    'devices',
    'daily_attendance',
    'attendance_events',
    'attendance_adjustments',
    'audit_logs'
  )
ORDER BY table_name, ordinal_position;

-- 2. Foreign Key Relationships across all 9 tables
SELECT
    tc.table_schema, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'profiles',
    'projects',
    'geofences',
    'employee_project_assignments',
    'devices',
    'daily_attendance',
    'attendance_events',
    'attendance_adjustments',
    'audit_logs'
  )
ORDER BY tc.table_name;
