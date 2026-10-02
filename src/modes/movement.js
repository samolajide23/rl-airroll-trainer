import * as THREE from "three";
import { formatSpeed } from "../shared/rl-units.js";
import { BallContactMode } from "./ballContact.js";
import { generateMovementSetup, MOVEMENT_TRAINING } from "../shared/movementTraining.js";
import { ARENA_UU } from "../shared/soccarArena.js";
import { physToThree } from "../shared/carPhysics.js";
import { disposeScene } from "../shared/disposeScene.js";

export class MovementMode extends BallContactMode {
  constructor(ctx, options = {}) {
    super(ctx, { ...options, variant: options.variant ?? "driving" });
    this.targetGroup = new THREE.Group();
    this.root.add(this.targetGroup);
    this.targetMarkers = Array.from({ length: 5 }, () => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(150 * ARENA_UU, 180 * ARENA_UU, 48), new THREE.MeshBasicMaterial({ color: 0x83cdec, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2;
      this.targetGroup.add(marker);
      return marker;
    });
    this.goalAura = new THREE.Group();
    const auraHeight = 260 * ARENA_UU;
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(180 * ARENA_UU, 180 * ARENA_UU, auraHeight, 64, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { color: { value: new THREE.Color(0xffd166) } },
        vertexShader: `
          varying vec2 auraUv;
          void main() {
            auraUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          varying vec2 auraUv;
          void main() {
            float fade = 1.0 - auraUv.y;
            gl_FragColor = vec4(color, 0.32 * fade * fade);
          }
        `,
      }),
    );
    aura.position.y = auraHeight / 2;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(180 * ARENA_UU, 4 * ARENA_UU, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.65, depthWrite: false }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = auraHeight;
    this.goalAura.add(aura, halo);
    this.targetGroup.add(this.goalAura);
    const chevron = new THREE.Shape();
    chevron.moveTo(-65, -45);
    chevron.lineTo(0, 45);
    chevron.lineTo(65, -45);
    chevron.lineTo(65, -10);
    chevron.lineTo(0, 80);
    chevron.lineTo(-65, -10);
    chevron.closePath();
    const arrowGeometry = new THREE.ShapeGeometry(chevron);
    arrowGeometry.scale(ARENA_UU, ARENA_UU, ARENA_UU);
    this.routeArrows = Array.from({ length: 30 }, () => {
      const arrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
      this.targetGroup.add(arrow);
      return arrow;
    });
    this.laneEdges = [-180, 180].map(offset => {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, length: { value: 1 } },
        vertexShader: `
          varying vec2 guideUv;
          void main() {
            guideUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float length;
          varying vec2 guideUv;
          void main() {
            float forward = 1.0 - guideUv.y;
            float across = abs(guideUv.x - 0.5) * 2.0;
            float glow = pow(1.0 - across, 2.0);
            float core = 1.0 - smoothstep(0.12, 0.28, across);
            float pulse = pow(max(0.0, cos((forward * length / 220.0 - time * 0.8) * 6.283185)), 8.0);
            vec3 hue = mix(vec3(0.514, 0.804, 0.925), vec3(1.0, 0.820, 0.400), forward);
            gl_FragColor = vec4(mix(hue, vec3(1.0), core * pulse * 0.6), glow * (0.3 + pulse * 0.35) + core * 0.35);
          }
        `,
      });
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(36 * ARENA_UU, ARENA_UU), material);
      edge.rotation.x = -Math.PI / 2;
      edge.onBeforeRender = () => { material.uniforms.time.value = performance.now() / 1000; };
      edge.userData.offset = offset;
      this.targetGroup.add(edge);
      return edge;
    });
    this.brakingArea = new THREE.Mesh(new THREE.RingGeometry(180 * ARENA_UU, 350 * ARENA_UU, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0.2, depthWrite: false }));
    this.brakingArea.rotation.x = -Math.PI / 2;
    this.targetGroup.add(this.brakingArea);
  }

  setupRound() {
    this.masteryStep ??= 0;
    this.setAttempts ??= [];
    this.setupIndex ??= 0;
    this.setup = this.retrySetup || generateMovementSetup(this.variant, this.masteryStep, this.varied, this.setupIndex++);
    this.retrySetup = null;
    this.spawn([this.setup.position[0], this.setup.position[1], this.hitbox.restZ], null, this.setup.yaw);
    this.physCar.vel.fromArray(this.setup.velocity);
    this.origin = this.physCar.pos.clone();
    this.nextTarget = 0;
    this.hold = 0;
    this.boostTime = 0;
    this.steerTime = 0;
    this.braked = false;
    this.jumped = false;
    this.doubleJumped = false;
    this.flipped = false;
    this.jumpHold = 0;
    this.maxHeight = 0;
    this.dodgeDirection = null;
    this.previousVelocity = this.physCar.vel.clone();
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.physCar.q);
    const right = new THREE.Vector3(0, 1, 0).applyQuaternion(this.physCar.q);
    this.requestedDirection = this.setup.dodge === "backward" ? forward.negate() : this.setup.dodge === "left" ? right.negate() : this.setup.dodge === "right" ? right : forward;
    this.prompt = MOVEMENT_TRAINING[this.variant].steps[this.masteryStep].title;
    this.refreshTargets();
  }

  refreshTargets() {
    if (this.goalAura) {
      const target = this.variant === "driving" && this.setup.targets[this.nextTarget];
      this.goalAura.visible = Boolean(target);
      if (target) {
        this.goalAura.scale.set(this.setup.targetRadius / 180, 1, this.setup.targetRadius / 180);
        physToThree(new THREE.Vector3(...target), this.goalAura.position).multiplyScalar(ARENA_UU);
        this.goalAura.position.y = 0.035;
      }
    }
    this.targetMarkers?.forEach((marker, index) => {
      marker.visible = this.variant === "driving" && index < this.setup.targets.length;
      if (!marker.visible) return;
      marker.scale.setScalar(this.setup.targetRadius / 180);
      physToThree(new THREE.Vector3(...this.setup.targets[index]), marker.position).multiplyScalar(ARENA_UU);
      marker.position.y = 0.035;
      marker.material.color.setHex(index < this.nextTarget ? 0x6cda9a : index === this.nextTarget ? 0xffd166 : 0x83cdec);
    });
    if (!this.routeArrows) return;
    this.routeArrows.forEach(arrow => { arrow.visible = false; });
    const driving = this.variant === "driving";
    const destinations = driving ? this.setup.targets : this.masteryStep >= 3
      ? [this.origin.clone().setZ(0).addScaledVector(this.requestedDirection, this.masteryStep === 3 ? 400 : 300).toArray()] : [];
    let arrowIndex = 0;
    destinations.forEach((destination, leg) => {
      const start = leg ? new THREE.Vector3(...destinations[leg - 1]) : this.origin.clone().setZ(0);
      const end = new THREE.Vector3(...destination);
      const direction = end.clone().sub(start);
      const length = direction.length();
      const count = Math.max(1, Math.floor(length / 200));
      const worldDirection = physToThree(direction.clone().normalize(), new THREE.Vector3());
      for (let index = 0; index < count && arrowIndex < this.routeArrows.length; index++) {
        const arrow = this.routeArrows[arrowIndex++];
        arrow.visible = true;
        physToThree(start.clone().lerp(end, (index + 0.5) / count), arrow.position).multiplyScalar(ARENA_UU);
        arrow.position.y = 0.045;
        arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-worldDirection.x, -worldDirection.z));
        const active = !driving || leg === this.nextTarget;
        arrow.material.color.setHex(driving && leg < this.nextTarget ? 0x6cda9a : active ? 0xffd166 : 0x83cdec);
        arrow.material.opacity = active ? 0.9 : 0.35;
      }
    });
    this.laneEdges.forEach(edge => {
      edge.visible = driving && Boolean(this.setup.laneWidth);
      if (!edge.visible) return;
      const distance = this.setup.targets.at(-1)[1];
      physToThree(new THREE.Vector3(Math.sign(edge.userData.offset) * this.setup.laneWidth, distance / 2, 0), edge.position).multiplyScalar(ARENA_UU);
      edge.position.y = 0.025;
      edge.scale.y = distance;
      edge.material.uniforms.length.value = distance;
    });
    this.brakingArea.visible = driving && this.masteryStep === 3;
    if (this.brakingArea.visible) {
      this.brakingArea.scale.setScalar(this.setup.targetRadius / 180);
      physToThree(new THREE.Vector3(...this.setup.targets[0]), this.brakingArea.position).multiplyScalar(ARENA_UU);
      this.brakingArea.position.y = 0.025;
    }
  }

  evaluateStep(dt, controls) {
    if (this.variant === "driving") return this.evaluateDriving(dt, controls);
    return this.evaluateJump(dt, controls);
  }

  evaluateDriving(dt, controls) {
    const car = this.physCar;
    const step = this.masteryStep;
    const target = new THREE.Vector3(...this.setup.targets[this.nextTarget]);
    const position = car.pos.clone().setZ(0);
    const speed = Math.hypot(car.vel.x, car.vel.y);
    this.boostTime += car.isBoosting ? dt : 0;
    this.steerTime += Math.abs(controls.steer || 0) * dt;
    this.braked ||= controls.throttle < -0.1;
    if (controls.jump || car.hasJumped) return this.finishRound(false, "Keep the wheels down");
    if (step !== 2 && car.isBoosting) return this.finishRound(false, "Throttle only");
    if (this.setup.laneWidth && Math.abs(car.pos.x) > this.setup.laneWidth) return this.finishRound(false, "Left the lane");
    const distance = position.distanceTo(target);
    const radius = this.setup.targetRadius;
    if (this.setup.targets.slice(this.nextTarget + 1).some(destination => position.distanceTo(new THREE.Vector3(...destination)) <= radius)) return this.finishRound(false, "Skipped checkpoint");
    const wheelsDown = car.onGround && new THREE.Vector3(0, 0, 1).applyQuaternion(car.q).z >= 0.92;
    this.progress = Math.max(0, 1 - distance / 2000);
    this.prompt = this.setup.targets.length > 1 ? `Target ${this.nextTarget + 1} / ${this.setup.targets.length}` : step === 3 ? "Brake inside the yellow target" : "Reach the yellow target";
    if (step === 3 && car.pos.y > target.y + 350) return this.finishRound(false, "Overshot the stop");
    if (step === 3) {
      this.hold = wheelsDown && distance <= radius && speed < this.setup.stopSpeed && this.braked ? this.hold + dt : 0;
      if (this.hold >= this.setup.stopHold - 1e-9) this.finishRound(true, "Controlled stop");
      return;
    }
    if (!wheelsDown || distance > radius) return;
    if (step === 1 && this.steerTime < 0.1) return;
    if (speed < this.setup.minSpeed) return this.finishRound(false, "Entered target too slowly");
    if (this.boostTime < this.setup.boostRequired) return this.finishRound(false, "Not enough boost");
    if (step === 2 && !car.isBoosting) return this.finishRound(false, "Boost through each target");
    this.nextTarget += 1;
    this.refreshTargets();
    if (this.nextTarget === this.setup.targets.length) this.finishRound(true, "Route complete");
  }

  evaluateJump(dt, controls) {
    const car = this.physCar;
    const step = this.masteryStep;
    if (car.isBoosting) return this.finishRound(false, "No boost in this stage");
    this.jumped ||= car.hasJumped;
    this.doubleJumped ||= car.hasDoubleJumped;
    if (car.hasFlipped && !this.flipped) {
      this.flipped = true;
      this.dodgeDirection = car.vel.clone().sub(this.previousVelocity).setZ(0).normalize();
      if (step >= 3 && this.dodgeDirection.dot(this.requestedDirection) < Math.cos(Math.PI / 6)) return this.finishRound(false, "Wrong dodge direction");
    }
    this.previousVelocity.copy(car.vel);
    this.jumpHold += car.jumping && controls.jump ? dt : 0;
    this.maxHeight = Math.max(this.maxHeight, car.pos.z - this.origin.z);
    if (step <= 1 && (this.doubleJumped || this.flipped)) return this.finishRound(false, "Single jump only");
    if (step === 2 && this.flipped) return this.finishRound(false, "Neutral second jump required");
    const height = [60, 180, 250, 0, 0][step];
    const travel = car.pos.clone().sub(this.origin).dot(this.requestedDirection);
    const qualified = this.jumped && this.maxHeight >= height && (step !== 1 || this.jumpHold >= 0.18 - 1e-9) && (step !== 2 || this.doubleJumped) && (step < 3 || this.flipped && travel >= (step === 3 ? 400 : 300));
    const upright = new THREE.Vector3(0, 0, 1).applyQuaternion(car.q).z >= 0.92;
    this.hold = qualified && car.onGround && upright && car.omega.length() < 0.6 ? this.hold + dt : 0;
    this.progress = step >= 3 ? Math.max(0, Math.min(1, travel / (step === 3 ? 400 : 300))) : Math.min(1, this.maxHeight / height);
    this.prompt = step >= 3 ? `Dodge ${this.setup.dodge}, then land wheels-down` : "Jump, then land wheels-down";
    if (this.hold >= 0.25 - 1e-9) this.finishRound(true, "Jump and landing complete");
  }

  updateDrillStatus() {
    super.updateDrillStatus();
    if (!this.physCar) return;
    this.ctx.hud.status.textContent = this.ctx.hud.status.textContent.replace(/ · \d+ touches/, '');
    this.ctx.hud.status.textContent += this.variant === "driving" ? ` · ${formatSpeed(Math.hypot(this.physCar.vel.x, this.physCar.vel.y))}` : ` · ${Math.round(this.maxHeight || 0)} uu peak height`;
  }

  stop() {
    disposeScene(this.targetGroup);
    super.stop();
  }
}