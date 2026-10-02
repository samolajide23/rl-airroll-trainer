#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/PluginSettingsWindow.h"
#include "imgui.h"
#include "bakkesmod/wrappers/GameObject/CarWrapper.h"
#include "bakkesmod/wrappers/GameObject/BallWrapper.h"
#include "bakkesmod/wrappers/GameObject/CameraWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/BoostWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/JumpComponentWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/VehicleSimWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/WheelWrapper.h"
#include "bakkesmod/wrappers/arraywrapper.h"
#include "bakkesmod/wrappers/GameEvent/ServerWrapper.h"
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
        return out;
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
            started = std::chrono::steady_clock::now();
            append("{\"type\":\"header\",\"version\":1,\"recorder\":\"0.3.0\",\"bakkesmod_version\":" + std::to_string(gameWrapper->GetBakkesModVersion()) + ",\"body_id\":" + std::to_string(car.GetLoadoutBody()) + ",\"position_units\":\"uu\",\"rotation_units\":\"unreal_rotator\","
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
        gameWrapper->HookEventPost("Function TAGame.Car_TA.SetVehicleInput", [this](std::string)
                                   { captureInput(); });
        gameWrapper->RegisterDrawable([this](CanvasWrapper)
                                      { captureCamera(); });
        cvarManager->log("Airroll recorder loaded. Local Free Play only; no gameplay changes.");
    }

    void onUnload() override
    {
        stop("unload");
        gameWrapper->UnhookEventPost("Function TAGame.Car_TA.SetVehicleInput");
        gameWrapper->UnregisterDrawables();
    }
};

BAKKESMOD_PLUGIN(AirrollRecorder, "Airroll telemetry recorder", "0.3.0", PLUGINTYPE_FREEPLAY)