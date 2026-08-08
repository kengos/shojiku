<script setup lang="ts">
// The reference page's live block: the page's own demo document, rendered by
// the engine in the reader's tab.
//
// It degrades on purpose. The site serves a RELEASED engine while
// docs/engine/ documents HEAD, so a page can legitimately describe syntax the
// loaded binary cannot parse. The demo declares the capability KEYS its wire
// needs; when this engine lacks one, the block shows the document as a
// listing and says so, instead of putting a parse error under a page that
// documents the feature as correct.
import { computed, onMounted, ref } from "vue";
import { useData, withBase } from "vitepress";
import type { Diagnostic } from "../../../src/lib/engineClient.ts";
import { isJapaneseDemo, requiredCapabilities, runnableHere } from "../../../src/lib/demos.ts";
import { engine, engineCapabilityKeys, japaneseLoaded, loadJapanese, pageUrl, render } from "../engine.ts";

const props = defineProps<{ page: string }>();

const { lang } = useData();
const ja = computed(() => lang.value === "ja");
const t = computed(() =>
  ja.value
    ? { jp: "日本語フォントを読み込む (10 MB)", alt: "デモの描画結果", busy: "…", src: "この文書のソース", gated: "このページが説明する記法は、このサイトが動かしているリリース版エンジンより新しいものです。次のリリースでこのデモも動くようになります。それまではソースだけを載せます。", need: "必要な機能キー" }
    : { jp: "Load the Japanese fonts (10 MB)", alt: "The rendered demo", busy: "…", src: "This document's source", gated: "The syntax this page documents is newer than the released engine this site runs. The demo will render here from the next release; until then it is shown as source.", need: "Capability keys needed" },
);

const template = ref("");
const img = ref("");
const diagnostics = ref<Diagnostic[]>([]);
const gated = ref<string[]>([]);
const needsJp = ref(false);
const jpReady = ref(false);
const busy = ref(true);

// The staged index lists what this demo actually has, so an optional file
// (params.json, definitions.yml, expect.json) is not requested at all. Probing
// for them worked, but left three 404s in the console of every page — noise a
// reader debugging their own template would have to read past.
const present = ref<string[]>([]);

async function fetchText(f: string): Promise<string | undefined> {
  if (!present.value.includes(f)) return undefined;
  const r = await fetch(withBase(`/data/reference/${props.page}/${f}`));
  return r.ok ? await r.text() : undefined;
}

async function draw(): Promise<void> {
  busy.value = true;
  try {
    const params = (await fetchText("params.json")) ?? "{}";
    const definitions = await fetchText("definitions.yml");
    const out = await render({ template: template.value, params, definitions }, 2);
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
  await loadJapanese();
  jpReady.value = true;
  await draw();
}

onMounted(async () => {
  const index = await fetch(withBase(`/data/reference/${props.page}/index.json`));
  present.value = index.ok ? ((JSON.parse(await index.text()) as { files: string[] }).files ?? []) : [];
  template.value = (await fetchText("templates.yml")) ?? "";
  const need = requiredCapabilities(await fetchText("expect.json"));
  await engine();
  if (!runnableHere(need, await engineCapabilityKeys())) {
    gated.value = need;
    busy.value = false;
    return;
  }
  needsJp.value = isJapaneseDemo(template.value);
  jpReady.value = japaneseLoaded();
  if (needsJp.value && !jpReady.value) {
    busy.value = false;
    return;
  }
  await draw();
});
</script>

<template>
  <div class="live-block rf-demo">
    <div v-if="gated.length" class="rf-gated">
      <p>{{ t.gated }}</p>
      <p class="rf-gated-keys">{{ t.need }}: <code v-for="k in gated" :key="k">{{ k }}</code></p>
    </div>
    <div v-else-if="needsJp && !jpReady" class="live-gate">
      <button class="live-btn primary" @click="enableJp">{{ t.jp }}</button>
    </div>
    <div v-else class="live-grid">
      <div class="live-out">
        <img v-if="img" :src="img" :alt="t.alt" />
        <p v-else class="live-busy">{{ t.busy }}</p>
      </div>
    </div>
    <ul v-if="diagnostics.length" class="live-diags">
      <li v-for="(d, i) in diagnostics" :key="i"><code>{{ d.severity }}[{{ d.code }}]</code> {{ d.message }}</li>
    </ul>
    <details class="rf-src">
      <summary>{{ t.src }}</summary>
      <pre class="pg-src"><code>{{ template }}</code></pre>
    </details>
  </div>
</template>
