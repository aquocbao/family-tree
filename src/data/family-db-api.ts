import type { FamilyDatabase } from '../types/family'
import { DEFAULT_LUNAR_EVENTS, cloneLunarEvents, isValidLunarEventList } from '../utils/lunar-events'
import { DEFAULT_LOI_NGO, cloneLoiNgo, isValidLoiNgo } from './loi-ngo'

const defaultSettings = {
  showBirthDate: true,
  showDeathDate: true,
  showSpouse: true,
  showViewDetail: true,
}

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) {
      return payload.error
    }
  } catch {
    // Ignore JSON parse errors and use fallback message below.
  }

  return `Lỗi máy chủ (${response.status}).`
}

const normalizeSettings = (settings?: FamilyDatabase['settings']): NonNullable<FamilyDatabase['settings']> => {
  const legacyDateVisibility = settings?.showDateInfo
  return {
    showBirthDate: settings?.showBirthDate ?? legacyDateVisibility ?? defaultSettings.showBirthDate,
    showDeathDate: settings?.showDeathDate ?? legacyDateVisibility ?? defaultSettings.showDeathDate,
    showSpouse: settings?.showSpouse ?? defaultSettings.showSpouse,
    showViewDetail: settings?.showViewDetail ?? defaultSettings.showViewDetail,
    showMemorialPlace: settings?.showMemorialPlace ?? true,
    notificationMonths: isValidNotificationMonths(settings?.notificationMonths) ? settings?.notificationMonths : 3,
    lunarEvents: cloneLunarEvents(
      isValidLunarEventList(settings?.lunarEvents) ? settings.lunarEvents : DEFAULT_LUNAR_EVENTS,
    ),
    loiNgo: cloneLoiNgo(isValidLoiNgo(settings?.loiNgo) ? settings.loiNgo : DEFAULT_LOI_NGO),
  }
}

const isValidNotificationMonths = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 12

const hasValidBooleanFields = (settings?: FamilyDatabase['settings']): boolean => {
  if (!settings) {
    return true
  }

  return (
    (settings.showBirthDate === undefined || typeof settings.showBirthDate === 'boolean') &&
    (settings.showDeathDate === undefined || typeof settings.showDeathDate === 'boolean') &&
    (settings.showSpouse === undefined || typeof settings.showSpouse === 'boolean') &&
    (settings.showViewDetail === undefined || typeof settings.showViewDetail === 'boolean') &&
    (settings.showMemorialPlace === undefined || typeof settings.showMemorialPlace === 'boolean') &&
    (settings.showDateInfo === undefined || typeof settings.showDateInfo === 'boolean') &&
    (settings.notificationMonths === undefined || isValidNotificationMonths(settings.notificationMonths)) &&
    (settings.lunarEvents === undefined || isValidLunarEventList(settings.lunarEvents)) &&
    (settings.loiNgo === undefined || isValidLoiNgo(settings.loiNgo))
  )
}

export const fetchFamilyDatabase = async (): Promise<FamilyDatabase> => {
  const response = await fetch('/api/family-db')

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  const payload = (await response.json()) as FamilyDatabase
  if (!Array.isArray(payload.members)) {
    throw new Error('Dữ liệu trả về không hợp lệ: thiếu danh sách members.')
  }

  if (!hasValidBooleanFields(payload.settings)) {
    throw new Error('Dữ liệu trả về không hợp lệ: settings phải là các giá trị boolean.')
  }

  if (payload.pendingMembers !== undefined && !Array.isArray(payload.pendingMembers)) {
    throw new Error('Dữ liệu trả về không hợp lệ: pendingMembers phải là mảng nếu có.')
  }

  if (!hasValidBooleanFields(payload.pendingSettings)) {
    throw new Error('Dữ liệu trả về không hợp lệ: pendingSettings phải là các giá trị boolean.')
  }

  if (payload.pendingUpdatedAt !== undefined && typeof payload.pendingUpdatedAt !== 'string') {
    throw new Error('Dữ liệu trả về không hợp lệ: pendingUpdatedAt phải là chuỗi nếu có.')
  }

  return {
    members: payload.members.map((member) => ({ ...member })),
    settings: normalizeSettings(payload.settings),
    pendingMembers: payload.pendingMembers?.map((member) => ({ ...member })),
    pendingSettings: payload.pendingMembers ? normalizeSettings(payload.pendingSettings) : undefined,
    pendingUpdatedAt: payload.pendingMembers ? payload.pendingUpdatedAt : undefined,
  }
}

export const saveFamilyDatabase = async (
  database: FamilyDatabase,
  options: { approvePassword?: string } = {},
): Promise<void> => {
  const response = await fetch('/api/family-db', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(options.approvePassword ? { 'X-Approve-Password': options.approvePassword } : {}),
    },
    body: JSON.stringify(database),
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }
}
