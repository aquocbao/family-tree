<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ADMIN_PATH, SUPER_ADMIN_PATH } from './admin-paths'
import FamilyTree from './components/FamilyTree.vue'
import SearchableMemberSelect from './components/SearchableMemberSelect.vue'
import { fetchFamilyDatabase, saveFamilyDatabase } from './data/family-db-api'
import { solarDateTextToLunarText } from './utils/lunar'
import { isDeceased as isDeceasedMember } from './utils/memorial'
import {
  DEFAULT_LUNAR_EVENTS,
  MAX_LUNAR_EVENTS,
  MAX_LUNAR_EVENT_NAME,
  cloneLunarEvents,
  isValidLunarEvent,
  type LunarEvent,
} from './utils/lunar-events'
import type { FamilyDatabase, FamilyGender, FamilyMember, FamilyTreeSettings } from './types/family'

type MemberForm = {
  id: string
  name: string
  position: string
  birthDate: string
  deathDate: string
  deathDateLunar: string
  memorialHostId: string
  gender: FamilyGender
  fatherId: string
  motherId: string
  spouseId: string
  formerSpouseId: string
  spouseOnRight: boolean
}

type AppMode = 'view' | 'admin' | 'super-admin'

const approvedMembers = ref<FamilyMember[]>([])
const pendingMembers = ref<FamilyMember[] | null>(null)
const pendingUpdatedAt = ref<string | undefined>(undefined)

const defaultTreeSettings = (): FamilyTreeSettings => ({
  showBirthDate: true,
  showDeathDate: true,
  showSpouse: true,
  showViewDetail: true,
  showMemorialPlace: true,
  notificationMonths: 3,
  lunarEvents: cloneLunarEvents(DEFAULT_LUNAR_EVENTS),
})

const approvedSettings = ref<FamilyTreeSettings>(defaultTreeSettings())
const pendingSettings = ref<FamilyTreeSettings | null>(null)

const emptyForm = (): MemberForm => ({
  id: '',
  name: '',
  position: '',
  birthDate: '',
  deathDate: '',
  deathDateLunar: '',
  memorialHostId: '',
  gender: 'other',
  fatherId: '',
  motherId: '',
  spouseId: '',
  formerSpouseId: '',
  spouseOnRight: false,
})

const formatDateForAdmin = (value?: string): string => {
  if (!value) {
    return ''
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    return value
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return `${day}-${month}-${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

const parseAdminDateToIso = (value: string): string | null | undefined => {
  const text = value.trim()
  if (!text) {
    return undefined
  }

  let day: number
  let month: number
  let year: number

  const ddmmyyyy = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.exec(text)
  if (ddmmyyyy) {
    day = Number(ddmmyyyy[1])
    month = Number(ddmmyyyy[2])
    year = Number(ddmmyyyy[3])
  } else {
    const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(text)
    if (compact) {
      day = Number(compact[1])
      month = Number(compact[2])
      year = Number(compact[3])
    } else {
    const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    if (!yyyymmdd) {
      return null
    }

    year = Number(yyyymmdd[1])
    month = Number(yyyymmdd[2])
    day = Number(yyyymmdd[3])
    }
  }

  const parsed = new Date(year, month - 1, day)
  const isValid =
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month &&
    parsed.getDate() === day

  if (!isValid) {
    return null
  }

  const dayText = String(day).padStart(2, '0')
  const monthText = String(month).padStart(2, '0')
  return `${year}-${monthText}-${dayText}`
}

const normalizePositionInput = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

const form = ref<MemberForm>(emptyForm())
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const formError = ref('')
const loadingError = ref('')
const isLoading = ref(true)
const isSaving = ref(false)
const showBirthDate = ref(true)
const showDeathDate = ref(true)
const showSpouseInfo = ref(true)
const showViewDetailAction = ref(true)
const showMemorialPlace = ref(true)
const notificationMonths = ref(3)
const lunarEvents = ref<LunarEvent[]>(cloneLunarEvents(DEFAULT_LUNAR_EVENTS))
const hasLoadedDatabase = ref(false)
const suppressSettingsSync = ref(false)
// Câu đối ca ngợi đức tổ và gia đạo hưng thịnh (read top → bottom).
// Facing the page, vế phải hangs on the right and vế trái on the left.
const COUPLET_RIGHT = {
  chars: ['敬', '祖', '承', '宗', '家', '道', '盛'],
  readings: ['Kính', 'Tổ', 'Thừa', 'Tông', 'Gia', 'Đạo', 'Thịnh'],
  meaning: 'Kính tổ, nối tông, gia đạo thịnh vượng',
}
const COUPLET_LEFT = {
  chars: ['傳', '孝', '報', '恩', '子', '孫', '昌'],
  readings: ['Truyền', 'Hiếu', 'Báo', 'Ân', 'Tử', 'Tôn', 'Xương'],
  meaning: 'Truyền hiếu báo ơn, con cháu hưng thịnh',
}

// Sticky title plaque + câu đối layout helpers
const appHeaderRef = ref<HTMLElement | null>(null)
const headerBandRef = ref<HTMLElement | null>(null)
const coupletSpacerRef = ref<HTMLElement | null>(null)
const isHeaderCompact = ref(false)

// Compact title bar after scrolling down a bit (two thresholds so it doesn't flicker at the edge).
const onWindowScroll = (): void => {
  const y = window.scrollY
  if (!isHeaderCompact.value && y > 120) {
    isHeaderCompact.value = true
  } else if (isHeaderCompact.value && y < 40) {
    isHeaderCompact.value = false
  }
}

const updateTitleLayout = (): void => {
  const band = headerBandRef.value
  const header = appHeaderRef.value
  if (band && header && !isHeaderCompact.value) {
    // The band keeps the full plaque's height in the page flow, so shrinking it never makes the page jump.
    band.style.setProperty('--band-h', `${Math.round(header.offsetHeight + 28)}px`) // plaque + space below
  }

  const spacer = coupletSpacerRef.value
  const couplet = document.querySelector<HTMLElement>('.couplet--left')
  if (!spacer || !couplet) {
    return
  }

  if (getComputedStyle(couplet).position !== 'absolute') {
    spacer.style.height = '0px' // wide screens: scrolls are fixed at the sides
    return
  }

  // Tablets/phones: scrolls hang beside the plaque; push the tree below their bottom edge.
  spacer.style.height = '0px'
  const coupletBottom = couplet.offsetTop + couplet.offsetHeight
  const spacerTop = spacer.offsetTop
  spacer.style.height = `${Math.max(0, coupletBottom - spacerTop + 16)}px`
}

onMounted(() => {
  updateTitleLayout()
  onWindowScroll()
  window.addEventListener('resize', updateTitleLayout)
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  void document.fonts?.ready.then(updateTitleLayout)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateTitleLayout)
  window.removeEventListener('scroll', onWindowScroll)
})

const route = useRoute()
const router = useRouter()

const mode = computed<AppMode>(() => {
  if (route.name === 'admin') {
    return 'admin'
  }

  if (route.name === 'super-admin') {
    return 'super-admin'
  }

  return 'view'
})

const isSuperAdminMode = computed(() => mode.value === 'super-admin')
const isEditableMode = computed(() => mode.value === 'admin' || mode.value === 'super-admin')
const hasPendingChanges = computed(() => pendingMembers.value !== null)

const members = computed<FamilyMember[]>(() => {
  if (mode.value === 'view') {
    return approvedMembers.value
  }

  return pendingMembers.value ?? approvedMembers.value
})

// Living members (no lunar death date), for "Nơi tổ chức đám giỗ"
const livingMembers = computed(() =>
  members.value.filter((member) => member.id !== editingId.value && !isDeceasedMember(member)),
)

const selectableMembers = computed(() => {
  return members.value.filter((member) => member.id !== editingId.value)
})

const resetForm = (): void => {
  form.value = emptyForm()
  isEditing.value = false
  editingId.value = null
  formError.value = ''
}

const startAddMember = (): void => {
  resetForm()
}

const editorPanelRef = ref<HTMLElement | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)
const isEditorFlashing = ref(false)
let editorFlashTimer: ReturnType<typeof setTimeout> | undefined

// Bring the edit panel into view and put the cursor in the name field.
const focusEditorPanel = async (): Promise<void> => {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen()
    } catch {
      // Ignore: still try to scroll to the panel.
    }
  }

  await nextTick()
  const panel = editorPanelRef.value
  if (!panel) {
    return
  }

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  nameInputRef.value?.focus({ preventScroll: true })
  nameInputRef.value?.select()

  isEditorFlashing.value = false
  await nextTick()
  isEditorFlashing.value = true
  if (editorFlashTimer) {
    clearTimeout(editorFlashTimer)
  }
  editorFlashTimer = setTimeout(() => {
    isEditorFlashing.value = false
  }, 1600)
}

// ---- Super admin: download the whole database (approved + pending) as a JSON file ----
const isDownloading = ref(false)
const downloadError = ref('')

const isDownloadPromptOpen = ref(false)
const downloadPassword = ref('')
const downloadPasswordRef = ref<HTMLInputElement | null>(null)

const openDownloadPrompt = async (): Promise<void> => {
  isDownloadPromptOpen.value = true
  downloadError.value = ''
  await nextTick()
  downloadPasswordRef.value?.focus()
}

const closeDownloadPrompt = (): void => {
  isDownloadPromptOpen.value = false
  downloadPassword.value = ''
  downloadError.value = ''
}

const downloadDatabaseJson = async (): Promise<void> => {
  if (!isSuperAdminMode.value || !downloadPassword.value) {
    return
  }

  isDownloading.value = true
  downloadError.value = ''
  try {
    // The server checks the password and returns exactly what is stored (approved + pending).
    const response = await fetch('/api/family-db/export', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'X-Download-Password': downloadPassword.value },
    })
    if (!response.ok) {
      let message = `Lỗi máy chủ (${response.status}).`
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) {
          message = payload.error
        }
      } catch {
        // keep fallback message
      }
      throw new Error(message)
    }

    const data = (await response.json()) as unknown
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const link = document.createElement('a')
    link.href = url
    link.download = `family-db_${stamp}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    closeDownloadPrompt()
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : 'Không thể tải file.'
    downloadPassword.value = ''
    await nextTick()
    downloadPasswordRef.value?.focus()
  } finally {
    isDownloading.value = false
  }
}

const startEditMember = (id: string): void => {
  if (!isEditableMode.value) {
    return
  }

  const member = members.value.find((item) => item.id === id)
  if (!member) {
    return
  }

  form.value = {
    id: member.id,
    name: member.name,
    position: member.position !== undefined ? String(member.position) : '',
    birthDate: formatDateForAdmin(member.birthDate),
    deathDate: formatDateForAdmin(member.deathDate),
    deathDateLunar: member.deathDateLunar ?? '',
    memorialHostId: member.memorialHostId ?? '',
    gender: member.gender,
    fatherId: member.fatherId ?? '',
    motherId: member.motherId ?? '',
    spouseId: member.spouseId ?? '',
    formerSpouseId: member.formerSpouseId ?? '',
    spouseOnRight: member.spouseOnRight ?? false,
  }

  isEditing.value = true
  editingId.value = member.id
  formError.value = ''
  void focusEditorPanel()
}

const normalizeMember = (member: FamilyMember): FamilyMember => {
  return {
    ...member,
    position: member.position ?? undefined,
    birthDate: member.birthDate ?? undefined,
    deathDate: member.deathDate ?? undefined,
    deathDateLunar: member.deathDateLunar ?? undefined,
    memorialPlace: member.memorialPlace ?? undefined,
    memorialHostId: member.memorialHostId ?? undefined,
    fatherId: member.fatherId ?? undefined,
    motherId: member.motherId ?? undefined,
    spouseId: member.spouseId ?? undefined,
    formerSpouseId: member.formerSpouseId ?? undefined,
    spouseOnRight: member.spouseOnRight ?? undefined,
    isHidden: member.isHidden ?? undefined,
  }
}

const cloneMembers = (value: FamilyMember[]): FamilyMember[] => value.map((member) => ({ ...member }))
const cloneSettings = (value: FamilyTreeSettings): FamilyTreeSettings => ({ ...value })

const getModeSettings = (nextMode: AppMode): FamilyTreeSettings => {
  if (nextMode === 'view') {
    return approvedSettings.value
  }

  return pendingSettings.value ?? approvedSettings.value
}

const applyTreeSettings = (settings: FamilyTreeSettings): void => {
  showBirthDate.value = settings.showBirthDate
  showDeathDate.value = settings.showDeathDate
  showSpouseInfo.value = settings.showSpouse
  showViewDetailAction.value = settings.showViewDetail
  showMemorialPlace.value = settings.showMemorialPlace ?? true
  notificationMonths.value = settings.notificationMonths ?? 3
  const nextEvents = cloneLunarEvents(settings.lunarEvents ?? DEFAULT_LUNAR_EVENTS)
  // Only replace the array when the content changed (a new array would re-trigger the settings watcher).
  if (JSON.stringify(nextEvents) !== JSON.stringify(lunarEvents.value)) {
    lunarEvents.value = nextEvents
    resetLunarEventsDraft()
  }
}

const getTreeSettings = (): FamilyTreeSettings => ({
  showBirthDate: showBirthDate.value,
  showDeathDate: showDeathDate.value,
  showSpouse: showSpouseInfo.value,
  showViewDetail: showViewDetailAction.value,
  showMemorialPlace: showMemorialPlace.value,
  notificationMonths: notificationMonths.value,
  lunarEvents: cloneLunarEvents(lunarEvents.value),
})

const applyLoadedState = (database: FamilyDatabase): void => {
  approvedMembers.value = database.members.map((member) => normalizeMember(member))
  approvedSettings.value = cloneSettings(database.settings ?? defaultTreeSettings())

  if (database.pendingMembers && database.pendingMembers.length > 0) {
    pendingMembers.value = database.pendingMembers.map((member) => normalizeMember(member))
    pendingSettings.value = cloneSettings(database.pendingSettings ?? approvedSettings.value)
    pendingUpdatedAt.value = database.pendingUpdatedAt
  } else {
    pendingMembers.value = null
    pendingSettings.value = null
    pendingUpdatedAt.value = undefined
  }
}

const buildDatabasePayload = (params: {
  nextApprovedMembers: FamilyMember[]
  nextApprovedSettings: FamilyTreeSettings
  nextPendingMembers: FamilyMember[] | null
  nextPendingSettings: FamilyTreeSettings | null
  nextPendingUpdatedAt?: string
}): FamilyDatabase => {
  return {
    members: params.nextApprovedMembers.map((member) => normalizeMember(member)),
    settings: cloneSettings(params.nextApprovedSettings),
    pendingMembers: params.nextPendingMembers
      ? params.nextPendingMembers.map((member) => normalizeMember(member))
      : undefined,
    pendingSettings: params.nextPendingMembers && params.nextPendingSettings
      ? cloneSettings(params.nextPendingSettings)
      : undefined,
    pendingUpdatedAt: params.nextPendingMembers ? params.nextPendingUpdatedAt : undefined,
  }
}

const syncTreeSettingsForCurrentMode = (): void => {
  suppressSettingsSync.value = true
  applyTreeSettings(cloneSettings(getModeSettings(mode.value)))
  suppressSettingsSync.value = false
}

const loadMembers = async (): Promise<void> => {
  isLoading.value = true

  try {
    const loadedDatabase = await fetchFamilyDatabase()
    applyLoadedState(loadedDatabase)
    syncTreeSettingsForCurrentMode()
    hasLoadedDatabase.value = true
    loadingError.value = ''
  } catch (error) {
    loadingError.value =
      error instanceof Error ? error.message : 'Không thể tải dữ liệu từ file JSON.'
  } finally {
    suppressSettingsSync.value = false
    isLoading.value = false
  }
}

const validateForm = (): boolean => {
  if (!form.value.id.trim()) {
    formError.value = 'Vui lòng nhập ID.'
    return false
  }

  if (!form.value.name.trim()) {
    formError.value = 'Vui lòng nhập tên.'
    return false
  }

  const positionText = normalizePositionInput(form.value.position)
  if (positionText) {
    if (!/^\d+$/.test(positionText)) {
      formError.value = 'Vị trí phải là số nguyên không âm.'
      return false
    }
  }

  const birthIso = parseAdminDateToIso(form.value.birthDate)
  if (birthIso === null) {
    formError.value = 'Ngày sinh không hợp lệ. Nhập dd-mm-yyyy hoặc ddmmyyyy.'
    return false
  }

  const deathIso = parseAdminDateToIso(form.value.deathDate)
  if (deathIso === null) {
    formError.value = 'Ngày mất không hợp lệ. Nhập dd-mm-yyyy hoặc ddmmyyyy.'
    return false
  }

  if (birthIso && deathIso) {
    const birthTime = new Date(birthIso).getTime()
    const deathTime = new Date(deathIso).getTime()
    if (deathTime < birthTime) {
      formError.value = 'Ngày mất không được trước ngày sinh.'
      return false
    }
  }

  const idInUse = members.value.some(
    (member) => member.id === form.value.id && member.id !== editingId.value,
  )

  if (idInUse) {
    formError.value = 'ID đã tồn tại. Vui lòng chọn ID khác.'
    return false
  }

  if (
    form.value.spouseId &&
    form.value.spouseId === form.value.id
  ) {
    formError.value = 'Một thành viên không thể tự chọn chính mình làm vợ/chồng.'
    return false
  }

  if (form.value.formerSpouseId && form.value.formerSpouseId === form.value.id) {
    formError.value = 'Không thể chọn chính mình làm vợ/chồng trước.'
    return false
  }

  if (form.value.formerSpouseId && form.value.formerSpouseId === form.value.spouseId) {
    formError.value = 'Vợ/chồng trước không thể trùng với vợ/chồng hiện tại.'
    return false
  }

  return true
}

// Lunar date computed from the solar death date in the form (used as hint/placeholder).
const autoLunarDeathDate = computed(() => {
  const iso = parseAdminDateToIso(form.value.deathDate)
  return iso ? solarDateTextToLunarText(iso) : ''
})

const formatDateInputField = (field: 'birthDate' | 'deathDate'): void => {
  const currentValue = form.value[field]
  const iso = parseAdminDateToIso(currentValue)
  if (iso === null || iso === undefined) {
    return
  }

  form.value[field] = formatDateForAdmin(iso)
}

const persistMembers = async (
  nextMembers: FamilyMember[],
  nextSettings: FamilyTreeSettings = getTreeSettings(),
): Promise<boolean> => {
  isSaving.value = true

  try {
    const shouldWritePending = isEditableMode.value
    const nextDatabase = buildDatabasePayload({
      nextApprovedMembers: cloneMembers(approvedMembers.value),
      nextApprovedSettings: cloneSettings(approvedSettings.value),
      nextPendingMembers: shouldWritePending ? cloneMembers(nextMembers) : null,
      nextPendingSettings: shouldWritePending ? cloneSettings(nextSettings) : null,
      nextPendingUpdatedAt: shouldWritePending ? new Date().toISOString() : undefined,
    })

    await saveFamilyDatabase(nextDatabase)
    if (shouldWritePending) {
      pendingMembers.value = cloneMembers(nextMembers)
      pendingSettings.value = cloneSettings(nextSettings)
      pendingUpdatedAt.value = nextDatabase.pendingUpdatedAt
    } else {
      approvedMembers.value = cloneMembers(nextMembers)
      approvedSettings.value = cloneSettings(nextSettings)
    }
    syncTreeSettingsForCurrentMode()
    loadingError.value = ''
    return true
  } catch (error) {
    loadingError.value =
      error instanceof Error ? error.message : 'Không thể lưu dữ liệu vào file JSON.'
    return false
  } finally {
    isSaving.value = false
  }
}

const saveMember = async (): Promise<void> => {
  if (!isEditableMode.value) {
    return
  }

  if (!validateForm()) {
    return
  }

  const birthIso = parseAdminDateToIso(form.value.birthDate)
  const deathIso = parseAdminDateToIso(form.value.deathDate)

  if (birthIso === null || deathIso === null) {
    formError.value = 'Định dạng ngày không hợp lệ.'
    return
  }

  const positionText = normalizePositionInput(form.value.position)

  const payload: FamilyMember = {
    id: isEditing.value && editingId.value ? editingId.value : form.value.id.trim(),
    name: form.value.name.trim(),
    position: positionText ? Number(positionText) : undefined,
    birthDate: birthIso,
    deathDate: deathIso,
    deathDateLunar: form.value.deathDateLunar.trim() || undefined,
    memorialHostId: form.value.memorialHostId || undefined,
    // keep an older free-text place only while no host is chosen
    memorialPlace: form.value.memorialHostId
      ? undefined
      : members.value.find((m) => m.id === editingId.value)?.memorialPlace,
    gender: form.value.gender,
    fatherId: form.value.fatherId || undefined,
    motherId: form.value.motherId || undefined,
    spouseId: form.value.spouseId || undefined,
    formerSpouseId: form.value.formerSpouseId || undefined,
    spouseOnRight: form.value.spouseOnRight || undefined,
  }

  const nextMembers = cloneMembers(members.value)

  if (isEditing.value && editingId.value) {
    const index = nextMembers.findIndex((member) => member.id === editingId.value)
    if (index === -1) {
      formError.value = 'Không tìm thấy thành viên để cập nhật.'
      return
    }

    const previousMember = { ...nextMembers[index] }
    const previousId = previousMember.id
    nextMembers[index] = {
      ...payload,
      isHidden: previousMember.isHidden ?? undefined,
    }

    if (previousId !== payload.id) {
      for (const member of nextMembers) {
        if (member.fatherId === previousId) {
          member.fatherId = payload.id
        }
        if (member.motherId === previousId) {
          member.motherId = payload.id
        }
        if (member.spouseId === previousId) {
          member.spouseId = payload.id
        }
      }
    }

    if (
      previousMember.spouseId &&
      previousMember.spouseId !== payload.spouseId
    ) {
      const oldSpouse = nextMembers.find((member) => member.id === previousMember.spouseId)
      if (oldSpouse?.spouseId === previousId) {
        oldSpouse.spouseId = undefined
      }
    }
  } else {
    nextMembers.push(payload)
  }

  if (payload.spouseId) {
    const spouse = nextMembers.find((member) => member.id === payload.spouseId)
    if (spouse) {
      spouse.spouseId = payload.id
    }
  }

  const saved = await persistMembers(nextMembers)
  if (!saved) {
    formError.value = 'Lưu vào file JSON thất bại.'
    return
  }

  formError.value = ''
  resetForm()
}

const toggleMemberHidden = async (id: string): Promise<void> => {
  if (!isEditableMode.value) {
    return
  }

  const target = members.value.find((member) => member.id === id)
  if (!target) {
    return
  }

  const nextMembers = members.value.map((member) => {
    if (member.id !== id) {
      return { ...member }
    }

    return {
      ...member,
      isHidden: !(member.isHidden ?? false),
    }
  })

  const saved = await persistMembers(nextMembers)
  if (!saved) {
    formError.value = 'Không thể cập nhật trạng thái ẩn/hiện vì không ghi được file JSON.'
  }
}

const deleteMember = async (id: string): Promise<void> => {
  if (!isEditableMode.value) {
    return
  }

  const nextMembers = cloneMembers(members.value)
    .filter((member) => member.id !== id)

  for (const member of nextMembers) {
    if (member.fatherId === id) {
      member.fatherId = undefined
    }
    if (member.motherId === id) {
      member.motherId = undefined
    }
    if (member.spouseId === id) {
      member.spouseId = undefined
    }
  }

  if (editingId.value === id) {
    resetForm()
  }

  const saved = await persistMembers(nextMembers)
  if (!saved) {
    formError.value = 'Xóa thất bại vì không ghi được file JSON.'
  }
}

const isApprovePromptOpen = ref(false)
/** What the password prompt confirms: approve (publish) or reject (discard) the admin's changes. */
const reviewAction = ref<'approve' | 'reject'>('approve')
const approvePassword = ref('')
const approveError = ref('')
const approvePasswordRef = ref<HTMLInputElement | null>(null)

const openApprovePrompt = async (action: 'approve' | 'reject' = 'approve'): Promise<void> => {
  reviewAction.value = action
  isApprovePromptOpen.value = true
  approveError.value = ''
  await nextTick()
  approvePasswordRef.value?.focus()
}

const closeApprovePrompt = (): void => {
  isApprovePromptOpen.value = false
  approvePassword.value = ''
  approveError.value = ''
}

const approvePendingChanges = async (): Promise<void> => {
  if (!isSuperAdminMode.value || !pendingMembers.value || !pendingSettings.value || !approvePassword.value) {
    return
  }

  isSaving.value = true
  try {
    const nextApprovedMembers = cloneMembers(pendingMembers.value)
    const nextApprovedSettings = cloneSettings(pendingSettings.value)
    const nextDatabase = buildDatabasePayload({
      nextApprovedMembers,
      nextApprovedSettings,
      nextPendingMembers: null,
      nextPendingSettings: null,
      nextPendingUpdatedAt: undefined,
    })

    await saveFamilyDatabase(nextDatabase, { approvePassword: approvePassword.value })
    closeApprovePrompt()
    approvedMembers.value = nextApprovedMembers
    approvedSettings.value = nextApprovedSettings
    pendingMembers.value = null
    pendingSettings.value = null
    pendingUpdatedAt.value = undefined
    loadingError.value = ''
    formError.value = ''
    resetForm()
    syncTreeSettingsForCurrentMode()
  } catch (error) {
    // Wrong password: keep the form open and show the message next to it.
    approveError.value = error instanceof Error ? error.message : 'Không thể phê duyệt thay đổi.'
    approvePassword.value = ''
    await nextTick()
    approvePasswordRef.value?.focus()
  } finally {
    isSaving.value = false
  }
}

// Từ chối: drop the pending copy; the approved data stays as it was.
const rejectPendingChanges = async (): Promise<void> => {
  if (!isSuperAdminMode.value || !pendingMembers.value || !approvePassword.value) {
    return
  }

  isSaving.value = true
  try {
    const nextDatabase = buildDatabasePayload({
      nextApprovedMembers: cloneMembers(approvedMembers.value),
      nextApprovedSettings: cloneSettings(approvedSettings.value),
      nextPendingMembers: null,
      nextPendingSettings: null,
      nextPendingUpdatedAt: undefined,
    })

    await saveFamilyDatabase(nextDatabase, { approvePassword: approvePassword.value })
    closeApprovePrompt()
    pendingMembers.value = null
    pendingSettings.value = null
    pendingUpdatedAt.value = undefined
    loadingError.value = ''
    formError.value = ''
    resetForm()
    syncTreeSettingsForCurrentMode()
  } catch (error) {
    approveError.value = error instanceof Error ? error.message : 'Không thể từ chối thay đổi.'
    approvePassword.value = ''
    await nextTick()
    approvePasswordRef.value?.focus()
  } finally {
    isSaving.value = false
  }
}

const submitReview = (): Promise<void> =>
  reviewAction.value === 'reject' ? rejectPendingChanges() : approvePendingChanges()

const pendingUpdatedLabel = computed(() => {
  if (!pendingUpdatedAt.value) {
    return ''
  }

  const time = new Date(pendingUpdatedAt.value)
  if (Number.isNaN(time.getTime())) {
    return pendingUpdatedAt.value
  }

  return time.toLocaleString('vi-VN')
})

const setMode = (nextMode: AppMode): void => {
  if (nextMode === mode.value) {
    return
  }

  const nextPath =
    nextMode === 'admin' ? ADMIN_PATH : nextMode === 'super-admin' ? SUPER_ADMIN_PATH : '/view'
  void router.push(nextPath)
}

watch(mode, () => {
  if (!isEditableMode.value) {
    resetForm()
  }

  syncTreeSettingsForCurrentMode()
})

watch(isEditableMode, (currentMode) => {
  if (!currentMode) {
    resetForm()
  }
})

watch([showBirthDate, showDeathDate, showSpouseInfo, showViewDetailAction, notificationMonths, lunarEvents, showMemorialPlace], async (
  [nextBirthDate, nextDeathDate, nextSpouse, nextDetail, nextMonths, nextEvents, nextPlace],
  [previousBirthDate, previousDeathDate, previousSpouse, previousDetail, previousMonths, previousEvents, previousPlace],
) => {
  if (
    suppressSettingsSync.value ||
    !hasLoadedDatabase.value ||
    !isEditableMode.value ||
    (
      nextBirthDate === previousBirthDate &&
      nextDeathDate === previousDeathDate &&
      nextSpouse === previousSpouse &&
      nextDetail === previousDetail &&
      nextMonths === previousMonths &&
      nextPlace === previousPlace &&
      JSON.stringify(nextEvents) === JSON.stringify(previousEvents)
    )
  ) {
    return
  }

  // Loading the page (or switching mode) just shows the stored settings: never save those back.
  const stored = getModeSettings(mode.value)
  if (
    nextBirthDate === stored.showBirthDate &&
    nextDeathDate === stored.showDeathDate &&
    nextSpouse === stored.showSpouse &&
    nextDetail === stored.showViewDetail &&
    nextPlace === (stored.showMemorialPlace ?? true) &&
    nextMonths === (stored.notificationMonths ?? 3) &&
    JSON.stringify(nextEvents) === JSON.stringify(cloneLunarEvents(stored.lunarEvents ?? DEFAULT_LUNAR_EVENTS))
  ) {
    return
  }

  const saved = await persistMembers(
    cloneMembers(members.value),
    {
      showBirthDate: nextBirthDate,
      showDeathDate: nextDeathDate,
      showSpouse: nextSpouse,
      showViewDetail: nextDetail,
      showMemorialPlace: nextPlace,
      notificationMonths: nextMonths,
      lunarEvents: cloneLunarEvents(nextEvents),
    },
  )
  if (!saved) {
    suppressSettingsSync.value = true
    showBirthDate.value = previousBirthDate
    showDeathDate.value = previousDeathDate
    showSpouseInfo.value = previousSpouse
    showViewDetailAction.value = previousDetail
    showMemorialPlace.value = previousPlace
    notificationMonths.value = previousMonths
    lunarEvents.value = previousEvents
    resetLunarEventsDraft()
    suppressSettingsSync.value = false
  } else if (JSON.stringify(nextEvents) !== JSON.stringify(previousEvents)) {
    lunarEventsMessage.value = 'Đã lưu danh sách Lễ Tết.'
  }
})

// ---- Lễ Tết editor (draft; saved with the "Lưu danh sách" button) ----
type LunarEventDraft = { name: string; day: number | string; month: number | string; lastDayOfMonth: boolean }
const lunarEventsDraft = ref<LunarEventDraft[]>([])
const lunarEventsError = ref('')
const lunarEventsMessage = ref('')

function resetLunarEventsDraft(): void {
  lunarEventsDraft.value = lunarEvents.value.map((e) => ({
    name: e.name,
    day: e.day,
    month: e.month,
    lastDayOfMonth: Boolean(e.lastDayOfMonth),
  }))
  lunarEventsError.value = ''
}

resetLunarEventsDraft()

const lunarEventsDirty = computed(() => {
  const draft = lunarEventsDraft.value.map((e) => [e.name.trim(), Number(e.day), Number(e.month), e.lastDayOfMonth])
  const saved = lunarEvents.value.map((e) => [e.name, e.day, e.month, Boolean(e.lastDayOfMonth)])
  return JSON.stringify(draft) !== JSON.stringify(saved)
})

const addLunarEvent = (): void => {
  lunarEventsMessage.value = ''
  lunarEventsDraft.value.push({ name: '', day: 1, month: 1, lastDayOfMonth: false })
}

const removeLunarEvent = (index: number): void => {
  lunarEventsMessage.value = ''
  lunarEventsDraft.value.splice(index, 1)
}

const restoreDefaultLunarEvents = (): void => {
  lunarEventsMessage.value = ''
  lunarEventsDraft.value = DEFAULT_LUNAR_EVENTS.map((e) => ({
    name: e.name,
    day: e.day,
    month: e.month,
    lastDayOfMonth: Boolean(e.lastDayOfMonth),
  }))
}

const saveLunarEvents = (): void => {
  lunarEventsMessage.value = ''
  const next: LunarEvent[] = lunarEventsDraft.value.map((e) => ({
    name: e.name.trim(),
    day: e.lastDayOfMonth ? 30 : Number(e.day),
    month: Number(e.month),
    ...(e.lastDayOfMonth ? { lastDayOfMonth: true } : {}),
  }))
  const invalidIndex = next.findIndex((e) => !isValidLunarEvent(e))
  if (invalidIndex !== -1) {
    lunarEventsError.value = `Dòng ${invalidIndex + 1}: cần tên (tối đa ${MAX_LUNAR_EVENT_NAME} ký tự), ngày 1–30 và tháng 1–12.`
    return
  }
  if (next.length > MAX_LUNAR_EVENTS) {
    lunarEventsError.value = `Tối đa ${MAX_LUNAR_EVENTS} sự kiện.`
    return
  }
  lunarEventsError.value = ''
  lunarEvents.value = next // the settings watcher saves it (pending → super admin approval)
}

onMounted(async () => {
  await loadMembers()
})
</script>

<template>
  <main class="app">
    <aside class="couplet couplet--left" :title="`Vế trái: ${COUPLET_LEFT.meaning}`" :aria-label="`Câu đối, vế trái: ${COUPLET_LEFT.meaning}`">
      <span v-for="(char, index) in COUPLET_LEFT.chars" :key="index" class="couplet-cell" aria-hidden="true">
        <span class="couplet-char">{{ char }}</span>
        <span class="couplet-reading">{{ COUPLET_LEFT.readings[index] }}</span>
      </span>
    </aside>
    <aside class="couplet couplet--right" :title="`Vế phải: ${COUPLET_RIGHT.meaning}`" :aria-label="`Câu đối, vế phải: ${COUPLET_RIGHT.meaning}`">
      <span v-for="(char, index) in COUPLET_RIGHT.chars" :key="index" class="couplet-cell" aria-hidden="true">
        <span class="couplet-char">{{ char }}</span>
        <span class="couplet-reading">{{ COUPLET_RIGHT.readings[index] }}</span>
      </span>
    </aside>

    <!-- Title band: full plaque at the top; once you scroll it becomes a slim bar that stays on top -->
    <div ref="headerBandRef" class="header-band" :class="{ 'is-compact': isHeaderCompact }">
      <div class="header-band-bar">
        <header ref="appHeaderRef" class="app-header">
          <h1>范氏家谱</h1>
          <h2>PHẠM THỊ GIA PHẢ</h2>
        </header>
      </div>
    </div>
    <!-- tablets/phones: keeps the tree below the câu đối scrolls (height set in script) -->
    <div ref="coupletSpacerRef" class="couplet-spacer" aria-hidden="true"></div>

    <section v-if="isEditableMode" class="mode-panel">
      <h2>Chế độ</h2>
      <div class="mode-actions">
        <button
          type="button"
          :class="{ active: mode === 'view' }"
          @click="setMode('view')"
        >
          Chế độ xem
        </button>
        <button
          type="button"
          :class="{ active: mode === 'admin' }"
          @click="setMode('admin')"
        >
          Chế độ quản trị
        </button>
        <button
          v-if="isSuperAdminMode"
          type="button"
          :class="{ active: mode === 'super-admin' }"
          @click="setMode('super-admin')"
        >
          Super admin
        </button>
      </div>
      <p class="mode-help">
        {{
          isSuperAdminMode
            ? 'Super admin: review, chỉnh sửa và phê duyệt thay đổi.'
            : 'Admin: thay đổi sẽ vào bản chờ duyệt, chưa hiển thị ở chế độ xem.'
        }}
      </p>
      <p class="mode-url">
        Đường dẫn: <code>{{ mode === 'super-admin' ? SUPER_ADMIN_PATH : ADMIN_PATH }}</code>
      </p>
      <div v-if="isSuperAdminMode" class="download-row">
        <button v-if="!isDownloadPromptOpen" type="button" class="download-btn" @click="openDownloadPrompt">
          ⬇ Tải file JSON dữ liệu
        </button>
        <form v-else class="download-form" @submit.prevent="downloadDatabaseJson">
          <input
            ref="downloadPasswordRef"
            v-model="downloadPassword"
            type="password"
            autocomplete="current-password"
            placeholder="Mật khẩu tải file"
            aria-label="Mật khẩu tải file"
            :disabled="isDownloading"
          />
          <button type="submit" class="download-btn" :disabled="isDownloading || !downloadPassword">
            {{ isDownloading ? 'Đang kiểm tra...' : 'Tải xuống' }}
          </button>
          <button type="button" class="download-cancel" :disabled="isDownloading" @click="closeDownloadPrompt">Hủy</button>
        </form>
        <span v-if="downloadError" class="download-error">{{ downloadError }}</span>
      </div>
    </section>

    <section v-if="isEditableMode" class="review-panel">
      <p v-if="hasPendingChanges">
        Có bản thay đổi đang chờ duyệt
        <template v-if="pendingUpdatedLabel"> (cập nhật: {{ pendingUpdatedLabel }})</template>.
      </p>
      <p v-else>Chưa có thay đổi chờ duyệt.</p>
      <template v-if="isSuperAdminMode">
        <div v-if="!isApprovePromptOpen" class="review-actions">
          <button
            type="button"
            class="approve-btn"
            :disabled="isSaving || !hasPendingChanges"
            @click="openApprovePrompt('approve')"
          >
            Phê duyệt thay đổi
          </button>
          <button
            type="button"
            class="reject-btn"
            :disabled="isSaving || !hasPendingChanges"
            title="Bỏ toàn bộ thay đổi của admin, giữ dữ liệu đã duyệt"
            @click="openApprovePrompt('reject')"
          >
            Từ chối thay đổi
          </button>
        </div>
        <form v-else class="approve-form" @submit.prevent="submitReview">
          <span v-if="reviewAction === 'reject'" class="reject-note">
            Từ chối sẽ xóa toàn bộ thay đổi đang chờ duyệt và quay về dữ liệu đã duyệt.
          </span>
          <input
            ref="approvePasswordRef"
            v-model="approvePassword"
            type="password"
            autocomplete="current-password"
            placeholder="Mật khẩu phê duyệt"
            aria-label="Mật khẩu phê duyệt"
            :disabled="isSaving"
          />
          <button
            type="submit"
            :class="reviewAction === 'reject' ? 'reject-btn' : 'approve-btn'"
            :disabled="isSaving || !approvePassword"
          >
            {{ isSaving ? 'Đang xử lý...' : reviewAction === 'reject' ? 'Xác nhận từ chối' : 'Xác nhận phê duyệt' }}
          </button>
          <button type="button" class="download-cancel" :disabled="isSaving" @click="closeApprovePrompt">Hủy</button>
          <span v-if="approveError" class="download-error">{{ approveError }}</span>
        </form>
      </template>
    </section>

    <div v-if="isEditableMode" class="admin-panels">
      <section
        ref="editorPanelRef"
        class="editor-panel"
        :class="{ 'editor-panel--flash': isEditorFlashing }"
      >
        <h2>{{ isEditing ? 'Chỉnh sửa thành viên' : 'Thêm thành viên' }}</h2>

        <form class="member-form" @submit.prevent="saveMember">
        <label>
          ID
          <input
            v-model="form.id"
            type="text"
            required
            :disabled="isSaving"
            :readonly="isEditing"
            :class="{ 'is-locked': isEditing }"
            :title="isEditing ? 'Không thể đổi ID khi chỉnh sửa' : undefined"
          />
          <small v-if="isEditing" class="field-hint">ID không thể thay đổi khi chỉnh sửa.</small>
        </label>

        <label>
          Tên
          <input ref="nameInputRef" v-model="form.name" type="text" required :disabled="isSaving" />
        </label>

        <label>
          Vị trí (trái → phải)
          <input
            v-model="form.position"
            type="number"
            min="0"
            step="1"
            placeholder="Ví dụ: 1, 2, 3..."
            :disabled="isSaving"
          />
        </label>

        <label>
          Ngày sinh
          <input
            v-model="form.birthDate"
            type="text"
            inputmode="numeric"
            placeholder="dd-mm-yyyy hoặc ddmmyyyy"
            :disabled="isSaving"
            @blur="formatDateInputField('birthDate')"
          />
        </label>

        <label>
          Ngày mất
          <input
            v-model="form.deathDate"
            type="text"
            inputmode="numeric"
            placeholder="dd-mm-yyyy hoặc ddmmyyyy"
            :disabled="isSaving"
            @blur="formatDateInputField('deathDate')"
          />
        </label>

        <label>
          Ngày mất (âm lịch)
          <input
            v-model="form.deathDateLunar"
            type="text"
            :placeholder="autoLunarDeathDate ? `Tự tính: ${autoLunarDeathDate}` : 'Ví dụ: 15-03-2024 hoặc 15 tháng 3 năm Giáp Thìn'"
            :disabled="isSaving"
          />
          <small class="field-hint">
            {{
              autoLunarDeathDate
                ? 'Để trống để dùng ngày âm lịch tự tính từ ngày mất.'
                : 'Nhập khi chỉ biết ngày giỗ âm lịch.'
            }}
          </small>
        </label>

        <label>
          Nơi tổ chức đám giỗ (nhà của)
          <SearchableMemberSelect
            v-model="form.memorialHostId"
            list-id="memorial-host-members"
            :members="livingMembers"
            placeholder="Chọn người còn sống"
            :disabled="isSaving"
          />
        </label>

        <label>
          Giới tính
          <select v-model="form.gender" :disabled="isSaving">
            <option value="female">Nữ</option>
            <option value="male">Nam</option>
            <option value="other">Khác</option>
          </select>
        </label>

        <label>
          Cha
          <SearchableMemberSelect
            v-model="form.fatherId"
            list-id="father-members"
            :members="selectableMembers"
            :disabled="isSaving"
          />
        </label>

        <label>
          Mẹ
          <SearchableMemberSelect
            v-model="form.motherId"
            list-id="mother-members"
            :members="selectableMembers"
            :disabled="isSaving"
          />
        </label>

        <label>
          Vợ/Chồng
          <SearchableMemberSelect
            v-model="form.spouseId"
            list-id="spouse-members"
            :members="selectableMembers"
            :disabled="isSaving"
          />
        </label>

        <label>
          Vợ/chồng trước (đã ly hôn)
          <SearchableMemberSelect
            v-model="form.formerSpouseId"
            list-id="former-spouse-members"
            :members="selectableMembers"
            :disabled="isSaving"
          />
        </label>

        <label class="checkbox-field">
          <input v-model="form.spouseOnRight" type="checkbox" :disabled="isSaving" />
          Thành viên này nằm bên phải trong cặp vợ/chồng
        </label>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="form-actions">
          <button type="submit" :disabled="isSaving">
            {{ isSaving ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm thành viên' }}
          </button>
          <button type="button" class="secondary" :disabled="isSaving" @click="startAddMember">
            Làm mới
          </button>
        </div>
        </form>
      </section>

      <section class="settings-panel">
        <h2>Cài đặt</h2>
        <p class="settings-help">Tùy chỉnh cách hiển thị cây gia phả.</p>

        <label class="setting-toggle">
          <input v-model="showBirthDate" type="checkbox" />
          Hiển thị ngày sinh
        </label>
        <label class="setting-toggle">
          <input v-model="showDeathDate" type="checkbox" />
          Hiển thị ngày mất
        </label>
        <label class="setting-toggle">
          <input v-model="showSpouseInfo" type="checkbox" />
          Hiển thị vợ/chồng
        </label>
        <label class="setting-toggle">
          <input v-model="showViewDetailAction" type="checkbox" />
          Hiển thị nút xem chi tiết
        </label>
        <label class="setting-toggle">
          <input v-model="showMemorialPlace" type="checkbox" />
          Hiển thị nơi tổ chức đám giỗ
        </label>
        <label class="setting-select">
          Thanh thông báo (ngày giỗ, Lễ Tết) hiển thị trong
          <select v-model.number="notificationMonths">
            <option :value="0">Tắt thanh thông báo</option>
            <option :value="1">1 tháng tới</option>
            <option :value="2">2 tháng tới</option>
            <option :value="3">3 tháng tới</option>
            <option :value="4">4 tháng tới</option>
            <option :value="6">6 tháng tới</option>

          </select>
        </label>

        <div class="lunar-events-editor">
          <h3>Lễ Tết trên thanh thông báo (âm lịch)</h3>
          <div class="lunar-events-head" aria-hidden="true">
            <span>Tên</span><span>Ngày</span><span>Tháng</span><span>Cuối tháng</span><span></span>
          </div>
          <div v-for="(event, index) in lunarEventsDraft" :key="index" class="lunar-event-row">
            <input
              v-model="event.name"
              type="text"
              class="lunar-event-name"
              :maxlength="MAX_LUNAR_EVENT_NAME"
              placeholder="Tên sự kiện"
              aria-label="Tên sự kiện"
            />
            <input
              v-model.number="event.day"
              type="number"
              min="1"
              max="30"
              :disabled="event.lastDayOfMonth"
              aria-label="Ngày âm lịch"
            />
            <input v-model.number="event.month" type="number" min="1" max="12" aria-label="Tháng âm lịch" />
            <label class="lunar-event-last" title="Ngày cuối tháng (29 hoặc 30), ví dụ Giao thừa">
              <input v-model="event.lastDayOfMonth" type="checkbox" />
              <span class="lunar-event-last-text">Cuối tháng</span>
            </label>
            <button type="button" class="lunar-event-remove" aria-label="Xóa sự kiện" @click="removeLunarEvent(index)">✕</button>
          </div>
          <p v-if="lunarEventsDraft.length === 0" class="settings-help">Chưa có sự kiện nào.</p>
          <div class="lunar-events-actions">
            <button type="button" class="lunar-btn" :disabled="lunarEventsDraft.length >= MAX_LUNAR_EVENTS" @click="addLunarEvent">
              + Thêm sự kiện
            </button>
            <button type="button" class="lunar-btn" @click="restoreDefaultLunarEvents">Khôi phục mặc định</button>
            <button type="button" class="lunar-btn" :disabled="!lunarEventsDirty" @click="resetLunarEventsDraft">Hủy thay đổi</button>
            <button type="button" class="lunar-btn lunar-btn--primary" :disabled="!lunarEventsDirty || isSaving" @click="saveLunarEvents">
              Lưu danh sách
            </button>
          </div>
          <p v-if="lunarEventsError" class="download-error">{{ lunarEventsError }}</p>
          <p v-else-if="lunarEventsMessage" class="lunar-events-message">{{ lunarEventsMessage }}</p>
        </div>
      </section>
    </div>

    <p v-if="isLoading" class="status-message">Đang tải dữ liệu từ file JSON...</p>
    <p v-else-if="loadingError" class="status-message error">{{ loadingError }}</p>

    <FamilyTree
      :members="members"
      :can-manage="isEditableMode"
      :show-birth-date="showBirthDate"
      :show-death-date="showDeathDate"
      :show-spouse="showSpouseInfo"
      :show-view-detail="showViewDetailAction"
      :show-memorial-place="showMemorialPlace"
      :notification-months="notificationMonths"
      :lunar-events="lunarEvents"
      @edit-member="startEditMember"
      @delete-member="deleteMember"
      @toggle-member-hidden="toggleMemberHidden"
    />
  </main>
</template>

<style scoped>
.app {
  --app-pad-x: 2rem;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 2rem var(--app-pad-x) 3rem;
}

/* ---------- Title band ---------- */
.header-band {
  position: sticky;
  top: 0;
  z-index: 50;
  /* full width of the page (cancel the page side padding) */
  margin: 0 calc(-1 * var(--app-pad-x));
  padding: 0 var(--app-pad-x);
  /* keeps the full plaque's height in the page so nothing jumps when it shrinks */
  height: var(--band-h, auto);
  pointer-events: none;
}

.header-band-bar {
  pointer-events: auto;
  transition: background-color 0.25s ease, box-shadow 0.25s ease, padding 0.25s ease;
}

.header-band .app-header {
  margin: 0 auto;
  transition: padding 0.25s ease, width 0.25s ease;
}

.header-band .app-header h1,
.header-band .app-header h2 {
  transition: font-size 0.25s ease, letter-spacing 0.25s ease, margin 0.25s ease;
}

/* compact: slim bar across the top with a solid background, plaque on one line */
.header-band.is-compact .header-band-bar {
  margin: 0 calc(-1 * var(--app-pad-x));
  padding: 0;
  box-shadow: 0 6px 16px rgba(60, 25, 8, 0.3);
}

/* compact: the red plaque spans the full width of the window */
.header-band.is-compact .app-header {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 1.1rem;
  width: 100%;
  max-width: none;
  padding: 0.45rem 2.2rem 0.5rem;
  border-width: 0 0 2px;
  border-radius: 0;
  box-shadow:
    inset 0 -4px 0 #7d1b14,
    inset 0 -5px 0 rgba(241, 212, 138, 0.6);
}

.header-band.is-compact .app-header h1 {
  margin: 0;
  font-size: 1.55rem;
  letter-spacing: 0.15em;
}

.header-band.is-compact .app-header h2 {
  font-size: 0.85rem;
  letter-spacing: 0.22em;
}

.header-band.is-compact .app-header::before,
.header-band.is-compact .app-header::after {
  width: 28px;
  height: 28px;
}

.app-header {
  position: relative;
  width: min(640px, 100%);
  margin: 0.5rem auto 1.75rem;
  padding: 1.1rem 2.5rem 1.2rem;
  text-align: center;
  color: #f1d48a;
  background:
    radial-gradient(ellipse at 50% 30%, #a3291d 0%, #7d1b14 60%, #5e130e 100%);
  border: 3px solid #c9a24a;
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 5px #7d1b14,
    inset 0 0 0 6px rgba(241, 212, 138, 0.7),
    0 10px 24px rgba(60, 20, 8, 0.35);
}

.app-header::before,
.app-header::after {
  content: '';
  position: absolute;
  top: 0;
  width: 64px;
  height: 64px;
  background: url('/gia-pha-cloud-corner.svg') no-repeat center / contain;
  filter: brightness(1.9) saturate(0.6);
  pointer-events: none;
}

.app-header::before {
  left: 0;
}

.app-header::after {
  right: 0;
  transform: scaleX(-1);
}

.app-header h1,
.app-header h2 {
  position: relative;
  z-index: 1;
}

.app-header h1 {
  margin: 0 0 0.15rem;
  font-family: 'Ma Shan Zheng', 'KaiTi', 'STKaiti', serif;
  font-weight: 400;
  font-size: clamp(2.2rem, 4.5vw, 3.2rem);
  line-height: 1.2;
  letter-spacing: 0.25em;
  text-indent: 0.25em;
  color: #f6e2a8;
  text-shadow: 0 2px 0 rgba(40, 8, 4, 0.55);
}

.app-header h2 {
  margin: 0;
  font-family: 'Noto Serif', Georgia, serif;
  font-weight: 600;
  font-size: clamp(1rem, 2vw, 1.3rem);
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #f1d48a;
}

.app-header p {
  margin: 0;
  color: #5a6376;
}

.mode-panel {
  background: #ffffff;
  border: 1px solid #d7dbe6;
  border-radius: 16px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.mode-panel h2 {
  margin: 0 0 0.75rem;
  color: #23345d;
}

.mode-actions {
  display: flex;
  gap: 0.5rem;
}

.mode-actions button {
  border-radius: 999px;
  border: 1px solid #8ca7de;
  background: #fff;
  color: #2f4678;
  font-weight: 700;
  padding: 0.35rem 0.85rem;
  cursor: pointer;
}

.mode-actions button.active {
  background: #2f4678;
  color: #fff;
}

.mode-help {
  margin: 0.7rem 0 0;
  color: #5a6376;
  font-weight: 600;
}

.mode-url {
  margin: 0.5rem 0 0;
  color: #5a6376;
}

.mode-url code {
  background: #eef2ff;
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}

.review-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  background: #fff8ea;
  border: 1px solid #e3c79a;
  border-radius: 12px;
  padding: 0.75rem 0.9rem;
  margin-bottom: 1rem;
}

.review-panel p {
  margin: 0;
  color: #5f3a1a;
  font-weight: 600;
}

.approve-btn {
  border: 1px solid #8ca7de;
  border-radius: 8px;
  background: #2f4678;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  padding: 0.45rem 0.9rem;
}

.approve-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.reject-btn {
  border: 1px solid #d99a8f;
  border-radius: 8px;
  background: #9b2a1c;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  padding: 0.45rem 0.9rem;
}

.reject-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.reject-note {
  flex-basis: 100%;
  color: #8f1d1d;
  font-weight: 600;
}

.editor-panel {
  background: #ffffff;
  border: 1px solid #d7dbe6;
  border-radius: 16px;
  padding: 1rem;
}

.editor-panel {
  scroll-margin-top: 90px; /* clear the slim title bar */
}

.editor-panel--flash {
  animation: editor-panel-flash 1.6s ease-out;
}

@keyframes editor-panel-flash {
  0%,
  40% {
    box-shadow: 0 0 0 4px rgba(201, 162, 74, 0.85);
  }
  100% {
    box-shadow: 0 0 0 4px rgba(201, 162, 74, 0);
  }
}

.editor-panel h2 {
  margin: 0 0 0.75rem;
  color: #23345d;
}

.admin-panels {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr);
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}

.settings-panel {
  background: #ffffff;
  border: 1px solid #d7dbe6;
  border-radius: 16px;
  padding: 1rem;
}

.settings-panel h2 {
  margin: 0;
  color: #23345d;
}

.settings-help {
  margin: 0.4rem 0 0.75rem;
  color: #5a6376;
  font-weight: 600;
}

.setting-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.6rem;
  font-weight: 600;
  color: #2c3e63;
}

.setting-toggle input {
  width: 16px;
  height: 16px;
}

.member-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.member-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-weight: 600;
  color: #2c3e63;
}

.member-form .checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.member-form .checkbox-field input {
  width: 16px;
  height: 16px;
}

.member-form input,
.member-form select {
  border: 1px solid #becce8;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font: inherit;
}

.form-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.form-actions button {
  border-radius: 8px;
  border: 1px solid #8ca7de;
  background: #2f4678;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  padding: 0.5rem 0.85rem;
}

.form-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.form-actions .secondary {
  background: #ffffff;
  color: #2f4678;
}

.form-error {
  grid-column: 1 / -1;
  margin: 0.25rem 0 0;
  color: #8f1d1d;
  font-weight: 600;
}

.status-message {
  margin: 0 0 1rem;
  font-weight: 600;
  color: #3b4a6e;
}

.status-message.error {
  color: #8f1d1d;
}

@media (max-width: 980px) {
  .admin-panels {
    grid-template-columns: 1fr;
  }
}

.download-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.download-btn {
  border: 1px solid #a77f48;
  border-radius: 8px;
  background: #fff4df;
  color: #5c3818;
  font-weight: 700;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
}

.download-btn:hover:not(:disabled) {
  background: #ffe9c3;
}

.download-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.download-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.download-form input {
  border: 1px solid #c7a979;
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
  font: inherit;
  min-width: 200px;
}

.download-cancel {
  border: 1px solid #b9b0a2;
  border-radius: 8px;
  background: #fff;
  color: #5a4a3a;
  font-weight: 600;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}

.approve-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.approve-form input {
  border: 1px solid #c7a979;
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
  font: inherit;
  min-width: 200px;
}

.download-error {
  color: #8f1d1d;
  font-weight: 600;
}

.setting-select {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.75rem;
  font-weight: 600;
}

.setting-select select {
  max-width: 260px;
  border: 1px solid #becce8;
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font: inherit;
  font-weight: 400;
  background: #fff;
}

.lunar-events-editor {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px dashed #d9c6a3;
}

.lunar-events-editor h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #23345d;
}

.lunar-events-head,
.lunar-event-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.2rem 4.2rem 6.2rem 2rem;
  gap: 0.4rem;
  align-items: center;
}

.lunar-events-head {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b5a44;
  margin-bottom: 0.25rem;
}

.lunar-event-row {
  margin-bottom: 0.35rem;
}

.lunar-event-row input[type='text'],
.lunar-event-row input[type='number'] {
  width: 100%;
  min-width: 0;
  border: 1px solid #becce8;
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  font: inherit;
}

.lunar-event-row input:disabled {
  background: #f2f2f2;
  color: #999;
}

.lunar-event-last {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
}

.lunar-event-remove {
  border: 1px solid #e3b4b4;
  border-radius: 6px;
  background: #fff5f5;
  color: #8f1d1d;
  cursor: pointer;
  height: 1.9rem;
}

.lunar-events-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.lunar-btn {
  border: 1px solid #8ca7de;
  border-radius: 8px;
  background: #fff;
  color: #2f4678;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}

.lunar-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.lunar-btn--primary {
  background: #2f4678;
  color: #fff;
}

.lunar-events-message {
  margin: 0.4rem 0 0;
  color: #2f6b2f;
  font-weight: 600;
}

/* ---------- Câu đối (hanging couplet scrolls): chữ Hán + âm Hán-Việt ---------- */
.couplet {
  --char-size: min(3.4rem, 5.5vh);
  position: fixed;
  top: 50%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--char-size) * 0.12);
  width: calc(var(--char-size) * 1.9);
  padding: calc(var(--char-size) * 0.45) 0;
  transform: translateY(-50%);
  color: #f6d77e;
  text-shadow: 0 1px 0 rgba(40, 8, 4, 0.6);
  background:
    radial-gradient(circle at 50% 8%, rgba(255, 220, 150, 0.18), transparent 40%),
    linear-gradient(90deg, #7a1810, #a52a1c 30%, #a52a1c 70%, #7a1810);
  border: 2px solid #c9a24a;
  border-radius: 3px;
  box-shadow:
    inset 0 0 0 3px #8a1f15,
    inset 0 0 0 4px rgba(241, 212, 138, 0.6),
    0 10px 22px rgba(50, 15, 5, 0.35);
  user-select: none;
}

.couplet-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.couplet-char {
  font-family: 'LXGW WenKai TC', 'Ma Shan Zheng', 'KaiTi', 'DFKai-SB', 'BiauKai', serif;
  font-weight: 700;
  font-size: var(--char-size);
  line-height: 1.05;
}

.couplet-reading {
  font-family: 'Noto Serif', Georgia, serif;
  font-weight: 700;
  font-size: max(calc(var(--char-size) * 0.34), var(--reading-min, 0rem));
  line-height: 1.15;
  letter-spacing: 0.02em;
  color: #fbe7b0;
  white-space: nowrap;
}

/* wooden rods at the top and bottom of each scroll */
.couplet::before,
.couplet::after {
  content: '';
  position: absolute;
  left: -0.5rem;
  right: -0.5rem;
  height: 0.6rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #8a5a2b, #4a2c12);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}

.couplet::before {
  top: -0.5rem;
}

.couplet::after {
  bottom: -0.5rem;
}

.couplet--left {
  left: 1rem;
}

.couplet--right {
  right: 1rem;
}

/* leave room for the scrolls on wide screens */
@media (min-width: 1100px) {
  .app {
    --app-pad-x: calc(min(3.4rem, 5.5vh) * 1.9 + 2.6rem);
  }
}

/* tablets & phones: the scrolls hang beside the title plaque (like câu đối beside a hoành phi) */
@media (max-width: 1099px) {
  .app {
    position: relative;
  }

  .couplet {
    --char-size: 2.15rem;
    --reading-min: 0.8rem;
    position: absolute;
    top: 1.1rem;
    transform: none;
  }

  .couplet--left {
    left: 1rem;
  }

  .couplet--right {
    right: 1rem;
  }

  .app-header {
    width: min(640px, calc(100% - 10.5rem));
    margin-top: 0.5rem;
  }
}

/* ---------- Mobile ---------- */
@media (max-width: 640px) {
  .app {
    --app-pad-x: 0.6rem;
    padding: 1rem var(--app-pad-x) 1.5rem;
  }

  .header-band.is-compact .app-header {
    gap: 0.6rem;
    padding: 0.25rem 1.2rem 0.3rem;
  }

  .header-band.is-compact .app-header h1 {
    font-size: 1.15rem;
  }

  .header-band.is-compact .app-header h2 {
    font-size: 0.62rem;
    letter-spacing: 0.12em;
  }

  .couplet {
    --char-size: 1.45rem;
    --reading-min: 0.64rem;
    width: 2.95rem;
    top: 0.8rem;
  }

  .couplet::before,
  .couplet::after {
    left: -0.3rem;
    right: -0.3rem;
    height: 0.4rem;
  }

  .couplet::before {
    top: -0.32rem;
  }

  .couplet::after {
    bottom: -0.32rem;
  }

  .couplet--left {
    left: 0.4rem;
  }

  .couplet--right {
    right: 0.4rem;
  }

  .app-header {
    width: calc(100% - 7.3rem);
  }

  .app-header {
    margin: 0.25rem auto 1rem;
    padding: 0.8rem 1.25rem 0.9rem;
  }

  .app-header::before,
  .app-header::after {
    width: 40px;
    height: 40px;
  }

  .app-header h1 {
    font-size: 2rem;
    letter-spacing: 0.18em;
    text-indent: 0.18em;
  }

  .app-header h2 {
    font-size: 0.95rem;
    letter-spacing: 0.22em;
    text-indent: 0.22em;
  }

  .mode-panel,
  .editor-panel,
  .settings-panel {
    padding: 0.85rem;
    border-radius: 12px;
  }

  .mode-actions {
    flex-wrap: wrap;
  }

  .mode-url code {
    word-break: break-all;
  }

  .review-panel {
    flex-direction: column;
    align-items: stretch;
  }

  /* 16px inputs stop iOS Safari from zooming in on focus */
  .member-form input,
  .member-form select,
  .setting-select select,
  .lunar-event-row input[type='text'],
  .lunar-event-row input[type='number'] {
    font-size: 16px;
  }

  .form-actions {
    flex-wrap: wrap;
  }

  .lunar-events-head {
    display: none;
  }

  .lunar-event-row {
    grid-template-columns: minmax(0, 1fr) 3.4rem 3.4rem 2rem 2rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px dotted #e3d6bd;
  }

  .lunar-event-last-text {
    display: none;
  }
}

.member-form input.is-locked {
  background: #f2efe8;
  color: #6b5f4f;
  cursor: not-allowed;
}

.field-hint {
  font-size: 0.78rem;
  font-weight: 400;
  color: #7a6a55;
}

/* very narrow phones (iPhone SE, small Androids): keep the title on one line */
@media (max-width: 380px) {
  .app-header {
    padding-left: 0.8rem;
    padding-right: 0.8rem;
  }

  .app-header h1 {
    font-size: 1.55rem;
    letter-spacing: 0.1em;
    text-indent: 0.1em;
    white-space: nowrap;
  }

  .app-header h2 {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-indent: 0.12em;
    white-space: nowrap;
  }
}
</style>
