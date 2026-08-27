-- ==============================================================================
-- MILESTONE CONSULTANCY ATTENDANCE SYSTEM
-- COMPLETE DATABASE SCHEMA RECONCILIATION & RLS POLICIES
-- Idempotent, non-destructive migration ensuring all tables, columns, constraints & RLS match
-- ==============================================================================

-- 1. Ensure public schema usage
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- 2. Security Definer Helper: is_admin() (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ==============================================================================
-- 3. SCHEMA RECONCILIATION FOR ALL 9 TABLES
-- ==============================================================================

-- TABLE 1: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
    phone TEXT,
    employee_code TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 2: projects
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 3: geofences
CREATE TABLE IF NOT EXISTS public.geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius DOUBLE PRECISION NOT NULL DEFAULT 150,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 4: employee_project_assignments
CREATE TABLE IF NOT EXISTS public.employee_project_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT unique_employee_project UNIQUE (employee_id, project_id)
);

-- TABLE 5: devices
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    unbound_at TIMESTAMPTZ,
    unbound_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- TABLE 6: daily_attendance
CREATE TABLE IF NOT EXISTS public.daily_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sign_in_time TEXT,
    sign_out_time TEXT,
    total_working_hours NUMERIC(5, 2),
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
    is_adjusted BOOLEAN NOT NULL DEFAULT false,
    adjustment_remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconcile daily_attendance columns if table already existed with missing/renamed fields:
DO $$
BEGIN
    -- If 'date' column existed, rename to 'attendance_date'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'date'
    ) THEN
        ALTER TABLE public.daily_attendance RENAME COLUMN "date" TO attendance_date;
    END IF;

    -- Ensure attendance_date exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'attendance_date'
    ) THEN
        ALTER TABLE public.daily_attendance ADD COLUMN attendance_date DATE NOT NULL DEFAULT CURRENT_DATE;
    END IF;

    -- Ensure sign_in_time exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'sign_in_time'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'check_in_time'
        ) THEN
            ALTER TABLE public.daily_attendance RENAME COLUMN check_in_time TO sign_in_time;
        ELSE
            ALTER TABLE public.daily_attendance ADD COLUMN sign_in_time TEXT;
        END IF;
    END IF;

    -- Ensure sign_out_time exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'sign_out_time'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'check_out_time'
        ) THEN
            ALTER TABLE public.daily_attendance RENAME COLUMN check_out_time TO sign_out_time;
        ELSE
            ALTER TABLE public.daily_attendance ADD COLUMN sign_out_time TEXT;
        END IF;
    END IF;

    -- Ensure is_adjusted exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'is_adjusted'
    ) THEN
        ALTER TABLE public.daily_attendance ADD COLUMN is_adjusted BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- Ensure adjustment_remark exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'adjustment_remark'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'adjustment_reason'
        ) THEN
            ALTER TABLE public.daily_attendance RENAME COLUMN adjustment_reason TO adjustment_remark;
        ELSE
            ALTER TABLE public.daily_attendance ADD COLUMN adjustment_remark TEXT;
        END IF;
    END IF;

    -- Ensure total_working_hours exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_attendance' AND column_name = 'total_working_hours'
    ) THEN
        ALTER TABLE public.daily_attendance ADD COLUMN total_working_hours NUMERIC(5, 2);
    END IF;
END $$;

-- TABLE 7: attendance_events
CREATE TABLE IF NOT EXISTS public.attendance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('SIGN_IN', 'SIGN_OUT', 'CHECK_IN', 'CHECK_OUT')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_inside_geofence BOOLEAN NOT NULL,
    device_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 8: attendance_adjustments
CREATE TABLE IF NOT EXISTS public.attendance_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_attendance_id UUID NOT NULL REFERENCES public.daily_attendance(id) ON DELETE CASCADE,
    adjusted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    previous_value JSONB NOT NULL,
    new_value JSONB NOT NULL,
    remark TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 9: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. GRANTS TO 'authenticated' ROLE
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
  public.profiles,
  public.projects,
  public.geofences,
  public.employee_project_assignments,
  public.devices,
  public.attendance_events,
  public.daily_attendance,
  public.attendance_adjustments,
  public.audit_logs
TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all 9 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Clean existing policies idempotently
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins update any" ON public.profiles;
DROP POLICY IF EXISTS "Users and Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

DROP POLICY IF EXISTS "Admins have full access to projects" ON public.projects;
DROP POLICY IF EXISTS "Employees can view assigned active projects" ON public.projects;

DROP POLICY IF EXISTS "Admins have full access to geofences" ON public.geofences;
DROP POLICY IF EXISTS "Employees can view geofences of assigned projects" ON public.geofences;

DROP POLICY IF EXISTS "Admins have full access to assignments" ON public.employee_project_assignments;
DROP POLICY IF EXISTS "Employees can view own assignments" ON public.employee_project_assignments;

DROP POLICY IF EXISTS "Admins have full access to devices" ON public.devices;
DROP POLICY IF EXISTS "Employees can view own devices" ON public.devices;
DROP POLICY IF EXISTS "Employees can insert own device" ON public.devices;
DROP POLICY IF EXISTS "Employees can update own device" ON public.devices;
DROP POLICY IF EXISTS "Employees can manage own device" ON public.devices;

DROP POLICY IF EXISTS "Admins have full access to daily attendance" ON public.daily_attendance;
DROP POLICY IF EXISTS "Employees can view own daily attendance" ON public.daily_attendance;
DROP POLICY IF EXISTS "Employees can insert own daily attendance" ON public.daily_attendance;
DROP POLICY IF EXISTS "Employees can update own daily attendance" ON public.daily_attendance;
DROP POLICY IF EXISTS "Employees can view and manage own daily attendance" ON public.daily_attendance;

DROP POLICY IF EXISTS "Admins can view all attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Employees can view own attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Employees can insert own attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Employees can view and insert own attendance events" ON public.attendance_events;

DROP POLICY IF EXISTS "Admins can view all adjustments" ON public.attendance_adjustments;
DROP POLICY IF EXISTS "Admins can insert adjustments" ON public.attendance_adjustments;
DROP POLICY IF EXISTS "Employees can view adjustments on own attendance" ON public.attendance_adjustments;
DROP POLICY IF EXISTS "Admins can view and create adjustments" ON public.attendance_adjustments;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- CREATE RLS POLICIES

-- PROFILES
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.is_admin() OR id = auth.uid());

CREATE POLICY "Users can update own profile or admins update any"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

-- PROJECTS
CREATE POLICY "Admins have full access to projects"
ON public.projects FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view assigned active projects"
ON public.projects FOR SELECT TO authenticated
USING (
  is_active = true AND id IN (
    SELECT project_id FROM public.employee_project_assignments WHERE employee_id = auth.uid()
  )
);

-- GEOFENCES
CREATE POLICY "Admins have full access to geofences"
ON public.geofences FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view geofences of assigned projects"
ON public.geofences FOR SELECT TO authenticated
USING (
  is_active = true AND project_id IN (
    SELECT project_id FROM public.employee_project_assignments WHERE employee_id = auth.uid()
  )
);

-- EMPLOYEE_PROJECT_ASSIGNMENTS
CREATE POLICY "Admins have full access to assignments"
ON public.employee_project_assignments FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view own assignments"
ON public.employee_project_assignments FOR SELECT TO authenticated
USING (employee_id = auth.uid());

-- DEVICES
CREATE POLICY "Admins have full access to devices"
ON public.devices FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view own devices"
ON public.devices FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY "Employees can insert own device"
ON public.devices FOR INSERT TO authenticated
WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Employees can update own device"
ON public.devices FOR UPDATE TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

-- DAILY_ATTENDANCE
CREATE POLICY "Admins have full access to daily attendance"
ON public.daily_attendance FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view own daily attendance"
ON public.daily_attendance FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY "Employees can insert own daily attendance"
ON public.daily_attendance FOR INSERT TO authenticated
WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Employees can update own daily attendance"
ON public.daily_attendance FOR UPDATE TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

-- ATTENDANCE_EVENTS
CREATE POLICY "Admins can view all attendance events"
ON public.attendance_events FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Employees can view own attendance events"
ON public.attendance_events FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY "Employees can insert own attendance events"
ON public.attendance_events FOR INSERT TO authenticated
WITH CHECK (employee_id = auth.uid());

-- ATTENDANCE_ADJUSTMENTS
CREATE POLICY "Admins can view all adjustments"
ON public.attendance_adjustments FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert adjustments"
ON public.attendance_adjustments FOR INSERT TO authenticated
WITH CHECK (public.is_admin() AND adjusted_by = auth.uid());

CREATE POLICY "Employees can view adjustments on own attendance"
ON public.attendance_adjustments FOR SELECT TO authenticated
USING (
  daily_attendance_id IN (
    SELECT id FROM public.daily_attendance WHERE employee_id = auth.uid()
  )
);

-- AUDIT_LOGS (Append-only)
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() OR public.is_admin());
