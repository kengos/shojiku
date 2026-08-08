<script setup lang="ts">
// The `Generated` badge, scoped to the SIDEBAR. The tree below it is derived
// — each page's front-matter crossed with the parser's own key catalog — and
// this is the only generated thing on a reference page: the prose and the key
// tables are hand-written, so badging them would be the exact claim the badge
// exists to prevent.
import { computed } from "vue";
import { useData, useRoute } from "vitepress";

const route = useRoute();
const { lang } = useData();
const show = computed(() => route.path.includes("/reference/"));
const text = computed(() => (lang.value === "ja" ? "パーサーから生成" : "Generated from the parser"));
</script>

<template>
  <p v-if="show" class="rf-badge">{{ text }}</p>
</template>
