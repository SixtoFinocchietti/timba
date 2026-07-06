-- Migración 001: Estados de deudas para flujo de pago
-- Ejecutar en el dashboard de Supabase → SQL Editor

-- 1. Ampliar el CHECK constraint de estados
ALTER TABLE deudas DROP CONSTRAINT IF EXISTS deudas_estado_check;
ALTER TABLE deudas ADD CONSTRAINT deudas_estado_check
  CHECK (estado IN ('pendiente', 'pago_informado', 'finalizada', 'cancelada'));

-- 2. Columna para registrar cuándo se cerró la deuda
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS fecha_cierre timestamptz;

-- 3. Política RLS para que acreedor y deudor puedan actualizar su deuda
DROP POLICY IF EXISTS "deudas_update" ON deudas;
CREATE POLICY "deudas_update" ON deudas FOR UPDATE
  USING (auth.uid() = acreedor_id OR auth.uid() = deudor_id);

-- 4. Política RLS para que el creador de la timba pueda insertar deudas al cerrarla
DROP POLICY IF EXISTS "deudas_insert" ON deudas;
CREATE POLICY "deudas_insert" ON deudas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timbas
      WHERE timbas.id = deudas.timba_id
        AND timbas.creador_id = auth.uid()
    )
  );
