import { mkdir, writeFile } from "node:fs/promises";
import { Vector3 } from "three";
import { SkybotDiagnostic } from "../../src/shared/skybot.js";
import { makePhysCar, makeBall, RL, createSoccarBoostPads, stepBoostPads } from "../../src/shared/carPhysics.js";
import { stepCarBall } from "../../src/shared/carSim.js";

const car = makePhysCar(new Vector3(0, -4608, 17), Math.PI / 2, "octane");
car.boost = RL.BOOST_SPAWN;
const ball = makeBall(new Vector3(0, 0, RL.BALL_REST_Z));
const pads = createSoccarBoostPads();
const bot = new SkybotDiagnostic();
bot.begin(car, ball);
for (let tick = 0; tick < 1200; tick++) {
  const input = bot.controls(car, ball);
  const contact = stepCarBall(car, ball, input, tick, RL.DT);
  stepBoostPads(pads, car, RL.DT);
  bot.observe(car, ball, input, Boolean(contact));
}
await mkdir("tools/physics-compare/out/skybot", { recursive: true });
await writeFile("tools/physics-compare/out/skybot/scenarios.json", JSON.stringify(bot.recording, null, 2));
console.log(JSON.stringify({ ticks: bot.tick, firstContact: bot.lastContact, finalBallError: bot.error }, null, 2));