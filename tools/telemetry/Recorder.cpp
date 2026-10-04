#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/PluginSettingsWindow.h"
#include "imgui.h"
#include "bakkesmod/wrappers/GameObject/CarWrapper.h"
#include "bakkesmod/wrappers/GameObject/BallWrapper.h"
#include "bakkesmod/wrappers/GameObject/CameraWrapper.h"
#include "bakkesmod/wrappers/GameObject/CameraSettingsActorWrapper.h"
#include "bakkesmod/wrappers/GameObject/CameraStates/CameraStateCarWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/BoostWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/JumpComponentWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/VehicleSimWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/WheelWrapper.h"
#include "bakkesmod/wrappers/arraywrapper.h"
#include "bakkesmod/wrappers/GameEvent/ServerWrapper.h"
#include "bakkesmod/wrappers/PlayerControllerWrapper.h"
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <locale>
#include <sstream>
#include <vector>
#include <mutex>

class AirrollRecorder : public BakkesMod::Plugin::BakkesModPlugin, public BakkesMod::Plugin::PluginSettingsWindow
{
    std::recursive_mutex stateMutex;
    std::string lastSavedPath;
    std::string status = "Ready. Enter local Free Play before starting.";
    double stoppedElapsed = 0;
    bool recording = false;
    std::chrono::steady_clock::time_point started;
    std::vector<std::string> records;
    std::filesystem::path destination;
    size_t bytes = 0;
    size_t sequence = 0;
    size_t inputCount = 0;
    size_t cameraCount = 0;
    double previousCameraElapsed = -1;
    struct CameraCase
    {
        ProfileCameraSettings settings;
        std::string label;
        bool ballCam;
        bool shake;
        float lookUp = 1;
    };
    std::vector<CameraCase> cameraCases;
    bool batchActive = false;
    size_t batchIndex = 0;
    double caseStarted = 0;
    ProfileCameraSettings savedSettings;
    std::string savedMode;
    bool savedSecondary = false;
    bool savedBehind = false;
    float savedLookUp = 0;
    float consumedLookUp = 0;
    float desiredLookUp = 0;
    double consumedLookUpElapsed = -1;
    float swivelDeltaTime = 0;
    Rotator swivelBefore;
    bool dynamicBatch = false;
    bool fovBatch = false;
    std::string armBatch;
    bool savedShake = false;
    RBState savedCar, savedBall;
    static constexpr size_t MAX_BYTES = 32 * 1024 * 1024;

    static void vector(std::ostream &out, const Vector &value)
    {
        out << '[' << value.X << ',' << value.Y << ',' << value.Z << ']';
    }

    static void body(std::ostream &out, const RBState &state)
    {
        out << "{\"pos\":";
        vector(out, state.Location);
        out << ",\"vel\":";
        vector(out, state.LinearVelocity);
        out << ",\"omega\":";
        vector(out, state.AngularVelocity);
        out << ",\"quaternion_wxyz\":[" << state.Quaternion.W << ','
            << state.Quaternion.X << ',' << state.Quaternion.Y << ',' << state.Quaternion.Z
            << "],\"rb_time\":" << state.Time << '}';
    }

    double elapsed() const
    {
        return std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    }

    bool allowed()
    {
        if (!recording)
            return false;
        if (!gameWrapper->IsInFreeplay() || gameWrapper->IsInOnlineGame())
        {
            stop("left_freeplay");
            return false;
        }
        if (elapsed() >= 60 || bytes >= MAX_BYTES)
        {
            stop("limit");
            return false;
        }
        return !gameWrapper->IsPaused();
    }

    void append(const std::string &record)
    {
        if (recording && bytes + record.size() + 1 > MAX_BYTES)
        {
            stop("limit");
            return;
        }
        bytes += record.size() + 1;
        records.push_back(record);
    }

    std::ostringstream sample(const char *type)
    {
        std::ostringstream out;
        out.imbue(std::locale::classic());
        out << std::setprecision(9) << "{\"type\":\"" << type
            << "\",\"sequence\":" << sequence++ << ",\"elapsed\":" << elapsed();
        if (batchActive)
        {
            const auto &entry = cameraCases[batchIndex];
            out << ",\"camera_case\":\"" << cameraCases[batchIndex].label
                << "\",\"case_elapsed\":" << elapsed() - caseStarted
                << ",\"requested_camera\":{\"ball_cam\":" << (entry.ballCam ? "true" : "false")
                << ",\"fov\":" << entry.settings.FOV << ",\"height\":" << entry.settings.Height
                << ",\"angle\":" << entry.settings.Pitch << ",\"distance\":" << entry.settings.Distance
                << ",\"stiffness\":" << entry.settings.Stiffness << ",\"swivel_speed\":" << entry.settings.SwivelSpeed
                << ",\"transition_speed\":" << entry.settings.TransitionSpeed
                << ",\"look_up\":" << entry.lookUp
                << ",\"shake\":" << (entry.shake ? "true" : "false") << '}';
            auto controller = gameWrapper->GetPlayerController();
            if (!controller.IsNull())
                out << ",\"camera_input\":{\"look_up\":" << controller.GetALookUp()
                    << ",\"consumed_look_up\":" << consumedLookUp
                    << ",\"consumed_elapsed\":" << consumedLookUpElapsed << '}';
        }
        return out;
    }

    void restoreBatch()
    {
        if (!batchActive)
            return;
        batchActive = false;
        if (!gameWrapper->IsInFreeplay() || gameWrapper->IsInOnlineGame())
            return;
        auto camera = gameWrapper->GetCamera();
        auto car = gameWrapper->GetLocalCar();
        auto server = gameWrapper->GetGameEventAsServer();
        if (!camera.IsNull())
        {
            camera.SetCameraSettings(savedSettings);
            camera.SetbDisableCameraShake(!savedShake);
            auto actor = camera.GetCameraSettingsActor();
            if (!actor.IsNull())
            {
                actor.SetUsingSecondaryCamera(savedSecondary);
                actor.SetUsingBehindView(savedBehind);
            }
        }
        auto controller = gameWrapper->GetPlayerController();
        if (!controller.IsNull())
            controller.SetALookUp(savedLookUp);
        if (!car.IsNull())
            car.SetPhysicsState(savedCar);
        if (!server.IsNull())
        {
            auto ball = server.GetBall();
            if (!ball.IsNull())
                ball.SetPhysicsState(savedBall);
        }
    }

    void applyCameraCase()
    {
        auto camera = gameWrapper->GetCamera();
        const auto &entry = cameraCases[batchIndex];
        camera.SetbDisableCameraShake(!entry.shake);
        auto actor = camera.GetCameraSettingsActor();
        if (!actor.IsNull())
            actor.SetUsingSecondaryCamera(entry.ballCam);
        camera.SetCameraSettings(entry.settings);
        caseStarted = elapsed();
        cvarManager->log("Camera batch: " + entry.label);
    }

    void startCameraBatch(bool dynamic = false, bool fov = false, std::string arm = "")
    {
        std::lock_guard<std::recursive_mutex> lock(stateMutex);
        if (recording || !gameWrapper->IsInFreeplay() || gameWrapper->IsInOnlineGame())
            return;
        auto camera = gameWrapper->GetCamera();
        auto car = gameWrapper->GetLocalCar();
        auto server = gameWrapper->GetGameEventAsServer();
        if (camera.IsNull() || car.IsNull() || server.IsNull())
            return;
        auto ball = server.GetBall();
        if (ball.IsNull())
            return;
        auto actor = camera.GetCameraSettingsActor();
        if (actor.IsNull())
            return;
        savedSettings = camera.GetCameraSettings();
        savedMode = camera.GetCameraState();
        savedSecondary = actor.GetUsingSecondaryCamera();
        savedBehind = actor.GetUsingBehindView();
        auto controller = gameWrapper->GetPlayerController();
        if (controller.IsNull())
            return;
        savedLookUp = controller.GetALookUp();
        dynamicBatch = dynamic;
        fovBatch = fov;
        armBatch = arm;
        savedShake = camera.IsCameraShakeOn();
        savedCar = car.GetRBState();
        savedBall = ball.GetRBState();
        cameraCases.clear();
        const std::vector<std::pair<std::string, float ProfileCameraSettings::*>> fields = {
            {"fov", &ProfileCameraSettings::FOV}, {"height", &ProfileCameraSettings::Height}, {"angle", &ProfileCameraSettings::Pitch}, {"distance", &ProfileCameraSettings::Distance}, {"stiffness", &ProfileCameraSettings::Stiffness}, {"swivel", &ProfileCameraSettings::SwivelSpeed}, {"transition", &ProfileCameraSettings::TransitionSpeed}};
        const float values[7][3] = {{60, 90, 110}, {40, 100, 200}, {-15, -5, 0}, {100, 270, 400}, {0, 0.5f, 1}, {1, 5, 10}, {1, 1.5f, 2}};
        for (bool ballCam : {false, true})
        {
            const std::string mode = ballCam ? "ball/" : "car/";
            for (size_t field = 0; field < fields.size(); ++field)
                for (size_t level = 0; level < 3; ++level)
                {
                    auto settings = savedSettings;
                    settings.*(fields[field].second) = values[field][level];
                    cameraCases.push_back({settings, mode + fields[field].first + "/" + std::to_string(level), ballCam, false});
                }
            for (bool shake : {false, true})
                cameraCases.push_back({savedSettings, mode + "shake/" + (shake ? "1" : "0"), ballCam, shake});
        }
        if (dynamicBatch)
        {
            cameraCases.clear();
            for (bool ballCam : {false, true})
                for (const auto &control : {std::string("swivel"), std::string("transition"), std::string("rear")})
                    for (size_t level = 0; level < 3; ++level)
                    {
                        auto settings = savedSettings;
                        settings.SwivelSpeed = 1 + 4.5f * level;
                        settings.TransitionSpeed = 1 + 0.5f * level;
                        cameraCases.push_back({settings, std::string(ballCam ? "ball/" : "car/") + control + "/" + std::to_string(level), ballCam, false});
                    }
        }
        if (fovBatch)
        {
            cameraCases.clear();
            for (bool ballCam : {false, true})
                for (size_t level = 0; level < 5; ++level)
                {
                    auto settings = savedSettings;
                    const float fovs[] = {60, 90, 110, 90, 60};
                    settings.FOV = fovs[level];
                    cameraCases.push_back({settings, std::string(ballCam ? "ball/fov/" : "car/fov/") + std::to_string(level), ballCam, false});
                }
        }
        if (armBatch == "pitch-car" || armBatch == "pitch-ball")
        {
            const bool selectedBallCam = armBatch == "pitch-ball";
            cameraCases.clear();
            for (bool ballCam : {false, true})
                if (ballCam == selectedBallCam)
                    for (size_t speed = 0; speed < 3; ++speed)
                        for (float input : {-1.0f, -0.5f, 0.5f})
                        {
                            auto settings = savedSettings;
                            settings.SwivelSpeed = 1 + 4.5f * speed;
                            cameraCases.push_back({settings, std::string(ballCam ? "ball/" : "car/") + "swivel/" + std::to_string(speed) + "/" + std::to_string(input), ballCam, false, input});
                        }
            armBatch.clear();
        }
        if (!armBatch.empty())
        {
            cameraCases.clear();
            for (bool ballCam : {false, true})
                for (const auto &field : fields)
                    if (field.first == armBatch)
                        for (size_t level = 0; level < 5; ++level)
                        {
                            auto settings = savedSettings;
                            const size_t fieldIndex = &field - fields.data();
                            const size_t levels[] = {0, 1, 2, 1, 0};
                            settings.*(field.second) = values[fieldIndex][levels[level]];
                            cameraCases.push_back({settings, std::string(ballCam ? "ball/" : "car/") + armBatch + "/" + std::to_string(level), ballCam, false});
                        }
            if (cameraCases.empty())
                return;
        }
        start();
        if (!recording)
            return;
        batchIndex = 0;
        batchActive = true;
        consumedLookUpElapsed = -1;
        applyCameraCase();
    }

    void advanceCameraBatch()
    {
        std::lock_guard<std::recursive_mutex> lock(stateMutex);
        if (!batchActive || !allowed())
            return;
        if (elapsed() - caseStarted >= (fovBatch || !armBatch.empty() ? 2.8 : dynamicBatch ? 2.2
                                                                                           : 0.85))
        {
            if (++batchIndex >= cameraCases.size())
            {
                stop("camera_batch_complete");
                return;
            }
            applyCameraCase();
        }
        auto car = gameWrapper->GetLocalCar();
        auto server = gameWrapper->GetGameEventAsServer();
        auto camera = gameWrapper->GetCamera();
        if (car.IsNull() || server.IsNull() || camera.IsNull())
        {
            stop("batch_actor_missing");
            return;
        }
        auto ball = server.GetBall();
        if (ball.IsNull())
        {
            stop("batch_ball_missing");
            return;
        }
        const float phase = static_cast<float>(elapsed() - caseStarted);
        if (dynamicBatch)
        {
            const auto &entry = cameraCases[batchIndex];
            auto actor = camera.GetCameraSettingsActor();
            auto controller = gameWrapper->GetPlayerController();
            if (actor.IsNull() || controller.IsNull())
            {
                stop("batch_controller_missing");
                return;
            }
            const bool pulse = !fovBatch && armBatch.empty() && phase >= 0.75f && phase < 1.5f;
            controller.SetALookUp(entry.label.find("swivel") != std::string::npos && pulse ? entry.lookUp : 0);
            actor.SetUsingBehindView(entry.label.find("rear") != std::string::npos && pulse);
            actor.SetUsingSecondaryCamera(entry.label.find("transition") != std::string::npos && pulse ? !entry.ballCam : entry.ballCam);
            const auto actual = camera.GetCameraSettings();
            const auto requested = entry.settings;
            if (phase < 0.1f || actual.FOV != requested.FOV || actual.Height != requested.Height ||
                actual.Pitch != requested.Pitch || actual.Distance != requested.Distance ||
                actual.Stiffness != requested.Stiffness || actual.SwivelSpeed != requested.SwivelSpeed ||
                actual.TransitionSpeed != requested.TransitionSpeed)
                camera.SetCameraSettings(requested);
            car.SetLocation(Vector(0, 0, 17));
            car.SetRotation(Rotator(0, 0, 0));
            car.SetVelocity(Vector(0, 0, 0));
            car.SetAngularVelocity(Vector(0, 0, 0), false);
            ball.SetLocation(Vector(1000, 600, 300));
            ball.SetVelocity(Vector(0, 0, 0));
            ball.SetAngularVelocity(Vector(0, 0, 0), false);
            return;
        }
        car.SetLocation(Vector(phase > 0.55f ? (phase - 0.55f) * 1000 : 0, 0, 17));
        car.SetRotation(Rotator(0, 0, 0));
        car.SetVelocity(Vector(phase > 0.55f ? 1000 : 0, 0, 0));
        car.SetAngularVelocity(Vector(0, 0, 0), false);
        ball.SetLocation(Vector(1000, phase > 0.7f ? 300 : 0, phase > 0.55f ? 400 : 93.15f));
        ball.SetVelocity(Vector(0, 0, 0));
        ball.SetAngularVelocity(Vector(0, 0, 0), false);
    }

    void captureInput()
    {
        std::lock_guard<std::recursive_mutex> lock(stateMutex);
        if (!allowed())
            return;
        auto car = gameWrapper->GetLocalCar();
        auto server = gameWrapper->GetGameEventAsServer();
        if (car.IsNull() || server.IsNull())
            return;
        auto ball = server.GetBall();
        if (ball.IsNull())
            return;
        const auto input = car.GetInput();
        auto out = sample("input_state");
        out << ",\"physics_time\":" << car.GetPhysicsTime()
            << ",\"input\":{\"throttle\":" << input.Throttle
            << ",\"steer\":" << input.Steer << ",\"pitch\":" << input.Pitch
            << ",\"yaw\":" << input.Yaw << ",\"roll\":" << input.Roll
            << ",\"dodge_forward\":" << input.DodgeForward
            << ",\"dodge_strafe\":" << input.DodgeStrafe
            << ",\"jump\":" << (input.Jump ? "true" : "false")
            << ",\"handbrake\":" << (input.Handbrake ? "true" : "false")
            << ",\"activate_boost\":" << (input.ActivateBoost ? "true" : "false")
            << ",\"holding_boost\":" << (input.HoldingBoost ? "true" : "false") << '}'
            << ",\"car\":";
        body(out, car.GetRBState());
        out << ",\"ball\":";
        body(out, ball.GetRBState());
        out << ",\"flags\":{\"on_ground\":" << (car.GetbOnGround() ? "true" : "false")
            << ",\"jumped\":" << (car.GetbJumped() ? "true" : "false")
            << ",\"double_jumped\":" << (car.GetbDoubleJumped() ? "true" : "false")
            << ",\"has_flip\":" << (car.HasFlip() ? "true" : "false")
            << ",\"supersonic\":" << (car.GetbSuperSonic() ? "true" : "false")
            << ",\"wheel_contacts\":" << car.GetNumWheelContacts()
            << ",\"wheel_world_contacts\":" << car.GetNumWheelWorldContacts() << '}';
        auto boost = car.GetBoostComponent();
        out << ",\"boost_raw\":";
        if (boost.IsNull())
            out << "null";
        else
            out << boost.GetCurrentBoostAmount();
        const auto sticky = car.GetStickyForce();
        out << ",\"contact_state\":{\"time_on_ground\":" << car.GetTimeOnGround()
            << ",\"time_off_ground\":" << car.GetTimeOffGround()
            << ",\"sticky_ground\":" << sticky.Ground
            << ",\"sticky_wall\":" << sticky.Wall << ",\"ground_normal\":";
        vector(out, car.GetGroundNormal());
        out << "},\"jump_component\":";
        auto jump = car.GetJumpComponent();
        if (jump.IsNull())
            out << "null";
        else
            out << "{\"min_time\":" << jump.GetMinJumpTime()
                << ",\"active\":" << (jump.GetbActive() ? "true" : "false")
                << ",\"activity_time\":" << jump.GetActivityTime()
                << ",\"active_time\":" << jump.GetActiveTime()
                << ",\"force_time\":" << jump.GetJumpForceTime()
                << ",\"impulse\":" << jump.GetJumpImpulse()
                << ",\"force\":" << jump.GetJumpForce()
                << ",\"impulse_speed\":" << jump.GetJumpImpulseSpeed()
                << ",\"accel\":" << jump.GetJumpAccel()
                << ",\"deactivate\":" << (jump.GetbDeactivate() ? "true" : "false") << '}';
        out << ",\"wheels\":";
        auto vehicle = car.GetVehicleSim();
        if (vehicle.IsNull())
            out << "null";
        else
        {
            auto wheels = vehicle.GetWheels();
            out << '[';
            for (int index = 0; index < wheels.Count(); index++)
            {
                if (index != 0)
                    out << ',';
                auto wheel = wheels.Get(index);
                if (wheel.IsNull())
                {
                    out << "null";
                    continue;
                }
                const auto contact = wheel.GetContact();
                out << "{\"index\":" << wheel.GetWheelIndex()
                    << ",\"has_contact\":" << (contact.bHasContact ? "true" : "false")
                    << ",\"world_contact\":" << (contact.bHasContactWithWorldGeometry ? "true" : "false")
                    << ",\"had_contact\":" << (wheel.GetbHadContact() ? "true" : "false")
                    << ",\"contact_change_time\":" << contact.HasContactChangeTime
                    << ",\"radius\":" << wheel.GetWheelRadius()
                    << ",\"suspension_distance\":" << wheel.GetSuspensionDistance()
                    << ",\"suspension_travel\":" << wheel.GetSuspensionTravel()
                    << ",\"suspension_max_raise\":" << wheel.GetSuspensionMaxRaise()
                    << ",\"contact_force_distance\":" << wheel.GetContactForceDistance()
                    << ",\"stiffness\":" << wheel.GetSuspensionStiffness()
                    << ",\"damping_compression\":" << wheel.GetSuspensionDampingCompression()
                    << ",\"damping_relaxation\":" << wheel.GetSuspensionDampingRelaxation()
                    << ",\"ray_start_local\":";
                vector(out, wheel.GetLocalSuspensionRayStart());
                out << ",\"rest_position_local\":";
                vector(out, wheel.GetLocalRestPosition());
                out << ",\"contact_location\":";
                vector(out, contact.Location);
                out << ",\"contact_normal\":";
                vector(out, contact.Normal);
                out << '}';
            }
            out << ']';
        }
        out << '}';
        append(out.str());
        inputCount++;
    }

    void captureCamera()
    {
        std::lock_guard<std::recursive_mutex> lock(stateMutex);
        if (!allowed())
            return;
        auto camera = gameWrapper->GetCamera();
        if (camera.IsNull())
            return;
        auto out = sample("camera");
        const auto rotation = camera.GetRotation();
        const auto swivel = camera.GetCurrentSwivel();
        const auto settings = camera.GetCameraSettings();
        const auto screen = gameWrapper->GetScreenSize();
        const auto cameraElapsed = elapsed();
        auto car = gameWrapper->GetLocalCar();
        auto server = gameWrapper->GetGameEventAsServer();
        auto settingsActor = camera.GetCameraSettingsActor();
        auto blender = camera.GetBlender();
        const auto defaults = CameraStateCarWrapper::GetInstanceWithDefaultValues();
        out << ",\"camera_callback_interval\":";
        if (previousCameraElapsed < 0)
            out << "null";
        else
            out << cameraElapsed - previousCameraElapsed;
        previousCameraElapsed = cameraElapsed;
        out << ",\"state_name\":" << std::quoted(camera.GetCameraState())
            << ",\"behind_view\":";
        if (settingsActor.IsNull())
            out << "null";
        else
            out << (settingsActor.GetUsingBehindView() ? "true" : "false");
        out << ",\"native_rates\":{\"swivel_fast\":" << camera.GetSwivelFastSpeed()
            << ",\"swivel_decay\":" << camera.GetSwivelDieRate()
            << ",\"clip\":" << camera.GetClipRate() << "},\"car_camera_default_rates\":";
        if (defaults.IsNull())
            out << "null";
        else
            out << "{\"to_ground\":" << defaults.GetInterpToGroundRate()
                << ",\"to_air\":" << defaults.GetInterpToAirRate()
                << ",\"ground_rotation\":" << defaults.GetGroundRotationInterpRate()
                << ",\"wall_rotation\":" << defaults.GetGroundRotationInterpRateWall()
                << ",\"fov\":" << defaults.GetFOVInterpSpeed()
                << ",\"supersonic_fov\":" << defaults.GetSupersonicFOVInterpSpeed()
                << ",\"ground_normal\":" << defaults.GetGroundNormalInterpRate() << '}';
        out << ",\"blender_state\":";
        if (blender.IsNull())
            out << "null";
        else
        {
            const auto activeState = blender.GetCameraState();
            if (activeState.IsNull())
                out << "null";
            else
                out << std::quoted(activeState.GetStateType());
        }
        out << ",\"transition\":";
        if (blender.IsNull())
            out << "null";
        else
        {
            const auto transition = blender.GetTransition();
            out << "{\"started\":" << (transition.started ? "true" : "false");
            if (transition.started)
            {
                out << ",\"remaining_time\":" << transition.remaining_time
                    << ",\"blend_time\":" << transition.blend_params.blend_time
                    << ",\"blend_function\":" << static_cast<unsigned int>(transition.blend_params.blend_function)
                    << ",\"blend_exp\":" << transition.blend_params.blend_exp
                    << ",\"lock_outgoing\":" << (transition.blend_params.lock_outgoing ? "true" : "false")
                    << ",\"snapshot\":{\"focus\":";
                vector(out, transition.snapshot_pov.focus);
                const auto snapshotRotation = transition.snapshot_pov.rotation;
                out << ",\"rotator_unreal\":[" << snapshotRotation.Pitch << ',' << snapshotRotation.Yaw << ',' << snapshotRotation.Roll
                    << "],\"distance\":" << transition.snapshot_pov.distance
                    << ",\"fov\":" << transition.snapshot_pov.fov << ",\"pos\":";
                vector(out, transition.snapshot_pov.calculated_location);
                out << '}';
            }
            out << '}';
        }
        out << ",\"observed_car\":";
        if (car.IsNull())
            out << "null";
        else
            body(out, car.GetRBState());
        out << ",\"observed_ball\":";
        if (server.IsNull())
            out << "null";
        else
        {
            auto ball = server.GetBall();
            if (ball.IsNull())
                out << "null";
            else
                body(out, ball.GetRBState());
        }
        out << ",\"pos\":";
        vector(out, camera.GetLocation());
        out << ",\"rotator_unreal\":[" << rotation.Pitch << ',' << rotation.Yaw << ',' << rotation.Roll << ']'
            << ",\"swivel_unreal\":[" << swivel.Pitch << ',' << swivel.Yaw << ',' << swivel.Roll << ']'
            << ",\"fov\":" << camera.GetFOV()
            << ",\"viewport\":[" << screen.X << ',' << screen.Y << ']'
            << ",\"settings\":{\"fov\":" << settings.FOV << ",\"height\":" << settings.Height
            << ",\"angle\":" << settings.Pitch << ",\"distance\":" << settings.Distance
            << ",\"stiffness\":" << settings.Stiffness << ",\"swivel_speed\":" << settings.SwivelSpeed
            << ",\"transition_speed\":" << settings.TransitionSpeed
            << ",\"shake\":" << (camera.IsCameraShakeOn() ? "true" : "false") << "}}";
        append(out.str());
        cameraCount++;
    }

    void start()
    {
        std::lock_guard<std::recursive_mutex> lock(stateMutex);
        if (recording)
        {
            cvarManager->log("Recorder is already running.");
            return;
        }
        if (!gameWrapper->IsInFreeplay() || gameWrapper->IsInOnlineGame())
        {
            status = "Cannot start: enter local Free Play.";
            cvarManager->log("Recorder only starts in local Free Play.");
            return;
        }
        auto car = gameWrapper->GetLocalCar();
        if (car.IsNull())
        {
            status = "Wait for the local car to spawn.";
            cvarManager->log(status);
            return;
        }
        try
        {
            const auto folder = gameWrapper->GetDataFolder() / "airroll-telemetry";
            std::filesystem::create_directories(folder);
            const auto stamp = std::chrono::duration_cast<std::chrono::microseconds>(
                                   std::chrono::system_clock::now().time_since_epoch())
                                   .count();
            destination = folder / ("capture-" + std::to_string(stamp) + ".ndjson");
            std::ofstream check(destination, std::ios::out | std::ios::trunc);
            if (!check)
            {
                status = "Cannot create capture file.";
                cvarManager->log(status);
                return;
            }
            check.close();
            records.clear();
            bytes = 0;
            sequence = 0;
            inputCount = 0;
            cameraCount = 0;
            previousCameraElapsed = -1;
            started = std::chrono::steady_clock::now();
            append("{\"type\":\"header\",\"version\":1,\"recorder\":\"0.4.0\",\"camera_diagnostics_version\":1,\"bakkesmod_version\":" + std::to_string(gameWrapper->GetBakkesModVersion()) + ",\"body_id\":" + std::to_string(car.GetLoadoutBody()) + ",\"position_units\":\"uu\",\"rotation_units\":\"unreal_rotator\","
                                                                                                                                                                                                                                                       "\"input_phase\":\"post_SetVehicleInput_not_post_physics\","
                                                                                                                                                                                                                                                       "\"camera_phase\":\"drawable\",\"sample_rate_assumed\":false}");
            recording = true;
            stoppedElapsed = 0;
            status = "Recording local Free Play.";
            cvarManager->log("Recording started (60-second limit). Use airroll_record_stop to save.");
        }
        catch (const std::exception &error)
        {
            status = std::string("Recorder start failed: ") + error.what();
            cvarManager->log(status);
        }
    }

    void stop(const char *reason)
    {
        std::lock_guard<std::recursive_mutex> lock(stateMutex);
        if (!recording)
            return;
        stoppedElapsed = elapsed();
        restoreBatch();
        recording = false;
        std::ofstream out(destination, std::ios::out | std::ios::trunc);
        if (!out)
        {
            status = "Save failed. Buffered data remains until next start.";
            cvarManager->log(status);
            return;
        }
        for (const auto &record : records)
            out << record << '\n';
        out << "{\"type\":\"footer\",\"reason\":\"" << reason
            << "\",\"input_count\":" << inputCount << ",\"camera_count\":" << cameraCount << "}\n";
        out.close();
        if (!out)
        {
            status = "Capture write failed; file may be incomplete.";
            cvarManager->log(status);
            return;
        }
        records.clear();
        lastSavedPath = destination.string();
        status = std::string("Saved capture. Stop reason: ") + reason;
        cvarManager->log("Capture saved: " + destination.string());
    }

public:
    std::string GetPluginName() override { return "Airroll Recorder"; }

    void SetImGuiContext(uintptr_t context) override
    {
        ImGui::SetCurrentContext(reinterpret_cast<ImGuiContext *>(context));
    }

    void RenderSettings() override
    {
        bool active;
        double seconds;
        size_t inputs, cameras, buffered;
        std::string message, saved;
        {
            std::lock_guard<std::recursive_mutex> lock(stateMutex);
            active = recording;
            seconds = active ? elapsed() : stoppedElapsed;
            inputs = inputCount;
            cameras = cameraCount;
            buffered = bytes;
            message = status;
            saved = lastSavedPath;
        }
        ImGui::TextUnformatted("FREE PLAY TELEMETRY");
        ImGui::Separator();
        ImGui::TextWrapped("%s", message.c_str());
        if (active)
        {
            if (ImGui::Button("Stop & Save", ImVec2(160, 32)))
            {
                gameWrapper->Execute([this](GameWrapper *)
                                     { stop("manual"); });
            }
        }
        else
        {
            if (ImGui::Button("Start Recording", ImVec2(160, 32)))
            {
                gameWrapper->Execute([this](GameWrapper *)
                                     { start(); });
            }
        }
        ImGui::Text("Elapsed: %.1f / 60 seconds", seconds);
        ImGui::Text("Input / state samples: %llu", static_cast<unsigned long long>(inputs));
        ImGui::Text("Camera samples: %llu", static_cast<unsigned long long>(cameras));
        ImGui::Text("Capture size: %.2f / 32 MiB", buffered / (1024.0 * 1024.0));
        ImGui::ProgressBar(static_cast<float>(buffered) / MAX_BYTES, ImVec2(-1, 0), "Capture limit");
        ImGui::Separator();
        if (!saved.empty())
        {
            ImGui::TextUnformatted("Last saved capture");
            ImGui::TextWrapped("%s", saved.c_str());
            if (ImGui::Button("Copy File Path"))
                ImGui::SetClipboardText(saved.c_str());
        }
        ImGui::TextWrapped("Local Free Play only. Capture stops after 60 seconds, at the buffer limit, or when leaving Free Play. Closing this panel does not stop recording.");
    }

    void onLoad() override
    {
        cvarManager->registerNotifier("airroll_record_start", [this](std::vector<std::string>)
                                      { start(); }, "Start local Free Play telemetry", 0);
        cvarManager->registerNotifier("airroll_record_stop", [this](std::vector<std::string>)
                                      { stop("manual"); }, "Stop and save telemetry", 0);
        cvarManager->registerNotifier("airroll_camera_batch", [this](std::vector<std::string>)
                                      { startCameraBatch(); }, "Run local native camera setting sweep", 0);
        cvarManager->registerNotifier("airroll_camera_controls", [this](std::vector<std::string> arguments)
                                      { const std::string kind = arguments.size() > 1 ? arguments[1] : "";
                                                        if (kind == "targets") { cvarManager->executeCommand("airroll_camera_targets"); return; }
                                                        startCameraBatch(true, kind == "fov", kind != "fov" ? kind : ""); }, "Run local native camera control sweep", 0);
        cvarManager->registerNotifier("airroll_camera_targets", [this](std::vector<std::string>)
                                      {
                           std::lock_guard<std::recursive_mutex> lock(stateMutex);
                           if (recording || !gameWrapper->IsInFreeplay() || gameWrapper->IsInOnlineGame()) return;
                           auto camera = gameWrapper->GetCamera();
                           if (camera.IsNull()) return;
                           for (int step = -20; step <= 20; ++step)
                           {
                               const float input = step / 20.0f;
                               const auto desired = camera.GetDesiredSwivel(input, 0);
                               cvarManager->log("Camera target query: " + std::to_string(input) + " " + std::to_string(desired.Pitch));
                           } }, "Query native swivel targets outside recording in local Free Play", 0);
        gameWrapper->HookEvent("Function TAGame.Car_TA.SetVehicleInput", [this](std::string)
                               { advanceCameraBatch(); });
        gameWrapper->HookEventPost("Function TAGame.Car_TA.SetVehicleInput", [this](std::string)
                                   { captureInput(); });
        gameWrapper->HookEventWithCaller<ActorWrapper>("Function TAGame.Camera_TA.UpdateSwivel", [this](ActorWrapper, void *params, std::string)
                                                       {
                           std::lock_guard<std::recursive_mutex> lock(stateMutex);
                           if (!batchActive || !dynamicBatch || !allowed()) return;
                           auto controller = gameWrapper->GetPlayerController();
                           if (controller.IsNull()) return;
                           const auto &entry = cameraCases[batchIndex];
                           const double phase = elapsed() - caseStarted;
                           controller.SetALookUp(!fovBatch && armBatch.empty() &&
                               entry.label.find("swivel") != std::string::npos &&
                               phase >= 0.75 && phase < 1.5 ? entry.lookUp : 0);
                           consumedLookUp = controller.GetALookUp();
                           consumedLookUpElapsed = elapsed();
                           swivelDeltaTime = params ? *static_cast<float *>(params) : 0;
                           auto camera = gameWrapper->GetCamera();
                           if (camera.IsNull()) { swivelDeltaTime = 0; return; }
                           swivelBefore = camera.GetCurrentSwivel(); });
        gameWrapper->HookEventPost("Function TAGame.Camera_TA.UpdateSwivel", [this](std::string)
                                   {
                           std::lock_guard<std::recursive_mutex> lock(stateMutex);
                           if (!batchActive || !dynamicBatch || !allowed() || swivelDeltaTime <= 0) return;
                           auto camera = gameWrapper->GetCamera();
                           if (camera.IsNull()) return;
                           const auto after = camera.GetCurrentSwivel();
                           const Rotator desired{static_cast<int>((desiredLookUp < 0 ? 8900 : 5500) * desiredLookUp), 0, 0};
                           auto out = sample("camera_swivel_update");
                           out << ",\"desired_source\":\"native_target_argument_with_queried_range\",\"desired_look_up\":" << desiredLookUp << ",\"delta_time\":" << swivelDeltaTime
                               << ",\"before_unreal\":[" << swivelBefore.Pitch << ',' << swivelBefore.Yaw << ',' << swivelBefore.Roll
                               << "],\"after_unreal\":[" << after.Pitch << ',' << after.Yaw << ',' << after.Roll
                               << "],\"desired_unreal\":[" << desired.Pitch << ',' << desired.Yaw << ',' << desired.Roll << "]}";
                           append(out.str()); });
        gameWrapper->HookEventWithCaller<ActorWrapper>("Function TAGame.Camera_TA.GetDesiredSwivel", [this](ActorWrapper, void *params, std::string)
                                                       {
                           std::lock_guard<std::recursive_mutex> lock(stateMutex);
                           if (!batchActive || !dynamicBatch || !allowed() || !params) return;
                           desiredLookUp = *static_cast<float *>(params); });
        gameWrapper->RegisterDrawable([this](CanvasWrapper)
                                      { captureCamera(); });
        cvarManager->log("Airroll recorder loaded. Capture is read-only; explicit camera batch changes and restores local Free Play state.");
    }

    void onUnload() override
    {
        stop("unload");
        gameWrapper->UnhookEventPost("Function TAGame.Car_TA.SetVehicleInput");
        gameWrapper->UnhookEvent("Function TAGame.Car_TA.SetVehicleInput");
        gameWrapper->UnhookEvent("Function TAGame.Camera_TA.UpdateSwivel");
        gameWrapper->UnhookEvent("Function TAGame.Camera_TA.GetDesiredSwivel");
        gameWrapper->UnhookEventPost("Function TAGame.Camera_TA.UpdateSwivel");
        gameWrapper->UnregisterDrawables();
    }
};

BAKKESMOD_PLUGIN(AirrollRecorder, "Airroll telemetry recorder", "0.4.0", PLUGINTYPE_FREEPLAY)