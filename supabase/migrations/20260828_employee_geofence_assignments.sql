-- ====================================================================
-- Milestone Consultancy Attendance System
-- Migration: employee_geofence_assignments junction table
-- ====================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.employee_geofence_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    geofence_id UUID NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
    assigned_from DATE NOT NULL DEFAULT CURRENT_DATE,
    assigned_to DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_employee_geofence_assignment UNIQUE (employee_id, geofence_id)
);

-- 2. Indices for high performance lookups
CREATE INDEX IF NOT EXISTS idx_emp_geo_assign_employee_id ON public.employee_geofence_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_geo_assign_geofence_id ON public.employee_geofence_assignments(geofence_id);
CREATE INDEX IF NOT EXISTS idx_emp_geo_assign_active ON public.employee_geofence_assignments(is_active);

-- 3. Enable RLS
ALTER TABLE public.employee_geofence_assignments ENABLE ROW LEVEL SECURITY;

-- 4. Grants
GRANT ALL ON TABLE public.employee_geofence_assignments TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_geofence_assignments TO authenticated;
GRANT SELECT ON TABLE public.employee_geofence_assignments TO anon;

-- 5. Policies
DROP POLICY IF EXISTS "Admins full access to employee_geofence_assignments" ON public.employee_geofence_assignments;
CREATE POLICY "Admins full access to employee_geofence_assignments"
ON public.employee_geofence_assignments
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

DROP POLICY IF EXISTS "Employees can view own active geofence assignments" ON public.employee_geofence_assignments;
CREATE POLICY "Employees can view own active geofence assignments"
ON public.employee_geofence_assignments
FOR SELECT
TO authenticated
USING (
    employee_id = auth.uid()
    AND is_active = true
);

