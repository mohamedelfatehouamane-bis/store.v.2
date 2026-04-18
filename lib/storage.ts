import { supabaseAdmin } from '@/lib/db'

type AdminClient = NonNullable<typeof supabaseAdmin>

export async function ensureBucket(
  adminClient: AdminClient,
  bucketName: string,
  fileSizeLimit?: string
) {
  const listResult = await adminClient.storage.listBuckets()

  if (listResult.error) {
    throw new Error(listResult.error.message || `Unable to list storage buckets for ${bucketName}`)
  }

  const bucketExists = (listResult.data ?? []).some((bucket) => bucket.name === bucketName)
  if (bucketExists) {
    return
  }

  const createResult = await adminClient.storage.createBucket(bucketName, {
    public: true,
    ...(fileSizeLimit ? { fileSizeLimit } : {}),
  })

  if (createResult.error && !/already exists/i.test(createResult.error.message ?? '')) {
    throw new Error(createResult.error.message || `Unable to create storage bucket ${bucketName}`)
  }
}

export function sanitizeStorageFileName(name: string) {
  const normalized = name.normalize('NFKD').replace(/[^\u0000-\u007F]/g, '')
  const cleaned = normalized.replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/\s+/g, '_')
  return cleaned || 'file'
}