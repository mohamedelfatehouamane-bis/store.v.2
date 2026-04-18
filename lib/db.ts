import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type SupabaseClientType = ReturnType<typeof createClient>
const globalForSupabase = globalThis as unknown as {
  __supabaseClient?: SupabaseClientType
}

export const supabase =
  globalForSupabase.__supabaseClient ?? createClient(supabaseUrl, supabaseAnonKey)

if (typeof window !== 'undefined') {
  globalForSupabase.__supabaseClient = supabase
}

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  throw new Error(
    'MySQL query helper is deprecated. Convert this API route to use Supabase client methods directly.'
  )
}

export async function queryOne<T = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> {
  throw new Error(
    'MySQL query helper is deprecated. Convert this API route to use Supabase client methods directly.'
  )
}

export async function executeQuery(
  sql: string,
  params: any[] = []
): Promise<any> {
  throw new Error(
    'MySQL query helper is deprecated. Convert this API route to use Supabase client methods directly.'
  )
}
