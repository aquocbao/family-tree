import type { FamilyDatabase } from '../types/family'

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
  }
}

const hasValidBooleanFields = (settings?: FamilyDatabase['settings']): boolean => {
  if (!settings) {
    return true
  }

  return (
    (settings.showBirthDate === undefined || typeof settings.showBirthDate === 'boolean') &&
    (settings.showDeathDate === undefined || typeof settings.showDeathDate === 'boolean') &&
    (settings.showSpouse === undefined || typeof settings.showSpouse === 'boolean') &&
    (settings.showViewDetail === undefined || typeof settings.showViewDetail === 'boolean') &&
    (settings.showDateInfo === undefined || typeof settings.showDateInfo === 'boolean')
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

export const saveFamilyDatabase = async (database: FamilyDatabase): Promise<void> => {
  const response = await fetch('/api/family-db', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(database),
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }
}
