// /api/family-db handlers: replace the Vite dev-server middleware for /api/family-db in production.
// Storage: Workers KV namespace bound as FAMILY_DB_KV. If KV is empty (or not bound), GET falls back
// to the bundled src/data/family-db.json so the site still loads.
import seedDatabase from '../src/data/family-db.json'
import { DOWNLOAD_KEY } from '../src/admin-paths'

interface KVNamespaceLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

interface Env {
  FAMILY_DB_KV?: KVNamespaceLike
  /** Worker secret required to download the JSON file (npx wrangler secret put DOWNLOAD_PASSWORD). */
  DOWNLOAD_PASSWORD?: string
}

type Context = { request: Request; env: Env }

const KV_KEY = 'family-db'

const json = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

const isOptionalString = (v: unknown) => v === undefined || v === null || typeof v === 'string'
const isOptionalBool = (v: unknown) => v === undefined || typeof v === 'boolean'

const isValidMember = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    (m.gender === 'female' || m.gender === 'male' || m.gender === 'other') &&
    (m.position === undefined ||
      (typeof m.position === 'number' && Number.isInteger(m.position) && m.position >= 0)) &&
    isOptionalString(m.birthDate) &&
    isOptionalString(m.deathDate) &&
    isOptionalString(m.deathDateLunar) &&
    isOptionalString(m.fatherId) &&
    isOptionalString(m.motherId) &&
    isOptionalString(m.spouseId) &&
    isOptionalBool(m.spouseOnRight) &&
    isOptionalBool(m.isHidden)
  )
}

const isValidSettings = (value: unknown): boolean => {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return ['showBirthDate', 'showDeathDate', 'showSpouse', 'showViewDetail', 'showDateInfo'].every((k) =>
    isOptionalBool(s[k]),
  )
}

const validate = (payload: Record<string, unknown>): string | null => {
  if (!Array.isArray(payload.members)) return 'members phải là mảng.'
  if (!payload.members.every(isValidMember)) return 'có thành viên sai định dạng.'
  if (!isValidSettings(payload.settings)) return 'các trường settings phải là boolean.'
  if (payload.pendingMembers !== undefined && !Array.isArray(payload.pendingMembers))
    return 'pendingMembers phải là mảng nếu có.'
  if (Array.isArray(payload.pendingMembers) && !payload.pendingMembers.every(isValidMember))
    return 'pendingMembers có thành viên sai định dạng.'
  if (!isValidSettings(payload.pendingSettings)) return 'các trường pendingSettings phải là boolean.'
  if (payload.pendingUpdatedAt !== undefined && typeof payload.pendingUpdatedAt !== 'string')
    return 'pendingUpdatedAt phải là chuỗi nếu có.'
  return null
}

const pick = (p: Record<string, unknown>) => ({
  members: p.members,
  settings: p.settings,
  pendingMembers: p.pendingMembers,
  pendingSettings: p.pendingSettings,
  pendingUpdatedAt: p.pendingUpdatedAt,
})

export const onRequestGet = async ({ env }: Context): Promise<Response> => {
  try {
    const stored = env.FAMILY_DB_KV ? await env.FAMILY_DB_KV.get(KV_KEY) : null
    const payload = (stored ? JSON.parse(stored) : seedDatabase) as Record<string, unknown>
    const error = validate(payload)
    if (error) return json(500, { error: `Dữ liệu family-db không hợp lệ: ${error}` })
    return json(200, pick(payload))
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : ''
    return json(500, { error: `Không thể đọc dữ liệu family-db.${detail}` })
  }
}

export const onRequestPut = async ({ request, env }: Context): Promise<Response> => {
  if (!env.FAMILY_DB_KV) {
    return json(501, {
      error: 'Chưa cấu hình lưu trữ: hãy tạo KV namespace và khai báo binding FAMILY_DB_KV trong wrangler.toml.',
    })
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return json(400, { error: 'Payload không hợp lệ: JSON bị lỗi định dạng.' })
  }

  const error = validate(payload)
  if (error) return json(400, { error: `Payload không hợp lệ: ${error}` })

  try {
    await env.FAMILY_DB_KV.put(KV_KEY, JSON.stringify(pick(payload)))
    return json(200, { ok: true })
  } catch (err) {
    const detail = err instanceof Error ? ` ${err.message}` : ''
    return json(500, { error: `Không thể ghi dữ liệu family-db.${detail}` })
  }
}

// ---- Authenticated download of the whole database ----
const sha256 = async (text: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

// Compare via fixed-length hashes so the check does not leak timing information.
const passwordMatches = async (given: string, expected: string): Promise<boolean> => {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

export const onRequestExport = async ({ request, env }: Context): Promise<Response> => {
  const expected = env.DOWNLOAD_PASSWORD || DOWNLOAD_KEY
  const given = request.headers.get('X-Download-Password') ?? ''
  if (!given || !(await passwordMatches(given, expected))) {
    // Small delay slows down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 800))
    return json(401, { error: 'Sai mật khẩu.' })
  }

  const response = await onRequestGet({ request, env })
  if (!response.ok) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Content-Disposition', 'attachment; filename="family-db.json"')
  return new Response(response.body, { status: 200, headers })
}
