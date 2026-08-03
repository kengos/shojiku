<script setup lang="ts">
// Which engine the live blocks on this page are running, as the binary itself
// reports it. The site serves a RELEASED build (site/.data/wasm, pinned to a
// release by site/.data/wasm-source.json), so this is the same version a
// visitor installs — saying so is the point: a playground ahead of the
// released package would quietly contradict the determinism claim.
import { onMounted, ref } from "vue";
import { reportedVersion } from "../engine.ts";

const version = ref("");

onMounted(async () => {
  try {
    version.value = await reportedVersion();
  } catch {
    version.value = ""; // A label never breaks the block it annotates.
  }
});
</script>

<template>
  <a
    v-if="version"
    class="engine-version"
    :href="`https://github.com/kengos/shojiku/releases/tag/v${version}`"
    target="_blank"
    rel="noreferrer"
    >engine v{{ version }}</a
  >
</template>
