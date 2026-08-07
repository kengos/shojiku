<script setup lang="ts">
// The homepage live block: edit the real example's YAML, render in-tab.
// The en-US sample opens immediately; the JP one waits behind the explicit
// font load. Typing re-renders on its own after a short pause — a Render
// button made readers think the page had not understood their edit.
import { onMounted, ref, watch, computed, onBeforeUnmount } from "vue";
import { useData } from "vitepress";
import type { Diagnostic } from "../../../src/lib/engineClient.ts";
import EngineVersion from "./EngineVersion.vue";
import { engine, fetchLiveDoc, japaneseLoaded, loadJapanese, pageUrl, render, renderPdfUrl, type LiveDoc } from "../engine.ts";

/** Long enough that a burst of keystrokes renders once, short enough to feel live. */
const DEBOUNCE_MS = 400;

const { lang } = useData();
const ja = computed(() => lang.value === "ja");
const t = computed(() =>
  ja.value
    ? { reset: "元に戻す", pdf: "PDFをダウンロード", jp: "日本語フォントを読み込む (10 MB)", starting: "エンジンを起動しています…", loading: "サンプルを読み込んでいます…", rendering: "レンダリング中…", fonts: "日本語フォントを読み込んでいます (9 MB)…", alt: "レンダリング結果", source: "templates.yml のソース" }
    : { reset: "Reset", pdf: "Download PDF", jp: "Load the Japanese fonts (10 MB)", starting: "starting the engine…", loading: "loading the example…", rendering: "rendering…", fonts: "loading Japanese fonts (9 MB)…", alt: "The rendered page", source: "templates.yml source" },
);

const template = ref("");
const doc = ref<LiveDoc | null>(null);
const img = ref("");
const diagnostics = ref<Diagnostic[]>([]);
const busy = ref("");
const jp = ref(false);
const dirty = computed(() => doc.value !== null && template.value !== doc.value.template);

let timer: ReturnType<typeof setTimeout> | undefined;

async function show(d: LiveDoc): Promise<void> {
  const out = await render({ ...d, template: template.value || d.template });
  diagnostics.value = out.diagnostics;
  if (out.pages[0] !== undefined) {
    if (img.value !== "") URL.revokeObjectURL(img.value);
    img.value = pageUrl(out.pages[0]);
  }
  busy.value = "";
}

async function guard(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (e) {
    diagnostics.value = [{ severity: "error", code: "live_block_failed", message: String(e) }];
  } finally {
    busy.value = "";
  }
}

async function open(name: "live-flex" | "receipt-ja"): Promise<void> {
  busy.value = t.value.loading;
  const d = await fetchLiveDoc(name);
  doc.value = d;
  template.value = d.template;
  await show(d);
}

async function rerender(): Promise<void> {
  if (doc.value === null) return;
  busy.value = t.value.rendering;
  await guard(() => show(doc.value!));
}

/** Every edit schedules one render; a keystroke inside the window replaces it. */
watch(template, () => {
  if (doc.value === null) return;
  clearTimeout(timer);
  timer = setTimeout(() => void rerender(), DEBOUNCE_MS);
});

onBeforeUnmount(() => clearTimeout(timer));

function reset(): void {
  if (doc.value === null) return;
  template.value = doc.value.template;
}

async function toJapanese(): Promise<void> {
  busy.value = t.value.fonts;
  await guard(async () => {
    await loadJapanese();
    jp.value = true;
    await open("receipt-ja");
  });
}

async function downloadPdf(): Promise<void> {
  if (doc.value === null) return;
  const r = await renderPdfUrl({ ...doc.value, template: template.value });
  if (r === null || r.url === "") {
    diagnostics.value = r?.diagnostics ?? [];
    return;
  }
  const a = document.createElement("a");
  a.href = r.url;
  a.download = "shojiku.pdf";
  a.click();
  URL.revokeObjectURL(r.url);
}

onMounted(() => {
  busy.value = t.value.starting;
  return guard(async () => {
    await engine();
    jp.value = japaneseLoaded();
    await open(jp.value ? "receipt-ja" : "live-flex");
  });
});
</script>

<template>
  <div class="live-block">
    <div class="live-grid">
      <textarea v-model="template" spellcheck="false" :aria-label="t.source"></textarea>
      <div class="live-out">
        <img v-if="img" :src="img" :alt="t.alt" />
        <p v-else class="live-busy">{{ busy || "…" }}</p>
      </div>
    </div>
    <div class="live-bar">
      <button class="live-btn" :disabled="!dirty" @click="reset">{{ t.reset }}</button>
      <button class="live-btn primary" :disabled="busy !== ''" @click="downloadPdf">{{ t.pdf }}</button>
      <span class="live-spacer"></span>
      <button v-if="!jp" class="live-btn" :disabled="busy !== ''" @click="toJapanese">{{ t.jp }}</button>
      <span v-if="busy" class="live-note">{{ busy }}</span>
      <EngineVersion />
    </div>
    <ul v-if="diagnostics.length" class="live-diags">
      <li v-for="(d, i) in diagnostics" :key="i"><code>{{ d.severity }}[{{ d.code }}]</code> {{ d.message }}</li>
    </ul>
  </div>
</template>
