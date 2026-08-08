<script setup lang="ts">
// The playground block: typed knobs generate a small template (never a
// string patch), the engine re-renders it, and the generated YAML is one
// disclosure away — the spec and the pixels cannot diverge. The source has
// always been the whole runnable file; collapsing it lets the rendered page
// lead, and open it is still something you can save and render. Enum knobs
// are segmented buttons (a bare <select> read as a text box in review).
import { computed, onMounted, ref, watch } from "vue";
import { useData } from "vitepress";
import type { Diagnostic } from "../../../src/lib/engineClient.ts";
import {
  clampFlexKnobs,
  clampFlexWidthKnobs,
  clampFontKnobs,
  clampGridKnobs,
  clampTextKnobs,
  FLEX_KNOB_DEFAULTS,
  FLEX_WIDTH_KNOB_DEFAULTS,
  flexDemoTemplate,
  flexWidthDemoTemplate,
  FONT_KNOB_DEFAULTS,
  fontDemoTemplate,
  GRID_KNOB_DEFAULTS,
  gridDemoTemplate,
  TEXT_KNOB_DEFAULTS,
  textDemoTemplate,
} from "../../../src/lib/playground.ts";
import { engine, japaneseLoaded, loadJapanese, pageUrl, render } from "../engine.ts";

const props = defineProps<{ demo: "text" | "grid" | "flex" | "flexw" | "font" }>();

const { lang } = useData();
const srcLabel = computed(() => (lang.value === "ja" ? "この文書のソース" : "This document's source"));

const text = ref({ ...TEXT_KNOB_DEFAULTS });
const grid = ref({ ...GRID_KNOB_DEFAULTS });
const flex = ref({ ...FLEX_KNOB_DEFAULTS });
const flexw = ref({ ...FLEX_WIDTH_KNOB_DEFAULTS });
const font = ref({ ...FONT_KNOB_DEFAULTS });
const img = ref("");
const diagnostics = ref<Diagnostic[]>([]);
const busy = ref(true);
const jpReady = ref(false);

const needsJp = computed(() => props.demo === "grid" || props.demo === "font");

const template = computed(() => {
  switch (props.demo) {
    case "text":
      return textDemoTemplate(clampTextKnobs(text.value));
    case "grid":
      return gridDemoTemplate(clampGridKnobs(grid.value));
    case "flex":
      return flexDemoTemplate(clampFlexKnobs(flex.value));
    case "flexw":
      return flexWidthDemoTemplate(clampFlexWidthKnobs(flexw.value));
    default:
      return fontDemoTemplate(clampFontKnobs(font.value));
  }
});

async function rerender(): Promise<void> {
  busy.value = true;
  try {
    const out = await render({ template: template.value, params: "{}" }, 2);
    diagnostics.value = out.diagnostics;
    if (out.pages[0] !== undefined) {
      if (img.value !== "") URL.revokeObjectURL(img.value);
      img.value = pageUrl(out.pages[0]);
    }
  } catch (e) {
    diagnostics.value = [{ severity: "error", code: "live_block_failed", message: String(e) }];
  } finally {
    busy.value = false;
  }
}

async function enableJp(): Promise<void> {
  busy.value = true;
  try {
    await loadJapanese();
    jpReady.value = true;
  } catch (e) {
    diagnostics.value = [{ severity: "error", code: "live_block_failed", message: String(e) }];
    busy.value = false;
    return;
  }
  await rerender();
}

watch([text, grid, flex, flexw, font], () => void rerender(), { deep: true });

onMounted(async () => {
  await engine();
  jpReady.value = japaneseLoaded();
  if (needsJp.value && !jpReady.value) {
    busy.value = false;
    return;
  }
  await rerender();
});
</script>

<template>
  <div class="live-block">
    <div v-if="needsJp && !jpReady" class="live-gate">
      <button class="live-btn primary" @click="enableJp">日本語フォントを読み込む (10 MB)</button>
    </div>
    <div v-else class="live-grid">
      <div class="pg-side">
        <div v-if="demo === 'text'" class="pg-knobs">
          <label>textAlign</label>
          <div class="pg-seg" role="group" aria-label="textAlign">
            <button v-for="v in ['left', 'center', 'right']" :key="v" :class="{ on: text.textAlign === v }" @click="text.textAlign = v as never">{{ v }}</button>
          </div>
          <label>fontSize {{ text.fontSize }}
            <input v-model.number="text.fontSize" type="range" min="8" max="32" step="1" />
          </label>
          <label>lineHeight {{ text.lineHeight }}
            <input v-model.number="text.lineHeight" type="range" min="1" max="2.4" step="0.1" />
          </label>
          <label>letterSpacing</label>
          <div class="pg-seg" role="group" aria-label="letterSpacing">
            <button v-for="v in ['0', '0.1em', '0.25em']" :key="v" :class="{ on: text.letterSpacing === v }" @click="text.letterSpacing = v">{{ v }}</button>
          </div>
        </div>
        <div v-else-if="demo === 'flex'" class="pg-knobs">
          <label>columns {{ flex.columns }}
            <input v-model.number="flex.columns" type="range" min="1" max="4" step="1" />
          </label>
          <label>gap {{ flex.gap }}
            <input v-model.number="flex.gap" type="range" min="0" max="24" step="2" />
          </label>
        </div>
        <div v-else-if="demo === 'flexw'" class="pg-knobs">
          <label>width {{ flexw.width }}
            <input v-model.number="flexw.width" type="range" min="60" max="180" step="5" />
          </label>
        </div>
        <div v-else-if="demo === 'font'" class="pg-knobs">
          <label>fontFamily（ラテン行に適用）</label>
          <div class="pg-seg" role="group" aria-label="fontFamily">
            <button v-for="v in ['biz-udp-gothic', 'noto-sans-mono']" :key="v" :class="{ on: font.family === v }" @click="font.family = v as never">{{ v }}</button>
          </div>
          <label>fontWeight</label>
          <div class="pg-seg" role="group" aria-label="fontWeight">
            <button v-for="v in ['normal', 'bold']" :key="v" :class="{ on: font.weight === v }" @click="font.weight = v as never">{{ v }}</button>
          </div>
          <label>fontSize {{ font.fontSize }}
            <input v-model.number="font.fontSize" type="range" min="8" max="32" step="1" />
          </label>
        </div>
        <div v-else class="pg-knobs">
          <label>writingMode</label>
          <div class="pg-seg" role="group" aria-label="writingMode">
            <button v-for="v in ['vertical_rl', 'horizontal_tb']" :key="v" :class="{ on: grid.writingMode === v }" @click="grid.writingMode = v as never">{{ v }}</button>
          </div>
          <label>cellSize {{ grid.cellSize }}
            <input v-model.number="grid.cellSize" type="range" min="12" max="32" step="1" />
          </label>
        </div>
        <details class="rf-src">
          <summary>{{ srcLabel }}</summary>
          <pre class="pg-src"><code>{{ template }}</code></pre>
        </details>
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
