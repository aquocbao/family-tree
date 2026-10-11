<script setup lang="ts">
import { computed } from 'vue'
import type { FamilyMember } from '../types/family'

const props = withDefaults(
  defineProps<{
    member: FamilyMember
    spouseName?: string
    canManage?: boolean
    showBirthDate?: boolean
    showDeathDate?: boolean
    showSpouse?: boolean
    showViewDetail?: boolean
  }>(),
  {
    canManage: false,
    showBirthDate: true,
    showDeathDate: true,
    showSpouse: true,
    showViewDetail: true,
  },
)

defineEmits<{
  viewDetail: [id: string]
  edit: [id: string]
  delete: [id: string]
  toggleHidden: [id: string]
}>()

const genderLabel = computed(() => {
  if (props.member.gender === 'female') {
    return 'Nữ'
  }

  if (props.member.gender === 'male') {
    return 'Nam'
  }

  return 'Khác'
})

const genderClass = computed(() => {
  if (props.member.gender === 'male') {
    return 'male'
  }

  if (props.member.gender === 'female') {
    return 'female'
  }

  return 'other'
})

const isContentHidden = computed(() => Boolean(props.member.isHidden))

const canShowSpouse = computed(() => {
  const hasBothParents = Boolean(props.member.fatherId && props.member.motherId)
  return props.showSpouse && hasBothParents && Boolean(props.spouseName)
})

const formatDate = (value?: string): string => {
  if (!value) {
    return '—'
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
</script>

<template>
  <article class="person-card" :class="`person-card--${genderClass}`">
    <template v-if="isContentHidden">
      <h3>Đã ẩn thông tin</h3>
    </template>
    <template v-else>
      <h3>{{ member.name }}</h3>
      <p v-if="showBirthDate"><strong>Ngày sinh:</strong> {{ formatDate(member.birthDate) }}</p>
      <p v-if="showDeathDate"><strong>Ngày mất:</strong> {{ formatDate(member.deathDate) }}</p>
      <p><strong>Giới tính:</strong> {{ genderLabel }}</p>
      <p v-if="canShowSpouse"><strong>Vợ/Chồng:</strong> {{ spouseName }}</p>
    </template>

    <div class="actions">
      <button
        v-if="canManage"
        type="button"
        class="visibility"
        @click="$emit('toggleHidden', member.id)"
      >
        {{ isContentHidden ? 'Hiện' : 'Ẩn' }}
      </button>

      <template v-if="!isContentHidden">
        <button
          v-if="showViewDetail"
          type="button"
          class="detail"
          @click="$emit('viewDetail', member.id)"
        >
          Xem chi tiết
        </button>

        <template v-if="canManage">
          <button type="button" class="edit" @click="$emit('edit', member.id)">
            Sửa
          </button>
          <button type="button" class="delete" @click="$emit('delete', member.id)">
            Xóa
          </button>
        </template>
      </template>
    </div>
  </article>
</template>

<style scoped>
.person-card {
  background: #ffffff;
  border: 1px solid #d7dbe6;
  border-radius: 12px;
  padding: 1rem;
  width: 100%;
  max-width: 260px;
  box-shadow: 0 2px 8px rgba(24, 39, 75, 0.06);
}

.person-card--male {
  background: #f0f7ff;
  border-color: #9fc3ef;
}

.person-card--female {
  background: #fff1f7;
  border-color: #efb3cf;
}

.person-card--other {
  background: #f6f6fb;
  border-color: #d7dbe6;
}

.person-card h3 {
  margin: 0 0 0.5rem;
  color: #1b2a4a;
  overflow-wrap: anywhere;
}

.person-card p {
  margin: 0.25rem 0;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.actions button {
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  font-weight: 600;
}

.visibility {
  border: 1px solid #9ba6bd;
  background: #f3f5fb;
  color: #2a395d;
}

.visibility:hover {
  background: #e7ebf7;
}

.detail {
  border: 1px solid #6b8ad3;
  background: #eef3ff;
  color: #1f3d78;
}

.detail:hover {
  background: #dde8ff;
}

.edit {
  border: 1px solid #8ca7de;
  background: #fff;
  color: #2f4678;
}

.edit:hover {
  background: #f0f4ff;
}

.delete {
  border: 1px solid #f1a9a9;
  background: #fff7f7;
  color: #8f1d1d;
}

.delete:hover {
  background: #ffeaea;
}
</style>
