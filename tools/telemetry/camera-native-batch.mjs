import { execFile } from "node:child_process";
import { watch, openSync, closeSync, unlinkSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const tools = dirname(fileURLToPath(import.meta.url));
const captures = join(process.env.APPDATA, "bakkesmod", "bakkesmod", "data", "airroll-telemetry");
const kinds = process.argv.slice(2);
if (kinds.length === 1 && kinds[0] === "--report") {
    const saved = JSON.parse(await readFile(join(captures, "camera-response-coverage.json"), "utf8"));
    console.log(JSON.stringify({ boundary: saved.boundary, sweeps: saved.sweeps.map(sweep => ({
        kind: sweep.kind, complete: sweep.complete, attempts: sweep.attempts.length,
        accepted_cases: sweep.cases.length, error: sweep.error,
    })) }));
    process.exit(0);
}
if (!kinds.length || kinds.some(kind => !["height", "distance", "angle", "fov", "controls", "pitch-car", "pitch-ball"].includes(kind))) {
    throw new Error("Specify sweep kinds: height distance angle fov controls pitch-car pitch-ball");
}
let priorSweeps = [];
try {
    priorSweeps = JSON.parse(await readFile(join(captures, "camera-response-coverage.json"), "utf8")).sweeps;
} catch (error) {
    if (error.code !== "ENOENT") throw error;
}
const report = { boundary: "Native response coverage, not full trainer motion parity",
    sweeps: priorSweeps.filter(sweep => !kinds.includes(sweep.kind)) };
const lockPath = join(captures, "camera-native-batch.lock");
const lock = openSync(lockPath, "wx");
closeSync(lock);
process.once("exit", () => { unlinkSync(lockPath); });
for (const kind of kinds) {
    const coverage = new Map();
    const attempts = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
        const previousFiles = new Set(await readdir(captures));
        let watcher;
        let deadline;
        const completed = new Promise((resolve, reject) => {
            let inspecting = false;
            watcher = watch(captures, async (_event, filename) => {
                if (inspecting || !filename?.endsWith(".ndjson") || previousFiles.has(filename)) return;
                inspecting = true;
                try {
                    const content = await readFile(join(captures, filename), "utf8");
                    const footer = JSON.parse(content.trim().split(/\r?\n/).at(-1));
                    if (footer.type !== "footer") return;
                    if (footer.reason !== "camera_batch_complete") reject(new Error(`Capture stopped: ${footer.reason}`));
                    else resolve(join(captures, filename));
                } catch (error) {
                    if (!(error instanceof SyntaxError) && error.code !== "ENOENT") reject(error);
                } finally { inspecting = false; }
            });
            deadline = setTimeout(() => reject(new Error(`No completed ${kind} capture within 50 seconds; check local Free Play.`)), 50000);
        });
        completed.catch(() => {});
        try {
            const command = `airroll_camera_controls${kind === "controls" ? "" : ` ${kind}`}`;
            await execute(process.execPath, ["--experimental-websocket", join(tools, "native-command.mjs"), command]);
            const file = await completed;
            const flags = kind === "fov" ? ["--fov"] : kind.startsWith("pitch-") ? ["--pitch"] : kind === "controls" ? [] : ["--arm"];
            let output;
            try {
                output = (await execute(process.execPath, [join(tools, "camera-controls-audit.mjs"), file, ...flags], { maxBuffer: 1024 * 1024 })).stdout;
            } catch (error) {
                if (error.code === 1 && !error.stdout && /Line \d+:/.test(error.stderr ?? "")) {
                    attempts.push({ file, rejected: true, error: error.stderr });
                    console.log(JSON.stringify({ kind, attempt, capture: file, rejected: true, error: error.stderr }));
                    continue;
                }
                if (error.code !== 1 || !error.stdout) throw error;
                output = error.stdout;
            }
            const results = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
            const cases = results.filter(row => row.label);
            for (const row of cases) if (row.accepted && !coverage.has(row.label)) coverage.set(row.label, { file, ...row });
            attempts.push({ file, summary: results.at(-1) });
            console.log(JSON.stringify({ kind, attempt, capture: file, accepted_coverage: coverage.size, expected: cases.length, summary: results.at(-1) }));
            if (coverage.size === cases.length && cases.length > 0) break;
        } catch (error) {
            await execute(process.execPath, ["--experimental-websocket", join(tools, "native-command.mjs"), "airroll_record_stop"]).catch(() => {});
            report.sweeps.push({ kind, complete: false, attempts, cases: [...coverage.values()], error: error.message });
            await writeFile(join(captures, "camera-response-coverage.json"), JSON.stringify(report, null, 2) + "\n");
            throw error;
        } finally {
            clearTimeout(deadline);
            watcher.close();
        }
    }
    const expected = kind.startsWith("pitch-") ? 9 : kind === "controls" ? 18 : 10;
    report.sweeps.push({ kind, complete: coverage.size === expected, attempts, cases: [...coverage.values()] });
    await writeFile(join(captures, "camera-response-coverage.json"), JSON.stringify(report, null, 2) + "\n");
}
await writeFile(join(captures, "camera-response-coverage.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: join(captures, "camera-response-coverage.json"), complete: report.sweeps.every(sweep => sweep.complete) }));
if (report.sweeps.some(sweep => !sweep.complete)) process.exitCode = 1;