<script setup lang="ts">
// The provenance strip: what this page IS. A reference page is a projection
// of a repository file, so the page says which file, says which parts of it
// were generated rather than written, and offers both the human route (view
// the source) and the agent route (copy the raw markdown).
import { computed, ref } from "vue";
import { useData, withBase } from "vitepress";

// `parts` is what is GENERATED on THIS page, passed by the projection rather
// than assumed: the landing has no sidebar and no demo, so a fixed sentence
// there would have claimed two things the reader cannot see.
const props = defineProps<{ source: string; parts: string }>();

const REPO = "https://github.com/kengos/shojiku";
const { lang } = useData();
const ja = computed(() => lang.value === "ja");

const t = computed(() =>
  ja.value
    ? { renders: "このページの本文は", generated: "生成されているのは", view: "ソースを見る", copy: "AI用にコピー", copied: "コピーしました", failed: "コピーできませんでした" }
    : { renders: "This page renders", generated: "Generated here:", view: "View source", copy: "Copy for AI", copied: "Copied", failed: "Copy failed" },
);

// Same-origin on purpose: the site CSP is `connect-src 'self'`, so a fetch
// of the GitHub raw URL is blocked and the button would fail every time.
// `blob` is only ever an href — a navigation, not a fetch.
const raw = computed(() => withBase(`/data/reference/${props.source.replace(/^docs\/engine\//, "").replace(/\.md$/, "")}.md`));
const blob = computed(() => `${REPO}/blob/main/${props.source}`);
const state = ref<"idle" | "copied" | "failed">("idle");

async function copy(): Promise<void> {
  try {
    const text = await (await fetch(raw.value)).text();
    await navigator.clipboard.writeText(text);
    state.value = "copied";
  } catch {
    state.value = "failed";
  }
  setTimeout(() => (state.value = "idle"), 2000);
}
</script>

<template>
  <div class="rf-prov">
    <p class="rf-prov-line">
      <span>{{ t.renders }} <a :href="blob" target="_blank" rel="noreferrer"><code>{{ source }}</code></a>.</span>
      <span class="rf-prov-gen">{{ t.generated }} {{ parts }}</span>
    </p>
    <p class="rf-prov-acts">
      <a class="rf-prov-btn" :href="blob" target="_blank" rel="noreferrer">{{ t.view }}</a>
      <button class="rf-prov-btn" type="button" @click="copy">
        {{ state === "copied" ? t.copied : state === "failed" ? t.failed : t.copy }}
      </button>
    </p>
  </div>
</template>
