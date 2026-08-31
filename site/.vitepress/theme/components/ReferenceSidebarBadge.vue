<script setup lang="ts">
// The `Generated` badge, scoped to the SIDEBAR. The tree below it is derived —
// each page's front-matter crossed with the parser's own key catalog.
//
// It stays on the SIDEBAR now that the reference's tables are assembled and
// audited too, and the reason is the one this comment always gave — with the
// numbers, since that is what settles it. Of the 995 cells those tables
// render, 81 take a value from the engine, and all 81 are the Severity
// column on 4 of the 35 tables; on the 28 KEY tables it is 0 of 648. What the
// engine supplies there is the row SET, the column-count invariant (a row can
// no longer carry a cell its header drops), and the refusal when a table and
// the wire disagree — not the text. The text is authored, and deliberately:
// measured against the catalog, 124 of 129 description cells and 109 of 141
// type cells say something it does not carry (page context, cross-page links,
// constraints like `≥ 0` that the wire validates at parse time rather than in
// its schema). Badging that prose "Generated from the parser" is the exact
// claim this badge exists to prevent.
//
// What names the per-page truth instead is the provenance strip, which lists
// what each page really generates — including "the key tables" — and it
// detects them rather than keeping a second list.
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
