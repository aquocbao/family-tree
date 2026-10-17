import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { APPROVE_KEY, DOWNLOAD_KEY } from './src/admin-paths'
import { DEFAULT_LUNAR_EVENTS, isValidLunarEventList } from './src/utils/lunar-events'

const dbFilePath = path.resolve(import.meta.dirname, 'src/data/family-db.json')

type RawMember = {
  id?: unknown
  name?: unknown
  position?: unknown
  birthDate?: unknown
  deathDate?: unknown
  deathDateLunar?: unknown
  memorialPlace?: unknown
  memorialHostId?: unknown
  gender?: unknown
  fatherId?: unknown
  motherId?: unknown
  spouseId?: unknown
  formerSpouseId?: unknown
  spouseIds?: unknown
  deceased?: unknown
  spouseOnRight?: unknown
  isHidden?: unknown
}

type RawSettings = {
  showBirthDate?: unknown
  showDeathDate?: unknown
  showSpouse?: unknown
  showViewDetail?: unknown
  showMemorialPlace?: unknown
  showDateInfo?: unknown
  notificationMonths?: unknown
  lunarEvents?: unknown
}

const createDefaultDatabase = (): {
  members: []
  settings: {
    showBirthDate: true
    showDeathDate: true
    showSpouse: true
    showViewDetail: true
  }
  pendingMembers?: undefined
  pendingSettings?: undefined
  pendingUpdatedAt?: undefined
} => ({
  members: [],
  settings: {
    showBirthDate: true,
    showDeathDate: true,
    showSpouse: true,
    showViewDetail: true,
  },
  pendingMembers: undefined,
  pendingSettings: undefined,
  pendingUpdatedAt: undefined,
})

const normalizeJsonText = (text: string): string =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Uint8Array[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

const isValidMember = (value: unknown): value is RawMember => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const member = value as RawMember
  const isString = (field: unknown): boolean => typeof field === 'string'
  const isOptionalNonNegativeInteger = (field: unknown): boolean =>
    field === undefined || (typeof field === 'number' && Number.isInteger(field) && field >= 0)
  const isOptionalString = (field: unknown): boolean =>
    field === undefined || field === null || typeof field === 'string'

  const hasRequired =
    isString(member.id) &&
    isString(member.name) &&
    (member.gender === 'female' || member.gender === 'male' || member.gender === 'other')

  if (!hasRequired) {
    return false
  }

  return (
    isOptionalNonNegativeInteger(member.position) &&
    isOptionalString(member.birthDate) &&
    isOptionalString(member.deathDate) &&
    isOptionalString(member.deathDateLunar) &&
    isOptionalString(member.memorialPlace) &&
    isOptionalString(member.memorialHostId) &&
    isOptionalString(member.fatherId) &&
    isOptionalString(member.motherId) &&
    isOptionalString(member.spouseId) &&
    isOptionalString(member.formerSpouseId) &&
    (member.spouseIds === undefined ||
      (Array.isArray(member.spouseIds) && member.spouseIds.length <= 20 && member.spouseIds.every((id: unknown) => typeof id === 'string'))) &&
    (member.spouseOnRight === undefined || typeof member.spouseOnRight === 'boolean') &&
    (member.deceased === undefined || typeof member.deceased === 'boolean') &&
    (member.isHidden === undefined || typeof member.isHidden === 'boolean')
  )
}

const isValidSettings = (value: unknown): value is RawSettings => {
  if (value === undefined) {
    return true
  }

  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as RawSettings
  return (
    (settings.showBirthDate === undefined || typeof settings.showBirthDate === 'boolean') &&
    (settings.showDeathDate === undefined || typeof settings.showDeathDate === 'boolean') &&
    (settings.showSpouse === undefined || typeof settings.showSpouse === 'boolean') &&
    (settings.showViewDetail === undefined || typeof settings.showViewDetail === 'boolean') &&
    (settings.showMemorialPlace === undefined || typeof settings.showMemorialPlace === 'boolean') &&
    (settings.showDateInfo === undefined || typeof settings.showDateInfo === 'boolean') &&
    (settings.notificationMonths === undefined ||
      (typeof settings.notificationMonths === 'number' &&
        Number.isInteger(settings.notificationMonths) &&
        settings.notificationMonths >= 0 &&
        settings.notificationMonths <= 12)) &&
    (settings.lunarEvents === undefined || isValidLunarEventList(settings.lunarEvents))
  )
}

// Canonical JSON (sorted keys, null/undefined dropped) to detect real changes to approved data.
const canonical = (value: unknown): string => {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        const item = (v as Record<string, unknown>)[key]
        if (item !== undefined && item !== null) out[key] = normalize(item)
      }
      return out
    }
    return v
  }
  return JSON.stringify(normalize(value) ?? null)
}

// Settings with defaults filled in, so "missing" and "default value" compare as equal.
const withDefaultSettings = (value: unknown): Record<string, unknown> => {
  const s = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const legacy = s.showDateInfo
  return {
    showBirthDate: s.showBirthDate ?? legacy ?? true,
    showDeathDate: s.showDeathDate ?? legacy ?? true,
    showSpouse: s.showSpouse ?? true,
    showViewDetail: s.showViewDetail ?? true,
    showMemorialPlace: s.showMemorialPlace ?? true,
    notificationMonths: s.notificationMonths ?? 3,
    lunarEvents: s.lunarEvents ?? DEFAULT_LUNAR_EVENTS,
  }
}

const familyDbPlugin = (downloadPassword?: string, approvePassword: string = APPROVE_KEY) => {
  let writeQueue: Promise<void> = Promise.resolve()

  return {
    name: 'family-db-api',
    configureServer(server: {
    middlewares: {
      use: (
        path: string,
        handler: (
          req: IncomingMessage,
          res: {
            statusCode: number
            setHeader: (name: string, value: string) => void
            end: (chunk?: string) => void
          },
          next: () => void,
        ) => void,
      ) => void
    }
  }) {
    // Dev version of the authenticated download (password from DOWNLOAD_PASSWORD in .env.local).
    server.middlewares.use('/api/family-db/export', (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }

      const sendJson = (statusCode: number, payload: unknown): void => {
        res.statusCode = statusCode
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(payload))
      }

      if (!downloadPassword) {
        sendJson(503, { error: 'Chưa cấu hình mật khẩu tải file: thêm DOWNLOAD_PASSWORD vào .env.local.' })
        return
      }

      const given = req.headers['x-download-password']
      if (given !== downloadPassword) {
        setTimeout(() => sendJson(401, { error: 'Sai mật khẩu.' }), 800)
        return
      }

      void fs
        .readFile(dbFilePath, 'utf8')
        .then((content) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(normalizeJsonText(content))
        })
        .catch((error: unknown) => {
          const detail = error instanceof Error ? ` ${error.message}` : ''
          sendJson(500, { error: `Không thể đọc file family-db.json.${detail}` })
        })
    })

    server.middlewares.use('/api/family-db', (req, res, next) => {
      const sendJson = (statusCode: number, payload: unknown): void => {
        res.statusCode = statusCode
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(payload))
      }

      if (req.method === 'GET') {
        void (async () => {
          try {
            let content: string

            try {
              content = await fs.readFile(dbFilePath, 'utf8')
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error
              }

              const defaultDatabase = createDefaultDatabase()
              await fs.mkdir(path.dirname(dbFilePath), { recursive: true })
              await fs.writeFile(dbFilePath, `${JSON.stringify(defaultDatabase, null, 2)}\n`, 'utf8')
              sendJson(200, defaultDatabase)
              return
            }

            let payload: {
              members?: unknown
              settings?: unknown
              pendingMembers?: unknown
              pendingSettings?: unknown
              pendingUpdatedAt?: unknown
            }
            try {
              payload = JSON.parse(normalizeJsonText(content)) as {
                members?: unknown
                settings?: unknown
                pendingMembers?: unknown
                pendingSettings?: unknown
                pendingUpdatedAt?: unknown
              }
            } catch (error) {
              const detail = error instanceof Error ? ` ${error.message}` : ''
              sendJson(500, { error: `File family-db.json bị lỗi định dạng JSON.${detail}` })
              return
            }

            if (!Array.isArray(payload.members)) {
              sendJson(500, { error: 'Dữ liệu family-db.json không hợp lệ: thiếu mảng members.' })
              return
            }

            if (!payload.members.every((member) => isValidMember(member))) {
              sendJson(500, { error: 'Dữ liệu family-db.json không hợp lệ: có thành viên sai định dạng.' })
              return
            }

            if (!isValidSettings(payload.settings)) {
              sendJson(500, {
                error:
                  'Dữ liệu family-db.json không hợp lệ: các trường settings phải là boolean (showBirthDate, showDeathDate, showSpouse, showViewDetail).',
              })
              return
            }

            if (payload.pendingMembers !== undefined && !Array.isArray(payload.pendingMembers)) {
              sendJson(500, { error: 'Dữ liệu family-db.json không hợp lệ: pendingMembers phải là mảng nếu có.' })
              return
            }

            if (Array.isArray(payload.pendingMembers) && !payload.pendingMembers.every((member) => isValidMember(member))) {
              sendJson(500, { error: 'Dữ liệu family-db.json không hợp lệ: pendingMembers có thành viên sai định dạng.' })
              return
            }

            if (!isValidSettings(payload.pendingSettings)) {
              sendJson(500, {
                error:
                  'Dữ liệu family-db.json không hợp lệ: các trường pendingSettings phải là boolean (showBirthDate, showDeathDate, showSpouse, showViewDetail).',
              })
              return
            }

            if (payload.pendingUpdatedAt !== undefined && typeof payload.pendingUpdatedAt !== 'string') {
              sendJson(500, { error: 'Dữ liệu family-db.json không hợp lệ: pendingUpdatedAt phải là chuỗi nếu có.' })
              return
            }

            sendJson(200, {
              members: payload.members,
              settings: payload.settings,
              pendingMembers: payload.pendingMembers,
              pendingSettings: payload.pendingSettings,
              pendingUpdatedAt: payload.pendingUpdatedAt,
            })
          } catch (error) {
            const detail = error instanceof Error ? ` ${error.message}` : ''
            sendJson(500, { error: `Không thể đọc file family-db.json.${detail}` })
          }
        })()
        return
      }

      if (req.method === 'PUT') {
        void (async () => {
          try {
            const body = await readRequestBody(req)
            let payload: {
              members?: unknown
              settings?: unknown
              pendingMembers?: unknown
              pendingSettings?: unknown
              pendingUpdatedAt?: unknown
            }

            try {
              payload = JSON.parse(body) as {
                members?: unknown
                settings?: unknown
                pendingMembers?: unknown
                pendingSettings?: unknown
                pendingUpdatedAt?: unknown
              }
            } catch {
              sendJson(400, { error: 'Payload không hợp lệ: JSON bị lỗi định dạng.' })
              return
            }

            if (!Array.isArray(payload.members)) {
              sendJson(400, { error: 'Payload không hợp lệ: members phải là mảng.' })
              return
            }

            if (!payload.members.every((member) => isValidMember(member))) {
              sendJson(400, { error: 'Payload không hợp lệ: có thành viên sai định dạng.' })
              return
            }

            if (!isValidSettings(payload.settings)) {
              sendJson(400, {
                error:
                  'Payload không hợp lệ: các trường settings phải là boolean (showBirthDate, showDeathDate, showSpouse, showViewDetail).',
              })
              return
            }

            if (payload.pendingMembers !== undefined && !Array.isArray(payload.pendingMembers)) {
              sendJson(400, { error: 'Payload không hợp lệ: pendingMembers phải là mảng nếu có.' })
              return
            }

            if (Array.isArray(payload.pendingMembers) && !payload.pendingMembers.every((member) => isValidMember(member))) {
              sendJson(400, { error: 'Payload không hợp lệ: pendingMembers có thành viên sai định dạng.' })
              return
            }

            if (!isValidSettings(payload.pendingSettings)) {
              sendJson(400, {
                error:
                  'Payload không hợp lệ: các trường pendingSettings phải là boolean (showBirthDate, showDeathDate, showSpouse, showViewDetail).',
              })
              return
            }

            if (payload.pendingUpdatedAt !== undefined && typeof payload.pendingUpdatedAt !== 'string') {
              sendJson(400, { error: 'Payload không hợp lệ: pendingUpdatedAt phải là chuỗi nếu có.' })
              return
            }

            // Approving (changing members/settings) requires the approval password.
            let current: { members?: unknown; settings?: unknown; pendingMembers?: unknown } = {}
            try {
              current = JSON.parse(normalizeJsonText(await fs.readFile(dbFilePath, 'utf8'))) as typeof current
            } catch {
              current = {}
            }
            const changesApproved =
              canonical(current.members) !== canonical(payload.members) ||
              canonical(withDefaultSettings(current.settings)) !== canonical(withDefaultSettings(payload.settings))
            // Discarding the pending copy (Từ chối) also needs the approval password
            const hadPending = Array.isArray(current.pendingMembers) && current.pendingMembers.length > 0
            const keepsPending = Array.isArray(payload.pendingMembers) && payload.pendingMembers.length > 0
            const discardsPending = hadPending && !keepsPending
            if ((changesApproved || discardsPending) && req.headers['x-approve-password'] !== approvePassword) {
              setTimeout(() => sendJson(401, { error: 'Sai mật khẩu phê duyệt.' }), 800)
              return
            }

            await fs.mkdir(path.dirname(dbFilePath), { recursive: true })

            writeQueue = writeQueue
              .catch(() => undefined)
              .then(async () => {
                await fs.writeFile(
                  dbFilePath,
                  `${JSON.stringify({
                    members: payload.members,
                    settings: payload.settings,
                    pendingMembers: payload.pendingMembers,
                    pendingSettings: payload.pendingSettings,
                    pendingUpdatedAt: payload.pendingUpdatedAt,
                  }, null, 2)}\n`,
                  'utf8',
                )
              })

            await writeQueue

            sendJson(200, { ok: true })
          } catch (error) {
            const detail = error instanceof Error ? ` ${error.message}` : ''
            sendJson(500, { error: `Không thể ghi file family-db.json.${detail}` })
          }
        })()
        return
      }

      next()
    })
  },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue(), familyDbPlugin(env.DOWNLOAD_PASSWORD || DOWNLOAD_KEY, env.APPROVE_PASSWORD || APPROVE_KEY)],
  }
})
