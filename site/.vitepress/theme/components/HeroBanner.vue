<script setup lang="ts">
// The banner above the hero. It is not decoration: the PNG is the engine's
// own output for examples/dev/site-hero (one 200mm×90mm template), so the
// first thing the page shows is the thing the page claims. Full-bleed across
// the hero column, which is also what lets the hero headline sit on one line
// — with the default right-hand hero image the text column is half as wide.
// The alt text carries what the banner contains; the visible caption stays
// one line, because the picture argues for itself.
import { useData } from "vitepress";
import { computed } from "vue";

const SOURCE = "https://github.com/kengos/shojiku/tree/main/examples/dev/site-hero/";

const { lang } = useData();
const ja = computed(() => lang.value === "ja");
const alt = computed(() =>
  ja.value
    ? "Shojikuのバナー。この画像自体が200mm×90mmのテンプレート1枚からのレンダリング出力です。左に格子のマークとロゴタイプ、その下に「Write YAML, get the same PDF anywhere. Built for AI agents.」、さらに下にSigning・7-language SDKs・GUI・MCPの4つのチップ。右は原稿用紙スタイルの縦書き二列で、「縦書きも、そのまま。」と「直排也可」。空白マスの上に朱印が押してあります。"
    : 'The Shojiku banner, itself rendered from one 200mm×90mm template. On the left, the lattice mark and the logotype, then the line "Write YAML, get the same PDF anywhere. Built for AI agents.", then four chips: Signing, 7-language SDKs, GUI, MCP. On the right, two manuscript-paper columns set vertically, with a red seal stamped over the blank cells.',
);
const caption = computed(() =>
  ja.value ? "これはShojikuでレンダリングしたものです" : "Rendered by Shojiku",
);
</script>

<template>
  <div class="sj-hero-banner">
    <img :alt="alt" src="/brand/hero.png" />
    <p class="sj-hero-banner-caption">
      <a :href="SOURCE" rel="noreferrer" target="_blank">{{ caption }}</a>
    </p>
  </div>
</template>

<style scoped>
/* Padding + max-width chosen so the CONTENT box lands on the same 1152px
   column as .VPHero .container — the banner's edges have to line up with the
   headline's, not sit inside them. */
.sj-hero-banner {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: calc(1152px + 48px);
  padding: 0 24px;
}

.sj-hero-banner img {
  border-radius: 12px;
  display: block;
  height: auto;
  width: 100%;
}

.sj-hero-banner-caption {
  color: var(--vp-c-text-3);
  font-size: 12px;
  margin: 6px 0 0;
  text-align: right;
}

.sj-hero-banner-caption a {
  color: inherit;
  text-decoration: none;
}

.sj-hero-banner-caption a:hover {
  text-decoration: underline;
}

@media (min-width: 640px) {
  .sj-hero-banner {
    max-width: calc(1152px + 96px);
    padding: 0 48px;
  }
}

@media (min-width: 960px) {
  .sj-hero-banner {
    max-width: calc(1152px + 128px);
    padding: 0 64px;
  }
}
</style>
