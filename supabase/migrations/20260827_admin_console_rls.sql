-- ==============================================================================
-- MILESTONE CONSULTANCY ATTENDANCE SYSTEM
-- DATABASE GRANTS & ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 1. Ensure RLS is enabled on all 9 public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Grant table-level access permissions to the 'authenticated' role
GRANT USAGE ON SCHEMA public TO authenticated;

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

-- 3. Security Definer Helper: is_admin()
-- Evaluates if the executing authenticated user is an active Administrator
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

-- Grant execution permission on the helper function to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ==============================================================================
-- 4. CLEANUP EXISTING POLICIES (Idempotent Migration)
-- ==============================================================================

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users and Admins can update profiles" ON public.profiles;

-- projects
DROP POLICY IF EXISTS "Admins have full access to projects" ON public.projects;
DROP POLICY IF EXISTS "Employees can view assigned active projects" ON public.projects;

-- geofences
DROP POLICY IF EXISTS "Admins have full access to geofences" ON public.geofences;
DROP POLICY IF EXISTS "Employees can view geofences of assigned projects" ON public.geofences;

-- employee_project_assignments
DROP POLICY IF EXISTS "Admins have full access to assignments" ON public.employee_project_assignments;
DROP POLICY IF EXISTS "Employees can view own assignments" ON public.employee_project_assignments;

-- devices
DROP POLICY IF EXISTS "Admins have full access to devices" ON public.devices;
DROP POLICY IF EXISTS "Employees can manage own device" ON public.devices;

-- daily_attendance
DROP POLICY IF EXISTS "Admins have full access to daily attendance" ON public.daily_attendance;
DROP POLICY IF EXISTS "Employees can view and manage own daily attendance" ON public.daily_attendance;

-- attendance_events
DROP POLICY IF EXISTS "Admins can view all attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Employees can view and insert own attendance events" ON public.attendance_events;

-- attendance_adjustments
DROP POLICY IF EXISTS "Admins can view and create adjustments" ON public.attendance_adjustments;
DROP POLICY IF EXISTS "Employees can view own attendance adjustments" ON public.attendance_adjustments;

-- audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;


-- ==============================================================================
-- 5. CREATE GRANULAR RLS POLICIES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TABLE: profiles
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR public.is_admin()
);

CREATE POLICY "Admins can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR id = auth.uid()
);

CREATE POLICY "Users can update own profile or admins update any"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid() OR public.is_admin()
)
WITH CHECK (
  id = auth.uid() OR public.is_admin()
);

-- ------------------------------------------------------------------------------
-- TABLE: projects
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins have full access to projects"
ON public.projects
FOR ALL
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "Employees can view assigned active projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  is_active = true AND id IN (
    SELECT project_id 
    FROM public.employee_project_assignments 
    WHERE employee_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- TABLE: geofences
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins have full access to geofences"
ON public.geofences
FOR ALL
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "Employees can view geofences of assigned projects"
ON public.geofences
FOR SELECT
TO authenticated
USING (
  is_active = true AND project_id IN (
    SELECT project_id 
    FROM public.employee_project_assignments 
    WHERE employee_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- TABLE: employee_project_assignments
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins have full access to assignments"
ON public.employee_project_assignments
FOR ALL
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "Employees can view own assignments"
ON public.employee_project_assignments
FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
);

-- ------------------------------------------------------------------------------
-- TABLE: devices
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins have full access to devices"
ON public.devices
FOR ALL
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "Employees can view own devices"
ON public.devices
FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
);

CREATE POLICY "Employees can insert own device"
ON public.devices
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = auth.uid()
);

CREATE POLICY "Employees can update own device"
ON public.devices
FOR UPDATE
TO authenticated
USING (
  employee_id = auth.uid()
)
WITH CHECK (
  employee_id = auth.uid()
);

-- ------------------------------------------------------------------------------
-- TABLE: daily_attendance
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins have full access to daily attendance"
ON public.daily_attendance
FOR ALL
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "Employees can view own daily attendance"
ON public.daily_attendance
FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
);

CREATE POLICY "Employees can insert own daily attendance"
ON public.daily_attendance
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = auth.uid()
);

CREATE POLICY "Employees can update own daily attendance"
ON public.daily_attendance
FOR UPDATE
TO authenticated
USING (
  employee_id = auth.uid()
)
WITH CHECK (
  employee_id = auth.uid()
);

-- ------------------------------------------------------------------------------
-- TABLE: attendance_events
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins can view all attendance events"
ON public.attendance_events
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

CREATE POLICY "Employees can view own attendance events"
ON public.attendance_events
FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
);

CREATE POLICY "Employees can insert own attendance events"
ON public.attendance_events
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = auth.uid()
);

-- ------------------------------------------------------------------------------
-- TABLE: attendance_adjustments
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins can view all adjustments"
ON public.attendance_adjustments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

CREATE POLICY "Admins can insert adjustments"
ON public.attendance_adjustments
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() AND adjusted_by = auth.uid()
);

CREATE POLICY "Employees can view adjustments on own attendance"
ON public.attendance_adjustments
FOR SELECT
TO authenticated
USING (
  daily_attendance_id IN (
    SELECT id FROM public.daily_attendance WHERE employee_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- TABLE: audit_logs (Append-only)
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid() OR public.is_admin()
);

