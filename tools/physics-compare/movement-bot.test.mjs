import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildMovementScenarios, buildAuditScenarios } from "./movement-bot.mjs";
import { auditLeaves, auditState, auditSetup, requestedRotation, validateAuditScenarios, stateSchema } from "./audit-state.mjs";
import { makePhysCar, stepCar } from "../../src/shared/carPhysics.js";
import { stepCarBall } from "../../src/shared/carSim.js";
import { makeBall, stepBall, synchronizeBallBulletState } from "../../src/shared/rl-physics.js";
import { sphereArenaContacts } from "../../src/shared/arenaMesh.js";
import { SOCCAR_QUERY_ORDER, SOCCAR_TRI_COUNT } from "../../src/shared/soccarMeshData.js";

test("RocketSim ball freefall and drag retain Bullet float32 integration for 120 ticks", () => {
  for (const sample of [
    { vel: [0, 0, 0.001], spin: [0, 0, 0], pos: [0, 0, 675.567626953125], finalVel: [0, 0, -640.2808837890625] },
    { vel: [1000, -500, 200], spin: [1, 2, 3], pos: [984.7988891601562, -492.3994445800781, 872.5262451171875], finalVel: [970, -485, -446.2813720703125] },
  ]) {
    const ball = makeBall();
    ball.pos.set(0, 0, 1000);
    ball.vel.set(...sample.vel);
    ball.omega.set(...sample.spin);
    ball.physicsProfile = "rocketsim";
    synchronizeBallBulletState(ball);
    for (let tick = 0; tick < 120; tick++) stepBall(ball, undefined, { arena: false });
    assert.deepEqual(ball.pos.toArray(), sample.pos);
    assert.deepEqual(ball.vel.toArray(), sample.finalVel);
  }
});

test("RocketSim ceiling recording preserves impact timing and full ball vectors", () => {
  const checkpoints = new Map([
    [0, { pos: [0, 0, 1850], vel: [0, 0, 1500] }],
    [9, { pos: [0, 0, 1960.3271484375], vel: [0, 0, 1447.8765869140625] }],
    [10, { pos: [0, 0, 1950.227783203125], vel: [0, 0, -868.5055541992188] }],
    [11, { pos: [0, 0, 1942.94677734375], vel: [0, 0, -873.7018432617188] }],
    [90, { pos: [0, 0, 1231.8583984375], vel: [0, 0, -1280.0662841796875] }],
  ]);
  const ball = makeBall();
  ball.pos.set(0, 0, 1850);
  ball.vel.set(0, 0, 1500);
  ball.omega.set(0, 0, 0);
  ball.physicsProfile = "rocketsim";
  synchronizeBallBulletState(ball);
  let impactTick;
  for (let tick = 0; tick <= 90; tick++) {
    if (tick > 0) stepBall(ball);
    if (ball.vel.z < 0 && impactTick === undefined) impactTick = tick;
    assert.deepEqual(ball.omega.toArray(), [0, 0, 0], `spin at tick ${tick}`);
    const expected = checkpoints.get(tick);
    if (!expected) continue;
    for (const [field, limit] of [["pos", 0.0002], ["vel", 0.0005]]) {
      ball[field].toArray().forEach((value, axis) => {
        assert.ok(Math.abs(value - expected[field][axis]) <= limit,
          `${field}[${axis}] at tick ${tick}: ${value} vs ${expected[field][axis]}`);
      });
    }
  }
  assert.equal(impactTick, 10);
});

test("RocketSim wall bounce preserves immutable impact and post-impact vectors", () => {
  const checkpoints = new Map([
    [9, { pos: [4012.357421875, 14.980978965759277, 997.9700317382812], vel: [1496.5770263671875, 199.5436248779297, -48.70054244995117], omega: [0, 0, 0] }],
    [10, { pos: [3998.790283203125, 16.168437957763672, 997.64794921875], vel: [-897.718505859375, 142.49505615234375, -38.64634704589844], omega: [0, -0.4235199987888336, -1.5615838766098022] }],
    [88, { pos: [3421.085693359375, 107.86770629882812, 834.6070556640625], vel: [-880.1194458007812, 139.7015838623047, -456.28662109375], omega: [0, -0.4235199987888336, -1.5615838766098022] }],
    [120, { pos: [3187.3671875, 144.9658660888672, 689.6679077148438], vel: [-872.9995727539062, 138.57147216796875, -625.2489013671875], omega: [0, -0.4235199987888336, -1.5615838766098022] }],
  ]);
  const ball = makeBall();
  ball.pos.set(3900, 0, 1000);
  ball.vel.set(1500, 200, 0);
  ball.omega.set(0, 0, 0);
  ball.physicsProfile = "rocketsim";
  synchronizeBallBulletState(ball);
  let impactTick;
  for (let tick = 1; tick <= 120; tick++) {
    stepBall(ball);
    if (ball.vel.x < 0 && impactTick === undefined) impactTick = tick;
    const expected = checkpoints.get(tick);
    if (!expected) continue;
    for (const [field, limit] of [["pos", 0.0002], ["vel", 0.0005], ["omega", 0.00001]]) {
      ball[field].toArray().forEach((value, axis) => {
        assert.ok(Math.abs(value - expected[field][axis]) <= limit,
          `${field}[${axis}] at tick ${tick}: ${value} vs ${expected[field][axis]}`);
      });
    }
  }
  assert.equal(impactTick, 10);
});

test("RocketSim goal rebound retains native mesh manifolds and immutable trajectory", () => {
  assert.equal(SOCCAR_QUERY_ORDER.length, SOCCAR_TRI_COUNT);
  assert.equal(new Set(SOCCAR_QUERY_ORDER).size, SOCCAR_TRI_COUNT);
  assert(SOCCAR_QUERY_ORDER.every(triangle => triangle < SOCCAR_TRI_COUNT));
  const checkpoints = new Map([
    [85, { pos: [0, 5850.98583984375, 136.18359375], vel: [0, 1467.9803466796875, -455.5429992675781], omega: [0, 0, 0] }],
    [86, { pos: [2.0278540673913936e-13, 5849.3798828125, 146.01998901367188], vel: [2.433424815817542e-11, -25.780105590820312, 978.148193359375], omega: [-6, 4.7262619030019257e-14, 1.505129029223673e-13] }],
    [87, { pos: [4.0551931387508566e-13, 5849.16552734375, 154.12400817871094], vel: [2.4328070807877467e-11, -25.773563385009766, 972.4832763671875], omega: [-6, 4.7262619030019257e-14, 1.505129029223673e-13] }],
    [90, { pos: [1.0134124442395809e-12, 5848.52099609375, 178.15296936035156], vel: [2.4309552634771414e-11, -25.753944396972656, 955.4970703125], omega: [-6, 4.7262619030019257e-14, 1.505129029223673e-13] }],
  ]);
  const ball = makeBall();
  ball.pos.set(0, 4800, 300);
  ball.vel.set(0, 1500, 0);
  ball.omega.set(0, 0, 0);
  ball.physicsProfile = "rocketsim";
  synchronizeBallBulletState(ball);
  let impactTick;
  for (let tick = 0; tick <= 90; tick++) {
    if (tick) stepBall(ball);
    if (ball.vel.y < 0 && impactTick === undefined) impactTick = tick;
    if (tick === 85) {
      const contacts = sphereArenaContacts(ball.pos, 91.25, 1.905, {
        merge: false, manifold: true, bulletPosition: synchronizeBallBulletState(ball).pos,
      });
      assert.deepEqual(contacts.map(contact => contact.triangle), [4866, 4857, 4863, 4861, 5375, 5371, 5366, 5372]);
      assert.deepEqual(contacts[3].normal.toArray(), [0, -0.6365097165107727, 0.7712687253952026]);
      assert.deepEqual(contacts[3].nativeRel.toArray(), [0, 1.1616287231445312, -1.4075652360916138]);
      assert.equal(contacts[3].nativeDistance, -0.05462289974093437);
    }
    const expected = checkpoints.get(tick);
    if (!expected) continue;
    for (const [field, limit] of [["pos", 0.0002], ["vel", 0.0005], ["omega", 0.00001]])
      ball[field].toArray().forEach((value, axis) => assert.ok(Math.abs(value - expected[field][axis]) <= limit,
        `${field}[${axis}] at tick ${tick}: ${value} vs ${expected[field][axis]}`));
  }
  assert.equal(impactTick, 86);
});

test("coupled ticks select the car physics profile for independent ball flight", () => {
  const car = makePhysCar();
  car.physicsProfile = "rocketsim";
  car.arenaCollisions = false;
  car.pos.set(5000, 0, 1000);
  const ball = makeBall();
  ball.pos.set(0, 0, 1000);
  ball.vel.set(0, 0, 0.001);
  for (let tick = 0; tick < 120; tick++) stepCarBall(car, ball, {}, tick);
  assert.equal(ball.physicsProfile, "rocketsim");
  assert.deepEqual(ball.pos.toArray(), [0, 0, 675.567626953125]);
  assert.deepEqual(ball.vel.toArray(), [0, 0, -640.2808837890625]);
  car.physicsProfile = "native";
  stepCarBall(car, ball, {}, 120);
  assert.equal(ball.physicsProfile, "native");
});

test("coupled no-contact ticks preserve standalone RocketSim world trajectories", () => {
  for (const scenario of [
    { pos: [3900, 0, 1000], vel: [1500, 200, 0], ticks: 120 },
    { pos: [0, 4800, 300], vel: [0, 1500, 0], ticks: 90 },
    { pos: [0, 0, 200], vel: [200, 0, -300], ticks: 240 },
  ]) {
    const car = makePhysCar();
    car.physicsProfile = "rocketsim";
    car.pos.set(0, -3500, 1000);
    const independent = makeBall(), coupled = makeBall();
    for (const ball of [independent, coupled]) {
      ball.physicsProfile = "rocketsim";
      ball.pos.set(...scenario.pos);
      ball.vel.set(...scenario.vel);
      synchronizeBallBulletState(ball);
    }
    for (let tick = 0; tick < scenario.ticks; tick++) {
      stepBall(independent);
      assert.equal(stepCarBall(car, coupled, {}, tick), null);
      for (const field of ["pos", "vel", "omega"])
        assert.deepEqual(coupled[field].toArray(), independent[field].toArray(), `${field} at tick ${tick + 1}`);
    }
  }
});

test("airborne nose contact preserves native lateral velocity and spin without reseeding", () => {
  const car = makePhysCar(undefined, 0);
  car.physicsProfile = "rocketsim";
  car.arenaCollisions = false;
  car.pos.set(0, 0, 1000);
  car.boost = 100;
  assert.deepEqual(car.q.toArray(), [0, 0, 0, 1]);
  car.vel.set(1000, 0, 0);
  const ball = makeBall();
  ball.pos.set(260, 0, 1020.755);
  ball.vel.set(0, 0, 0.001);
  const checkpoints = new Map([
    [0, { car: [[0, 0, 1000], [1000, 0, 0], [0, 0, 0]], ball: [[260, 0, 1020.7550048828125], [0, 0, 0.0010000000474974513], [0, 0, 0]] }],
    [12, { car: [[99.99998474121094, 0, 996.4791259765625], [1000, 0, -65], [0, 0, 0]], ball: [[260, 0, 1017.2376708984375], [0, 0, -64.9083480834961], [0, 0, 0]] }],
    [13, { car: [[106.60720825195312, -0.0000033055691801564535, 995.8416748046875], [862.499267578125, -0.0003961787442676723, -76.49229431152344], [0.000010997562640113756, -1.8062107563018799, -0.00001606222940608859]], ball: [[270.35662841796875, 0.00001983342008315958, 1016.95556640625], [1445.7142333984375, 0.0023770732805132866, 9.508267402648926], [-7.021060177692107e-9, 0.9987329244613647, -0.00006496637070085853]] }],
    [60, { car: [[444.2819519042969, -0.00015845081361476332, 914.9633178710938], [862.499267578125, -0.0003961787442676723, -331.07537841796875], [0.000002326977664779406, -0.5775234699249268, -0.000007863722203182988]], ball: [[833.983642578125, 0.0009450563811697066, 969.9507446289062], [1428.569091796875, 0.0023488833103328943, -243.7073211669922], [-7.021060177692107e-9, 0.9987329244613647, -0.00006496637070085853]] }],
  ]);
  let firstContact;
  for (let tick = 0; tick <= 60; tick++) {
    if (tick > 0 && stepCarBall(car, ball, {}, tick - 1) && firstContact === undefined) firstContact = tick;
    const expected = checkpoints.get(tick);
    if (!expected) continue;
    for (const [name, body] of [["car", car], ["ball", ball]]) {
      ["pos", "vel", "omega"].forEach((field, index) => {
        const error = Math.hypot(...body[field].toArray().map((value, axis) => value - expected[name][index][axis]));
        assert(error <= [0.0002, 0.0005, 0.00001][index], `${name}.${field} at tick ${tick}: ${error}`);
      });
    }
  }
  assert.equal(firstContact, 13);
});

test("coupled floor rebound preserves immutable steering trajectory without reseeding", async () => {
  const sources = await Promise.all(["scenarios.json", "ball-scenarios.json", "contact-scenarios.json"].map(async name => JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"))));
  const source = buildAuditScenarios(...sources);
  source.scenarios = source.scenarios.filter(scenario => scenario.id === "movement_ground_steer_right_1s");
  assert.equal(source.scenarios.length, 1);
  assert.deepEqual(source.scenarios[0].ball, { pos: [0, 0, 92.75], vel: [0, 0, 0], ang_vel: [0, 0, 0] });
  const checkpoints = new Map([
    [0, { pos: [0, 0, 92.74999237060547], vel: [0, 0, 0], ang_vel: [0, 0, 0] }],
    [173, { pos: [4.89057731628418, 5.671706162502232e-7, 93.02308654785156], vel: [-0.9238499402999878, 3.7356980442382337e-7, -185.88626098632812], ang_vel: [-4.167302947166718e-9, -0.010309860110282898, 1.286994399940511e-9] }],
    [174, { pos: [4.882880687713623, 5.702991074940655e-7, 93.95227813720703], vel: [-0.9236153960227966, 3.754153397039772e-7, 111.50344848632812], ang_vel: [-4.1141419160339865e-9, -0.010309860110282898, 1.286994399940511e-9] }],
    [240, { pos: [4.381071090698242, 7.747534027657821e-7, 93.37899780273438], vel: [-0.8992586135864258, 3.6784732060368697e-7, -63.674652099609375], ang_vel: [-4.150834786997848e-9, -0.010558290407061577, 1.286994399940511e-9] }],
  ]);
  const output = await mkdtemp(path.join(tmpdir(), "airlab-coupled-floor-"));
  try {
    const manifest = path.join(output, "scenarios.json");
    await writeFile(manifest, JSON.stringify(source));
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./run_js.mjs", import.meta.url)), "--scenarios", manifest, "--out", output,
    ]);
    const replay = JSON.parse(await readFile(path.join(output, "movement_ground_steer_right_1s.json"), "utf8"));
    assert.equal(replay.frames.length, 241);
    for (const [tick, expected] of checkpoints) {
      const actual = replay.frames[tick].ball;
      for (const [field, limit] of [["pos", 0.0002], ["vel", 0.0005], ["ang_vel", 0.00001]])
        actual[field].forEach((value, axis) => assert.ok(Math.abs(value - expected[field][axis]) <= limit,
          `${field}[${axis}] at tick ${tick}: ${value} vs ${expected[field][axis]}`));
    }
    assert(replay.frames[173].ball.vel[2] < 0);
    assert(replay.frames[174].ball.vel[2] > 0);
    const carCheckpoints = new Map([
      [178, [[1039.7073974609375, 208.75048828125, 17.031953811645508], [661.3579711914062, 915.73193359375, 0.00045672059059143066], [-0.00003929977538064122, -0.000014704419299960136, 2.3824386596679688]]],
      [240, [[1038.930908203125, 770.3524169921875, 17.031972885131836], [-665.5013427734375, 974.1495361328125, 0.00006183981895446777], [-0.000003922032192349434, -0.000005942070856690407, 2.3712241649627686]]],
    ]);
    for (const [tick, expected] of carCheckpoints) {
      ["pos", "vel", "ang_vel"].forEach((field, index) => {
        const error = Math.hypot(...replay.frames[tick][field].map((value, axis) => value - expected[index][axis]));
        assert(error <= [0.0002, 0.0005, 0.00001][index], `car.${field} at tick ${tick}: ${error}`);
      });
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("goal-roof wheel normals preserve continuous native checkpoints through tick 122", async () => {
  const sources = await Promise.all(["scenarios.json", "ball-scenarios.json", "contact-scenarios.json"].map(async name => JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"))));
  const source = buildAuditScenarios(...sources);
  source.scenarios = source.scenarios.filter(scenario => scenario.id === "movement_movement_bot_goal_roof");
  assert.equal(source.scenarios.length, 1);
  const scenario = source.scenarios[0];
  assert.deepEqual(scenario.initial, {
    pos: [0, 5500, 610], vel: [0, 300, 0], ang_vel: [0, 0, 0],
    yaw: 0, pitch: 0, roll: 0, boost: 100, on_ground: false,
  });
  assert.deepEqual(scenario.ball, { pos: [0, 0, 92.75], vel: [0, 0, 0], ang_vel: [0, 0, 0] });
  assert.equal(scenario.preparation, "legacy");
  assert.equal(scenario.settle_ticks, 0);
  assert.deepEqual(scenario.control_schedule, [
    { until_tick: 240, controls: { throttle: 1, steer: 0.3 } },
    { until_tick: 360, controls: { throttle: -1, steer: -0.3 } },
  ]);
  const checkpoints = new Map([
    [0, [[0, 5500, 610], [0, 300, 0], [0, 0, 0]]],
    [1, [[0.004629599396139383, 5502.34130859375, 610.0399169921875], [0.5555518865585327, 280.98138427734375, 4.78894567489624], [-0.5308825969696045, 0.17821012437343597, -0.062442317605018616]]],
    [32, [[23.84861183166504, 5549.8037109375, 591.6730346679688], [252.18716430664062, 87.90303039550781, -34.29643249511719], [-0.12105245888233185, 0.05826590210199356, 0.24741756916046143]]],
    [64, [[137.4456787109375, 5567.9619140625, 586.2538452148438], [569.7587280273438, 102.11902618408203, -32.553810119628906], [0.002737656468525529, 0.2012891173362732, 0.6268882751464844]]],
    [96, [[320.24114990234375, 5617.01171875, 570.5731201171875], [776.81591796875, 273.5215148925781, -87.46083068847656], [-0.0000718494993634522, 0.2232353836297989, 0.6978321075439453]]],
    [122, [[499.91387939453125, 5696.2578125, 545.2332763671875], [867.0465698242188, 454.6567077636719, -145.3819580078125], [-0.00004950509173795581, 0.217311292886734, 0.6795094609260559]]],
  ]);
  const output = await mkdtemp(path.join(tmpdir(), "airlab-goal-roof-"));
  try {
    const manifest = path.join(output, "scenarios.json");
    await writeFile(manifest, JSON.stringify(source));
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./run_js.mjs", import.meta.url)), "--scenarios", manifest, "--out", output,
    ]);
    const replay = JSON.parse(await readFile(path.join(output, `${scenario.id}.json`), "utf8"));
    assert.equal(replay.frames.length, 361);
    for (const [tick, expected] of checkpoints) {
      const actual = replay.frames[tick];
      ["pos", "vel", "ang_vel"].forEach((field, index) => {
        const error = Math.hypot(...actual[field].map((value, axis) => value - expected[index][axis]));
        assert(error <= [0.0002, 0.0005, 0.00001][index], `${field} at tick ${tick}: ${error}`);
      });
      assert.equal(actual.boost, 100);
      assert.equal(actual.on_ground, tick !== 1);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("audit checks every mapped state leaf and reports unavailable state", () => {
  const limits = { pos_max: 0.01, vel_max: 0.01, omega_max: 0.001, fwd_max_deg: 0.001, boost_max: 0.001, air_time_max: 0.001 };
  for (const [kind, entity] of [["car", makePhysCar()], ["ball", makeBall()], ["setup", makePhysCar()]]) {
    const state = kind === "setup" ? auditSetup(entity, "raw", 0) : auditState(entity, kind);
    if (kind !== "setup") assert.deepEqual(Object.keys(state), Object.keys(stateSchema[kind]));
    const leaves = auditLeaves(state, structuredClone(state), limits, kind);
    assert.throws(() => auditLeaves(state, state, {}), /limit/);
    const missing = auditLeaves({ outer: { first: 1, second: true } }, { outer: null }, limits);
    assert.deepEqual(missing.map(leaf => leaf.field), ["outer.first", "outer.second"]);
    assert(missing.every(leaf => leaf.status === "unavailable"));
    assert(leaves.some(leaf => leaf.status === "unavailable"));
    for (const leaf of leaves.filter(entry => entry.status === "checked")) {
      const candidate = structuredClone(state);
      const parts = leaf.field.split(".").slice(1);
      const key = parts.pop();
      const parent = parts.reduce((value, part) => value[part], candidate);
      parent[key] = typeof parent[key] === "boolean" ? !parent[key] : parent[key] + 1;
      const changed = auditLeaves(state, candidate, limits, kind).find(entry => entry.field === leaf.field);
      assert.equal(changed.status, "mismatch", leaf.field);
    }
  }
});

test("wheel configuration audit reports solver inputs rather than source presets", () => {
  const car = makePhysCar();
  car.hitbox.wheels.front.offset[1] = 900;
  car.hitbox.wheels.front.suspensionRest = 900;
  const setup = auditSetup(car, "raw", 0);
  assert.deepEqual(setup.car_config.front_wheels, {
    connection_point_offset: [51.25, 25.899999618530273, 20.7549991607666],
    suspension_rest_length: 38.755001068115234, wheel_radius: 12.5,
  });
  assert.equal(setup.car_config.back_wheels.suspension_rest_length, 37.05500030517578);
  car.wheels[0].connection.y = 32;
  assert.equal(auditSetup(car, "raw", 0).car_config.front_wheels.connection_point_offset[1], 32);
});

test("applied-control audit records sanitized inputs independently of the caller", () => {
  const car = makePhysCar();
  car.arenaCollisions = false;
  const controls = { throttle: 2, pitch: 0.5, powerslide: true };
  stepCar(car, controls);
  controls.pitch = -1;
  assert.deepEqual(auditState(car, "car").last_controls, {
    throttle: 1, steer: 0, pitch: 0.5, yaw: 0, roll: 0, boost: false, jump: false, handbrake: true,
  });
});

test("audited curriculum has explicit ball and rejects ignored inputs", async () => {
  const sources = await Promise.all(["scenarios.json", "ball-scenarios.json", "contact-scenarios.json"].map(async name => JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"))));
  const source = buildAuditScenarios(...sources);
  assert.equal(source.scenarios.length, sources.reduce((total, entry) => total + entry.scenarios.length, 12));
  assert(source.scenarios.every(scenario => scenario.entity === "ball" || scenario.ball));
  for (const mutate of [
    value => { value.scenarios = []; },
    value => { value.scenarios = {}; },
    value => { value.scenarios[0].initial.typo = 1; },
    value => { value.scenarios[0].controls = { boost: 1 }; },
    value => { value.scenarios[0].ball.vel = [0, NaN, 0]; },
    value => { value.scenarios[0].controls = { steer: 2 }; },
    value => { value.defaults.tick_rate = 60; },
    value => { delete value.scenarios[0].ball; },
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid);
    assert.throws(() => validateAuditScenarios(invalid));
  }
});

test("requested spawn rotation independently checks yaw, pitch and roll signs", () => {
  const limits = { pos_max: 0.0002, vel_max: 0.0005, omega_max: 0.00001, fwd_max_deg: 0.00005, boost_max: 0.00001, air_time_max: 0.00003 };
  const identity = { forward: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] };
  for (const [angles, expected] of [
    [{ yaw: 0, pitch: 0, roll: 0 }, identity],
    [{ yaw: Math.PI / 2, pitch: 0, roll: 0 }, { forward: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, 1] }],
    [{ yaw: 0, pitch: Math.PI / 2, roll: 0 }, { forward: [0, 0, 1], right: [0, 1, 0], up: [-1, 0, 0] }],
    [{ yaw: 0, pitch: 0, roll: Math.PI / 2 }, { forward: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] }],
  ]) {
    const actual = requestedRotation(angles);
    assert(auditLeaves(expected, actual, limits, "spawn.rot_mat").every(leaf => leaf.status === "checked"));
    if (expected !== identity) assert(auditLeaves(actual, identity, limits, "spawn.rot_mat").some(leaf => leaf.status === "mismatch"));
  }
});

test("airborne replay matches native cold-state ground flag before first contact update", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "airlab-replay-"));
  try {
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./run_js.mjs", import.meta.url)),
      "--scenarios", fileURLToPath(new URL("./scenarios.json", import.meta.url)),
      "--only", "freefall_1s", "--only", "plank_jump", "--out", output,
    ]);
    const replay = JSON.parse(await readFile(path.join(output, "freefall_1s.json"), "utf8"));
    assert.equal(replay.frames[0].on_ground, true);
    assert.equal(replay.frames[0].air_time, 0);
    assert(replay.frames.slice(1).every(frame => frame.on_ground === false));
    const jump = JSON.parse(await readFile(path.join(output, "plank_jump.json"), "utf8"));
    const nativeEndpoint = [-998.1614990234375, 0, 227.46133422851562];
    assert(Math.hypot(...jump.frames.at(-1).pos.map((value, index) => value - nativeEndpoint[index])) <= 0.002);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("audited jump history starts and advances at native float32 precision", async () => {
  const sources = await Promise.all(["scenarios.json", "ball-scenarios.json", "contact-scenarios.json"].map(async name => JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"))));
  const source = buildAuditScenarios(...sources);
  source.scenarios = source.scenarios.filter(scenario => scenario.id === "movement_flip_window_last_tick");
  assert.equal(source.scenarios.length, 1);
  const output = await mkdtemp(path.join(tmpdir(), "airlab-jump-history-"));
  try {
    const manifest = path.join(output, "scenarios.json");
    await writeFile(manifest, JSON.stringify(source));
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./run_js.mjs", import.meta.url)), "--scenarios", manifest, "--out", output,
    ]);
    const replay = JSON.parse(await readFile(path.join(output, "movement_flip_window_last_tick.json"), "utf8"));
    assert.equal(replay.frames[0].audit.car.air_time_since_jump, 1.2333333492279053);
    assert.equal(replay.frames[1].audit.car.air_time_since_jump, 1.2416666746139526);
    for (const frame of replay.frames) assert.equal(frame.audit.car.air_time_since_jump, Math.fround(frame.audit.car.air_time_since_jump));
    assert.equal(replay.frames[0].audit.car.has_jumped, true);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("movement bot records deterministic isolated controls without modifying source", async () => {
  const source = JSON.parse(await readFile(new URL("./scenarios.json", import.meta.url), "utf8"));
  const original = JSON.stringify(source);
  const first = buildMovementScenarios(source);
  assert.equal(JSON.stringify(first), JSON.stringify(buildMovementScenarios(source)));
  assert.equal(JSON.stringify(source), original);
  assert.equal(first.scenarios.length, source.scenarios.length + 6);
  assert.equal(new Set(first.scenarios.map(scenario => scenario.id)).size, first.scenarios.length);
  for (const scenario of first.scenarios) {
    assert.equal(scenario.car_only, true);
    assert.equal(scenario.ball, undefined);
    if (!scenario.id.startsWith("movement_bot_")) continue;
    assert.equal(scenario.control_schedule.at(-1).until_tick, scenario.ticks);
    let previous = 0;
    for (const segment of scenario.control_schedule) {
      assert(segment.until_tick > previous);
      previous = segment.until_tick;
      for (const [key, value] of Object.entries(segment.controls)) {
        if (["boost", "jump", "handbrake"].includes(key)) assert.equal(typeof value, "boolean");
        else assert(Number.isFinite(value) && Math.abs(value) <= 1);
      }
    }
  }
});

test("movement bot rejects coupled or ball-only source scenarios", () => {
  assert.throws(() => buildMovementScenarios({ scenarios: [{ ball: { pos: [0, 0, 93] } }] }), /car-only/);
  assert.throws(() => buildMovementScenarios({ scenarios: [{ entity: "ball" }] }), /car-only/);
});

test("native cold world-contact normal is zero before any collision", () => {
  const car = makePhysCar();
  assert.deepEqual(car.worldContact.normal.toArray(), [0, 0, 0]);
  assert.equal(car.worldContact.hasContact, false);
});