<script setup lang="ts">
// The gallery listing over the loaded entries (en or ja per prop).
import type { GalleryEntry } from "../../../src/lib/gallery.ts";

const props = defineProps<{ entries: GalleryEntry[]; lang: "en" | "ja" }>();

function title(e: GalleryEntry): string {
  return props.lang === "ja" ? e.titleJa : e.titleEn;
}
function blurb(e: GalleryEntry): string {
  return props.lang === "ja" ? e.blurbJa : e.blurbEn;
}
function imgs(e: GalleryEntry): string[] {
  const slug = e.dir.replace("/", "-");
  const list = e.preview2 === undefined ? [e.preview] : [e.preview, e.preview2];
  return list.map((p) => `/gallery/${slug}/${p}`);
}
function repo(e: GalleryEntry): string {
  return `https://github.com/kengos/shojiku/tree/main/examples/${e.dir}/`;
}
</script>

<template>
  <div class="gal">
    <article v-for="e in entries" :key="e.dir" class="gal-card">
      <a :href="repo(e)" class="gal-figs" :class="{ pair: imgs(e).length === 2 }">
        <img v-for="src in imgs(e)" :key="src" :src="src" :alt="title(e)" loading="lazy" />
      </a>
      <h3>{{ title(e) }}</h3>
      <p>{{ blurb(e) }}</p>
      <p class="gal-src"><a :href="repo(e)">templates.yml / definitions.yml / params.json →</a></p>
    </article>
  </div>
</template>
