import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ContactManifold } from "../../src/shared/contactManifold.js";

const rotation = new THREE.Quaternion();
const origin = new THREE.Vector3();
const point = (x = 0) => ({ rel: new THREE.Vector3(x, 0, -1), dist: -0.1,
  n: new THREE.Vector3(0, 0, 1), face: true, normalImpulse: 10,
  frictionImpulse: 2, t: new THREE.Vector3(1, 0, 0) });

test("contact manifold refreshes anchors and preserves scaled impulse history", () => {
  const manifold = new ContactManifold();
  manifold.store(origin, rotation, [point()]);
  const refreshed = manifold.update(new THREE.Vector3(0, 0, 0.2), rotation, []);
  assert.equal(refreshed.length, 1);
  assert(Math.abs(refreshed[0].dist - 0.1) < 1e-10);
  assert.equal(refreshed[0].cachedNormalImpulse, 8.5);
  assert.equal(refreshed[0].cachedFriction.x, 1.7);
  assert.equal(manifold.update(new THREE.Vector3(2, 0, 0), rotation, []).length, 0);
  assert.equal(manifold.update(new THREE.Vector3(0, 0, 2), rotation, []).length, 0);
  manifold.clear();
  assert.equal(manifold.points.length, 0);
});

test("contact manifold merges nearby points and retains at most four per plane", () => {
  const manifold = new ContactManifold();
  const generated = Array.from({ length: 8 }, (_, index) => point(index * 2));
  generated[3].dist = -0.5;
  const contacts = manifold.update(origin, rotation, generated);
  assert.equal(contacts.length, 4);
  assert(contacts.some(contact => contact.rel.x === 6));
  contacts.forEach(contact => {
    contact.normalImpulse = 10; contact.frictionImpulse = 2; contact.t = new THREE.Vector3(1, 0, 0);
  });
  manifold.store(origin, rotation, contacts);
  const merged = manifold.update(origin, rotation, [point(6)]);
  assert.equal(merged.length, 4);
  assert.equal(merged.find(contact => contact.rel.x === 6).cachedNormalImpulse, 8.5);
});