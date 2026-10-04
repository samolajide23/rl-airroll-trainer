export async function loadSoccar(engine, manifest, readMesh, cryptoProvider) {
  const entries = Object.entries(manifest.meshes).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length !== 16) throw new Error('Expected 16 pinned SOCCAR meshes');
  for (const [name, expectedHash] of entries) {
    const bytes = new Uint8Array(await readMesh(name));
    const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
    const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    if (actualHash !== expectedHash) throw new Error(`Mesh hash mismatch: ${name}`);
    const pointer = engine._malloc(bytes.length);
    if (!pointer) throw new Error('Mesh allocation failed');
    try {
      engine.HEAPU8.set(bytes, pointer);
      if (!engine._rs_add_mesh(pointer, bytes.length)) throw new Error('Meshes must load before engine initialization');
    } finally {
      engine._free(pointer);
    }
  }
  if (engine._rs_create_soccar() !== 1) throw new Error('SOCCAR creation failed');
  return entries.length;
}

export function runContactChecks(engine) {
  const snapshot = () => {
    const pointer = engine._rs_state() / 4;
    if (!pointer) throw new Error('Missing arena state');
    const state = Array.from(engine.HEAPF32.subarray(pointer, pointer + 20));
    if (!state.every(Number.isFinite)) throw new Error('Nonfinite engine state');
    return state;
  };
  const requireCheck = (passed, name) => {
    if (!passed) throw new Error(`Contact check failed: ${name}`);
  };
  const run = () => {
    engine._rs_set_car(-2000, 0, 17, 0, 0, 0, 100);
    engine._rs_set_ball(0, 0, 400, 0, 0, -500, 0, 0, 0);
    let floorBounce = null;
    for (let tick = 1; tick <= 120; tick += 1) {
      engine._rs_step(1, 0, 0, 0, 0, 0, 0, 0, 0);
      const state = snapshot();
      if (state[15] > 100) {
        floorBounce = { tick, state };
        break;
      }
    }
    requireCheck(floorBounce !== null, 'ball floor rebound');
    requireCheck(floorBounce.state[12] > 80, 'ball remains above floor');
    engine._rs_step(120, 0, 0, 0, 0, 0, 0, 0, 0);
    requireCheck(snapshot()[19] === 1, 'car wheel grounding');
    engine._rs_step(1, 0, 0, 0, 0, 0, 1, 0, 0);
    const jump = snapshot();
    requireCheck(jump[5] > 200, 'grounded jump impulse');

    engine._rs_set_car(-2000, 0, 17, 0, 0, 0, 100);
    engine._rs_set_ball(3800, 0, 500, 1000, 0, 0, 0, 0, 0);
    let wallBounce = null;
    for (let tick = 1; tick <= 90; tick += 1) {
      engine._rs_step(1, 0, 0, 0, 0, 0, 0, 0, 0);
      const state = snapshot();
      if (state[13] < -100) {
        wallBounce = { tick, state };
        break;
      }
    }
    requireCheck(wallBounce !== null, 'ball side-wall rebound');

    engine._rs_set_car(-400, 0, 17, 1000, 0, 0, 100);
    engine._rs_set_ball(0, 0, 93.15, 0, 0, 0, 0, 0, 0);
    let carHit = null;
    for (let tick = 1; tick <= 90; tick += 1) {
      engine._rs_step(1, 1, 0, 0, 0, 0, 0, 0, 0);
      const state = snapshot();
      if (state[13] > 100) {
        carHit = { tick, state };
        break;
      }
    }
    requireCheck(carHit !== null, 'car-to-ball impulse');
    return { floorBounce, jump, wallBounce, carHit };
  };
  const started = performance.now();
  const first = run();
  engine._rs_destroy();
  requireCheck(engine._rs_create_soccar() === 1, 'arena recreation');
  const repeated = run();
  requireCheck(JSON.stringify(first) === JSON.stringify(repeated), 'recreated arena determinism');
  engine._rs_destroy();
  return { status: 'passed', elapsedMs: performance.now() - started, ...first };
}