<script setup lang="ts">
// The playground block: typed knobs generate a small template (never a
// string patch), the engine re-renders it, and the generated YAML is shown
// beside the page — the spec and the pixels cannot diverge.
import { computed, onMounted, ref, watch } from "vue";
import type { Diagnostic } from "../../../src/lib/engineClient.ts";
import {
  clampGridKnobs,
  clampTextKnobs,
  GRID_KNOB_DEFAULTS,
  gridDemoTemplate,
  TEXT_KNOB_DEFAULTS,
  textDemoTemplate,
} from "../../../src/lib/playground.ts";
import { engine, japaneseLoaded, loadJapanese, pageUrl, render } from "../engine.ts";

const props = defineProps<{ demo: "text" | "grid" }>();

const text = ref({ ...TEXT_KNOB_DEFAULTS });
const grid = ref({ ...GRID_KNOB_DEFAULTS });
const img = ref("");
const diagnostics = ref<Diagnostic[]>([]);
const busy = ref(true);
const jpReady = ref(false);

const template = computed(() =>
  props.demo === "text" ? textDemoTemplate(clampTextKnobs(text.value)) : gridDemoTemplate(clampGridKnobs(grid.value)),
);

async function rerender(): Promise<void> {
  busy.value = true;
  const out = await render({ template: template.value, params: "{}" }, 2);
  diagnostics.value = out.diagnostics;
  if (out.pages[0] !== undefined) {
    if (img.value !== "") URL.revokeObjectURL(img.value);
    img.value = pageUrl(out.pages[0]);
  }
  busy.value = false;
}

async function enableJp(): Promise<void> {
  busy.value = true;
  await loadJapanese();
  jpReady.value = true;
  await rerender();
}

watch([text, grid], () => void rerender(), { deep: true });

onMounted(async () => {
  await engine();
  jpReady.value = japaneseLoaded();
  if (props.demo === "grid" && !jpReady.value) {
    busy.value = false;
    return;
  }
  await rerender();
});
</script>

<template>
  <div class="live-block">
    <div v-if="demo === 'grid' && !jpReady" class="live-gate">
      <button class="live-btn primary" @click="enableJp">日本語フォントを読み込む (9 MB)</button>
    </div>
    <div v-else class="live-grid">
      <div class="pg-side">
        <div v-if="demo === 'text'" class="pg-knobs">
          <label>textAlign
            <select v-model="text.textAlign">
              <option>left</option><option>center</option><option>right</option>
            </select>
          </label>
          <label>fontSize {{ text.fontSize }}
            <input v-model.number="text.fontSize" type="range" min="8" max="32" step="1" />
          </label>
          <label>lineHeight {{ text.lineHeight }}
            <input v-model.number="text.lineHeight" type="range" min="1" max="2.4" step="0.1" />
          </label>
          <label>letterSpacing
            <select v-model="text.letterSpacing">
              <option value="0">0</option><option value="0.1em">0.1em</option><option value="0.25em">0.25em</option>
            </select>
          </label>
        </div>
        <div v-else class="pg-knobs">
          <label>writingMode
            <select v-model="grid.writingMode">
              <option>vertical_rl</option><option>horizontal_tb</option>
            </select>
          </label>
          <label>cellSize {{ grid.cellSize }}
            <input v-model.number="grid.cellSize" type="range" min="12" max="32" step="1" />
          </label>
        </div>
        <pre class="pg-src"><code>{{ template }}</code></pre>
      </div>
      <div class="live-out">
        <img v-if="img" :src="img" alt="The rendered demo page" />
        <p v-else class="live-busy">…</p>
      </div>
    </div>
    <ul v-if="diagnostics.length" class="live-diags">
      <li v-for="(d, i) in diagnostics" :key="i"><code>{{ d.severity }}[{{ d.code }}]</code> {{ d.message }}</li>
    </ul>
  </div>
</template>
