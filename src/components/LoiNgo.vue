<script setup lang="ts">
import { DEFAULT_LOI_NGO, type LoiNgo } from '../data/loi-ngo'
import { isHouseView } from '../view-style'

/** "Lời ngỏ": the foreword of the family record, shown above the tree. Closed by default so the tree stays near the top. */
withDefaults(defineProps<{ content?: LoiNgo }>(), { content: () => DEFAULT_LOI_NGO })
</script>

<template>
  <details class="loi-ngo" :class="{ 'loi-ngo--house': isHouseView }">
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
  /* each line of the admin's text on its own line */
  white-space: pre-line;
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

/* "Nhà 3D": a wooden notice board under a small roof */
.loi-ngo--house {
  position: relative;
  margin-top: 4.5rem;
  border: 10px solid #7a4a24;
  border-image: linear-gradient(160deg, #a06a3a, #5a3518 45%, #7a4a24 55%, #a06a3a) 1;
  border-radius: 0;
  background:
    radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255, 232, 170, 0.55), transparent 75%),
    linear-gradient(180deg, #fcf4de, #f0deb3);
  box-shadow:
    inset 0 12px 18px -10px rgba(60, 30, 8, 0.35),
    6px 7px 0 #4b2b12,
    0 16px 24px -8px rgba(40, 20, 5, 0.45);
}

.loi-ngo--house::before {
  content: '';
  position: absolute;
  left: -40px;
  right: -40px;
  bottom: calc(100% + 6px);
  height: 64px;
  background:
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 11px),
    linear-gradient(180deg, #6a3d1d, #3a200e);
  clip-path: polygon(50% 0, 100% 82%, 100% 100%, 0 100%, 0 82%);
  pointer-events: none;
}

/* a lantern glowing under the eaves */
.loi-ngo--house::after {
  content: '';
  position: absolute;
  top: -4px;
  left: 50%;
  width: 28px;
  height: 34px;
  transform: translateX(-50%);
  background:
    linear-gradient(#3a200e, #3a200e) center top / 2px 10px no-repeat,
    radial-gradient(ellipse 12px 14px at 50% 60%, #fff0b8 0, #ffc65c 45%, #e2952c 80%, transparent 84%);
  filter: drop-shadow(0 0 8px rgba(255, 190, 90, 0.7));
  pointer-events: none;
}

.loi-ngo--house summary {
  padding-top: 2.3rem;
}

.loi-ngo--house .loi-ngo-title {
  color: #5a3518;
}

.loi-ngo--house .loi-ngo-hint {
  color: #7a4a24;
}

.loi-ngo--house .loi-ngo-body {
  border-top-color: rgba(122, 74, 36, 0.4);
}

@media (max-width: 640px) {
  .loi-ngo--house {
    margin-top: 3.25rem;
    border-width: 7px;
  }

  .loi-ngo--house::before {
    left: -7px;
    right: -7px;
    height: 46px;
  }
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
