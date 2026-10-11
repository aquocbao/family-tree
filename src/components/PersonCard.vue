<script setup lang="ts">
import { computed } from 'vue'
import type { FamilyMember } from '../types/family'
import { solarDateTextToLunarText } from '../utils/lunar'

const props = withDefaults(
  defineProps<{
    member: FamilyMember
    spouseName?: string
    canManage?: boolean
    showBirthDate?: boolean
    showDeathDate?: boolean
    showSpouse?: boolean
    showViewDetail?: boolean
    highlighted?: boolean
  }>(),
  {
    canManage: false,
    showBirthDate: true,
    showDeathDate: true,
    showSpouse: true,
    showViewDetail: true,
    highlighted: false,
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

const lunarDeathDate = computed(
  () => props.member.deathDateLunar?.trim() || solarDateTextToLunarText(props.member.deathDate),
)

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
  <article
    class="person-card"
    :class="[`person-card--${genderClass}`, { 'person-card--highlighted': highlighted }]"
    :data-member-id="member.id"
  >
    <template v-if="isContentHidden">
      <h3>Đã ẩn thông tin</h3>
    </template>
    <template v-else>
      <div class="avatar" :class="`avatar--${genderClass}`" role="img" :aria-label="genderLabel" :title="genderLabel">
        <img
          v-if="member.gender === 'male' || member.gender === 'female'"
          :src="member.gender === 'male' ? '/avatar/male-avatar.png' : '/avatar/female-avatar.png'"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
        <svg v-else viewBox="0 0 64 64" aria-hidden="true">
          <!-- "Khác": neutral figure (khăn xếp, áo the in brown) -->
          <g transform="translate(-6.4 -8) scale(1.2)">
            <path d="M8 64c1-11 9-17 24-18c15 1 23 7 24 18z" fill="#5b4a3a" />
            <path d="M26.5 45.5h11v3.2c-1.6 1-3.6 1.5-5.5 1.5s-3.9-.5-5.5-1.5z" fill="#f3ead6" />
            <path d="M32 50v14" stroke="#c9a24a" stroke-width="0.9" />
            <circle cx="34.6" cy="53" r="0.9" fill="#c9a24a" />
            <circle cx="34.6" cy="57.5" r="0.9" fill="#c9a24a" />
            <rect x="29" y="37" width="6" height="9" rx="2.5" fill="#e9c39e" />
            <ellipse cx="32" cy="30" rx="8.6" ry="10" fill="#f2d3b3" />
            <path d="M22.6 27.5c-.6-7.8 3.7-12.3 9.4-12.3s10 4.5 9.4 12.3c-2.8-1.3-6-2-9.4-2s-6.6.7-9.4 2z" fill="#262321" />
            <path d="M23.2 24.3c2.7-1.2 5.7-1.8 8.8-1.8s6.1.6 8.8 1.8M23.9 21.2c2.5-1 5.2-1.5 8.1-1.5s5.6.5 8.1 1.5M25.6 18.3c2-.8 4.2-1.2 6.4-1.2s4.4.4 6.4 1.2" stroke="#56504a" stroke-width="1" fill="none" />
          </g>
        </svg>
      </div>
      <h3>{{ member.name }}</h3>
      <p v-if="showBirthDate"><strong>Ngày sinh:</strong> {{ formatDate(member.birthDate) }}</p>
      <p v-if="showDeathDate && member.deathDate"><strong>Ngày mất:</strong> {{ formatDate(member.deathDate) }}</p>
      <p v-if="showDeathDate && lunarDeathDate"><strong>Ngày mất (âm lịch):</strong> {{ lunarDeathDate }}</p>
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
.person-card--highlighted {
  outline: 3px solid #e0a020;
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgba(224, 160, 32, 0.25);
  animation: person-card-pulse 1.2s ease-in-out 2;
}

@keyframes person-card-pulse {
  50% {
    box-shadow: 0 0 0 12px rgba(224, 160, 32, 0.1);
  }
}

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
  flex-wrap: wrap;
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

@media (max-width: 640px) {
  .avatar {
    width: 42px;
    height: 42px;
    margin-bottom: 0.35rem;
  }

  .person-card {
    width: 150px;
    max-width: 150px;
    padding: 0.6rem 0.65rem;
    border-radius: 10px;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .person-card h3 {
    font-size: 0.92rem;
    margin-bottom: 0.3rem;
  }

  .person-card p {
    margin: 0.15rem 0;
  }

  .actions {
    gap: 0.3rem;
    margin-top: 0.5rem;
  }

  .actions button {
    padding: 0.3rem 0.45rem;
    font-size: 0.72rem;
    border-radius: 6px;
  }
}

/* Person avatar at the top of each card */
.avatar {
  width: 58px;
  height: 58px;
  margin: 0 auto 0.5rem;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #c9a24a;
  box-shadow: 0 0 0 3px #fffaf0, 0 2px 6px rgba(60, 25, 8, 0.2);
}

.avatar svg,
.avatar img {
  display: block;
  width: 100%;
  height: 100%;
}

.avatar img {
  object-fit: cover;
}

.avatar--male {
  background: #dbe4ef;
}

.avatar--female {
  background: #f6dfe2;
}

.avatar--other {
  background: #ece6da;
}

.person-card h3 {
  text-align: center;
}
</style>
