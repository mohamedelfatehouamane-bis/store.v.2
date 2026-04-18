import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { Client } from 'pg'

type MigrationFile = {
  fileName: string
  fullPath: string
  order: number
  version: string
  sql: string
  rollbackSql: string | null
}

const globalMigrationState = globalThis as unknown as {
  __migrationRunnerPromise?: Promise<void>
}

function isMigrationFile(fileName: string): boolean {
  return /^\d+.*\.sql$/i.test(fileName)
}

function getOrderFromFileName(fileName: string): number {
  const match = fileName.match(/^(\d+)/)
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
}

function getVersionFromSqlOrFile(sql: string, fileName: string): string {
  const versionMatch = sql.match(/--\s*migration-version\s*:\s*([^\r\n]+)/i)
  if (versionMatch?.[1]) {
    return versionMatch[1].trim()
  }

  return fileName.replace(/\.sql$/i, '')
}

function getRollbackSqlFromSql(sql: string): string | null {
  const rollbackBlockMatch = sql.match(/--\s*rollback-sql-start\s*\n([\s\S]*?)\n--\s*rollback-sql-end/i)
  if (rollbackBlockMatch?.[1]) {
    return rollbackBlockMatch[1].trim()
  }

  return null
}

async function loadRollbackFileForVersion(version: string): Promise<string | null> {
  const rollbackDir = path.join(process.cwd(), 'scripts', 'rollback')
  const rollbackFilePath = path.join(rollbackDir, `${version}-rollback.sql`)

  try {
    const rollbackSql = await readFile(rollbackFilePath, 'utf8')
    return rollbackSql
  } catch {
    return null
  }
}

async function discoverMigrations(): Promise<MigrationFile[]> {
  const scriptsDir = path.join(process.cwd(), 'scripts')
  const files = await readdir(scriptsDir, { withFileTypes: true })

  const migrationFiles = files
    .filter((entry) => entry.isFile() && isMigrationFile(entry.name))
    .map((entry) => entry.name)

  const loaded = await Promise.all(
    migrationFiles.map(async (fileName) => {
      const fullPath = path.join(scriptsDir, fileName)
      const sql = await readFile(fullPath, 'utf8')
      const version = getVersionFromSqlOrFile(sql, fileName)
      const rollbackFromInlineSql = getRollbackSqlFromSql(sql)
      const rollbackFromFile = await loadRollbackFileForVersion(version)

      return {
        fileName,
        fullPath,
        order: getOrderFromFileName(fileName),
        version,
        sql,
        rollbackSql: rollbackFromInlineSql ?? rollbackFromFile,
      }
    })
  )

  return loaded.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order
    }

    return a.fileName.localeCompare(b.fileName)
  })
}

async function ensureTrackingTables(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      version TEXT UNIQUE,
      applied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migration_logs (
      id SERIAL PRIMARY KEY,
      version TEXT,
      executed_sql TEXT,
      success BOOLEAN,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migration_rollbacks (
      id SERIAL PRIMARY KEY,
      version TEXT UNIQUE,
      rollback_sql TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
    )
  `)
}

async function logMigrationEvent(
  client: Client,
  version: string,
  executedSql: string,
  success: boolean | null
): Promise<void> {
  await client.query(
    `
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES ($1, $2, $3)
    `,
    [version, executedSql, success]
  )
}

async function persistRollbackSql(
  client: Client,
  version: string,
  rollbackSql: string | null
): Promise<void> {
  if (!rollbackSql) {
    return
  }

  await client.query(
    `
      INSERT INTO public.schema_migration_rollbacks (version, rollback_sql)
      VALUES ($1, $2)
      ON CONFLICT (version)
      DO UPDATE SET rollback_sql = EXCLUDED.rollback_sql, updated_at = now()
    `,
    [version, rollbackSql]
  )
}

async function runMigrations(): Promise<void> {
  const shouldRun = process.env.RUN_MIGRATIONS === 'true'

  if (!shouldRun) {
    console.log('[migrations] Skipped (RUN_MIGRATIONS is not true)')
    return
  }

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!connectionString) {
    throw new Error(
      '[migrations] RUN_MIGRATIONS=true but DATABASE_URL/SUPABASE_DB_URL is missing'
    )
  }

  const migrations = await discoverMigrations()
  const client = new Client({ connectionString })

  await client.connect()

  try {
    await ensureTrackingTables(client)

    for (const migration of migrations) {
      const existing = await client.query<{ id: number }>(
        `
          SELECT id
          FROM public.schema_migrations
          WHERE version = $1
          LIMIT 1
        `,
        [migration.version]
      )

      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`[migrations] skipped ${migration.version} (${migration.fileName})`)
        await logMigrationEvent(client, migration.version, 'MIGRATION_SKIPPED_ALREADY_APPLIED', true)
        await persistRollbackSql(client, migration.version, migration.rollbackSql)
        continue
      }

      console.log(`[migrations] running ${migration.version} (${migration.fileName})`)
      await logMigrationEvent(client, migration.version, `MIGRATION_START_FILE:${migration.fileName}`, null)
      await persistRollbackSql(client, migration.version, migration.rollbackSql)

      try {
        await client.query(migration.sql)

        await client.query(
          `
            INSERT INTO public.schema_migrations (version)
            VALUES ($1)
            ON CONFLICT (version) DO NOTHING
          `,
          [migration.version]
        )

        await logMigrationEvent(client, migration.version, 'MIGRATION_SUCCESS', true)
        console.log(`[migrations] success ${migration.version}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await logMigrationEvent(client, migration.version, `MIGRATION_FAILED:${message}`, false)
        console.error(`[migrations] failed ${migration.version}: ${message}`)
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

export async function runMigrationsOnStartup(): Promise<void> {
  if (!globalMigrationState.__migrationRunnerPromise) {
    globalMigrationState.__migrationRunnerPromise = runMigrations()
  }

  return globalMigrationState.__migrationRunnerPromise
}
