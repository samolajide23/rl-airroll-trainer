#include "RocketSim.h"
#include <emscripten/emscripten.h>
#include <memory>
#include <unordered_map>

static std::unique_ptr<RocketSim::Arena> arena;
static RocketSim::Car *car = nullptr;
static float stateValues[20];
static std::vector<RocketSim::FileData> meshFiles;
struct SimWorld
{
    std::unique_ptr<RocketSim::Arena> arena;
    RocketSim::Car *car = nullptr;
    std::vector<RocketSim::Car *> cars;
    float values[80] = {};
};
static std::unordered_map<int, SimWorld> worlds;
static int nextWorld = 1;

extern "C"
{
    EMSCRIPTEN_KEEPALIVE int rs_add_mesh(const byte *data, int length)
    {
        if (RocketSim::GetStage() != RocketSim::RocketSimStage::UNINITIALIZED || !data || length < 1)
            return 0;
        meshFiles.emplace_back(data, data + length);
        return static_cast<int>(meshFiles.size());
    }

    EMSCRIPTEN_KEEPALIVE int rs_create_soccar()
    {
        if (meshFiles.empty())
            return 0;
        RocketSim::InitFromMem({{RocketSim::GameMode::SOCCAR, meshFiles}}, true);
        if (RocketSim::GetArenaCollisionShapes(RocketSim::GameMode::SOCCAR).empty())
            return 0;
        arena.reset(RocketSim::Arena::Create(RocketSim::GameMode::SOCCAR));
        car = arena->AddCar(RocketSim::Team::BLUE);
        return 1;
    }

    EMSCRIPTEN_KEEPALIVE int rs_create()
    {
        RocketSim::InitFromMem({}, true);
        arena.reset(RocketSim::Arena::Create(RocketSim::GameMode::THE_VOID));
        car = arena->AddCar(RocketSim::Team::BLUE);
        RocketSim::CarState initial;
        initial.pos = RocketSim::Vec(0, 0, 2500);
        initial.vel = RocketSim::Vec(1400, 0, 0);
        initial.boost = 100;
        car->SetState(initial);
        return 1;
    }

    EMSCRIPTEN_KEEPALIVE void rs_set_car(float posX, float posY, float posZ,
                                         float velX, float velY, float velZ, float boost)
    {
        if (!car)
            return;
        RocketSim::CarState initial;
        initial.pos = RocketSim::Vec(posX, posY, posZ);
        initial.vel = RocketSim::Vec(velX, velY, velZ);
        initial.boost = boost;
        initial.isOnGround = false;
        car->controls = {};
        car->SetState(initial);
    }

    EMSCRIPTEN_KEEPALIVE void rs_remove_car()
    {
        if (arena && car)
            arena->RemoveCar(car);
        car = nullptr;
    }

    EMSCRIPTEN_KEEPALIVE void rs_set_ball(float posX, float posY, float posZ,
                                          float velX, float velY, float velZ, float spinX, float spinY, float spinZ)
    {
        if (!arena)
            return;
        RocketSim::BallState initial;
        initial.pos = RocketSim::Vec(posX, posY, posZ);
        initial.vel = RocketSim::Vec(velX, velY, velZ);
        initial.angVel = RocketSim::Vec(spinX, spinY, spinZ);
        arena->ball->SetState(initial);
    }

    EMSCRIPTEN_KEEPALIVE void rs_step(int ticks, float throttle, float steer, float pitch,
                                      float yaw, float roll, int jump, int boost, int handbrake)
    {
        if (!arena || ticks < 1 || ticks > 1200)
            return;
        if (car)
        {
            car->controls.throttle = throttle;
            car->controls.steer = steer;
            car->controls.pitch = pitch;
            car->controls.yaw = yaw;
            car->controls.roll = roll;
            car->controls.jump = jump != 0;
            car->controls.boost = boost != 0;
            car->controls.handbrake = handbrake != 0;
        }
        arena->Step(ticks);
    }

    EMSCRIPTEN_KEEPALIVE const float *rs_state()
    {
        if (!arena)
            return nullptr;
        const auto state = car ? car->GetState() : RocketSim::CarState();
        stateValues[0] = state.pos.x;
        stateValues[1] = state.pos.y;
        stateValues[2] = state.pos.z;
        stateValues[3] = state.vel.x;
        stateValues[4] = state.vel.y;
        stateValues[5] = state.vel.z;
        stateValues[6] = state.angVel.x;
        stateValues[7] = state.angVel.y;
        stateValues[8] = state.angVel.z;
        stateValues[9] = state.boost;
        const auto ball = arena->ball->GetState();
        stateValues[10] = ball.pos.x;
        stateValues[11] = ball.pos.y;
        stateValues[12] = ball.pos.z;
        stateValues[13] = ball.vel.x;
        stateValues[14] = ball.vel.y;
        stateValues[15] = ball.vel.z;
        stateValues[16] = ball.angVel.x;
        stateValues[17] = ball.angVel.y;
        stateValues[18] = ball.angVel.z;
        stateValues[19] = state.isOnGround ? 1.f : 0.f;
        return stateValues;
    }

    EMSCRIPTEN_KEEPALIVE void rs_destroy()
    {
        car = nullptr;
        arena.reset();
    }

    EMSCRIPTEN_KEEPALIVE int rs_world_create(int soccar, int preset, int withCar)
    {
        if (RocketSim::GetStage() != RocketSim::RocketSimStage::INITIALIZED)
            return 0;
        const RocketSim::CarConfig *configs[] = {
            &RocketSim::CAR_CONFIG_OCTANE, &RocketSim::CAR_CONFIG_DOMINUS,
            &RocketSim::CAR_CONFIG_PLANK, &RocketSim::CAR_CONFIG_BREAKOUT,
            &RocketSim::CAR_CONFIG_HYBRID, &RocketSim::CAR_CONFIG_MERC};
        if (preset < 0 || preset >= 6)
            return 0;
        SimWorld world;
        world.arena.reset(RocketSim::Arena::Create(soccar ? RocketSim::GameMode::SOCCAR : RocketSim::GameMode::THE_VOID));
        if (withCar)
        {
            world.car = world.arena->AddCar(RocketSim::Team::BLUE, *configs[preset]);
            world.cars.push_back(world.car);
        }
        const int handle = nextWorld++;
        worlds.emplace(handle, std::move(world));
        return handle;
    }

    EMSCRIPTEN_KEEPALIVE void rs_world_destroy(int handle) { worlds.erase(handle); }

    EMSCRIPTEN_KEEPALIVE void rs_world_set_car(int handle, const float *values)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || !found->second.car || !values)
            return;
        auto target = found->second.car;
        RocketSim::CarState state;
        state.pos = {values[0], values[1], values[2]};
        state.vel = {values[3], values[4], values[5]};
        state.angVel = {values[6], values[7], values[8]};
        state.boost = values[9];
        state.rotMat.forward = {values[20], values[21], values[22]};
        state.rotMat.right = {values[23], values[24], values[25]};
        state.rotMat.up = {values[26], values[27], values[28]};
        state.isOnGround = values[19] != 0;
        state.hasJumped = values[29] != 0;
        state.hasDoubleJumped = values[30] != 0;
        state.hasFlipped = values[31] != 0;
        state.isJumping = values[32] != 0;
        state.isFlipping = values[33] != 0;
        state.jumpTime = values[34];
        state.flipTime = values[35];
        state.airTime = values[36];
        state.airTimeSinceJump = values[37];
        state.flipRelTorque = {values[38], values[39], values[40]};
        state.isBoosting = values[41] != 0;
        state.boostingTime = values[42];
        state.isSupersonic = values[43] != 0;
        state.supersonicTime = values[44];
        state.handbrakeVal = values[45];
        state.isAutoFlipping = values[46] != 0;
        state.autoFlipTimer = values[47];
        state.autoFlipTorqueScale = values[48];
        state.lastControls.jump = values[49] != 0;
        state.worldContact.hasContact = values[54] != 0;
        state.worldContact.contactNormal = {values[55], values[56], values[57]};
        state.isDemoed = values[58] != 0;
        state.demoRespawnTimer = values[59];
        for (int index = 0; index < 4; index++)
            state.wheelsWithContact[index] = values[50 + index] != 0;
        target->config.dodgeDeadzone = values[60];
        target->SetState(state);
    }

    EMSCRIPTEN_KEEPALIVE void rs_world_set_ball(int handle, const float *values)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || !values)
            return;
        RocketSim::BallState state;
        state.pos = {values[0], values[1], values[2]};
        state.vel = {values[3], values[4], values[5]};
        state.angVel = {values[6], values[7], values[8]};
        found->second.arena->ball->SetState(state);
    }

    EMSCRIPTEN_KEEPALIVE void rs_world_step(int handle, const float *controls, int infiniteBoost)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || !controls)
            return;
        auto &world = found->second;
        if (world.car)
        {
            auto &input = world.car->controls;
            input.throttle = controls[0];
            input.steer = controls[1];
            input.pitch = controls[2];
            input.yaw = controls[3];
            input.roll = controls[4];
            input.jump = controls[5] != 0;
            input.boost = controls[6] != 0;
            input.handbrake = controls[7] != 0;
            world.car->config.dodgeDeadzone = controls[8];
            if (infiniteBoost)
            {
                world.car->_internalState.boost = 100;
            }
        }
        world.arena->Step();
    }

    EMSCRIPTEN_KEEPALIVE const float *rs_world_state(int handle)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end())
            return nullptr;
        auto &world = found->second;
        auto values = world.values;
        const auto state = world.car ? world.car->GetState() : RocketSim::CarState();
        const auto ball = world.arena->ball->GetState();
        const RocketSim::Vec vectors[] = {state.pos, state.vel, state.angVel, ball.pos, ball.vel, ball.angVel};
        const int offsets[] = {0, 3, 6, 10, 13, 16};
        for (int index = 0; index < 6; index++)
        {
            values[offsets[index]] = vectors[index].x;
            values[offsets[index] + 1] = vectors[index].y;
            values[offsets[index] + 2] = vectors[index].z;
        }
        values[9] = state.boost;
        values[19] = state.isOnGround;
        const RocketSim::Vec basis[] = {state.rotMat.forward, state.rotMat.right, state.rotMat.up};
        for (int index = 0; index < 3; index++)
        {
            values[20 + index * 3] = basis[index].x;
            values[21 + index * 3] = basis[index].y;
            values[22 + index * 3] = basis[index].z;
        }
        values[29] = state.hasJumped;
        values[30] = state.hasDoubleJumped;
        values[31] = state.hasFlipped;
        values[32] = state.isJumping;
        values[33] = state.isFlipping;
        values[34] = state.jumpTime;
        values[35] = state.flipTime;
        values[36] = state.airTime;
        values[37] = state.airTimeSinceJump;
        values[38] = state.flipRelTorque.x;
        values[39] = state.flipRelTorque.y;
        values[40] = state.flipRelTorque.z;
        values[41] = state.isBoosting;
        values[42] = state.boostingTime;
        values[43] = state.isSupersonic;
        values[44] = state.supersonicTime;
        values[45] = state.handbrakeVal;
        values[46] = state.isAutoFlipping;
        values[47] = state.autoFlipTimer;
        values[48] = state.autoFlipTorqueScale;
        values[49] = state.lastControls.jump;
        for (int index = 0; index < 4; index++)
            values[50 + index] = state.wheelsWithContact[index];
        values[54] = state.worldContact.hasContact;
        values[55] = state.worldContact.contactNormal.x;
        values[56] = state.worldContact.contactNormal.y;
        values[57] = state.worldContact.contactNormal.z;
        values[58] = state.isDemoed;
        values[59] = state.demoRespawnTimer;
        values[60] = world.car ? world.car->config.dodgeDeadzone : 0.5f;
        values[61] = state.ballHitInfo.isValid && state.ballHitInfo.tickCountWhenHit + 1 == world.arena->tickCount;
        values[62] = state.ballHitInfo.ballPos.x + state.ballHitInfo.relativePosOnBall.x;
        values[63] = state.ballHitInfo.ballPos.y + state.ballHitInfo.relativePosOnBall.y;
        values[64] = state.ballHitInfo.ballPos.z + state.ballHitInfo.relativePosOnBall.z;
        values[65] = static_cast<float>(world.arena->tickCount);
        values[66] = static_cast<float>(worlds.size());
        return values;
    }

    EMSCRIPTEN_KEEPALIVE const float *rs_world_pad(int handle, int index, int reset)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end())
            return nullptr;
        auto &world = found->second;
        const auto &pads = world.arena->GetBoostPads();
        if (index < 0 || index >= static_cast<int>(pads.size()))
            return nullptr;
        auto pad = pads[index];
        if (reset)
            pad->SetState({});
        const auto state = pad->GetState();
        const auto position = pad->config.pos;
        world.values[70] = position.x;
        world.values[71] = position.y;
        world.values[72] = position.z;
        world.values[73] = state.isActive;
        world.values[74] = state.cooldown;
        return world.values + 70;
    }

    EMSCRIPTEN_KEEPALIVE int rs_world_add_car(int handle, int team, int preset)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || team < 0 || team > 1 || preset < 0 || preset >= 6)
            return -1;
        const RocketSim::CarConfig *configs[] = {
            &RocketSim::CAR_CONFIG_OCTANE, &RocketSim::CAR_CONFIG_DOMINUS,
            &RocketSim::CAR_CONFIG_PLANK, &RocketSim::CAR_CONFIG_BREAKOUT,
            &RocketSim::CAR_CONFIG_HYBRID, &RocketSim::CAR_CONFIG_MERC};
        auto &world = found->second;
        world.cars.push_back(world.arena->AddCar(static_cast<RocketSim::Team>(team), *configs[preset]));
        return static_cast<int>(world.cars.size()) - 1;
    }

    EMSCRIPTEN_KEEPALIVE void rs_world_set_car_at(int handle, int index, const float *values)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || index < 0 || index >= static_cast<int>(found->second.cars.size()))
            return;
        auto &world = found->second;
        auto original = world.car;
        world.car = world.cars[index];
        rs_world_set_car(handle, values);
        world.car = original;
    }

    EMSCRIPTEN_KEEPALIVE const float *rs_world_state_at(int handle, int index)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || index < 0 || index >= static_cast<int>(found->second.cars.size()))
            return nullptr;
        auto &world = found->second;
        auto original = world.car;
        world.car = world.cars[index];
        const auto result = rs_world_state(handle);
        world.car = original;
        return result;
    }

    EMSCRIPTEN_KEEPALIVE int rs_world_controls_at(int handle, int index, const float *controls, int infiniteBoost)
    {
        auto found = worlds.find(handle);
        if (found == worlds.end() || !controls || index < 0 || index >= static_cast<int>(found->second.cars.size()))
            return 0;
        auto target = found->second.cars[index];
        auto &input = target->controls;
        input.throttle = controls[0];
        input.steer = controls[1];
        input.pitch = controls[2];
        input.yaw = controls[3];
        input.roll = controls[4];
        input.jump = controls[5] != 0;
        input.boost = controls[6] != 0;
        input.handbrake = controls[7] != 0;
        target->config.dodgeDeadzone = controls[8];
        if (infiniteBoost)
            target->_internalState.boost = 100;
        return 1;
    }

    EMSCRIPTEN_KEEPALIVE void rs_world_advance(int handle)
    {
        auto found = worlds.find(handle);
        if (found != worlds.end())
            found->second.arena->Step();
    }
}