import { readFileSync } from "node:fs";
import { join } from "node:path";

const command = process.argv.slice(2).join(" ");
if (!command) throw new Error("Supply a BakkesMod command.");
const config = readFileSync(join(process.env.APPDATA, "bakkesmod", "bakkesmod", "cfg", "config.cfg"), "utf8");
const password = config.match(/^\s*rcon_password\s+"([^"]*)"/m)?.[1];
if (!password) throw new Error("Local RCON authentication is not configured.");
const socket = new WebSocket("ws://127.0.0.1:9002");
await new Promise((resolve, reject) => {
    let completion;
    const deadline = setTimeout(() => { socket.close(); reject(new Error("RCON authentication timed out.")); }, 5000);
    socket.addEventListener("open", () => socket.send(`rcon_password ${password}`));
    socket.addEventListener("error", () => { clearTimeout(deadline); reject(new Error("Local RCON connection failed.")); });
    socket.addEventListener("message", (event) => {
        if (String(event.data).includes("authyes")) {
            clearTimeout(deadline);
            socket.send(command);
            completion = setTimeout(() => { socket.close(); resolve(); }, 500);
        } else if (String(event.data).includes("ERR:")) {
            clearTimeout(deadline);
            clearTimeout(completion);
            socket.close();
            reject(new Error("Native command rejected: " + String(event.data)));
        } else if (String(event.data).includes("authno")) {
            clearTimeout(deadline);
            socket.close();
            reject(new Error("Local RCON authentication rejected."));
        }
    });
});
console.log(`Sent native command: ${command}`);