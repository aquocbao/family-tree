<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FamilyMember } from '../types/family'

const props = withDefaults(
  defineProps<{
    modelValue: string
    members: FamilyMember[]
    listId: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    placeholder: 'Tìm tên hoặc ID',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputText = ref('')
const isOpen = ref(false)

const formatLabel = (member: FamilyMember): string => {
  return `${member.name} (${member.id})`
}

const normalizeText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const selectedMember = computed(() => {
  if (!props.modelValue) {
    return undefined
  }

  return props.members.find((member) => member.id === props.modelValue)
})

const filteredMembers = computed(() => {
  const keyword = normalizeText(inputText.value)
  if (!keyword) {
    return props.members
  }

  return props.members.filter((member) => {
    return (
      normalizeText(member.name).includes(keyword) ||
      normalizeText(member.id).includes(keyword)
    )
  })
})

const syncInputFromModel = (): void => {
  if (!props.modelValue) {
    inputText.value = ''
    return
  }

  if (selectedMember.value) {
    inputText.value = formatLabel(selectedMember.value)
    return
  }

  inputText.value = props.modelValue
}

const selectMember = (member: FamilyMember): void => {
  emit('update:modelValue', member.id)
  inputText.value = formatLabel(member)
  isOpen.value = false
}

const commitTypedValue = (): void => {
  const text = inputText.value.trim()
  if (!text) {
    emit('update:modelValue', '')
    return
  }

  const exactByLabel = props.members.find((member) => formatLabel(member) === text)
  if (exactByLabel) {
    emit('update:modelValue', exactByLabel.id)
    inputText.value = formatLabel(exactByLabel)
    return
  }

  const exactById = props.members.find((member) => member.id === text)
  if (exactById) {
    emit('update:modelValue', exactById.id)
    inputText.value = formatLabel(exactById)
    return
  }

  const exactByName = props.members.find((member) => member.name === text)
  if (exactByName) {
    emit('update:modelValue', exactByName.id)
    inputText.value = formatLabel(exactByName)
    return
  }

  syncInputFromModel()
}

const onFocus = (): void => {
  if (props.disabled) {
    return
  }

  isOpen.value = true
}

const onInput = (): void => {
  if (props.disabled) {
    return
  }

  isOpen.value = true
}

const onBlur = (): void => {
  window.setTimeout(() => {
    commitTypedValue()
    isOpen.value = false
  }, 100)
}

watch(
  () => [props.modelValue, props.members] as const,
  () => {
    syncInputFromModel()
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <div class="searchable-select">
    <input
      v-model="inputText"
      class="searchable-input"
      type="text"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    />

    <ul v-if="isOpen" class="dropdown">
      <li
        v-for="member in filteredMembers"
        :key="member.id"
        class="option"
        @mousedown.prevent="selectMember(member)"
      >
        {{ formatLabel(member) }}
      </li>

      <li v-if="filteredMembers.length === 0" class="option disabled-option">
        Không tìm thấy kết quả
      </li>
    </ul>
  </div>
</template>

<style scoped>
.searchable-select {
  position: relative;
}

.searchable-input {
  border: 1px solid #becce8;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font: inherit;
  width: 100%;
}

.dropdown {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow: auto;
  list-style: none;
  margin: 0;
  padding: 0.3rem 0;
  border: 1px solid #becce8;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(16, 24, 40, 0.12);
}

.option {
  padding: 0.45rem 0.6rem;
  cursor: pointer;
}

.option:hover {
  background: #f2f6ff;
}

.disabled-option {
  color: #7a879f;
  cursor: default;
}

.disabled-option:hover {
  background: transparent;
}

@media (max-width: 640px) {
  .searchable-input {
    font-size: 16px; /* prevents iOS zoom on focus */
  }
}
</style>
