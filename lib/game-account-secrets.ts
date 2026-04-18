import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12

function getEncryptionKey() {
  const rawKey = process.env.GAME_ACCOUNT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-fallback-key'
  // Derive a fixed 32-byte key from env input.
  return crypto.createHash('sha256').update(rawKey).digest()
}

export function encryptGameAccountSecret(plainText: string) {
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getEncryptionKey()
  const cipher = crypto.createCipheriv(ALGO, key, iv)

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptGameAccountSecret(cipherText: string | null | undefined) {
  if (!cipherText) return null

  // Legacy values were bcrypt hashes and cannot be decrypted.
  if (cipherText.startsWith('$2a$') || cipherText.startsWith('$2b$') || cipherText.startsWith('$2y$')) {
    return null
  }

  const parts = cipherText.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return null
  }

  try {
    const [, ivB64, tagB64, encB64] = parts
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const encrypted = Buffer.from(encB64, 'base64')

    const key = getEncryptionKey()
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)

    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return plain.toString('utf8')
  } catch {
    return null
  }
}
