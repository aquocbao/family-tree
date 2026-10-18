<script setup lang="ts">
import { DEFAULT_LOI_NGO, type LoiNgo } from '../data/loi-ngo'

/** "Lời ngỏ": the foreword of the family record, shown above the tree. Closed by default so the tree stays near the top. */
withDefaults(defineProps<{ content?: LoiNgo }>(), { content: () => DEFAULT_LOI_NGO })
</script>

<template>
  <details class="loi-ngo">
    <summary>
      <span class="loi-ngo-title">Lời ngỏ</span>
      <span v-if="content.teaser" class="loi-ngo-teaser">{{ content.teaser }}</span>
      <span class="loi-ngo-hint" aria-hidden="true"></span>
    </summary>
    <div class="loi-ngo-body">
      <p v-for="(text, index) in content.paragraphs" :key="index">{{ text }}</p>
      <p v-if="content.sign" class="loi-ngo-sign">{{ content.sign }}</p>
    </div>
  </details>
</template>

<style scoped>
.loi-ngo {
  width: min(820px, 100%);
  margin: 0 auto 1.5rem;
  background: linear-gradient(180deg, #fbf3dc 0%, #f4e6c1 100%);
  border: 1px solid #c9a24a;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 4px #fbf3dc,
    inset 0 0 0 5px rgba(201, 162, 74, 0.55),
    0 6px 16px rgba(60, 20, 8, 0.15);
  color: #3d2a17;
}

summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.9rem 1.25rem 0.8rem;
  cursor: pointer;
  list-style: none;
  text-align: center;
}

summary::-webkit-details-marker {
  display: none;
}

summary:focus-visible {
  outline: 2px solid #9b3a24;
  outline-offset: 2px;
  border-radius: 8px;
}

.loi-ngo-title {
  font-family: 'Noto Serif', Georgia, serif;
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7a1d16;
}

.loi-ngo-teaser {
  font-family: 'Noto Serif', Georgia, serif;
  font-style: italic;
  font-size: 0.95rem;
  color: #8a5a2b;
}

.loi-ngo-hint {
  font-size: 0.8rem;
  font-weight: 600;
  color: #9b3a24;
}

.loi-ngo-hint::before {
  content: 'Đọc tiếp ▾';
}

.loi-ngo[open] .loi-ngo-hint::before {
  content: 'Thu gọn ▴';
}

.loi-ngo[open] .loi-ngo-teaser {
  display: none;
}

.loi-ngo-body {
  padding: 0.25rem 2rem 1.4rem;
  border-top: 1px dashed rgba(155, 58, 36, 0.35);
  margin: 0 1.25rem;
  font-family: 'Noto Serif', Georgia, serif;
  font-size: 1rem;
  line-height: 1.75;
  text-align: justify;
}

.loi-ngo-body p {
  margin: 0.9rem 0 0;
  text-indent: 2em;
}

.loi-ngo-body .loi-ngo-sign {
  text-indent: 0;
  text-align: right;
  font-style: italic;
  font-weight: 600;
}

@media (max-width: 640px) {
  .loi-ngo-body {
    padding: 0.1rem 0.25rem 1.1rem;
    margin: 0 0.9rem;
    font-size: 0.95rem;
    line-height: 1.65;
    text-align: left;
  }

  .loi-ngo-body p {
    text-indent: 1.25em;
  }
}
</style>
