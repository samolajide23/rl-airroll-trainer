import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const revision = "0033a98d4e060670f334f60f7f8dc5ee21ba93bb";
const root = new URL("../../public/bots/kamael/", import.meta.url);
const files = ["Kamael.py", "impossibum_states.py", "impossibum_utilities.py", "bot_ignore_list.txt", "requirements.txt", "Kamael.cfg", "kam_appearance.cfg", "kam_logo.png"];
await mkdir(root, { recursive: true });
const manifest = { repository: "https://github.com/RLBot/RLBotPack", revision, files: {} };
for (const file of [...files, "LICENSE"]) {
  const path = file === "LICENSE" ? file : `RLBotPack/Kamael_family/${file}`;
  const response = await fetch(`https://raw.githubusercontent.com/RLBot/RLBotPack/${revision}/${path}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(file, root), bytes);
  manifest.files[file] = createHash("sha256").update(bytes).digest("hex");
}
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Vendored unchanged Kamael source at ${revision}`);