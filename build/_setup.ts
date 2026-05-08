// This is a simple setup script in TypeScript that should work for most projects without modification
// The purpose of this script is to install build dependencies (tools like "func" and "fift") automatically
// We rely on this script for example to support Glitch.com (online IDE) and have it working in one click

import fs from "fs";
import child_process from "child_process";

// package ton-compiler brings its own func and fift executables which interfere with the system ones
try {
  fs.unlinkSync(__dirname + "/../node_modules/.bin/func");
  fs.unlinkSync(__dirname + "/../node_modules/.bin/fift");
} catch (e) {}
try {
  fs.unlinkSync(__dirname + "/../node_modules/.bin/func.cmd");
  fs.unlinkSync(__dirname + "/../node_modules/.bin/fift.cmd");
} catch (e) {}

// check if we're running on glitch.com (glitch is running Ubuntu 16)
if (fs.existsSync("/app/.glitchdotcom.json")) {
  // make sure we're installed once
  if (!fs.existsSync("/app/bin")) {
    child_process.execSync(`mkdir bin`);
    child_process.execSync(`wget https://github.com/ton-defi-org/ton-binaries/releases/download/ubuntu-16/fift -P ./bin`);
    child_process.execSync(`chmod +x ./bin/fift`);
    child_process.execSync(`wget https://github.com/ton-defi-org/ton-binaries/releases/download/ubuntu-16/func -P ./bin`);
    child_process.execSync(`chmod +x ./bin/func`);
    child_process.execSync(`wget https://github.com/ton-defi-org/ton-binaries/releases/download/fiftlib/fiftlib.zip -P ./bin`);
    child_process.execSync(`unzip ./bin/fiftlib.zip -d ./bin/fiftlib`);
  }
}

// check if we're running on Vercel (Ubuntu 22) or another CI environment missing func
const funcMissing = (() => { try { child_process.execSync("func -V"); return false; } catch { return true; } })();
if (funcMissing && !fs.existsSync("bin/func")) {
  const UBUNTU22_TAG = "ubuntu-22-0.4.6";
  const BASE = `https://github.com/ton-defi-org/ton-binaries/releases/download/${UBUNTU22_TAG}`;
  child_process.execSync(`mkdir -p bin`);
  child_process.execSync(`curl -fsSL ${BASE}/fift -o ./bin/fift`);
  child_process.execSync(`chmod +x ./bin/fift`);
  child_process.execSync(`curl -fsSL ${BASE}/func -o ./bin/func`);
  child_process.execSync(`chmod +x ./bin/func`);
  child_process.execSync(`curl -fsSL ${BASE}/fiftlib.zip -o ./bin/fiftlib.zip`);
  child_process.execSync(`unzip -q ./bin/fiftlib.zip -d ./bin/fiftlib`);
}
