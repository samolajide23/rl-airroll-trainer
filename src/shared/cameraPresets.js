export const CAMERA_PRESET_SOURCE = "https://liquipedia.net/rocketleague/List_of_player_camera_settings";

export const CAMERA_PRESETS = [
  { id: "car-soccer", label: "Car Soccer comparison", updated: "2026-10-04", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 4, transitionSpeed: 1, shake: false, ballCamMode: "toggle" } },
  { id: "xexead", label: "XeXead", updated: "2026-10-01", camera: { fov: 108, height: 80, angle: -3, distance: 270, stiffness: 1, swivelSpeed: 7.7, transitionSpeed: 1.8, shake: false, ballCamMode: "toggle" } },
  { id: "zen", label: "zen", updated: "2026-02-12", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 4, transitionSpeed: 1.4, shake: false, ballCamMode: "toggle" } },
  { id: "monkey-moon", label: "M0nkey M00n", updated: "2025-12-20", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.5, swivelSpeed: 4, transitionSpeed: 1.1, shake: false, ballCamMode: "toggle" } },
  { id: "firstkiller", label: "Firstkiller", updated: "2025-12-11", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 6.9, transitionSpeed: 1, shake: false, ballCamMode: "toggle" } },
  { id: "apparentlyjack", label: "ApparentlyJack", updated: "2025-11-10", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 2.2, transitionSpeed: 1.8, shake: false, ballCamMode: "toggle" } },
  { id: "vatira", label: "Vatira", updated: "2025-04-29", camera: { fov: 110, height: 90, angle: -5, distance: 270, stiffness: 0.35, swivelSpeed: 7.1, transitionSpeed: 1.5, shake: false, ballCamMode: "toggle" } },
  { id: "daniel", label: "Daniel", updated: "2025-11-25", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 4.7, transitionSpeed: 1.2, shake: false, ballCamMode: "toggle" } },
  { id: "beastmode", label: "BeastMode", updated: "2025-09-14", camera: { fov: 109, height: 90, angle: -4, distance: 270, stiffness: 0.45, swivelSpeed: 7, transitionSpeed: 1.2, shake: false, ballCamMode: "toggle" } },
  { id: "jstn", label: "jstn.", updated: "2025-12-11", camera: { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 4.7, transitionSpeed: 1.3, shake: false, ballCamMode: "toggle" } },
];

export function matchingCameraPreset(camera) {
  return CAMERA_PRESETS.find(preset => Object.entries(preset.camera).every(([key, value]) => camera[key] === value))?.id ?? "custom";
}