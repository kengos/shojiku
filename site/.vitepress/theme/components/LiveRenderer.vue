<script setup lang="ts">
// The homepage live block: edit the real example's YAML, render in-tab.
// en-US example immediately; the JP example behind the explicit font load.
import { onMounted, ref } from "vue";
import type { Diagnostic } from "../../../src/lib/engineClient.ts";
import { engine, fetchLiveDoc, japaneseLoaded, loadJapanese, pageUrl, render, renderPdfUrl, type LiveDoc } from "../engine.ts";

const template = ref("");
const doc = ref<LiveDoc | null>(null);
const img = ref("");
const diagnostics = ref<Diagnostic[]>([]);
const busy = ref("starting the engine…");
const jp = ref(false);

async function show(d: LiveDoc): Promise<void> {
  const out = await render({ ...d, template: template.value || d.template });
  diagnostics.value = out.diagnostics;
  if (out.pages[0] !== undefined) {
    if (img.value !== "") URL.revokeObjectURL(img.value);
    img.value = pageUrl(out.pages[0]);
  }
  busy.value = "";
}

async function open(name: "receipt-us" | "receipt-ja"): Promise<void> {
  busy.value = "loading the example…";
  const d = await fetchLiveDoc(name);
  doc.value = d;
  template.value = d.template;
  await show(d);
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

async function rerender(): Promise<void> {
  if (doc.value === null) return;
  busy.value = "rendering…";
  await guard(() => show(doc.value!));
}

async function toJapanese(): Promise<void> {
  busy.value = "loading Japanese fonts (9 MB)…";
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

onMounted(() =>
  guard(async () => {
    await engine();
    jp.value = japaneseLoaded();
    await open(jp.value ? "receipt-ja" : "receipt-us");
  }),
);
</script>

<template>
  <div class="live-block">
    <div class="live-grid">
      <textarea v-model="template" spellcheck="false" aria-label="templates.yml source"></textarea>
      <div class="live-out">
        <img v-if="img" :src="img" alt="The rendered page" />
        <p v-else class="live-busy">{{ busy || "…" }}</p>
      </div>
    </div>
    <div class="live-bar">
      <button class="live-btn primary" :disabled="busy !== ''" @click="rerender">Render</button>
      <button class="live-btn" :disabled="busy !== ''" @click="downloadPdf">Download PDF</button>
      <span class="live-spacer"></span>
      <button v-if="!jp" class="live-btn" :disabled="busy !== ''" @click="toJapanese">日本語フォントを読み込む (10 MB)</button>
      <span v-if="busy" class="live-note">{{ busy }}</span>
    </div>
    <ul v-if="diagnostics.length" class="live-diags">
      <li v-for="(d, i) in diagnostics" :key="i"><code>{{ d.severity }}[{{ d.code }}]</code> {{ d.message }}</li>
    </ul>
  </div>
</template>
