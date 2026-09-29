/**
 * Browser smoke: Free Play chase camera stays glued while driving.
 * Run: node tools/chase-camera-browser.mjs
 * Requires: Vite on :5173, Playwright chromium installed.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = process.env.APP_URL || "http://localhost:5173/";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Hub → Play → Free Play (single-drill category jumps straight in).
await page.locator("#hub-play, button.hub-card, button", { hasText: "Play" }).first().click();
await page.waitForTimeout(500);
const freePlay = page.locator("button.mode-card", { hasText: "Free Play" }).first();
await freePlay.waitFor({ state: "visible", timeout: 10000 });
await freePlay.click();
await page.waitForTimeout(1200);

const shot = (name) => join(OUT, name);
await page.screenshot({ path: shot("camera-follow-freeplay-start.png") });

/** Sample chase arm error: |cam − (car − forward·dist + up·height)| in XZ. */
async function sampleArmError() {
  return page.evaluate(() => {
    const mode = globalThis.__activeMode;
    const camera = globalThis.__gameCamera;
    if (!mode?.carMesh || !camera || !mode?.chase) {
      return { ok: false, reason: "debug hooks missing" };
    }
    const car = mode.carMesh.position;
    const cam = camera.position;
    const dist = mode.chase.smoothPos.distanceTo(car);
    // Horizontal offset from car to camera projected on −smoothDir should ≈ distance.
    const dir = mode.chase.smoothDir;
    const toCamX = cam.x - car.x;
    const toCamZ = cam.z - car.z;
    // Ideal: cam = car − smoothDir·|arm| (ignore height). Arm length from settings ~2.7m.
    const along = -(toCamX * dir.x + toCamZ * dir.z);
    const lat = Math.abs(toCamX * dir.z - toCamZ * dir.x);
    const status = document.querySelector("#status")?.textContent || "";
    return {
      ok: true,
      dist,
      along,
      lat,
      car: [car.x, car.y, car.z],
      cam: [cam.x, cam.y, cam.z],
      status,
    };
  });
}

const before = await sampleArmError();
console.log("before drive", before);

// Drive forward hard for ~1.5s
await page.keyboard.down("KeyW");
await page.waitForTimeout(1500);
await page.screenshot({ path: shot("camera-follow-driving-forward.png") });
const mid = await sampleArmError();
console.log("driving forward", mid);

// Turn while holding throttle
await page.keyboard.down("KeyA");
await page.waitForTimeout(1200);
await page.screenshot({ path: shot("camera-follow-turning.png") });
const turn = await sampleArmError();
console.log("turning", turn);
await page.keyboard.up("KeyA");
await page.keyboard.up("KeyW");
await page.waitForTimeout(500);
await page.screenshot({ path: shot("camera-follow-after-drive.png") });
const after = await sampleArmError();
console.log("after drive", after);

console.log("screenshots written to", OUT);
await browser.close();

const samples = [before, mid, turn, after];
const failed = samples.filter((s) => !s.ok || s.lat > 0.35);
if (failed.length) {
  console.error("FAIL camera lateral lag", failed);
  process.exit(1);
}
// While driving straight, car should have moved and camera stayed behind (lat small).
if (mid.ok && Math.hypot(mid.car[0], mid.car[2]) < 1) {
  console.error("FAIL car did not move under W", mid);
  process.exit(1);
}
console.log("PASS browser chase follow (lateral ≤ 0.35m while driving/turning)");
