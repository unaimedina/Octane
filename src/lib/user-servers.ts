import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { opencodeBin, opencodeSkillsDir, opencodeUsersDir, opencodeWorkspace } from "./env";

/**
 * One OpenCode server per user.
 *
 * Each child gets its own HOME/XDG directories, so sessions, credentials and
 * OpenCode Console logins never cross between users. The server listens on
 * localhost with a random Basic-auth password that only the web process knows.
 */

export type ManagedServer = {
  url: string;
  authHeader: string;
};

type ServerRecord = ManagedServer & {
  key: string;
  directory: string;
  pid: number | null;
  child: ChildProcess | null;
};

type ServerDescriptor = {
  pid?: number | null;
  port: number;
  password: string;
  startedAt: number;
};

type ServerProbe = {
  ok: boolean;
  pid?: number;
  unauthorized?: boolean;
};

type RuntimeProbe = {
  available: boolean;
  version: string | null;
};

type GlobalState = typeof globalThis & {
  __octaneUserServers?: Map<string, ServerRecord>;
  __octaneStartingServers?: Map<string, Promise<ServerRecord>>;
  __octaneUserServerExitHook?: boolean;
};

const state = globalThis as GlobalState;
const servers = (state.__octaneUserServers ??= new Map<string, ServerRecord>());
const starting = (state.__octaneStartingServers ??= new Map<
  string,
  Promise<ServerRecord>
>());

const DEFAULT_START_TIMEOUT_MS = 45_000;
const VERSION_CACHE_MS = 60_000;

let runtimeCache: { at: number; value: RuntimeProbe } | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basicAuth(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

function startTimeoutMs(): number {
  const configured = Number(process.env.OPENCODE_START_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_START_TIMEOUT_MS;
}

/** Stable, filesystem-safe directory name for a user subject. */
export function userKey(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 32);
}

function recordFromDescriptor(
  key: string,
  directory: string,
  descriptor: ServerDescriptor,
): ServerRecord {
  return {
    key,
    directory,
    url: `http://127.0.0.1:${descriptor.port}`,
    authHeader: basicAuth(descriptor.password),
    pid:
      typeof descriptor.pid === "number" && Number.isFinite(descriptor.pid)
        ? descriptor.pid
        : null,
    child: null,
  };
}

async function probeServer(
  record: Pick<ServerRecord, "url" | "authHeader">,
  timeoutMs: number,
): Promise<ServerProbe> {
  const headers = { authorization: record.authHeader };
  try {
    const info = await fetch(`${record.url}/api/info`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (info.status === 401 || info.status === 403) {
      return { ok: false, unauthorized: true };
    }
    if (info.ok) {
      const data = (await info.json().catch(() => null)) as { pid?: unknown } | null;
      return {
        ok: true,
        pid: typeof data?.pid === "number" ? data.pid : undefined,
      };
    }
    // v1 servers do not expose /api/info.
    const health = await fetch(`${record.url}/global/health`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (health.status === 401 || health.status === 403) {
      return { ok: false, unauthorized: true };
    }
    return { ok: health.ok };
  } catch {
    return { ok: false };
  }
}

async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else if (port > 0) resolve(port);
        else reject(new Error("Could not allocate a local port."));
      });
    });
  });
}

async function linkSkills(directory: string): Promise<void> {
  const skills = opencodeSkillsDir();
  if (!skills) return;
  const target = path.join(directory, ".config", "opencode", "skills");
  try {
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink() || stats.isDirectory()) return;
    await fs.rm(target, { force: true });
  } catch {
    // Nothing there yet.
  }
  try {
    await fs.mkdir(path.dirname(skills), { recursive: true }).catch(() => undefined);
    await fs.symlink(
      path.resolve(skills),
      target,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch {
    // Skills are optional; a failed link must not block the server.
  }
}

async function prepareDirectory(
  directory: string,
  subject: string,
  username?: string,
): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await Promise.all([
    fs.mkdir(path.join(directory, ".config", "opencode"), { recursive: true }),
    fs.mkdir(path.join(directory, ".local", "share"), { recursive: true }),
    fs.mkdir(path.join(directory, ".local", "state"), { recursive: true }),
    fs.mkdir(path.join(directory, ".cache"), { recursive: true }),
    fs.mkdir(path.join(directory, "tmp"), { recursive: true }),
    fs.mkdir(path.join(directory, "AppData", "Roaming"), { recursive: true }),
    fs.mkdir(path.join(directory, "AppData", "Local"), { recursive: true }),
  ]);
  await linkSkills(directory);
  await fs
    .writeFile(
      path.join(directory, "profile.json"),
      JSON.stringify(
        {
          subject,
          username: username ?? subject,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    )
    .catch(() => undefined);
}

function buildEnvironment(directory: string, password: string): NodeJS.ProcessEnv {
  const tmp = path.join(directory, "tmp");
  const baseHome = os.homedir();
  const env: NodeJS.ProcessEnv = {
    PATH:
      process.env.PATH ??
      process.env.Path ??
      "/usr/local/bin:/usr/bin:/bin",
    Path: process.env.Path ?? process.env.PATH,
    HOME: directory,
    USERPROFILE: directory,
    XDG_CONFIG_HOME: path.join(directory, ".config"),
    XDG_DATA_HOME: path.join(directory, ".local", "share"),
    XDG_CACHE_HOME: path.join(directory, ".cache"),
    XDG_STATE_HOME: path.join(directory, ".local", "state"),
    APPDATA: path.join(directory, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(directory, "AppData", "Local"),
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    OPENCODE_SERVER_USERNAME: "opencode",
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_PASSWORD: password,
    TERM: "dumb",
    NO_COLOR: "1",
    CI: "1",
    GIT_TERMINAL_PROMPT: "0",
    NODE_ENV: process.env.NODE_ENV,
  };

  for (const key of [
    "SystemRoot",
    "ComSpec",
    "WINDIR",
    "PATHEXT",
    "USERNAME",
    "USERDOMAIN",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
    "LANG",
    "LC_ALL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSH_AUTH_SOCK",
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  const gitconfig = path.join(baseHome, ".gitconfig");
  if (existsSync(gitconfig)) env.GIT_CONFIG_GLOBAL = gitconfig;

  return env;
}

function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Windows cannot spawn `.cmd` shims without a shell, but `cmd /c` mangles a
 * quoted bare command. Use a shell only for bare commands, `cmd /c` for
 * shims and a direct spawn for real executables.
 */
function spawnBin(args: string[], options: SpawnOptions): ChildProcess {
  const bin = opencodeBin();
  if (process.platform !== "win32") {
    return spawn(/* turbopackIgnore: true */ bin, args, options);
  }
  if (/\.(cmd|bat)$/i.test(bin)) {
    return spawn(
      /* turbopackIgnore: true */
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `${quoteForCmd(bin)} ${args.map(quoteForCmd).join(" ")}`],
      options,
    );
  }
  if (path.isAbsolute(bin)) {
    return spawn(/* turbopackIgnore: true */ bin, args, options);
  }
  return spawn(/* turbopackIgnore: true */ [bin, ...args].join(" "), [], {
    ...options,
    shell: true,
  });
}

function spawnServer(directory: string, port: number, password: string): ChildProcess {
  const args = [
    "serve",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ];
  return spawnBin(args, {
    cwd: opencodeWorkspace(),
    env: buildEnvironment(directory, password),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function killTree(child: ChildProcess, force = false): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    child.kill(force ? "SIGKILL" : "SIGTERM");
  } catch {
    // already gone
  }
}

async function stopRecord(record: ServerRecord): Promise<void> {
  const child = record.child;
  if (child && child.exitCode === null) {
    killTree(child);
    await Promise.race([once(child, "exit"), delay(5_000)]).catch(() => undefined);
    if (child.exitCode === null) killTree(child, true);
  }
  await fs
    .unlink(path.join(record.directory, "server.json"))
    .catch(() => undefined);
}

async function tryReuse(
  key: string,
  directory: string,
): Promise<ServerRecord | null> {
  const descriptorPath = path.join(directory, "server.json");
  let parsed: Partial<ServerDescriptor>;
  try {
    parsed = JSON.parse(await fs.readFile(descriptorPath, "utf8")) as Partial<ServerDescriptor>;
  } catch {
    return null;
  }
  if (
    typeof parsed.port !== "number" ||
    !Number.isFinite(parsed.port) ||
    typeof parsed.password !== "string" ||
    !parsed.password
  ) {
    await fs.unlink(descriptorPath).catch(() => undefined);
    return null;
  }
  const record = recordFromDescriptor(key, directory, {
    port: parsed.port,
    password: parsed.password,
    pid: parsed.pid,
    startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now(),
  });
  const probe = await probeServer(record, 1_500);
  if (probe.ok) {
    record.pid = probe.pid ?? record.pid;
    return record;
  }
  await fs.unlink(descriptorPath).catch(() => undefined);
  return null;
}

async function waitUntilReady(
  record: ServerRecord,
  child: ChildProcess,
  errorTail: () => string,
): Promise<ServerProbe> {
  const deadline = Date.now() + startTimeoutMs();
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `OpenCode exited before it was ready (${child.exitCode ?? child.signalCode}).${errorTail()}`,
      );
    }
    const probe = await probeServer(record, 1_500);
    if (probe.ok) return probe;
    if (probe.unauthorized) {
      throw new Error("OpenCode rejected the password generated for this user.");
    }
    await delay(250);
  }
  throw new Error(
    `OpenCode did not become ready within ${startTimeoutMs()}ms.${errorTail()}`,
  );
}

async function startServer(
  key: string,
  subject: string,
  username?: string,
): Promise<ServerRecord> {
  const directory = path.join(opencodeUsersDir(), key);
  await prepareDirectory(directory, subject, username);

  const reused = await tryReuse(key, directory);
  if (reused) {
    servers.set(key, reused);
    return reused;
  }

  const port = await freePort();
  const password = randomBytes(24).toString("base64url");
  const record: ServerRecord = {
    key,
    directory,
    url: `http://127.0.0.1:${port}`,
    authHeader: basicAuth(password),
    pid: null,
    child: null,
  };

  const child = spawnServer(directory, port, password);
  record.child = child;

  const logPath = path.join(directory, "opencode.log");
  await fs
    .stat(logPath)
    .then((stats) => {
      if (stats.size > 10 * 1024 * 1024) return fs.truncate(logPath, 0);
      return undefined;
    })
    .catch(() => undefined);
  const log = createWriteStream(logPath, {
    flags: "a",
    mode: 0o600,
  });
  log.on("error", () => undefined);
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);

  let tail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    tail = (tail + chunk.toString("utf8")).slice(-4_000);
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    tail = (tail + chunk.toString("utf8")).slice(-4_000);
  });

  const spawnFailure = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(error));
  });

  child.once("exit", () => {
    log.end();
    const current = servers.get(key);
    if (current?.child === child) {
      servers.delete(key);
      void fs
        .unlink(path.join(directory, "server.json"))
        .catch(() => undefined);
    }
  });

  try {
    const probe = await Promise.race([
      waitUntilReady(record, child, () =>
        tail ? `\n${tail.trim()}` : "",
      ),
      spawnFailure,
    ]);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("OpenCode exited during startup.");
    }
    record.pid = probe.pid ?? child.pid ?? null;
    const descriptor: ServerDescriptor = {
      pid: record.pid,
      port,
      password,
      startedAt: Date.now(),
    };
    await fs.writeFile(
      path.join(directory, "server.json"),
      JSON.stringify(descriptor, null, 2),
      { mode: 0o600 },
    );
  } catch (error) {
    killTree(child);
    log.end();
    await fs
      .unlink(path.join(directory, "server.json"))
      .catch(() => undefined);
    throw error;
  }

  servers.set(key, record);
  return record;
}

/**
 * Return the running server for this user, starting one on first use. A
 * descriptor on disk lets a restarted web process reuse servers that survived.
 */
export async function managedServerFor(
  subject: string,
  username?: string,
): Promise<ManagedServer> {
  const key = userKey(subject);
  const existing = servers.get(key);
  if (existing) {
    const probe = await probeServer(existing, 1_200);
    if (probe.ok) {
      return existing;
    }
    servers.delete(key);
    await stopRecord(existing);
  }

  const pending = starting.get(key);
  if (pending) return pending;

  const promise = startServer(key, subject, username).finally(() => {
    starting.delete(key);
  });
  starting.set(key, promise);
  return promise;
}

function readVersion(): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawnBin(["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      killTree(child, true);
      finish(null);
    }, 5_000);
    function finish(code: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output });
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", () => finish(null));
    child.once("exit", (code) => finish(code));
  });
}

/** Health probe for the login page: is the CLI able to start user servers? */
export async function probeManagedRuntime(): Promise<RuntimeProbe> {
  if (runtimeCache && Date.now() - runtimeCache.at < VERSION_CACHE_MS) {
    return runtimeCache.value;
  }
  const result = await readVersion();
  const match = result.output.match(/v?(\d+\.\d+\.\d+)/);
  const value: RuntimeProbe = {
    available: result.code === 0,
    version: match?.[1] ?? null,
  };
  runtimeCache = { at: Date.now(), value };
  return value;
}

if (!state.__octaneUserServerExitHook) {
  state.__octaneUserServerExitHook = true;
  process.once("exit", () => {
    for (const record of servers.values()) {
      if (record.child && record.child.exitCode === null) {
        killTree(record.child);
      }
    }
  });
}

