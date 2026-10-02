#include "RocketSim.h"
#include <bit>
#include <iomanip>
#include <iostream>
#include <string>

using namespace RocketSim;

static btSingleConstraintRowSolver tracedNormalSolver;
static btSingleConstraintRowSolver tracedFrictionSolver;

static btScalar TraceConstraintRow(btSolverBody& bodyA, btSolverBody& bodyB, const btSolverConstraint& row, bool friction) {
    const auto& component = row.m_angularComponentA;
    const auto& cross = row.m_relpos1CrossNormal;
    std::cout << "{\"stage\":\"ceilingRow\",\"friction\":" << friction
        << ",\"inverse\":" << row.m_jacDiagABInv << ",\"rhs\":" << row.m_rhs
        << ",\"component\":[" << component.x() << ',' << component.y() << ',' << component.z()
        << "],\"cross\":[" << cross.x() << ',' << cross.y() << ',' << cross.z()
        << "],\"before\":" << btScalar(row.m_appliedImpulse);
    const auto residual = (friction ? tracedFrictionSolver : tracedNormalSolver)(bodyA, bodyB, row);
    const auto& linear = bodyA.internalGetDeltaLinearVelocity();
    const auto& angular = bodyA.internalGetDeltaAngularVelocity();
    std::cout << ",\"after\":" << btScalar(row.m_appliedImpulse)
        << ",\"linear\":[" << linear.x() << ',' << linear.y() << ',' << linear.z()
        << "],\"angular\":[" << angular.x() << ',' << angular.y() << ',' << angular.z() << "]}\n";
    return residual;
}

static void PrintVector(const btVector3& vector) {
    std::cout << '[' << vector.x() * 50 << ',' << vector.y() * 50 << ',' << vector.z() * 50 << ']';
}

static void PrintSuspensionTerms(const btWheelInfoRL& wheel) {
    const float compression = wheel.getSuspensionRestLength() - wheel.m_raycastInfo.m_suspensionLength;
    const float stiffnessProduct = compression * wheel.m_suspensionStiffness;
    const float spring = stiffnessProduct * wheel.m_clippedInvContactDotSuspension;
    const float damping = wheel.m_suspensionRelativeVelocity < 0 ? wheel.m_wheelsDampingCompression : wheel.m_wheelsDampingRelaxation;
    const float dampingProduct = damping * wheel.m_suspensionRelativeVelocity;
    std::cout << ",\"nativePushback\":" << wheel.m_extraPushback
        << ",\"steerAngle\":" << wheel.m_steerAngle
        << ",\"axle\":[" << wheel.m_worldTransform.getBasis().getColumn(1).x() << ',' << wheel.m_worldTransform.getBasis().getColumn(1).y() << ',' << wheel.m_worldTransform.getBasis().getColumn(1).z() << ']'
        << ",\"latFriction\":" << wheel.m_latFriction << ",\"longFriction\":" << wheel.m_longFriction
        << ",\"nativeImpulse\":[" << wheel.m_impulse.x() << ',' << wheel.m_impulse.y() << ',' << wheel.m_impulse.z() << ']'
        << ",\"terms\":{\"rest\":" << wheel.getSuspensionRestLength()
        << ",\"length\":" << wheel.m_raycastInfo.m_suspensionLength
        << ",\"inverseContact\":" << wheel.m_clippedInvContactDotSuspension
        << ",\"relativeVelocity\":" << wheel.m_suspensionRelativeVelocity
        << ",\"stiffness\":" << wheel.m_suspensionStiffness
        << ",\"damping\":" << damping << ",\"scale\":" << wheel.m_suspensionForceScale
        << ",\"compression\":" << compression << ",\"stiffnessProduct\":" << stiffnessProduct
        << ",\"spring\":" << spring << ",\"dampingProduct\":" << dampingProduct
        << ",\"net\":" << spring - dampingProduct
        << ",\"force\":" << wheel.m_wheelsSuspensionForce << '}';
}

static void PrintWheelState(Car* car, const char* stage) {
    std::cout << std::setprecision(17) << "{\"stage\":\"" << stage << "\",\"pos\":";
    PrintVector(car->_rigidBody.getWorldTransform().getOrigin());
    std::cout << ",\"vel\":";
    PrintVector(car->_rigidBody.getLinearVelocity());
    const auto omega = car->_rigidBody.getAngularVelocity();
    std::cout << ",\"omega\":[" << omega.x() << ',' << omega.y() << ',' << omega.z() << ']';
    std::cout << ",\"wheels\":[";
    for (int index = 0; index < car->_bulletVehicle.getNumWheels(); ++index) {
        const auto& wheel = car->_bulletVehicle.getWheelInfo(index);
        if (index) std::cout << ',';
        std::cout << "{\"length\":" << wheel.m_raycastInfo.m_suspensionLength * 50
            << ",\"force\":" << wheel.m_wheelsSuspensionForce * 50
            << ",\"pushback\":" << wheel.m_extraPushback * 50
            << ",\"contact\":" << wheel.m_raycastInfo.m_isInContact;
        const btVector3 vectors[] = { wheel.m_raycastInfo.m_hardPointWS,
            wheel.m_raycastInfo.m_contactPointWS, wheel.m_raycastInfo.m_contactNormalWS };
        const char* names[] = { "hardPoint", "nativePoint", "normal" };
        for (int vectorIndex = 0; vectorIndex < 3; ++vectorIndex) {
            const auto& vector = vectors[vectorIndex];
            std::cout << ",\"" << names[vectorIndex] << "\":[" << vector.x() << ','
                << vector.y() << ',' << vector.z() << ']';
        }
        PrintSuspensionTerms(wheel);
        std::cout << '}';
    }
    std::cout << "]}\n";
}

int main(int argumentCount, char** arguments) {
    if (argumentCount != 2 && argumentCount != 3) return 2;
    if (argumentCount == 2 && std::string(arguments[1]) == "angular-math") {
        std::cout << std::setprecision(17);
        float values[12];
        while (std::cin >> values[0]) {
            for (int index = 1; index < 12; ++index) if (!(std::cin >> values[index])) return 3;
            btMatrix3x3 matrix(values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8]);
            const btVector3 desired(values[9], values[10], values[11]);
            const auto inverse = matrix.inverse();
            const auto torque = inverse * desired;
            const auto acceleration = matrix * torque;
            std::cout << "{\"inverse\":[";
            for (int row = 0; row < 3; ++row) {
                if (row) std::cout << ',';
                std::cout << '[' << inverse[row].x() << ',' << inverse[row].y() << ',' << inverse[row].z() << ']';
            }
            std::cout << "],\"torque\":[" << torque.x() << ',' << torque.y() << ',' << torque.z()
                << "],\"acceleration\":[" << acceleration.x() << ',' << acceleration.y() << ',' << acceleration.z() << "]}\n";
        }
        return 0;
    }
    if (argumentCount == 2 && std::string(arguments[1]) == "rsqrt-table") {
        for (int mantissaBits = 10; mantissaBits <= 13; ++mantissaBits) {
            const unsigned stride = 1u << (23 - mantissaBits);
            bool exact = true;
            for (unsigned parity = 0; parity < 2 && exact; ++parity) {
                float expected = 0;
                for (unsigned mantissa = 0; mantissa < (1u << 23); ++mantissa) {
                    const float input = std::bit_cast<float>(((127u + parity) << 23) | mantissa);
                    const float actual = _mm_cvtss_f32(_mm_rsqrt_ss(_mm_set_ss(input)));
                    if (mantissa % stride == 0) expected = actual;
                    if (actual != expected) { exact = false; break; }
                }
            }
            if (!exact) continue;
            std::cout << std::setprecision(17) << "{\"mantissaBits\":" << mantissaBits << ",\"values\":[";
            for (unsigned parity = 0; parity < 2; ++parity) {
                for (unsigned mantissa = 0; mantissa < (1u << 23); mantissa += stride) {
                    if (parity || mantissa) std::cout << ',';
                    const float input = std::bit_cast<float>(((127u + parity) << 23) | mantissa);
                    std::cout << _mm_cvtss_f32(_mm_rsqrt_ss(_mm_set_ss(input)));
                }
            }
            std::cout << "]}\n";
            return 0;
        }
        return 4;
    }
    if (argumentCount == 2 && std::string(arguments[1]) == "normalize-stages") {
        std::cout << std::setprecision(17);
        float coordinates[3];
        while (std::cin >> coordinates[0] >> coordinates[1] >> coordinates[2]) {
            btVector3 normal(coordinates[0], coordinates[1], coordinates[2]);
            for (int pass = 0; pass < 2; ++pass) {
                __m128 squared = _mm_mul_ps(normal.mVec128, normal.mVec128);
                const __m128 third = _mm_movehl_ps(squared, squared);
                const __m128 second = _mm_shuffle_ps(squared, squared, 0x55);
                squared = _mm_add_ss(_mm_add_ss(squared, second), third);
                const __m128 estimate = _mm_rsqrt_ss(squared);
                const __m128 half = _mm_mul_ss(squared, _mm_set_ss(0.5f));
                const __m128 firstProduct = _mm_mul_ss(half, estimate);
                const __m128 secondProduct = _mm_mul_ss(firstProduct, estimate);
                const __m128 correction = _mm_sub_ss(_mm_set_ss(1.5f), secondProduct);
                const __m128 inverse = _mm_mul_ss(estimate, correction);
                std::cout << "{\"pass\":" << pass << ",\"input\":["
                    << normal.x() << ',' << normal.y() << ',' << normal.z()
                    << "],\"squared\":" << _mm_cvtss_f32(squared)
                    << ",\"estimate\":" << _mm_cvtss_f32(estimate)
                    << ",\"half\":" << _mm_cvtss_f32(half)
                    << ",\"firstProduct\":" << _mm_cvtss_f32(firstProduct)
                    << ",\"secondProduct\":" << _mm_cvtss_f32(secondProduct)
                    << ",\"correction\":" << _mm_cvtss_f32(correction)
                    << ",\"inverse\":" << _mm_cvtss_f32(inverse);
                normal.normalize();
                std::cout << ",\"output\":[" << normal.x() << ',' << normal.y()
                    << ',' << normal.z() << "]}\n";
            }
        }
        return 0;
    }
    if (argumentCount == 2 && std::string(arguments[1]) == "normals") {
        std::cout << std::setprecision(17) << '[';
        float coordinates[9];
        bool first = true;
        while (std::cin >> coordinates[0]) {
            for (int index = 1; index < 9; ++index) {
                if (!(std::cin >> coordinates[index])) return 3;
            }
            btVector3 vertices[3];
            for (int index = 0; index < 3; ++index) {
                vertices[index] = btVector3(coordinates[index * 3],
                    coordinates[index * 3 + 1], coordinates[index * 3 + 2]);
            }
            btVector3 normal = (vertices[1] - vertices[0]).cross(vertices[2] - vertices[0]);
            normal.normalize();
            normal.normalize();
            if (!first) std::cout << ',';
            first = false;
            std::cout << normal.x() << ',' << normal.y() << ',' << normal.z();
        }
        std::cout << ']';
        return 0;
    }
    RocketSim::Init(arguments[1], true);
    auto arena = Arena::Create(GameMode::SOCCAR);
    if (argumentCount == 3 && std::string(arguments[2]) == "mesh-order") {
        struct QueryOrder : btTriangleCallback {
            void processTriangle(btVector3* vertices, int part, int triangle) override {
                std::cout << "{\"triangle\":" << triangle << ",\"vertices\":[";
                for (int vertex = 0; vertex < 3; ++vertex) {
                    if (vertex) std::cout << ',';
                    std::cout << '[' << vertices[vertex].x() << ',' << vertices[vertex].y() << ',' << vertices[vertex].z() << ']';
                }
                std::cout << "]}\n";
            }
        } callback;
        std::cout << std::setprecision(17);
        for (auto* mesh : arena->_worldCollisionBvhShapes)
            mesh->processAllTriangles(&callback, btVector3(-1000, -1000, -1000), btVector3(1000, 1000, 1000));
        return 0;
    }
    if (argumentCount == 3 && (std::string(arguments[2]) == "ball-wall" || std::string(arguments[2]) == "ball-goal" || std::string(arguments[2]) == "ball-nose")) {
        const bool ballGoal = std::string(arguments[2]) == "ball-goal";
        const bool ballNose = std::string(arguments[2]) == "ball-nose";
        static const auto originalContactAdded = gContactAddedCallback;
        if (ballGoal) gContactAddedCallback = [](btManifoldPoint& point, const btCollisionObjectWrapper* first, int firstPart, int firstIndex,
            const btCollisionObjectWrapper* second, int secondPart, int secondIndex) {
            const bool result = originalContactAdded(point, first, firstPart, firstIndex, second, secondPart, secondIndex);
            std::cerr << std::setprecision(17) << "{\"addedTriangle\":" << secondIndex
                << ",\"localA\":[" << point.m_localPointA.x() << ',' << point.m_localPointA.y() << ',' << point.m_localPointA.z()
                << "],\"normal\":[" << point.m_normalWorldOnB.x() << ',' << point.m_normalWorldOnB.y() << ',' << point.m_normalWorldOnB.z()
                << "],\"distance\":" << point.getDistance() << "}\n";
            return result;
        };
        BallState initial;
        initial.pos = ballGoal ? Vec(0, 4800, 300) : Vec(3900, 0, 1000);
        initial.vel = ballGoal ? Vec(0, 1500, 0) : Vec(1500, 200, 0);
        Car* contactCar = nullptr;
        if (ballNose) {
            contactCar = arena->AddCar(Team::BLUE);
            CarState initialCar;
            initialCar.pos = Vec(0, 0, 1000);
            initialCar.vel = Vec(1000, 0, 0);
            initialCar.boost = 100;
            contactCar->SetState(initialCar);
            initial.pos = Vec(260, 0, 1020.755f);
            initial.vel = Vec(0, 0, 0.001f);
        }
        arena->ball->SetState(initial);
        std::cout << std::setprecision(17);
        for (int tick = 0; tick <= (ballNose ? 60 : ballGoal ? 90 : 120); ++tick) {
            if (tick) arena->Step();
            const auto state = arena->ball->GetState();
            std::cout << "{\"tick\":" << tick << ",\"pos\":[" << state.pos.x << ',' << state.pos.y << ',' << state.pos.z
                << "],\"vel\":[" << state.vel.x << ',' << state.vel.y << ',' << state.vel.z
                << "],\"ang_vel\":[" << state.angVel.x << ',' << state.angVel.y << ',' << state.angVel.z
                << "],\"inverseMass\":" << arena->ball->_rigidBody.getInvMass() << ",\"contacts\":[";
            auto& dispatcher = arena->_bulletWorldParams.collisionDispatcher;
            bool first = true;
            for (int manifoldIndex = 0; manifoldIndex < dispatcher.getNumManifolds(); ++manifoldIndex) {
                const auto manifold = dispatcher.getManifoldByIndexInternal(manifoldIndex);
                for (int pointIndex = 0; pointIndex < manifold->getNumContacts(); ++pointIndex) {
                    const auto& point = manifold->getContactPoint(pointIndex);
                    if (!first) std::cout << ',';
                    first = false;
                    std::cout << "{\"normal\":[" << point.m_normalWorldOnB.x() << ',' << point.m_normalWorldOnB.y() << ',' << point.m_normalWorldOnB.z()
                        << "],\"distance\":" << point.getDistance() << ",\"impulse\":" << point.m_appliedImpulse
                        << ",\"frictionImpulse\":" << point.m_appliedImpulseLateral1
                        << ",\"restitution\":" << point.m_combinedRestitution
                        << ",\"friction\":" << point.m_combinedFriction
                        << ",\"pointA\":[" << point.getPositionWorldOnA().x() << ',' << point.getPositionWorldOnA().y() << ',' << point.getPositionWorldOnA().z()
                        << "],\"pointB\":[" << point.getPositionWorldOnB().x() << ',' << point.getPositionWorldOnB().y() << ',' << point.getPositionWorldOnB().z()
                        << "],\"triangle\":" << point.m_index1 << '}';
                }
            }
            std::cout << ']';
            if (contactCar) {
                const auto carState = contactCar->GetState();
                std::cout << ",\"car\":{\"pos\":[" << carState.pos.x << ',' << carState.pos.y << ',' << carState.pos.z
                    << "],\"vel\":[" << carState.vel.x << ',' << carState.vel.y << ',' << carState.vel.z
                    << "],\"ang_vel\":[" << carState.angVel.x << ',' << carState.angVel.y << ',' << carState.angVel.z << "]}";
            }
            std::cout << "}\n";
        }
        delete arena;
        return 0;
    }
    auto car = arena->AddCar(Team::BLUE);
    const bool ceiling = argumentCount == 3 && std::string(arguments[2]) == "ceiling";
    const bool jumpWall = argumentCount == 3 && std::string(arguments[2]) == "jump-wall";
    const bool groundFlip = argumentCount == 3 && std::string(arguments[2]) == "ground-flip";
    const bool replay = argumentCount == 3 && std::string(arguments[2]) == "replay";
    const bool goalRoof = argumentCount == 3 && std::string(arguments[2]) == "goal-roof";
    const bool fastSteering = argumentCount == 3 && std::string(arguments[2]) == "fast-steering";
    const bool steeringTrace = fastSteering || (argumentCount == 3 && std::string(arguments[2]) == "steering");
    CarState state;
    state.pos = Vec(-1000, 0, 80);
    state.rotMat = Angle(0, 0, float(M_PI)).ToRotMat();
    state.boost = 100;
    car->SetState(state);
    if (!ceiling && !groundFlip && !jumpWall && !goalRoof && !steeringTrace && !replay && (argumentCount != 3 || std::string(arguments[2]) != "drive")) arena->Step();
    state = CarState();
    state.pos = Vec(-1000, 0, 80);
    state.vel = Vec(0, 0, -100);
    state.rotMat = Angle(0, 0, float(M_PI)).ToRotMat();
    state.boost = 100;
    car->SetState(state);
    const bool straightDrive = argumentCount == 3 && std::string(arguments[2]) == "drive";
    const bool goalContact = argumentCount == 3 && !ceiling && !groundFlip && !jumpWall && !straightDrive && !replay && !goalRoof && !steeringTrace;
    if (ceiling) {
        state = CarState();
        state.pos = Vec(-1000, 0, 1800);
        state.boost = 100;
        car->SetState(state);
        car->controls = CarControls();
        arena->Step();
        state = CarState();
        state.pos = Vec(-1000, 0, 1800);
        state.vel = Vec(600, 0, 800);
        state.boost = 100;
        car->SetState(state);
        BallState ballState;
        ballState.pos = Vec(0, 0, 92.75f);
        arena->ball->SetState(ballState);
    }
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
    if (goalRoof) {
        state = CarState();
        state.pos = Vec(0, 5500, 610);
        state.rotMat = Angle(0, 0, 0).ToRotMat();
        state.boost = 100;
        car->SetState(state);
        car->controls = CarControls();
        BallState warmBall;
        warmBall.pos = Vec(0, 0, 3000);
        arena->ball->SetState(warmBall);
        arena->Step();
        PrintWheelState(car, "warmup");
        state = CarState();
        state.pos = Vec(0, 5500, 610);
        state.vel = Vec(0, 300, 0);
        state.rotMat = Angle(0, 0, 0).ToRotMat();
        state.boost = 100;
        car->SetState(state);
        PrintWheelState(car, "reset");
        BallState ballState;
        ballState.pos = Vec(0, 0, 10000);
        arena->ball->SetState(ballState);
    }
    if (steeringTrace || jumpWall || groundFlip) {
        state = CarState();
        state.pos = Vec(jumpWall ? 3600 : fastSteering ? -2000 : 0, 0, 17);
        state.rotMat = Angle(0, 0, 0).ToRotMat();
        state.boost = 100;
        car->SetState(state);
        car->controls = CarControls();
        BallState parkedBall;
        parkedBall.pos = Vec(0, 0, 3000);
        arena->ball->SetState(parkedBall);
        for (int settle = 0; settle < 240; ++settle) {
            arena->Step();
            PrintWheelState(car, ("settle-" + std::to_string(settle + 1)).c_str());
        }
        PrintWheelState(car, "settled");
        state.pos.z = car->GetState().pos.z;
        state.vel = Vec(fastSteering ? 2200 : 0, 0, 0);
        car->SetState(state);
        arena->Step();
        state.pos = car->GetState().pos;
        car->SetState(state);
        PrintWheelState(car, "reset");
        BallState ballState;
        ballState.pos = Vec(0, 0, 92.75f);
        arena->ball->SetState(ballState);
    }
    std::cout << std::setprecision(17);
    for (int tick = 0; tick < (ceiling || groundFlip ? 120 : goalRoof ? 360 : fastSteering ? 90 : steeringTrace ? 240 : replay ? 1200 : straightDrive ? 4 : goalContact ? 1 : 180); ++tick) {
        car->controls.jump = tick == 60;
        car->controls.throttle = tick > 60 ? 1 : 0;
        if (ceiling) car->controls = CarControls();
        if (straightDrive) {
            car->controls.jump = false;
            car->controls.throttle = 1;
            car->controls.boost = true;
            car->controls.steer = tick == 0 ? 1.2722218725854067e-15f : 0;
        }
        if (goalRoof) {
            car->controls = CarControls();
            car->controls.throttle = tick < 240 ? 1 : -1;
            car->controls.steer = tick < 240 ? 0.3f : -0.3f;
        }
        if (steeringTrace) {
            car->controls = CarControls();
            car->controls.throttle = 1;
            car->controls.steer = fastSteering ? 0.5f : tick < 120 ? 0 : 1;
        }
        if (jumpWall) {
            car->controls = CarControls();
            car->controls.throttle = 1;
            car->controls.jump = tick < 3;
            car->controls.boost = tick >= 3;
        }
        if (groundFlip) {
            car->controls = CarControls();
            car->controls.jump = tick < 3 || tick >= 15;
            car->controls.pitch = tick >= 15 ? -1 : 0;
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
        if (groundFlip && tick >= 37 && tick <= 39) {
            static Car* tracedCar = nullptr;
            tracedCar = car;
            arena->_bulletWorld.setInternalTickCallback([](btDynamicsWorld* world, btScalar step) {
                const auto& body = tracedCar->_rigidBody;
                std::cout << "{\"stage\":\"preSolver\",\"vel\":";
                PrintVector(body.getLinearVelocity());
                const auto spin = body.getAngularVelocity();
                const auto angularImpulse = body.getTotalTorque() * body.getInvInertiaTensorWorld() * step;
                std::cout << ",\"omega\":[" << spin.x() << ',' << spin.y() << ',' << spin.z()
                    << "],\"angularImpulse\":[" << angularImpulse.x() << ',' << angularImpulse.y() << ',' << angularImpulse.z() << "]}\n";
            }, arena, true);
        } else if (groundFlip) {
            arena->_bulletWorld.setInternalTickCallback(nullptr, arena, true);
        }
        auto* solver = static_cast<btSequentialImpulseConstraintSolver*>(arena->_bulletWorld.getConstraintSolver());
        if (ceiling && tick == 36) {
            tracedNormalSolver = solver->getActiveConstraintRowSolverLowerLimit();
            tracedFrictionSolver = solver->getActiveConstraintRowSolverGeneric();
            solver->setConstraintRowSolverLowerLimit([](btSolverBody& bodyA, btSolverBody& bodyB, const btSolverConstraint& row) {
                return TraceConstraintRow(bodyA, bodyB, row, false);
            });
            solver->setConstraintRowSolverGeneric([](btSolverBody& bodyA, btSolverBody& bodyB, const btSolverConstraint& row) {
                return TraceConstraintRow(bodyA, bodyB, row, true);
            });
        }
        arena->Step();
        if (ceiling && tick == 36) {
            solver->setConstraintRowSolverLowerLimit(tracedNormalSolver);
            solver->setConstraintRowSolverGeneric(tracedFrictionSolver);
        }
        if (replay && tick > 3 && (tick < 738 || tick > 750) && (tick < 870 || tick > 886)) continue;
        if (!ceiling && !groundFlip && !jumpWall && !goalRoof && !steeringTrace && !replay && !straightDrive && !goalContact && (tick < 27 || tick > 34) && (tick < 60 || tick > 74)) continue;
        state = car->GetState();
        std::cout << "{\"tick\":" << tick + 1 << ",\"pos\":";
        PrintVector(car->_rigidBody.getWorldTransform().getOrigin());
        std::cout << ",\"vel\":";
        PrintVector(car->_rigidBody.getLinearVelocity());
        std::cout << ",\"omega\":[" << state.angVel.x << ',' << state.angVel.y << ',' << state.angVel.z << ']';
        if (ceiling || groundFlip) {
            const auto& basis = car->_rigidBody.getWorldTransform().getBasis();
            std::cout << ",\"axes\":[";
            for (int axisIndex = 0; axisIndex < 3; ++axisIndex) {
                const auto axis = basis.getColumn(axisIndex);
                if (axisIndex) std::cout << ',';
                std::cout << '[' << axis.x() << ',' << axis.y() << ',' << axis.z() << ']';
            }
            std::cout << ']';
        }
        if (replay) {
            std::cout << ",\"ballPos\":";
            PrintVector(arena->ball->_rigidBody.getWorldTransform().getOrigin());
            std::cout << ",\"ballVel\":";
            PrintVector(arena->ball->_rigidBody.getLinearVelocity());
        }
        if (straightDrive || goalRoof || steeringTrace) {
            std::cout << ",\"wheels\":[";
            for (int wheelIndex = 0; wheelIndex < car->_bulletVehicle.getNumWheels(); ++wheelIndex) {
                const auto& wheel = car->_bulletVehicle.getWheelInfo(wheelIndex);
                if (wheelIndex) std::cout << ',';
                std::cout << "{\"length\":" << wheel.m_raycastInfo.m_suspensionLength * 50
                    << ",\"force\":" << wheel.m_wheelsSuspensionForce * 50
                    << ",\"pushback\":" << wheel.m_extraPushback * 50 << ",\"point\":";
                PrintVector(wheel.m_raycastInfo.m_contactPointWS);
                std::cout << ",\"nativePoint\":[" << wheel.m_raycastInfo.m_contactPointWS.x()
                    << ',' << wheel.m_raycastInfo.m_contactPointWS.y() << ',' << wheel.m_raycastInfo.m_contactPointWS.z()
                    << "],\"hardPoint\":[" << wheel.m_raycastInfo.m_hardPointWS.x()
                    << ',' << wheel.m_raycastInfo.m_hardPointWS.y() << ',' << wheel.m_raycastInfo.m_hardPointWS.z()
                    << "],\"normal\":[" << wheel.m_raycastInfo.m_contactNormalWS.x()
                    << ',' << wheel.m_raycastInfo.m_contactNormalWS.y() << ',' << wheel.m_raycastInfo.m_contactNormalWS.z() << ']';
                PrintSuspensionTerms(wheel);
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
                    << ",\"lifetime\":" << point.getLifeTime();
                if (ceiling) {
                    const auto& world = bodyIsFirst ? point.getPositionWorldOnA() : point.getPositionWorldOnB();
                    const auto& local = bodyIsFirst ? point.m_localPointA : point.m_localPointB;
                    const auto& tangent = point.m_lateralFrictionDir1;
                    std::cout << ",\"nativeWorld\":[" << world.x() << ',' << world.y() << ',' << world.z()
                        << "],\"nativeLocal\":[" << local.x() << ',' << local.y() << ',' << local.z()
                        << "],\"tangent\":[" << tangent.x() << ',' << tangent.y() << ',' << tangent.z()
                        << "],\"nativeDepth\":" << point.getDistance()
                        << ",\"nativeImpulse\":" << point.m_appliedImpulse
                        << ",\"nativeFriction\":" << point.m_appliedImpulseLateral1;
                }
                std::cout << '}';
            }
        }
        std::cout << "]}\n";
    }
    std::cout << "{\"final\":";
    PrintVector(car->_rigidBody.getWorldTransform().getOrigin());
    std::cout << "}\n";
    delete arena;
}