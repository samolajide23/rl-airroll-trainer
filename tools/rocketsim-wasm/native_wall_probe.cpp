#include "RocketSim.h"
#include <iomanip>
#include <iostream>
#include <memory>
#include <string>
#include <cstdint>

int parityProbe(const char* meshDirectory, int scenario, int ticks = 600, std::uint32_t seed = 12345u) {
    RocketSim::Init(meshDirectory, true);
    std::unique_ptr<RocketSim::Arena> arena(RocketSim::Arena::Create(RocketSim::GameMode::SOCCAR));
    const RocketSim::CarConfig* configs[] = {
        &RocketSim::CAR_CONFIG_OCTANE, &RocketSim::CAR_CONFIG_DOMINUS,
        &RocketSim::CAR_CONFIG_PLANK, &RocketSim::CAR_CONFIG_BREAKOUT,
        &RocketSim::CAR_CONFIG_HYBRID, &RocketSim::CAR_CONFIG_MERC
    };
    auto car = arena->AddCar(RocketSim::Team::BLUE, *configs[scenario % 6]);
    const int variant = scenario / 6;
    RocketSim::CarState initial;
    initial.pos = {variant == 2 ? 3500.f : -700.f, 0, variant == 1 ? 1200.f : 17.f};
    initial.vel = {variant == 1 ? 500.f : 1200.f, 0, 0};
    initial.boost = 37;
    if (variant == 3) { initial.pos = {2900, 3900, 120}; initial.vel = {900, 900, -200}; }
    if (variant == 4) { initial.pos = {850, 4700, 120}; initial.vel = {200, 1200, 0}; }
    if (variant == 5) { initial.pos = {0, 0, 1900}; initial.vel = {700, 0, 900}; }
    if (variant == 6) { initial.pos = {3900, 500, 280}; initial.vel = {500, 300, -600}; }
    if (variant == 7 || variant == 8) { initial.vel = {variant == 7 ? 2299.f : 2301.f, 0, 0}; initial.boost = variant == 7 ? .01f : 0.f; }
    if (variant == 10) { initial.pos.z = 1500; initial.hasJumped = true; initial.jumpTime = .2f; initial.airTimeSinceJump = 1.24f; }
    car->SetState(initial);
    RocketSim::BallState ball;
    ball.pos = {variant == 2 ? 3900.f : 0.f, 0, variant == 1 ? 1200.f : 93.15f};
    if (variant == 3) { ball.pos = {3200, 4200, 200}; ball.vel = {600, 700, -100}; }
    if (variant == 4) { ball.pos = {900, 5000, 200}; ball.vel = {0, 900, 0}; }
    if (variant == 5) { ball.pos = {200, 0, 1850}; ball.vel = {0, 0, 1000}; }
    if (variant == 6) { ball.pos = {3980, 800, 150}; ball.vel = {300, 100, -400}; }
    if (variant == 9) ball.pos.y = 135;
    arena->ball->SetState(ball);
    std::uint32_t random = seed + scenario;
    const auto axis = [&]() {
        random = random * 1664525u + 1013904223u;
        return (static_cast<int>((random >> 16) % 9) - 4) * 0.25f;
    };
    std::cout << std::setprecision(9) << '[';
    for (int tick = 0; tick < ticks; tick++) {
        if (tick % 12 == 0) {
            car->controls = {};
            car->controls.throttle = axis();
            car->controls.steer = axis();
            car->controls.pitch = axis();
            car->controls.yaw = axis();
            car->controls.roll = axis();
            car->controls.boost = axis() > 0;
            car->controls.jump = axis() > 0.5f;
            car->controls.handbrake = axis() > 0.5f;
        }
        if (variant == 7 || variant == 8) { car->controls = {}; car->controls.throttle = 1; car->controls.boost = true; }
        if (variant == 10) { car->controls = {}; car->controls.jump = tick == 3; car->controls.pitch = -1; }
        arena->Step();
        const auto state = car->GetState();
        const auto ballState = arena->ball->GetState();
        if (tick) std::cout << ',';
        std::cout << '[' << tick;
        for (const auto value : {state.pos, state.vel, state.angVel, state.rotMat.forward, state.rotMat.right, state.rotMat.up, ballState.pos, ballState.vel, ballState.angVel})
            std::cout << ',' << value.x << ',' << value.y << ',' << value.z;
        std::cout << ',' << state.boost << ',' << state.isOnGround << ',' << state.hasJumped << ',' << state.hasDoubleJumped << ',' << state.hasFlipped << ',' << state.isFlipping;
        for (const auto contact : state.wheelsWithContact) std::cout << ',' << contact;
        std::cout << ',' << state.jumpTime << ',' << state.flipTime << ',' << state.airTimeSinceJump;
        std::cout << ',' << state.isJumping << ',' << state.airTime;
        for (const auto value : {state.flipRelTorque}) std::cout << ',' << value.x << ',' << value.y << ',' << value.z;
        std::cout << ',' << state.isBoosting << ',' << state.boostingTime << ',' << state.isSupersonic << ',' << state.supersonicTime << ',' << state.handbrakeVal;
        std::cout << ',' << state.isAutoFlipping << ',' << state.autoFlipTimer << ',' << state.autoFlipTorqueScale << ',' << state.lastControls.jump;
        std::cout << ',' << state.worldContact.hasContact << ',' << state.worldContact.contactNormal.x << ',' << state.worldContact.contactNormal.y << ',' << state.worldContact.contactNormal.z;
        std::cout << ',' << state.isDemoed << ',' << state.demoRespawnTimer;
        std::cout << ',' << (state.ballHitInfo.isValid && state.ballHitInfo.tickCountWhenHit + 1 == arena->tickCount) << ']';
    }
    std::cout << "]\n";
    return 0;
}

int flipResetProbe(const char* meshDirectory, bool withBall) {
    RocketSim::Init(meshDirectory, true);
    std::unique_ptr<RocketSim::Arena> arena(RocketSim::Arena::Create(RocketSim::GameMode::THE_VOID));
    auto car = arena->AddCar(RocketSim::Team::BLUE);
    RocketSim::CarState initial;
    initial.pos = {0, 0, 880};
    initial.vel = {0, 0, 300};
    initial.rotMat.forward = {1, 0, 0};
    initial.rotMat.right = {0, -1, 0};
    initial.rotMat.up = {0, 0, -1};
    initial.hasJumped = true;
    initial.hasFlipped = true;
    initial.jumpTime = 0.3f;
    initial.airTimeSinceJump = 2.f;
    car->SetState(initial);
    RocketSim::BallState ball;
    ball.pos = withBall ? RocketSim::Vec(13.8757f, 0, 1000) : RocketSim::Vec(0, 0, 100000);
    arena->ball->SetState(ball);
    std::cout << std::setprecision(9) << "[";
    for (int tick = 0; tick <= 90; tick++) {
        const auto state = car->GetState();
        const auto ballState = arena->ball->GetState();
        if (tick) std::cout << ',';
        std::cout << '[' << tick;
        for (const auto vector : {state.pos, state.vel, state.angVel, state.rotMat.forward, state.rotMat.right, state.rotMat.up, ballState.pos, ballState.vel, ballState.angVel})
            std::cout << ',' << vector.x << ',' << vector.y << ',' << vector.z;
        std::cout << ',' << state.hasJumped << ',' << state.hasFlipped << ',' << state.isOnGround << ',' << state.isFlipping;
        for (const auto contact : state.wheelsWithContact) std::cout << ',' << contact;
        std::cout << ']';
        car->controls = {};
        car->controls.jump = tick == 30 || tick == 42;
        car->controls.pitch = tick == 42 ? -1.f : 0.f;
        if (tick < 90) arena->Step();
    }
    std::cout << "]\n";
    return 0;
}

int lifecycleProbe(const char* meshDirectory, int scenario) {
    RocketSim::Init(meshDirectory, true);
    std::unique_ptr<RocketSim::Arena> arena(RocketSim::Arena::Create(RocketSim::GameMode::SOCCAR));
    const RocketSim::CarConfig* configs[] = {&RocketSim::CAR_CONFIG_OCTANE, &RocketSim::CAR_CONFIG_DOMINUS, &RocketSim::CAR_CONFIG_PLANK, &RocketSim::CAR_CONFIG_BREAKOUT, &RocketSim::CAR_CONFIG_HYBRID, &RocketSim::CAR_CONFIG_MERC};
    const int preset = scenario >= 60 ? (scenario - 60) / 9 : scenario / 10;
    scenario = scenario >= 60 ? 10 + (scenario - 60) % 9 : scenario % 10;
    auto blue = arena->AddCar(RocketSim::Team::BLUE, *configs[preset]);
    auto orange = arena->AddCar(scenario == 9 ? RocketSim::Team::BLUE : RocketSim::Team::ORANGE, *configs[preset]);
    RocketSim::CarState first, second;
    first.pos = {-300, 0, 17}; first.vel = {scenario == 1 ? 2200.f : 1200.f, 0, 0}; first.boost = 0;
    second.pos = {0, 0, 17}; second.boost = 0;
    if (scenario == 1 || scenario == 9) { first.pos.x = -160; first.vel.x = 2300; first.isSupersonic = true; first.supersonicTime = 1; }
    int padIndex = -1;
    if (scenario == 3 || scenario == 4) {
        const auto& pads = arena->GetBoostPads();
        for (int index = 0; index < static_cast<int>(pads.size()); index++) {
            if (pads[index]->config.isBig == (scenario == 4)) { padIndex = index; break; }
        }
        first.pos = pads[padIndex]->config.pos + RocketSim::Vec(-200, 0, 17);
        first.vel = {1000, 0, 0}; second.pos = {0, 3000, 17};
    }
    if (scenario == 2) {
        first.pos = {-1000, 0, 17}; first.vel = {};
        second.pos = {1000, 0, 17}; second.isDemoed = true; second.demoRespawnTimer = .25f;
    }
    if (scenario >= 5 && scenario <= 8) {
        first.pos = {-1000, 0, scenario == 8 ? 500.f : 17.f};
        first.vel = {}; first.boost = 50; second.pos = {0, 3000, 17};
    }
    RocketSim::BallState ball; ball.pos = {0, 0, 1500};
    if (scenario >= 10) {
        first.pos = {-1000, 0, 17}; first.vel = {}; first.boost = 100;
        second.pos = {0, 3000, 17};
        if (scenario == 10) first.vel.x = -500;
        if (scenario == 11 || scenario == 12) first.vel.x = 800;
        if (scenario == 13) {
            first.pos = {0, 0, 1850}; first.vel = {0, 0, 700};
            first.rotMat.right = {0, -1, 0}; first.rotMat.up = {0, 0, -1};
            first.hasJumped = true; first.hasFlipped = true; first.flipTime = 2; first.airTimeSinceJump = 2;
        }
        if (scenario == 14 || scenario == 15) {
            first.vel.x = 700;
            ball.pos = first.pos + RocketSim::Vec(10, 0, 125); ball.vel = first.vel;
        }
        if (scenario == 16) {
            first.pos = {-1000, 0, 700}; first.vel = {500, 0, 0};
            ball.pos = {-850, 0, 740}; ball.vel = {450, 0, 0};
        }
        if (scenario == 17) {
            first.pos = {3450, 0, 700}; first.vel = {1000, 0, 0};
            ball.pos = {3620, 0, 710}; ball.vel = {1000, 0, 0};
            if (preset == 0) {
                first.pos = {0, 4474, 900}; first.vel = {0, 1000, 0};
                first.rotMat.forward = {0, 1, 0}; first.rotMat.right = {-1, 0, 0};
                ball.pos = {0, 4644, 910}; ball.vel = {0, 1000, 0};
            }
        }
        if (scenario == 18) {
            first.pos = {3830, 0, 100}; first.vel = {2000, 0, 0};
            ball.pos = {3980, 0, 100};
            if (preset == 0) {
                first.pos = {3830, -80, 100}; first.vel = {2000, 600, 0};
                first.rotMat.forward = {.95533649f, .29552021f, 0};
                first.rotMat.right = {-.29552021f, .95533649f, 0};
                ball.pos = {4004, 0, 100};
            }
        }
    }
    blue->SetState(first); orange->SetState(second); arena->ball->SetState(ball);
    const auto emitCar = [](const RocketSim::CarState& state) {
        std::cout << '[';
        bool separator = false;
        for (const auto vector : {state.pos, state.vel, state.angVel, state.rotMat.forward, state.rotMat.right, state.rotMat.up}) {
            if (separator) std::cout << ',';
            std::cout << vector.x << ',' << vector.y << ',' << vector.z; separator = true;
        }
        std::cout << ',' << state.boost << ',' << state.isOnGround << ',' << state.isDemoed << ',' << state.demoRespawnTimer;
        for (const auto wheel : state.wheelsWithContact) std::cout << ',' << wheel;
        std::cout << ',' << state.hasJumped << ',' << state.hasDoubleJumped << ',' << state.hasFlipped << ',' << state.isFlipping;
        std::cout << ',' << state.jumpTime << ',' << state.flipTime << ',' << state.airTime << ',' << state.airTimeSinceJump;
        std::cout << ',' << state.ballHitInfo.isValid << ',' << state.ballHitInfo.tickCountWhenHit;
        std::cout << ']';
    };
    std::cout << std::setprecision(9) << "{\"pad\":" << padIndex << ",\"initial\":[";
    emitCar(first); std::cout << ','; emitCar(second);
    std::cout << "],\"ball\":[" << ball.pos.x << ',' << ball.pos.y << ',' << ball.pos.z << ',' << ball.vel.x << ',' << ball.vel.y << ',' << ball.vel.z << "],\"frames\":[";
    const int ticks = scenario == 3 || scenario == 4 ? 1440 : scenario >= 5 ? 720 : 480;
    int flickCarryTicks = 0, flickJumpTick = -1, flickDodgeTick = -1;
    for (int tick = 0; tick < ticks; tick++) {
        blue->controls = {}; orange->controls = {};
        if (scenario >= 5 && scenario <= 7) {
            blue->controls.throttle = scenario == 7 ? -1.f : 1.f;
            blue->controls.jump = (tick >= 30 && tick < 50) || tick == 70;
            if (tick == 70) {
                blue->controls.pitch = scenario == 7 ? 1.f : -1.f;
                blue->controls.yaw = scenario == 6 ? 1.f : 0.f;
            }
            if (tick >= 85 && tick < 120 && scenario != 5) {
                blue->controls.pitch = scenario == 7 ? -1.f : 1.f;
                blue->controls.roll = scenario == 7 ? 1.f : 0.f;
            }
            blue->controls.handbrake = tick >= 120;
        }
        if (scenario == 8) blue->controls.boost = tick < 60;
        if (scenario >= 10) {
            const auto state = blue->GetState();
            const auto currentBall = arena->ball->GetState();
            auto& input = blue->controls;
            const auto clamp = [](float value) { return std::max(-1.f, std::min(1.f, value)); };
            if (scenario == 10 || scenario == 11) {
                const int age = tick - 30;
                input.throttle = scenario == 10 && age < 65 ? -1.f : 1.f;
                input.jump = age >= 0 && (age < 6 || (age >= 12 && age < 15));
                input.pitch = age >= 12 && age < (scenario == 10 ? 36 : 16) ? (scenario == 10 ? 1.f : -1.f)
                    : age >= (scenario == 10 ? 36 : 16) && age < 92 ? (scenario == 10 ? -1.f : 1.f) : 0.f;
                input.yaw = scenario == 11 && age >= 12 && age < 16 ? .25f : 0.f;
                if (age >= 40 && !state.isOnGround) input.roll = clamp(std::atan2(state.rotMat.right.z, state.rotMat.up.z) * 3 + state.angVel.Dot(state.rotMat.forward) * .8f);
                if (age >= 92 && !state.isOnGround) input.pitch = clamp(state.rotMat.forward.z * 4 + state.angVel.Dot(state.rotMat.right) * .5f);
                input.boost = scenario == 11 && state.rotMat.forward.x > .95f && std::abs(state.rotMat.forward.z) < .15f;
                if (scenario == 11 && age >= 40) {
                    const float heading = std::atan2(state.rotMat.forward.y, state.rotMat.forward.x);
                    if (state.isOnGround) input.steer = clamp(-heading * 3);
                    else input.yaw = clamp(-heading * 3 - state.angVel.Dot(state.rotMat.up) * .8f);
                }
                input.handbrake = scenario == 10 && state.isOnGround && age > 60;
            }
            if (scenario == 12) {
                input.throttle = 1; input.jump = tick >= 30 && tick < 33;
                input.pitch = tick >= 33 && tick < 46 ? .35f : 0.f;
                if (tick > 48 && !state.isOnGround && state.vel.z < 0 && state.pos.z < 55 && !state.hasFlipped) { input.jump = true; input.pitch = -1; }
            }
            if (scenario == 13) {
                input.jump = tick > 50 && !state.hasFlipped && state.pos.z < 1900;
                input.pitch = input.jump ? -1.f : 0.f;
            }
            if (scenario == 14 || scenario == 15) {
                input.throttle = clamp((currentBall.vel.x - state.vel.x) * .01f + (currentBall.pos.x - state.pos.x - 10) * .01f);
                if (scenario == 15) {
                    const auto offset = currentBall.pos - state.pos;
                    const bool carrying = state.isOnGround && std::abs(offset.x) < 80 && std::abs(offset.y) < 30
                        && offset.z > 110 && offset.z < 160 && (currentBall.vel - state.vel).Length() < 350;
                    flickCarryTicks = carrying ? flickCarryTicks + 1 : 0;
                    if (flickJumpTick < 0 && flickCarryTicks >= 30) flickJumpTick = tick;
                    if (flickJumpTick >= 0) {
                        const int age = tick - flickJumpTick;
                        input.throttle = 1;
                        input.jump = age < 6;
                        input.pitch = age >= 6 ? 1.f : 0.f;
                        if (flickDodgeTick < 0 && age >= 8 && !state.isOnGround && !state.hasFlipped
                            && offset.z > 40 && offset.z < 160 && std::abs(offset.x) < 110) flickDodgeTick = tick;
                        if (flickDodgeTick >= 0) input.jump = tick == flickDodgeTick;
                    }
                }
            }
            if (scenario == 16) {
                const float angle = std::atan2(currentBall.pos.z - state.pos.z - 70, currentBall.pos.x - state.pos.x);
                const float elevation = std::atan2(state.rotMat.forward.z, state.rotMat.forward.x);
                input.pitch = clamp((elevation - angle) * 3 + state.angVel.Dot(state.rotMat.right) * .8f);
                input.boost = currentBall.pos.x > state.pos.x && tick % 24 < 16;
            }
            if (scenario == 17) { input.pitch = tick > 30 ? 1.f : 0.f; input.boost = tick < 30; }
            if (scenario == 18) input.boost = tick < 30;
        }
        arena->Step();
        if (tick) std::cout << ',';
        std::cout << '['; emitCar(blue->GetState()); std::cout << ','; emitCar(orange->GetState());
        if (padIndex >= 0) {
            const auto pad = arena->GetBoostPads()[padIndex]->GetState();
            std::cout << ",[" << pad.isActive << ',' << pad.cooldown << ']';
        } else std::cout << ",null";
        const auto input = blue->controls;
        std::cout << ",[" << input.throttle << ',' << input.steer << ',' << input.pitch << ',' << input.yaw << ',' << input.roll << ',' << input.jump << ',' << input.boost << ',' << input.handbrake << ']';
        const auto ballState = arena->ball->GetState();
        std::cout << ",[" << ballState.pos.x << ',' << ballState.pos.y << ',' << ballState.pos.z
            << ',' << ballState.vel.x << ',' << ballState.vel.y << ',' << ballState.vel.z
            << ',' << ballState.angVel.x << ',' << ballState.angVel.y << ',' << ballState.angVel.z << ']';
        std::cout << ']';
    }
    std::cout << "]}\n";
    return 0;
}

int main(int argc, char** argv) {
    if (argc != 3 && argc != 4 && argc != 6) return 2;
    const std::string id = argv[2];
    if (id == "lifecycle_parity" && argc == 4) return lifecycleProbe(argv[1], std::stoi(argv[3]));
    if (id == "cosine_random_parity") {
        std::uint32_t random = 12345u;
        std::cout << std::setprecision(9);
        for (int sample = 0; sample < 65536; sample++) {
            random = random * 1664525u + 1013904223u;
            const float angle = static_cast<float>(random) / 4294967296.f * .03f;
            std::cout << angle << ',' << cosf(angle) << '\n';
        }
        return 0;
    }
    if (id == "cosine_parity" || id == "sine_parity") {
        std::cout << std::setprecision(9);
        for (int sample = 0; sample <= 8192; sample++) {
            const float angle = sample / 524288.f;
            std::cout << angle << ',' << (id == "sine_parity" ? sinf(angle) : cosf(angle)) << '\n';
        }
        return 0;
    }
    if (id == "deterministic_parity" && argc == 4) return parityProbe(argv[1], std::stoi(argv[3]));
    if (id == "deterministic_parity" && argc == 6) return parityProbe(argv[1], std::stoi(argv[3]), std::stoi(argv[4]), static_cast<std::uint32_t>(std::stoul(argv[5])));
    if (id == "flip_reset_ball" || id == "flip_reset_control") return flipResetProbe(argv[1], id == "flip_reset_ball");
    const bool jumpCase = id == "ground_jump_into_wall";
    if (!jumpCase && id != "wall_drive_throttle_3s") return 2;
    RocketSim::Init(argv[1], true);
    std::unique_ptr<RocketSim::Arena> arena(RocketSim::Arena::Create(RocketSim::GameMode::SOCCAR));
    auto car = arena->AddCar(RocketSim::Team::BLUE);
    const float startX = jumpCase ? 3600.f : 3000.f;
    const auto restore = [&](RocketSim::Vec position) {
        RocketSim::CarState state;
        state.pos = position;
        state.rotMat = RocketSim::Angle(0, 0, 0).ToRotMat();
        state.boost = 100;
        car->SetState(state);
    };
    restore({startX, 0, 17});
    car->controls = {};
    arena->Step(240);
    restore({startX, 0, car->GetState().pos.z});
    arena->Step();
    restore(car->GetState().pos);
#ifdef USE_SIMD
    if (argc == 4 && std::string(argv[3]) == "--sse2") {
        auto solver = static_cast<btSequentialImpulseConstraintSolver*>(arena->_bulletWorld.getConstraintSolver());
        solver->setConstraintRowSolverGeneric(solver->getSSE2ConstraintRowSolverGeneric());
        solver->setConstraintRowSolverLowerLimit(solver->getSSE2ConstraintRowSolverLowerLimit());
    }
#endif
    std::cout << std::setprecision(9);
    const int ticks = jumpCase ? 180 : 360;
    for (int tick = 0; tick <= ticks; tick++) {
        const auto state = car->GetState();
        std::cout << tick;
        for (const auto vector : {state.pos, state.vel, state.angVel, state.rotMat.forward, state.rotMat.right, state.rotMat.up})
            std::cout << ',' << vector.x << ',' << vector.y << ',' << vector.z;
        std::cout << ',' << state.boost << ',' << state.isOnGround << '\n';
        if (tick < ticks) {
            car->controls = {};
            car->controls.throttle = 1;
            car->controls.jump = jumpCase && tick < 3;
            car->controls.boost = jumpCase && tick >= 3;
            arena->Step();
        }
    }
}