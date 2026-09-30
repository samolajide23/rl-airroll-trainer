import * as THREE from "three";

export class ContactManifold {
  constructor(breakingThreshold = 1, warmstartFactor = 0.85) {
    this.breakingThreshold = breakingThreshold;
    this.warmstartFactor = warmstartFactor;
    this.points = [];
  }

  clear() {
    this.points = [];
  }

  refresh(position, rotation) {
    const retained = [];
    for (const point of this.points) {
      const rel = point.local.clone().applyQuaternion(rotation);
      const world = rel.clone().add(position);
      const separation = world.clone().sub(point.surface);
      const distance = separation.dot(point.normal);
      const tangent = separation.addScaledVector(point.normal, -distance);
      if (distance > this.breakingThreshold || tangent.lengthSq() > this.breakingThreshold ** 2) continue;
      retained.push({ rel, dist: distance, n: point.normal.clone(), face: point.face,
        cachedNormalImpulse: point.normalImpulse * this.warmstartFactor,
        cachedFriction: point.friction.clone().multiplyScalar(this.warmstartFactor) });
    }
    return retained;
  }

  update(position, rotation, generated) {
    const contacts = this.refresh(position, rotation);
    for (const contact of generated) {
      const match = contacts.find(point => point.n.dot(contact.n) > 0.99 &&
        point.rel.distanceToSquared(contact.rel) < this.breakingThreshold ** 2);
      if (match) {
        match.rel.copy(contact.rel);
        match.n.copy(contact.n);
        match.dist = contact.dist;
        match.face = contact.face;
      } else {
        contacts.push({ ...contact, rel: contact.rel.clone(), n: contact.n.clone(),
          cachedNormalImpulse: 0, cachedFriction: new THREE.Vector3() });
      }
    }
    const groups = [];
    for (const contact of contacts) {
      let group = groups.find(points => points[0].n.dot(contact.n) > 0.99);
      if (!group) { group = []; groups.push(group); }
      group.push(contact);
    }
    const reduced = [];
    for (const group of groups) {
      group.sort((left, right) => left.dist - right.dist);
      const selected = [group.shift()];
      while (selected.length < 4 && group.length) {
        let bestIndex = 0;
        let bestDistance = -1;
        group.forEach((point, index) => {
          const distance = Math.min(...selected.map(other => other.rel.distanceToSquared(point.rel)));
          if (distance > bestDistance) { bestDistance = distance; bestIndex = index; }
        });
        selected.push(group.splice(bestIndex, 1)[0]);
      }
      reduced.push(...selected);
    }
    return reduced;
  }

  store(position, rotation, contacts) {
    const inverse = rotation.clone().invert();
    this.points = contacts.map(contact => ({
      local: contact.rel.clone().applyQuaternion(inverse),
      surface: contact.rel.clone().add(position).addScaledVector(contact.n, -contact.dist),
      normal: contact.n.clone(), face: contact.face,
      normalImpulse: contact.normalImpulse,
      friction: contact.t.clone().multiplyScalar(contact.frictionImpulse),
    }));
  }
}