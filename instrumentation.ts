export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  if (process.env.RUN_MIGRATIONS !== 'true') {
    return
  }

  try {
    const { runMigrationsOnStartup } = await import('./lib/migration-runner')
    await runMigrationsOnStartup()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[instrumentation] Startup migrations skipped: ${message}`)
  }
}
