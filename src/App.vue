<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FamilyTree from './components/FamilyTree.vue'
import SearchableMemberSelect from './components/SearchableMemberSelect.vue'
import { fetchFamilyDatabase, saveFamilyDatabase } from './data/family-db-api'
import type { FamilyDatabase, FamilyGender, FamilyMember, FamilyTreeSettings } from './types/family'

type MemberForm = {
  id: string
  name: string
  position: string
  birthDate: string
  deathDate: string
  gender: FamilyGender
  fatherId: string
  motherId: string
  spouseId: string
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
})

const approvedSettings = ref<FamilyTreeSettings>(defaultTreeSettings())
const pendingSettings = ref<FamilyTreeSettings | null>(null)

const emptyForm = (): MemberForm => ({
  id: '',
  name: '',
  position: '',
  birthDate: '',
  deathDate: '',
  gender: 'other',
  fatherId: '',
  motherId: '',
  spouseId: '',
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
const hasLoadedDatabase = ref(false)
const suppressSettingsSync = ref(false)
const route = useRoute()
const router = useRouter()

const mode = computed<AppMode>(() => {
  if (route.path === '/admin') {
    return 'admin'
  }

  if (route.path === '/super-admin') {
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
    gender: member.gender,
    fatherId: member.fatherId ?? '',
    motherId: member.motherId ?? '',
    spouseId: member.spouseId ?? '',
    spouseOnRight: member.spouseOnRight ?? false,
  }

  isEditing.value = true
  editingId.value = member.id
  formError.value = ''
}

const normalizeMember = (member: FamilyMember): FamilyMember => {
  return {
    ...member,
    position: member.position ?? undefined,
    birthDate: member.birthDate ?? undefined,
    deathDate: member.deathDate ?? undefined,
    fatherId: member.fatherId ?? undefined,
    motherId: member.motherId ?? undefined,
    spouseId: member.spouseId ?? undefined,
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
}

const getTreeSettings = (): FamilyTreeSettings => ({
  showBirthDate: showBirthDate.value,
  showDeathDate: showDeathDate.value,
  showSpouse: showSpouseInfo.value,
  showViewDetail: showViewDetailAction.value,
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

  return true
}

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
    id: form.value.id.trim(),
    name: form.value.name.trim(),
    position: positionText ? Number(positionText) : undefined,
    birthDate: birthIso,
    deathDate: deathIso,
    gender: form.value.gender,
    fatherId: form.value.fatherId || undefined,
    motherId: form.value.motherId || undefined,
    spouseId: form.value.spouseId || undefined,
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

const approvePendingChanges = async (): Promise<void> => {
  if (!isSuperAdminMode.value || !pendingMembers.value || !pendingSettings.value) {
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

    await saveFamilyDatabase(nextDatabase)
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
    loadingError.value =
      error instanceof Error ? error.message : 'Không thể phê duyệt thay đổi.'
  } finally {
    isSaving.value = false
  }
}

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
    nextMode === 'admin' ? '/admin' : nextMode === 'super-admin' ? '/super-admin' : '/view'
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

watch([showBirthDate, showDeathDate, showSpouseInfo, showViewDetailAction], async (
  [nextBirthDate, nextDeathDate, nextSpouse, nextDetail],
  [previousBirthDate, previousDeathDate, previousSpouse, previousDetail],
) => {
  if (
    suppressSettingsSync.value ||
    !hasLoadedDatabase.value ||
    !isEditableMode.value ||
    (
      nextBirthDate === previousBirthDate &&
      nextDeathDate === previousDeathDate &&
      nextSpouse === previousSpouse &&
      nextDetail === previousDetail
    )
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
    },
  )
  if (!saved) {
    suppressSettingsSync.value = true
    showBirthDate.value = previousBirthDate
    showDeathDate.value = previousDeathDate
    showSpouseInfo.value = previousSpouse
    showViewDetailAction.value = previousDetail
    suppressSettingsSync.value = false
  }
})

onMounted(async () => {
  await loadMembers()
})
</script>

<template>
  <main class="app">
    <header class="app-header">
      <h1>PHẠM GIA</h1>
      <h2>范氏家谱</h2>
    </header>

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
        Đường dẫn: <code>{{ mode === 'super-admin' ? '/super-admin' : '/admin' }}</code>
      </p>
    </section>

    <section v-if="isEditableMode" class="review-panel">
      <p v-if="hasPendingChanges">
        Có bản thay đổi đang chờ duyệt
        <template v-if="pendingUpdatedLabel"> (cập nhật: {{ pendingUpdatedLabel }})</template>.
      </p>
      <p v-else>Chưa có thay đổi chờ duyệt.</p>
      <button
        v-if="isSuperAdminMode"
        type="button"
        class="approve-btn"
        :disabled="isSaving || !hasPendingChanges"
        @click="approvePendingChanges"
      >
        {{ isSaving ? 'Đang xử lý...' : 'Phê duyệt thay đổi' }}
      </button>
    </section>

    <div v-if="isEditableMode" class="admin-panels">
      <section class="editor-panel">
        <h2>{{ isEditing ? 'Chỉnh sửa thành viên' : 'Thêm thành viên' }}</h2>

        <form class="member-form" @submit.prevent="saveMember">
        <label>
          ID
          <input v-model="form.id" type="text" required :disabled="isSaving" />
        </label>

        <label>
          Tên
          <input v-model="form.name" type="text" required :disabled="isSaving" />
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
      @edit-member="startEditMember"
      @delete-member="deleteMember"
      @toggle-member-hidden="toggleMemberHidden"
    />
  </main>
</template>

<style scoped>
.app {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 2rem 2rem 3rem;
}

.app-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.app-header h1 {
  margin: 0 0 0.5rem;
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
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

.editor-panel {
  background: #ffffff;
  border: 1px solid #d7dbe6;
  border-radius: 16px;
  padding: 1rem;
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
</style>
