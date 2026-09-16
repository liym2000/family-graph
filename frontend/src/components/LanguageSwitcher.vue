<template>
  <div class="language-switcher" role="group" aria-label="Language / 界面语言">
    <button
      type="button"
      lang="zh-CN"
      :aria-pressed="locale === 'zh-CN'"
      @click="setLocale('zh-CN')"
    >
      中文
    </button>
    <button
      type="button"
      lang="en"
      :aria-pressed="locale === 'en'"
      @click="setLocale('en')"
    >
      EN
    </button>
  </div>
</template>
<script setup lang="ts">
import { locale, setLocale } from '../i18n';
</script>
