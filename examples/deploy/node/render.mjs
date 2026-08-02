// Renders the vendored template with its bundled sample data and writes the
// PDF to stdout — swap the params line for data from your app.
import { readFileSync } from "node:fs";
import { Client } from "shojiku";

const client = new Client({
  templates: "templates/",
  fontDirs: ["packs/fonts"],
  localeDirs: ["packs/locale"],
});
const params = JSON.parse(readFileSync("templates/receipt-ja/params.json", "utf8"));
const result = await client.generate("receipt-ja", params);
if (!result.success) {
  console.error(`render failed: ${result.failure.kind} | ${result.failure.message}`);
  process.exit(1);
}
process.stdout.write(result.artifact.bytes);
