// VitePress build-time data loader: /gallery and /ja/gallery render from the
// parsed examples/gallery.yml (the ONE gallery source; entries are generated,
// never transcribed).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGallery, type GalleryEntry } from "./src/lib/gallery.ts";

declare const data: GalleryEntry[];
export { data };

export default {
  watch: ["../examples/gallery.yml"],
  load(): GalleryEntry[] {
    return parseGallery(
      readFileSync(join(import.meta.dirname, "..", "examples", "gallery.yml"), "utf8"),
    );
  },
};
