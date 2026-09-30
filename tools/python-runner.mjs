/** Portable Python 3 launcher. PYTHON is a single executable path/name, not a shell command. */
import { spawnSync } from "node:child_process";
import { constants } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const probe = "import sys; print('python-runner:3' if sys.version_info.major == 3 else 'unsupported')";

/** Resolve Python independently of optional packages such as RocketSim. */
export function resolvePython({ env = process.env, cwd = process.cwd() } = {}) {
  const explicit = env.PYTHON !== undefined;
  const candidates = explicit
    ? [{ command: env.PYTHON, args: [] }]
    : [
        {
          command: join(projectRoot, ".venv", ...(process.platform === "win32"
            ? ["Scripts", "python.exe"] : ["bin", "python"])),
          args: [],
        },
        ...(process.platform === "win32"
          ? [{ command: "py", args: ["-3"] }, { command: "python", args: [] }, { command: "python3", args: [] }]
          : [{ command: "python3", args: [] }, { command: "python", args: [] }]),
      ];
  const failures = [];
  for (const candidate of candidates) {
    if (!candidate.command.trim()) {
      failures.push("PYTHON is empty");
      continue;
    }
    const result = spawnSync(candidate.command, [...candidate.args, "-I", "-c", probe], {
      env, cwd, encoding: "utf8", timeout: 5000, windowsHide: true, shell: false,
    });
    if (!result.error && result.status === 0 && result.stdout.trim() === "python-runner:3") {
      return candidate;
    }
    failures.push(`${JSON.stringify(candidate.command)}: ${result.error?.message
      || result.stderr?.trim() || `not a working Python 3 interpreter (exit ${result.status})`}`);
  }
  const error = new Error(explicit
    ? `Invalid PYTHON override. Set PYTHON to a Python 3 executable path/name without quotes or arguments. No fallback attempted.\n${failures.join("\n")}`
    : `No working Python 3 interpreter found. Set PYTHON or create a project .venv.\n${failures.join("\n")}`);
  error.code = explicit ? "PYTHON_INVALID_OVERRIDE" : "PYTHON_NOT_FOUND";
  throw error;
}

/** Spawn with an argument array (never a shell); optionally reuse a resolved interpreter. */
export function spawnPythonSync(args, options = {}, interpreter = resolvePython(options)) {
  return spawnSync(interpreter.command, [...interpreter.args, "-X", "utf8", ...args], {
    ...options, shell: false,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnPythonSync(process.argv.slice(2), { stdio: "inherit" });
    if (result.error) console.error(`Python launch failed: ${result.error.message}`);
    process.exitCode = result.status ?? (result.signal ? 128 + (constants.signals[result.signal] || 0) : 1);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}