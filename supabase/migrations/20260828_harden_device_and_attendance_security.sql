-- ============================================================
-- Migration: 20260828_harden_device_and_attendance_security.sql
-- Description: Hardens device binding, geofence assignment, and attendance security
-- ============================================================

-- 1. Ensure trigger function handle_new_user is reproducible
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
    insert into public.profiles (
        id,
        role,
        full_name,
        username,
        employee_code,
        phone,
        email,
        is_active,
        must_change_password
    )
    values (
        new.id,
        'employee',
        coalesce(new.raw_user_meta_data->>'full_name', 'Employee'),
        new.raw_user_meta_data->>'username',
        new.raw_user_meta_data->>'employee_code',
        new.raw_user_meta_data->>'phone',
        new.email,
        true,
        true
    )
    on conflict (id) do nothing;

    return new;
end;
$function$;

-- 2. Ensure trigger exists on auth.users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
    ) THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- 3. Ensure employee_project_assignments has all required columns and indices
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'employee_project_assignments' AND column_name = 'assigned_from'
    ) THEN
        ALTER TABLE public.employee_project_assignments ADD COLUMN assigned_from DATE NOT NULL DEFAULT CURRENT_DATE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'employee_project_assignments' AND column_name = 'assigned_to'
    ) THEN
        ALTER TABLE public.employee_project_assignments ADD COLUMN assigned_to DATE NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'employee_project_assignments' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.employee_project_assignments ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'employee_project_assignments' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.employee_project_assignments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 4. Unique constraints for atomicity & preventing race conditions
-- Unique active device per employee (ensures single active device binding guarantee)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_device_per_employee
ON public.devices (employee_id)
WHERE (is_active = true);

-- Unique daily attendance per employee per date (prevents duplicate clock-ins)
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_attendance_employee_date
ON public.daily_attendance (employee_id, attendance_date);

-- 5. Harden RLS policies on public.devices table
-- Drop legacy employee update policy to prevent employees from rewriting their bound device_id or is_active
DROP POLICY IF EXISTS "Employees can update own device" ON public.devices;
DROP POLICY IF EXISTS "Employees can insert own device" ON public.devices;
DROP POLICY IF EXISTS "Employees can view own devices" ON public.devices;
DROP POLICY IF EXISTS "Admins have full access to devices" ON public.devices;

-- Admins retain full management access (view, insert, update, delete)
CREATE POLICY "Admins have full access to devices"
ON public.devices FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Employees can read their own devices
CREATE POLICY "Employees can view own devices"
ON public.devices FOR SELECT TO authenticated
USING (employee_id = auth.uid());

-- Employees can only insert initial device binding if NO active device is already bound
CREATE POLICY "Employees can insert initial device binding"
ON public.devices FOR INSERT TO authenticated
WITH CHECK (
    employee_id = auth.uid()
    AND NOT EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.employee_id = auth.uid() AND d.is_active = true
    )
);

-- 6. Ensure RLS on employee_project_assignments
ALTER TABLE IF EXISTS public.employee_project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to assignments" ON public.employee_project_assignments;
DROP POLICY IF EXISTS "Employees can view own assignments" ON public.employee_project_assignments;

CREATE POLICY "Admins have full access to assignments"
ON public.employee_project_assignments FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view own assignments"
ON public.employee_project_assignments FOR SELECT TO authenticated
USING (employee_id = auth.uid());

-- 7. Ensure RLS on employee_geofence_assignments
ALTER TABLE IF EXISTS public.employee_geofence_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to employee geofence assignments" ON public.employee_geofence_assignments;
DROP POLICY IF EXISTS "Employees can view own geofence assignments" ON public.employee_geofence_assignments;

CREATE POLICY "Admins have full access to employee geofence assignments"
ON public.employee_geofence_assignments FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view own geofence assignments"
ON public.employee_geofence_assignments FOR SELECT TO authenticated
USING (employee_id = auth.uid());
