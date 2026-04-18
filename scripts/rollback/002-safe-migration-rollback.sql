-- Manual rollback for migration version: 002-safe-migration
-- This rollback uses guards and avoids destructive operations on critical data.

DO $$
BEGIN
  IF to_regclass('public.schema_migration_logs') IS NOT NULL THEN
    INSERT INTO public.schema_migration_logs (version, executed_sql, success)
    VALUES ('002-safe-migration', 'ROLLBACK_START', NULL);
  END IF;

  IF to_regclass('public.payment_method_accounts') IS NOT NULL THEN
    ALTER TABLE public.payment_method_accounts
      DROP CONSTRAINT IF EXISTS payment_method_accounts_priority_positive_check;

    DROP INDEX IF EXISTS public.idx_payment_method_accounts_last_used;
    DROP INDEX IF EXISTS public.idx_payment_method_accounts_priority;
    DROP INDEX IF EXISTS public.idx_payment_method_accounts_active_priority_usage;

    ALTER TABLE public.payment_method_accounts
      DROP COLUMN IF EXISTS last_used,
      DROP COLUMN IF EXISTS priority;
  END IF;

  IF to_regclass('public.point_topups') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_point_topups_rejection_reason;

    ALTER TABLE public.point_topups
      DROP COLUMN IF EXISTS rejection_reason;
  END IF;

  IF to_regclass('public.point_transactions') IS NOT NULL THEN
    ALTER TABLE public.point_transactions
      DROP CONSTRAINT IF EXISTS point_transactions_status_allowed_check;

    DROP INDEX IF EXISTS public.idx_point_transactions_status;
    DROP INDEX IF EXISTS public.idx_point_transactions_reference_status;

    ALTER TABLE public.point_transactions
      DROP COLUMN IF EXISTS status;
  END IF;

  -- Required manual reset of migration-applied marker.
  DELETE FROM public.schema_migrations
  WHERE version = '002-safe-migration';

  IF to_regclass('public.schema_migration_rollbacks') IS NOT NULL THEN
    DELETE FROM public.schema_migration_rollbacks
    WHERE version = '002-safe-migration';
  END IF;

  IF to_regclass('public.schema_migration_logs') IS NOT NULL THEN
    INSERT INTO public.schema_migration_logs (version, executed_sql, success)
    VALUES ('002-safe-migration', 'ROLLBACK_SUCCESS', true);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    IF to_regclass('public.schema_migration_logs') IS NOT NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES ('002-safe-migration', format('ROLLBACK_FAILED: %s', SQLERRM), false);
    END IF;
    RAISE;
END
$$;
