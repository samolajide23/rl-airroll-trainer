import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeCar, makeSoccarKickoffCar, stepCar } from "../../src/shared/carSim.js";
import { RL, makeBall, stepBall, carHitbox, collideCarBall, alignCarVisualToHitbox } from "../../src/shared/rl-physics.js";
import { HITBOX_PRESETS } from "../../src/shared/hitboxPresets.js";
import { stepCarBall } from "../../src/shared/carSim.js";
import { AerialBody, FixedStepClock, frameElapsed } from "../../src/shared/aerial.js";
import { applyToCarModel } from "../../src/shared/rl-physics.js";
import { sphereArenaContacts } from "../../src/shared/arenaMesh.js";
import { compareScenario, failuresFor } from "./trajectory.mjs";
import { firstDivergence } from "./first-divergence.mjs";

const close = (a, b, tolerance = 1e-6) => assert(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test("native translation retains internal precision and resynchronizes after teleport", () => {
  const car = makeCar(new THREE.Vector3(-1000, 0, 800), 0);
  car.arenaCollisions = false;
  car.vel.x = 1.973595142364502;
  let nativeX = Math.fround(-1000 * Math.fround(1 / 50));
  const increment = Math.fround(Math.fround(car.vel.x * Math.fround(1 / 50)) * Math.fround(RL.DT));
  for (let tick = 0; tick < 120; tick++) {
    stepCar(car, {});
    nativeX = Math.fround(nativeX + increment);
    assert.equal(car.pos.x, Math.fround(nativeX * 50));
  }
  car.pos.x = 1200;
  stepCar(car, {});
  assert.equal(car.pos.x, Math.fround(Math.fround(Math.fround(1200 * Math.fround(1 / 50)) + increment) * 50));
});

test("airborne boost consumption matches native float32 endpoint", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 800), 0);
  car.arenaCollisions = false;
  car.boost = 100;
  for (let tick = 0; tick < 120; tick++) stepCar(car, { boost: true });
  assert.equal(car.boost, 66.66656494140625);
});

test("Free Play kickoff matches RocketSim raw spawn for every hitbox", () => {
  for (const hitbox of Object.values(HITBOX_PRESETS)) {
    const car = makeSoccarKickoffCar(hitbox);
    assert.deepEqual(car.pos.toArray(), [0, -4608, 17]);
    assert.deepEqual(car.vel.toArray(), [0, 0, 0]);
    assert.deepEqual(car.omega.toArray(), [0, 0, 0]);
    assert.equal(car.onGround, true);
    assert.equal(car.boost, Math.fround(100 / 3));
    assert.deepEqual(new THREE.Vector3(1, 0, 0).applyQuaternion(car.q).toArray().map(Math.fround), [-4.371138828673793e-8, 1, 0]);
    assert.deepEqual(new THREE.Vector3(0, 0, 1).applyQuaternion(car.q).toArray(), [0, 0, 1]);
    const ball = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    assert.deepEqual(ball.pos.toArray(), [0, 0, Math.fround(93.15)]);
    assert.deepEqual(ball.vel.toArray(), [0, 0, 0]);
  }
});

test("goal roof contact uses the local roof height instead of the arena ceiling", () => {
  const car = makeCar(new THREE.Vector3(0, 5200, 610), 0);
  car.captureArenaContacts = true;
  car.vel.set(0, 0, 100);
  const before = car.pos.clone();
  stepCar(car, {});
  assert(car.lastArenaContacts.some(contact => contact.normal[2] < -0.99), "must exercise the goal underside");
  assert(car.pos.distanceTo(before) < 30, `goal contact moved car ${car.pos.distanceTo(before)} uu in one tick`);
  assert(car.lastArenaContacts.every(contact => contact.distance > -40), "local contacts cannot have arena-ceiling-sized penetration");
});

test("car above the goal roof is not treated as penetrating its underside", () => {
  for (const side of [-1, 1]) {
    const car = makeCar(new THREE.Vector3(0, side * 5200, 660), 0);
    car.captureArenaContacts = true;
    const before = car.pos.clone();
    stepCar(car, {});
    assert(car.pos.distanceTo(before) < 1, "a car clear of the roof cannot be ejected through it");
    assert(car.lastArenaContacts.every(contact => contact.distance > -2), "roof backside is not an infinite solid");
    for (let tick = 0; tick < 120; tick++) {
      const previous = car.pos.clone();
      stepCar(car, { throttle: 1 });
      assert(car.pos.distanceTo(previous) < 20, "driving on the goal roof must remain bounded");
    }
  }
});

test("driving around the rear goal roof does not eject the offset hitbox", () => {
  for (const side of [-1, 1]) {
    const car = makeCar(new THREE.Vector3(0, side * 5500, 610), 0);
    car.vel.set(0, side * 300, 0);
    for (let tick = 0; tick < 240; tick++) {
      const before = car.pos.clone();
      stepCar(car, { throttle: 1, steer: 0.3 });
      const movement = car.pos.distanceTo(before);
      assert(movement < 30, `rear roof ejection at tick ${tick}: ${movement} uu`);
    }
  }
});

test("rounded goal-wall support rejects the RocketSim tick-1092 false contact", () => {
  const car = makeCar(new THREE.Vector3(806.9577026367188, 5552.9384765625, 466.6036682128906), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.8524223566055298, 0.5228289365768433, 0.005098483990877867),
    new THREE.Vector3(0.5191479921340942, -0.8474992513656616, 0.11059010773897171),
    new THREE.Vector3(0.06214067339897156, -0.09162262082099915, -0.9938528537750244),
  ));
  car.vel.set(1064.420654296875, -365.4482727050781, -200.84703063964844);
  car.omega.set(0.004958970006555319, 0.14052443206310272, 1.293604850769043);
  car.onGround = false;
  car.wheelsContact = false;
  car.airTime = 0.43333324790000916;
  stepCar(car, {});
  assert.equal(car.worldContact.hasContact, false);
  assert(car.vel.distanceTo(new THREE.Vector3(1064.420654296875, -365.4482727050781, -206.26368713378906)) < 0.0001);
});

test("goal-wall contact retains the positive-gap triangle witness and native split rotation", () => {
  const car = makeCar(new THREE.Vector3(815.8279418945312, 5549.89306640625, 464.8847961425781), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.8468338847160339, 0.5318413376808167, 0.004139023832976818),
    new THREE.Vector3(0.5282347798347473, -0.8419469594955444, 0.10996901988983154),
    new THREE.Vector3(0.06197091564536095, -0.09093911200761795, -0.9939262866973877),
  )).normalize();
  car.vel.set(1064.420654296875, -365.4482727050781, -206.26368713378906);
  car.omega.set(0.0030474429950118065, 0.13740240037441254, 1.2729005813598633);
  car.captureArenaContacts = true;
  stepCar(car, {});
  assert.equal(car.lastArenaContacts.length, 2);
  assert(car.lastArenaContacts[0].distance > 0);
  assert(new THREE.Vector3(...car.lastArenaContacts[0].point).distanceTo(new THREE.Vector3(895.637878418, 5559.91845703, 467.268218994)) < 0.001);
  assert(car.vel.distanceTo(new THREE.Vector3(-246.17376708984375, -351.5784606933594, -201.24020385742188)) < 0.06);
  assert(car.omega.distanceTo(new THREE.Vector3(-0.12081586569547653, 1.388466238975525, 5.320485591888428)) < 0.0002);
  assert(new THREE.Vector3(1, 0, 0).applyQuaternion(car.q).distanceTo(new THREE.Vector3(0.8100093603134155, 0.5861758589744568, -0.01681293547153473)) < 0.00001);
  assert(new THREE.Vector3(0, 0, 1).applyQuaternion(car.q).distanceTo(new THREE.Vector3(0.04218151420354843, -0.08683712035417557, -0.9953290224075317)) < 0.00001);
});

test("first inverted-floor impact uses a support corner and pre-gravity restitution", () => {
  const car = makeCar(new THREE.Vector3(-1000, 0, 40.4375), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 8.742277657347586e-8),
    new THREE.Vector3(0, -8.742277657347586e-8, -1),
  ));
  car.vel.set(0, 0, -246.24990844726562);
  car.onGround = false;
  car.wheelsContact = false;
  stepCar(car, {});
  assert(car.vel.distanceTo(new THREE.Vector3(0, -14.092405319213867, -204.69189453125)) < 0.05);
  assert(car.omega.distanceTo(new THREE.Vector3(1.963854193687439, -2.6135618686676025, -0.569733738899231)) < 0.01);
  stepCar(car, {});
  stepCar(car, {});
  assert(car.vel.distanceTo(new THREE.Vector3(26.945232391357422, 6.043222427368164, -32.62736892700195)) < 2);
  assert(car.omega.distanceTo(new THREE.Vector3(-0.8431462049484253, 2.836383581161499, -0.5307889580726624)) < 0.1);
});

test("inverted roof recovery matches native fresh contacts and positive-gap rejection", () => {
  const car = makeCar(new THREE.Vector3(-1000, 0, 80), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 8.742277657347586e-8),
    new THREE.Vector3(0, -8.742277657347586e-8, -1),
  ));
  car.vel.set(0, 0, -100);
  for (let tick = 0; tick < 180; tick++) {
    stepCar(car, { jump: tick === 60, throttle: tick > 60 ? 1 : 0 });
    if (tick === 30) assert(Math.abs(car.pos.z - 39.19276428222656) < 0.001);
    if (tick === 65) {
      assert.equal(car.worldContact.hasContact, false);
      assert(car.vel.distanceTo(new THREE.Vector3(8.727950096130371, -3.5010223388671875, 161.90252685546875)) < 0.001);
    }
  }
  assert(car.pos.distanceTo(new THREE.Vector3(-911.80517578125, -21.689756393432617, 16.980024337768555)) < 0.01);
});

test("deferred ball contacts match RocketSim goal ramp and roof seam velocities", () => {
  const cases = [
    {
      pos: [0.6656724214553833, 5361.5615234375, 93.12435150146484],
      vel: [0.5807785987854004, 1543.20751953125, 0],
      spin: [-2.8851401805877686, 0.0010622699046507478, -0.000269571493845433],
      expected: [0.6873723864555359, 1511.0379638671875, 76.9347152709961],
    },
    {
      pos: [3.25771188736, 5900.94921875, 296.325286865],
      vel: [46.5585289001, -305.970153809, 1543.30761719],
      spin: [2.0046620369, -0.5074300766, -0.1875045896],
      expected: [48.4311027527, -529.163452148, 1371.99340820],
    },
    {
      pos: [7.58625555038, 5836.4423828125, 380.921630859],
      vel: [57.4054718018, -942.252929688, 663.341064453],
      spin: [-5.9697771072, -0.5964442492, -0.0775186941],
      expected: [63.5610923767, -976.641113281, 444.154174805],
    },
  ];
  for (const scenario of cases) {
    const ball = makeBall(new THREE.Vector3(...scenario.pos));
    ball.vel.set(...scenario.vel);
    ball.omega.set(...scenario.spin);
    stepBall(ball, RL.DT, { deferTransform: true })();
    assert(ball.vel.distanceTo(new THREE.Vector3(...scenario.expected)) < 0.025);
  }
});

test("high-speed simulation keeps the same tick count and trajectory at 15 and 120 render FPS", () => {
  const simulate = fps => {
    const car = makeCar(new THREE.Vector3(0, 0, 3000), 0);
    car.arenaCollisions = false;
    car.infiniteBoost = true;
    car.vel.set(1800, 200, 100);
    const clock = new FixedStepClock();
    let ticks = 0;
    let previous = 0;
    for (let frame = 1; frame <= fps * 2; frame++) {
      const now = frame * 1000 / fps;
      clock.advance(frameElapsed(now, previous), () => {
        stepCar(car, { boost: true, pitch: 0.4, yaw: -0.5, roll: 1 });
        ticks++;
      });
      previous = now;
    }
    return { car, ticks };
  };
  const fast = simulate(120), slow = simulate(15);
  assert(Math.abs(fast.ticks - slow.ticks) <= 1);
  if (fast.ticks < slow.ticks) stepCar(fast.car, { boost: true, pitch: 0.4, yaw: -0.5, roll: 1 });
  if (slow.ticks < fast.ticks) stepCar(slow.car, { boost: true, pitch: 0.4, yaw: -0.5, roll: 1 });
  assert(fast.car.pos.distanceTo(slow.car.pos) < 1e-6);
  assert.deepEqual(fast.car.q.toArray(), slow.car.q.toArray());
  close(frameElapsed(10000, 0), 0.1);
  close(frameElapsed(0, 100), 0);
});

test("configured dodge threshold uses RocketSim summed absolute axes and inclusive boundary", () => {
  for (const controls of [{ pitch: 0.959 }, { pitch: 0.96 }, { pitch: -0.5, yaw: -0.46 }, { roll: 0.96 }]) {
    const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
    car.arenaCollisions = false;
    car.onGround = false;
    car.wheelsContact = false;
    car.hasJumped = true;
    car.dodgeDeadzone = 0.96;
    stepCar(car, { ...controls, jump: true });
    const magnitude = Math.abs(controls.pitch ?? 0) + Math.abs(controls.yaw ?? 0) + Math.abs(controls.roll ?? 0);
    assert.equal(car.hasFlipped, magnitude >= 0.96);
    assert.equal(car.hasDoubleJumped, magnitude < 0.96);
  }
});

test("ceiling friction direction includes external force at the second impact", () => {
  const car = makeCar(new THREE.Vector3(-815.2799682617188, 0, 2013.793212890625));
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.9989769458770752, 0.005383843090385199, -0.04490096867084503),
    new THREE.Vector3(-0.007858701050281525, 0.9984485507011414, -0.055125121027231216),
    new THREE.Vector3(0.04453451931476593, 0.05542158707976341, 0.9974693655967712)
  ));
  car.vel.set(566.31689453125, 0, 487.3059387207031);
  car.omega.set(-4.2632527351379395, 3.4353833198547363, 0.5223217606544495);
  car.onGround = false;
  car.wheelsContact = false;
  stepCar(car, {});
  assert(car.vel.distanceTo(new THREE.Vector3(508.78997802734375, -12.43116283416748, 285.706787109375)) < 0.001);
  assert(car.omega.distanceTo(new THREE.Vector3(4.555018901824951, -3.055729389190674, -0.40535789728164673)) < 0.0001);
});

test("ceiling support endpoint stays within the measured RocketSim response envelope", () => {
  const car = makeCar(new THREE.Vector3(-1000, 0, 1800), 0);
  car.vel.set(600, 0, 800);
  for (let tick = 0; tick < 120; tick++) stepCar(car, {});
  assert(car.pos.distanceTo(new THREE.Vector3(-519.8243408203125, 1.6410937309265137, 1849.1641845703125)) < 0.01);
  assert(car.vel.distanceTo(new THREE.Vector3(425.058837890625, 2.5372796058654785, -455.26239013671875)) < 0.01);
  assert(car.omega.distanceTo(new THREE.Vector3(-0.046904198825359344, 0.04992206022143364, 0.2164486050605774)) < 0.001);
});

test("chassis inverse inertia uses the safe-margin box dimensions for every preset", () => {
  for (const preset of ["octane", "dominus", "plank", "breakout", "hybrid", "merc"]) {
    const car = makeCar(undefined, 0, preset);
    const margin = Math.min(2, Math.min(...car.hitbox.size) * 0.05);
    const dimensions = car.hitbox.size.map(length => length - 4 + 2 * margin);
    const expected = dimensions.map((length, index) => {
      const others = dimensions.filter((value, axis) => axis !== index);
      return 12 / (180 * (others[0] ** 2 + others[1] ** 2));
    });
    car.invInertiaLocal.toArray().forEach((value, index) => close(value, expected[index]));
  }
});

test("one-tick boost press stops at the reference minimum duration", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false;
  car.boost = RL.BOOST_MAX;
  let boostTicks = 0;
  for (let tick = 0; tick < 60; tick++) {
    stepCar(car, { boost: tick === 0 });
    if (car.isBoosting) boostTicks++;
  }
  assert.equal(boostTicks, Math.round(RL.BOOST_MIN_TIME / RL.DT));
  assert.equal(car.vel.x, 105.83332824707031);
  assert.equal(car.boost, 96.66665649414062);
});

test("first airborne wheel contact uses the initial zero friction coefficients", () => {
  const car = makeCar(new THREE.Vector3(-1000, 0, 250), 0);
  car.vel.set(600, 300, -300);
  car.onGround = false;
  car.wheelsContact = false;
  let contacted = false;
  for (let tick = 0; tick < 120; tick++) {
    const previousSideSpeed = car.vel.y;
    stepCar(car, { throttle: 1, handbrake: true });
    if (car.numWheelsInContact > 0) {
      close(car.vel.y, previousSideSpeed);
      close(car.omega.z, 0);
      contacted = true;
      break;
    }
  }
  assert(contacted);
});

test("stationary kickoff jumps do not collide with distant triangle planes", () => {
  for (const preset of Object.values(HITBOX_PRESETS)) {
    const spawn = RL.SOCCAR_SPAWNS[4];
    const car = makeCar(new THREE.Vector3(spawn.x, spawn.y, preset.restZ), spawn.yaw, preset);
    let peakHeight = 0;
    for (let tick = 0; tick < 300; tick++) {
      stepCar(car, { jump: tick < 12 });
      peakHeight = Math.max(peakHeight, car.pos.z);
      if (car.pos.z > 100) {
        assert(car.omega.length() < 0.2, `${preset.id}: unexpected spin at tick ${tick}`);
        assert(Math.hypot(car.vel.x, car.vel.y) < 10, `${preset.id}: unexpected sideways impulse at tick ${tick}`);
        assert.equal(car.worldContact.hasContact, false);
      }
    }
    assert(peakHeight > 100);
    assert.equal(car.onGround, true);
  }
});

test("aerial drills match Free Play orientation, not just spin magnitude", () => {
  for (const controls of [{ roll: 1 }, { roll: -1 }, { pitch: 1 }, { yaw: 1 }, { pitch: 0.5, yaw: -0.5, roll: 0.5 }]) {
    const car = makeCar(new THREE.Vector3(0, 0, 1000));
    car.arenaCollisions = false;
    const rendered = new THREE.Object3D();
    const drill = new THREE.Object3D();
    const body = new AerialBody();
    applyToCarModel(car, rendered);
    drill.quaternion.copy(rendered.quaternion);
    for (let tick = 0; tick < 90; tick++) {
      stepCar(car, controls);
      applyToCarModel(car, rendered);
      body.step(drill, controls.roll ?? 0, controls.pitch ?? 0, controls.yaw ?? 0, RL.DT);
      assert(rendered.quaternion.angleTo(drill.quaternion) < 0.001,
        `${JSON.stringify(controls)} differs on tick ${tick}`);
    }
  }
});

test("visual calibration uses actual length, grounds wheels, and is idempotent", () => {
  for (const preset of Object.values(HITBOX_PRESETS)) {
    const car = new THREE.Group();
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4.2), new THREE.MeshBasicMaterial());
    visual.geometry.translate(0, 0.7, 0.2);
    car.add(visual);
    const bounds = new THREE.Box3().setFromObject(visual);
    car.userData.visual = visual;
    car.userData.visualBounds = bounds;
    car.userData.refLength = bounds.max.z - bounds.min.z;
    car.position.y = preset.restZ * 0.01;
    for (let i = 0; i < 3; i++) {
      alignCarVisualToHitbox(car, preset);
      car.updateMatrixWorld(true);
      const actual = new THREE.Box3().setFromObject(visual);
      close(actual.min.y, 0);
      close(actual.max.z - actual.min.z, preset.size[0] * 0.01);
      close(actual.getCenter(new THREE.Vector3()).z, preset.offset[0] * 0.01);
    }
    visual.geometry.dispose(); visual.material.dispose();
  }
});

test("ball damping precedes gravity and uses Bullet exponential decay", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, 1000));
  ball.vel.set(1000, 0, 0);
  stepBall(ball, RL.DT, { arena: false });
  close(ball.vel.x, 1000 * (1 - RL.BALL_DRAG) ** RL.DT);
  close(ball.vel.z, -RL.GRAVITY * RL.DT);
  close(ball.pos.x, ball.vel.x * RL.DT);
});

test("zero-velocity kickoff ball sleeps until an impulse", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
  for (let i = 0; i < 120; i++) stepBall(ball);
  close(ball.pos.z, RL.BALL_REST_Z);
  ball.vel.x = 10;
  stepBall(ball);
  assert(ball.pos.x > 0);
});

test("ball speed is capped after integrating its position", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, 1000));
  ball.vel.x = 7000;
  ball.omega.x = 10;
  stepBall(ball, RL.DT, { arena: false });
  assert(ball.pos.x > RL.BALL_MAX_SPEED * RL.DT);
  close(ball.vel.length(), RL.BALL_MAX_SPEED);
  close(ball.omega.length(), RL.BALL_MAX_SPIN);
});

test("THE_VOID car and ball do not collide with the floor", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false;
  const ball = makeBall(new THREE.Vector3(0, 0, 1000));
  ball.vel.z = 0.001;
  for (let i = 0; i < 240; i++) {
    stepCar(car, {});
    stepBall(ball, RL.DT, { arena: false });
  }
  assert(car.pos.z < 0 && ball.pos.z < 0);
  assert.equal(car.numWheelsInContact, 0);
});

test("goal mouth has no phantom contact with distant roof planes", () => {
  assert.equal(sphereArenaContacts(new THREE.Vector3(0, 5200, 300), RL.BALL_RADIUS).length, 0);
});

test("floor bounce matches measured RocketSim first two ticks", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, 100));
  ball.vel.z = -1000;
  stepBall(ball);
  close(ball.pos.z, 91.62364196777344, 0.001);
  assert(ball.vel.z < 0);
  stepBall(ball);
  close(ball.pos.z, 96.64817810058594, 0.001);
  close(ball.vel.z, 602.9447631835938, 0.001);
});

test("inside-OBB ball exits the nearest face, including exact centre", () => {
  for (const offset of [0, 5, -5]) {
    const car = makeCar(new THREE.Vector3(0, 0, 1000), 0.3);
    const box = carHitbox(car);
    const ball = makeBall(box.center.clone().addScaledVector(box.u, offset));
    const hit = collideCarBall(car, ball, 10);
    assert(hit);
    close(hit.normal.length(), 1);
    close(Math.abs(ball.pos.clone().sub(box.center).dot(box.u)), box.half[2] + RL.BALL_RADIUS);
  }
});

test("car-ball impulses cannot leave over-cap state", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  const box = carHitbox(car);
  const ball = makeBall(box.center.clone().addScaledVector(box.f, box.half[0] + 90));
  car.vel.x = 2300; ball.vel.x = -6000; ball.omega.set(6, 0, 0);
  assert(collideCarBall(car, ball, 10));
  assert(ball.vel.length() <= RL.BALL_MAX_SPEED + 1e-6);
  assert(ball.omega.length() <= RL.BALL_MAX_SPIN + 1e-6);
  assert(car.vel.length() <= RL.MAX_SPEED + 1e-6);
  assert(car.omega.length() <= RL.MAX_ANG_VEL + 1e-6);
});

function fixture() {
  return { id: "ball", entity: "ball", game_mode: "void", scenario_sha256: "test", ticks: 1, tick_rate: 120, tick_time: 1 / 120, initial: {}, frames: [0, 1].map(tick => ({ tick, pos: [0, 0, 0], vel: [0, 0, 0], ang_vel: [0, 0, 0] })) };
}

test("first-divergence diagnostic identifies the earliest velocity mismatch", () => {
  const reference = fixture(), candidate = fixture();
  assert.equal(firstDivergence(reference, candidate).first_tick, null);
  candidate.frames[1].vel[0] = 2;
  const result = firstDivergence(reference, candidate);
  assert.equal(result.first_tick, 1);
  assert.equal(result.context[1].velocity_error, 2);
});

test("first-divergence diagnostic detects small position and orientation errors independently", () => {
  const reference = fixture(), candidate = fixture();
  candidate.frames[1].pos[0] = 0.0002;
  assert.equal(firstDivergence(reference, candidate).first_tick, null);
  const position = firstDivergence(reference, candidate, { position: 0.0001 });
  assert.equal(position.first_tick, 1);
  assert.deepEqual(position.exceeded, ["position"]);
  for (const data of [reference, candidate]) {
    delete data.entity;
    for (const frame of data.frames) Object.assign(frame, {
      rot: { forward: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] },
      boost: 100, air_time: 0, on_ground: false,
    });
  }
  const radians = 0.00002 * Math.PI / 180;
  candidate.frames[1].rot.forward = [Math.cos(radians), Math.sin(radians), 0];
  const orientation = firstDivergence(reference, candidate, { forward: 0.00001, up: 0.00001 });
  assert.equal(orientation.first_tick, 1);
  assert.deepEqual(orientation.exceeded, ["forward"]);
  close(orientation.context[1].forward_error_deg, 0.00002, 1e-12);
  assert.equal(firstDivergence(reference, candidate, { forward: 0.00002 }).first_tick, null);
  candidate.frames[1].on_ground = true;
  assert.deepEqual(firstDivergence(reference, candidate, { ground: 0 }).exceeded, ["ground"]);
});

test("comparison rejects malformed, stale, and truncated trajectories", () => {
  for (const corrupt of [
    f => f.frames.pop(), f => f.frames[1].tick++, f => f.frames[1].pos[0] = NaN,
    f => f.frames[0].vel = [0], f => f.scenario_sha256 = "stale", f => f.game_mode = "soccar",
    f => f.initial = { different: true }, f => f.tick_rate = 60,
    f => f.diagnostic_reference_seed_interval = 1,
    f => f.diagnostic_reference_seed_interval = 0,
  ]) {
    const a = fixture(), b = fixture(); corrupt(b);
    assert.throws(() => compareScenario(a, b));
  }
});

test("comparison rejects reference-seeded diagnostics on either side", () => {
  const reference = fixture(), candidate = fixture();
  reference.diagnostic_reference_seed_interval = 10;
  assert.throws(() => compareScenario(reference, candidate), /cannot certify open-loop parity/);
});

test("numerical divergence fails budgets instead of just printing a report", () => {
  const a = fixture(), b = fixture();
  assert.equal(compareScenario(a, b).pos_max, 0);
  b.frames[1].pos[0] = 5;
  assert.equal(failuresFor(compareScenario(a, b), { defaults: { pos_max: 0.2 } }).length, 1);
  assert.throws(() => failuresFor(compareScenario(a, b), { defaults: { typo: 1 } }));
});

test("coupled comparison validates and measures the ball, not just the car", () => {
  // Use valid car frames because coupled scenarios contain both entities.
  const a = fixture(), b = fixture();
  for (const data of [a, b]) {
    data.entity = "car"; data.ball_initial = { pos: [0, 0, 0] };
    for (const frame of data.frames) {
      frame.rot = { forward: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] };
      frame.boost = 100; frame.air_time = 0; frame.on_ground = false;
      frame.ball = { pos: [0, 0, 0], vel: [0, 0, 0], ang_vel: [0, 0, 0] };
    }
  }
  b.frames[1].ball.pos[0] = 10;
  const result = compareScenario(a, b);
  assert.equal(result.pos_max, 0);
  assert.equal(result.ball_pos_max, 10);
  assert.equal(failuresFor(result, { defaults: { ball_pos_max: 0.2 } }).length, 1);
  b.frames[1].ball.vel[0] = NaN;
  assert.throws(() => compareScenario(a, b));
});

test("coupled nose contact begins on RocketSim tick 13, not tick 12", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false; car.vel.x = 1000;
  const ball = makeBall(new THREE.Vector3(260, 0, 1020.755));
  ball.vel.z = 0.001;
  for (let tick = 0; tick < 12; tick++) assert.equal(stepCarBall(car, ball, {}, tick), null);
  close(ball.vel.x, 0);
  assert(stepCarBall(car, ball, {}, 12));
  assert(ball.vel.x > 1400 && ball.vel.x < 1500);
  const velocity = ball.vel.x;
  for (let tick = 13; tick < 17; tick++) stepCarBall(car, ball, {}, tick);
  assert(ball.vel.x <= velocity); // no spurious repeated extra impulse
});

test("coupled positive-distance touch matches the recorded RocketSim kickoff approach", () => {
  const car = makeCar(new THREE.Vector3(0, -157.868566, 17.030691), Math.PI / 2);
  car.q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  car.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.009731));
  car.vel.set(0, 751.21538, -0.001532);
  const ball = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
  assert(collideCarBall(car, ball, 388, { deferred: true }));
  assert(ball.vel.y > 0);
});

test("coupled contact uses RocketSim's 1.905 uu shape-relative threshold", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.vel.x = 1000;
  const hitbox = carHitbox(car);
  const ball = makeBall(hitbox.center.clone().addScaledVector(hitbox.f, hitbox.half[0] + RL.BALL_RADIUS + 2.01));
  assert.equal(collideCarBall(car, ball, 0, { deferred: true }), null);
  ball.pos.addScaledVector(hitbox.f, -0.51);
  assert.equal(collideCarBall(car, ball, 0), null);
  assert(collideCarBall(car, ball, 0, { deferred: true }));
  const effectiveHalfLength = hitbox.half[0] - 2 + Math.min(2, Math.min(...hitbox.half) * 0.1);
  ball.pos.copy(hitbox.center).addScaledVector(hitbox.f, effectiveHalfLength + RL.BALL_RADIUS + 1.906);
  assert.equal(collideCarBall(car, ball, 2, { deferred: true }), null);
  ball.pos.addScaledVector(hitbox.f, -0.002);
  assert(collideCarBall(car, ball, 2, { deferred: true }));
});

test("floor contact rejects the premature Skybot tick-635 rebound", () => {
  const ball = makeBall(new THREE.Vector3(0, 2343.981248803655, 93.22691220419514));
  ball.vel.set(0, 1549.4034812553753, -215.23194874595484);
  stepBall(ball);
  assert(ball.vel.z < 0);
  stepBall(ball);
  assert(ball.vel.z > 0);
});

test("positive-distance floor bounce matches the recorded RocketSim rebound tick", () => {
  const ball = makeBall(new THREE.Vector3(0, 874.765198, 92.493156));
  ball.vel.set(0, 953.931824, -290.859985);
  ball.omega.set(1.659115, 0, 0);
  stepBall(ball);
  close(ball.vel.z, 174.471725, 0.001);
  close(ball.vel.y, 788.953613, 0.01);
});

test("low Skybot floor bounce preserves the native contact tick schedule", () => {
  const ball = makeBall(new THREE.Vector3(0.25410905480384827, 3528.234375, 93.13864135742188));
  ball.vel.set(0.13533413410186768, 1244.30859375, -18.18158531188965);
  ball.omega.set(-6, 0.0008695402066223323, -0.00016394114936701953);
  const expected = [
    [93.22952270507812, 10.906183242797852],
    [93.2752456665039, 5.486748695373535],
    [93.27581787109375, 0.06868913769721985],
    [93.23125457763672, -5.347995281219482],
    [93.14156341552734, -10.7633056640625],
    [93.19536590576172, 6.456345558166504],
    [93.20401763916016, 1.0380398035049438],
    [93.16752624511719, -4.378890514373779],
    [93.08589935302734, -9.79444694519043],
    [93.08589935302734, 0.0000003725290298461914],
  ];
  for (const [height, velocity] of expected) {
    const finish = stepBall(ball, RL.DT, { deferTransform: true, deferContacts: true });
    for (let iteration = 0; iteration < 10; iteration++) finish.solveContacts();
    finish();
    close(ball.pos.z, height, 0.00001);
    close(ball.vel.z, velocity, 0.00001);
  }
});

test("second Skybot touch matches exact-reference ball velocity with prior wheel state", () => {
  const car = makeCar(new THREE.Vector3(0.009812669828534126, 893.853271484375, 17.0312557220459), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.00001704692840576172, 0.9999544620513916, -0.009544400498270988),
    new THREE.Vector3(-1, 0.00001704692840576172, -1.862645149230957e-9),
    new THREE.Vector3(1.6065314412117004e-7, 0.009544400498270988, 0.9999544620513916),
  )).normalize();
  const contactPosition = car.pos.clone();
  const contactOrientation = car.q.clone();
  car.vel.set(0.01981959491968155, 1162.7613525390625, 0.002084672451019287);
  stepCar(car, { throttle: 1, boost: true });
  car.pos.copy(contactPosition);
  car.q.copy(contactOrientation);
  car.vel.set(0.020019007846713066, 1174.4215087890625, -0.077085942029953);
  car.omega.set(-0.000014072982594370842, 9.324867278337479e-8, -2.7939677238464355e-9);
  car.boost = 11.722222328186035;
  const ball = makeBall(new THREE.Vector3(0.030402518808841705, 1038.6309814453125, 115.2155990600586));
  ball.vel.set(0.02368253469467163, 784.1619873046875, 43.790809631347656);
  ball.omega.set(-2.8542022705078125, 0.0001176048899651505, -1.285679047668964e-7);
  assert(stepCarBall(car, ball, { throttle: 1, boost: true }, 522));
  assert(ball.vel.distanceTo(new THREE.Vector3(0.07740885764360428, 1305.0648193359375, 190.0068359375)) < 0.5,
    `second-touch velocity ${ball.vel.toArray()}`);
});

test("grounded Skybot touch includes the simultaneous ball-floor reaction", () => {
  const car = makeCar(new THREE.Vector3(0.1628281027, 4064.591308594, 17.0319786072), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.000050544739, 0.999954402447, -0.009559584782),
    new THREE.Vector3(-1.000000119209, 0.000050544739, 0.000000002328),
    new THREE.Vector3(0.000000485685, 0.009559584782, 0.999954283237),
  )).normalize();
  const position = car.pos.clone();
  const orientation = car.q.clone();
  car.boost = 0;
  car.vel.set(0.0662223548, 1311.094116211, -0.0001065433);
  stepCar(car, { throttle: 1 });
  car.pos.copy(position);
  car.q.copy(orientation);
  car.vel.set(0.0663240179, 1313.208251953, -0.0000841916);
  car.omega.set(-0.0000306819, -0.0000000438, -0.0000000456);
  const ball = makeBall(new THREE.Vector3(0.3305686116, 4222.91015625, 93.085899353));
  ball.vel.set(0.1198346019, 1080.250244141, 0);
  ball.omega.set(-5.9999995232, 0.0007219720, -0.0000857883);
  assert(stepCarBall(car, ball, { throttle: 1 }, 811));
  assert(ball.vel.distanceTo(new THREE.Vector3(0.3527716696, 1422.847412109, 38.764202118)) < 0.001);
  assert(car.vel.distanceTo(new THREE.Vector3(0.0665134862, 1276.921508789, 16.0059604645)) < 0.001);
  close(car.omega.x, 1.9938839674, 0.00001);
});

test("third Skybot touch is detected from the exact RocketSim pre-contact state", () => {
  const car = makeCar(new THREE.Vector3(0.03107278235256672, 1469.8922119140625, 17.019493103027344), 0);
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.00004094839096069336, 0.99995356798172, -0.009636425413191319),
    new THREE.Vector3(-1, 0.00004100799560546875, -2.3283062144940914e-9),
    new THREE.Vector3(3.9255240835700533e-7, 0.009636425413191319, 0.99995356798172),
  )).normalize();
  car.vel.set(0.059330109506845474, 1435.214111328125, 0.17174780368804932);
  car.omega.set(0.0007750652730464935, -7.404970858715387e-8, 4.6249567731138086e-8);
  const ball = makeBall(new THREE.Vector3(0.06267277896404266, 1587.769775390625, 137.40109252929688));
  ball.vel.set(0.07643264532089233, 1288.606201171875, -81.54550170898438);
  ball.omega.set(0.7732715606689453, 0.00008243288903031498, -0.00003160127380397171);
  assert(collideCarBall(car, ball, 573, { deferred: true }));
  assert(car.vel.z < 0);
  assert(ball.vel.y > 1288.606201171875);
});

test("separating third-touch boundary does not add another ball impulse", () => {
  const car = makeCar(new THREE.Vector3(0, 1493.6097144832718, 16.80797276272983), Math.PI / 2);
  car.vel.set(0, 1424.596, -4);
  const box = carHitbox(car);
  const ball = makeBall(box.center.clone().addScaledVector(box.f, box.half[0] + RL.BALL_RADIUS + 1.95));
  ball.vel.set(0, 1449.7020334677322, 48.731806451325106);
  car.lastExtraBallTick = 573;
  const velocity = ball.vel.clone();
  collideCarBall(car, ball, 575, { deferred: true });
  assert.equal(ball.extraVelocityCache?.length() ?? 0, 0);
  assert(ball.vel.distanceTo(velocity) < 0.001);
});

test("coupled step preserves stationary ball sleep without contact", () => {
  const car = makeCar(new THREE.Vector3(-2000, 0, 1000), 0);
  car.arenaCollisions = false;
  const ball = makeBall(new THREE.Vector3(0, 0, 93.15));
  for (let tick = 0; tick < 120; tick++) stepCarBall(car, ball, {}, tick);
  close(ball.pos.z, 93.15);
  close(ball.vel.length(), 0);
});

test("nose contact matches measured first-hit car angular response", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false;
  car.vel.x = 1000;
  const ball = makeBall(new THREE.Vector3(260, 0, 1020.755));
  ball.vel.z = 0.001;
  for (let tick = 0; tick < 13; tick++) stepCarBall(car, ball, {}, tick);
  close(car.omega.y, -1.8062107563, 0.0001);
  close(ball.omega.y, 0.9987329245, 0.0001);
});

test("offset contact matches measured first-hit ball velocity and spin", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false; car.vel.x = 1000;
  const ball = makeBall(new THREE.Vector3(260, 60, 1035));
  ball.vel.z = 0.001;
  for (let tick = 0; tick < 13; tick++) stepCarBall(car, ball, {}, tick);
  assert(ball.vel.distanceTo(new THREE.Vector3(1229.312744140625, 435.63958740234375, -7.157659530639648)) < 0.5);
  assert(ball.omega.distanceTo(new THREE.Vector3(0.000060416, -0.00028465, 0.557679)) < 0.01);
});