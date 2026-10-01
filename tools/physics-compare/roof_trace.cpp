#include "RocketSim.h"
#include <iomanip>
#include <iostream>
#include <string>

using namespace RocketSim;

static void PrintVector(const btVector3& vector) {
    std::cout << '[' << vector.x() * 50 << ',' << vector.y() * 50 << ',' << vector.z() * 50 << ']';
}

int main(int argumentCount, char** arguments) {
    if (argumentCount != 2 && argumentCount != 3) return 2;
    RocketSim::Init(arguments[1], true);
    auto arena = Arena::Create(GameMode::SOCCAR);
    auto car = arena->AddCar(Team::BLUE);
    const bool replay = argumentCount == 3 && std::string(arguments[2]) == "replay";
    CarState state;
    state.pos = Vec(-1000, 0, 80);
    state.rotMat = Angle(0, 0, float(M_PI)).ToRotMat();
    state.boost = 100;
    car->SetState(state);
    if (!replay && (argumentCount != 3 || std::string(arguments[2]) != "drive")) arena->Step();
    state = CarState();
    state.pos = Vec(-1000, 0, 80);
    state.vel = Vec(0, 0, -100);
    state.rotMat = Angle(0, 0, float(M_PI)).ToRotMat();
    state.boost = 100;
    car->SetState(state);
    const bool straightDrive = argumentCount == 3 && std::string(arguments[2]) == "drive";
    const bool goalContact = argumentCount == 3 && !straightDrive && !replay;
    if (straightDrive || replay) {
        state = CarState();
        state.pos = Vec(0, -4608, 17);
        state.rotMat = Angle(float(M_PI / 2), 0, 0).ToRotMat();
        state.boost = 33.33333206176758f;
        car->SetState(state);
        car->controls = CarControls();
        arena->Step();
        const auto settled = car->GetState();
        state.pos.z = settled.pos.z;
        car->SetState(state);
        BallState ballState;
        ballState.pos = Vec(0, 0, 93.1500015258789f);
        arena->ball->SetState(ballState);
    }
    if (goalContact) {
        state = CarState();
        state.pos = Vec(815.8279418945312f, 5549.89306640625f, 464.8847961425781f);
        state.vel = Vec(1064.420654296875f, -365.4482727050781f, -206.26368713378906f);
        state.angVel = Vec(0.0030474429950118065f, 0.13740240037441254f, 1.2729005813598633f);
        state.rotMat = RotMat(
            Vec(0.8468338847160339f, 0.5318413376808167f, 0.004139023832976818f),
            Vec(0.5282347798347473f, -0.8419469594955444f, 0.10996901988983154f),
            Vec(0.06197091564536095f, -0.09093911200761795f, -0.9939262866973877f));
        state.boost = 0;
        car->SetState(state);
    }
    std::cout << std::setprecision(12);
    for (int tick = 0; tick < (replay ? 1200 : straightDrive ? 4 : goalContact ? 1 : 180); ++tick) {
        car->controls.jump = tick == 60;
        car->controls.throttle = tick > 60 ? 1 : 0;
        if (straightDrive) {
            car->controls.jump = false;
            car->controls.throttle = 1;
            car->controls.boost = true;
            car->controls.steer = tick == 0 ? 1.2722218725854067e-15f : 0;
        }
        if (replay) {
            int boost, jump, handbrake;
            if (!(std::cin >> car->controls.throttle >> car->controls.steer
                >> car->controls.pitch >> car->controls.yaw >> car->controls.roll
                >> boost >> jump >> handbrake)) return 3;
            car->controls.boost = boost;
            car->controls.jump = jump;
            car->controls.handbrake = handbrake;
        }
        arena->Step();
        if (replay && tick > 3 && (tick < 738 || tick > 750) && (tick < 870 || tick > 886)) continue;
        if (!replay && !straightDrive && !goalContact && (tick < 27 || tick > 34) && (tick < 60 || tick > 74)) continue;
        state = car->GetState();
        std::cout << "{\"tick\":" << tick + 1 << ",\"pos\":";
        PrintVector(car->_rigidBody.getWorldTransform().getOrigin());
        std::cout << ",\"vel\":";
        PrintVector(car->_rigidBody.getLinearVelocity());
        std::cout << ",\"omega\":[" << state.angVel.x << ',' << state.angVel.y << ',' << state.angVel.z << ']';
        if (replay) {
            std::cout << ",\"ballPos\":";
            PrintVector(arena->ball->_rigidBody.getWorldTransform().getOrigin());
            std::cout << ",\"ballVel\":";
            PrintVector(arena->ball->_rigidBody.getLinearVelocity());
        }
        if (straightDrive) {
            std::cout << ",\"wheels\":[";
            for (int wheelIndex = 0; wheelIndex < car->_bulletVehicle.getNumWheels(); ++wheelIndex) {
                const auto& wheel = car->_bulletVehicle.getWheelInfo(wheelIndex);
                if (wheelIndex) std::cout << ',';
                std::cout << "{\"length\":" << wheel.m_raycastInfo.m_suspensionLength * 50
                    << ",\"force\":" << wheel.m_wheelsSuspensionForce * 50
                    << ",\"pushback\":" << wheel.m_extraPushback * 50 << ",\"point\":";
                PrintVector(wheel.m_raycastInfo.m_contactPointWS);
                std::cout << '}';
            }
            std::cout << ']';
        }
        std::cout << ",\"worldContact\":" << state.worldContact.hasContact
            << ",\"autoFlip\":" << state.isAutoFlipping << ",\"contacts\":[";
        bool first = true;
        auto& dispatcher = arena->_bulletWorldParams.collisionDispatcher;
        for (int manifoldIndex = 0; manifoldIndex < dispatcher.getNumManifolds(); ++manifoldIndex) {
            auto manifold = dispatcher.getManifoldByIndexInternal(manifoldIndex);
            const bool carIsFirst = manifold->getBody0() == &car->_rigidBody;
            const bool ballIsFirst = manifold->getBody0() == &arena->ball->_rigidBody;
            const bool carContact = carIsFirst || manifold->getBody1() == &car->_rigidBody;
            const bool ballContact = ballIsFirst || manifold->getBody1() == &arena->ball->_rigidBody;
            if (!carContact && !(replay && ballContact)) continue;
            const bool bodyIsFirst = carContact ? carIsFirst : ballIsFirst;
            for (int pointIndex = 0; pointIndex < manifold->getNumContacts(); ++pointIndex) {
                const auto& point = manifold->getContactPoint(pointIndex);
                if (!first) std::cout << ',';
                first = false;
                std::cout << "{\"body\":\"" << (carContact ? "car" : "ball") << "\",\"depth\":" << point.getDistance() * 50 << ",\"local\":";
                PrintVector(bodyIsFirst ? point.m_localPointA : point.m_localPointB);
                std::cout << ",\"world\":";
                PrintVector(bodyIsFirst ? point.getPositionWorldOnA() : point.getPositionWorldOnB());
                std::cout << ",\"impulse\":" << point.m_appliedImpulse * 50
                    << ",\"triangleA\":" << point.m_index0 << ",\"triangleB\":" << point.m_index1
                    << ",\"friction\":" << point.m_appliedImpulseLateral1 * 50
                    << ",\"normal\":[" << point.m_normalWorldOnB.x() << ',' << point.m_normalWorldOnB.y() << ',' << point.m_normalWorldOnB.z() << ']'
                    << ",\"lifetime\":" << point.getLifeTime() << '}';
            }
        }
        std::cout << "]}\n";
    }
    std::cout << "{\"final\":";
    PrintVector(car->_rigidBody.getWorldTransform().getOrigin());
    std::cout << "}\n";
    delete arena;
}