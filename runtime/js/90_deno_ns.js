// Copyright 2018-2025 the Deno authors. MIT license.

import { core, primordials } from "ext:core/mod.js";
import {
  op_net_listen_udp,
  op_net_listen_unixpacket,
  op_runtime_cpu_usage,
  op_runtime_memory_usage,
} from "ext:core/ops";

import * as timers from "ext:deno_web/02_timers.js";
import * as httpClient from "ext:deno_fetch/22_http_client.js";
import * as console from "ext:deno_console/01_console.js";
import * as ffi from "ext:deno_ffi/00_ffi.js";
import * as net from "ext:deno_net/01_net.js";
import * as tls from "ext:deno_net/02_tls.js";
import * as serve from "ext:deno_http/00_serve.ts";
import * as http from "ext:deno_http/01_http.js";
import * as websocket from "ext:deno_http/02_websocket.ts";
import * as errors from "ext:runtime/01_errors.js";
import * as version from "ext:runtime/01_version.ts";
import * as permissions from "ext:runtime/10_permissions.js";
import * as io from "ext:deno_io/12_io.js";
import * as fs from "ext:deno_fs/30_fs.js";
import * as os from "ext:deno_os/30_os.js";
import * as fsEvents from "ext:runtime/40_fs_events.js";
import * as process from "ext:deno_process/40_process.js";
import * as signals from "ext:deno_os/40_signals.js";
import * as tty from "ext:runtime/40_tty.js";
import * as kv from "ext:deno_kv/01_db.ts";
import * as cron from "ext:deno_cron/01_cron.ts";
import * as webgpuSurface from "ext:deno_webgpu/02_surface.js";
import * as telemetry from "ext:deno_telemetry/telemetry.ts";
import { unstableIds } from "ext:deno_features/flags.js";
import { loadWebGPU } from "ext:deno_webgpu/00_init.js";

const { ObjectDefineProperties, Float64Array } = primordials;

const loadQuic = core.createLazyLoader("ext:deno_net/03_quic.js");
const loadWebTransport = core.createLazyLoader("ext:deno_web/webtransport.js");

// the out buffer for `cpuUsage` and `memoryUsage`
const usageBuffer = new Float64Array(4);

const denoNs = {
  Process: process.Process,
  run: process.run,
  isatty: tty.isatty,
  writeFileSync: fs.writeFileSync,
  writeFile: fs.writeFile,
  writeTextFileSync: fs.writeTextFileSync,
  writeTextFile: fs.writeTextFile,
  readTextFile: fs.readTextFile,
  readTextFileSync: fs.readTextFileSync,
  readFile: fs.readFile,
  readFileSync: fs.readFileSync,
  watchFs: fsEvents.watchFs,
  chmodSync: fs.chmodSync,
  chmod: fs.chmod,
  chown: fs.chown,
  chownSync: fs.chownSync,
  copyFileSync: fs.copyFileSync,
  cwd: fs.cwd,
  makeTempDirSync: fs.makeTempDirSync,
  makeTempDir: fs.makeTempDir,
  makeTempFileSync: fs.makeTempFileSync,
  makeTempFile: fs.makeTempFile,
  cpuUsage: () => {
    op_runtime_cpu_usage(usageBuffer);
    const { 0: system, 1: user } = usageBuffer;
    return {
      system,
      user,
    };
  },
  memoryUsage: () => {
    op_runtime_memory_usage(usageBuffer);
    const {
      0: rss,
      1: heapTotal,
      2: heapUsed,
      3: external,
    } = usageBuffer;
    return {
      rss,
      heapTotal,
      heapUsed,
      external,
    };
  },
  mkdirSync: fs.mkdirSync,
  mkdir: fs.mkdir,
  chdir: fs.chdir,
  copyFile: fs.copyFile,
  readDirSync: fs.readDirSync,
  readDir: fs.readDir,
  readLinkSync: fs.readLinkSync,
  readLink: fs.readLink,
  realPathSync: fs.realPathSync,
  realPath: fs.realPath,
  removeSync: fs.removeSync,
  remove: fs.remove,
  renameSync: fs.renameSync,
  rename: fs.rename,
  version: version.version,
  build: core.build,
  statSync: fs.statSync,
  lstatSync: fs.lstatSync,
  stat: fs.stat,
  lstat: fs.lstat,
  truncateSync: fs.truncateSync,
  truncate: fs.truncate,
  errors: errors.errors,
  inspect: console.inspect,
  env: os.env,
  exit: os.exit,
  execPath: os.execPath,
  SeekMode: io.SeekMode,
  FsFile: fs.FsFile,
  open: fs.open,
  openSync: fs.openSync,
  create: fs.create,
  createSync: fs.createSync,
  stdin: io.stdin,
  stdout: io.stdout,
  stderr: io.stderr,
  connect: net.connect,
  listen: net.listen,
  loadavg: os.loadavg,
  connectTls: tls.connectTls,
  listenTls: tls.listenTls,
  startTls: tls.startTls,
  symlink: fs.symlink,
  symlinkSync: fs.symlinkSync,
  link: fs.link,
  linkSync: fs.linkSync,
  permissions: permissions.permissions,
  Permissions: permissions.Permissions,
  PermissionStatus: permissions.PermissionStatus,
  serveHttp: http.serveHttp,
  serve: serve.serve,
  resolveDns: net.resolveDns,
  upgradeWebSocket: websocket.upgradeWebSocket,
  utime: fs.utime,
  utimeSync: fs.utimeSync,
  kill: process.kill,
  addSignalListener: signals.addSignalListener,
  removeSignalListener: signals.removeSignalListener,
  refTimer: timers.refTimer,
  unrefTimer: timers.unrefTimer,
  osRelease: os.osRelease,
  osUptime: os.osUptime,
  hostname: os.hostname,
  systemMemoryInfo: os.systemMemoryInfo,
  networkInterfaces: os.networkInterfaces,
  consoleSize: tty.consoleSize,
  gid: os.gid,
  uid: os.uid,
  Command: process.Command,
  ChildProcess: process.ChildProcess,
  dlopen: ffi.dlopen,
  UnsafeCallback: ffi.UnsafeCallback,
  UnsafePointer: ffi.UnsafePointer,
  UnsafePointerView: ffi.UnsafePointerView,
  UnsafeFnPointer: ffi.UnsafeFnPointer,
  umask: fs.umask,
  HttpClient: httpClient.HttpClient,
  createHttpClient: httpClient.createHttpClient,
  telemetry: telemetry.telemetry,
};

const denoNsUnstableById = { __proto__: null };

// denoNsUnstableById[unstableIds.broadcastChannel] = { __proto__: null }

denoNsUnstableById[unstableIds.cron] = {
  cron: cron.cron,
};

denoNsUnstableById[unstableIds.kv] = {
  openKv: kv.openKv,
  AtomicOperation: kv.AtomicOperation,
  Kv: kv.Kv,
  KvU64: kv.KvU64,
  KvListIterator: kv.KvListIterator,
};

denoNsUnstableById[unstableIds.net] = {
  listenDatagram: net.createListenDatagram(
    op_net_listen_udp,
    op_net_listen_unixpacket,
  ),
};

ObjectDefineProperties(denoNsUnstableById[unstableIds.net], {
  connectQuic: core.propWritableLazyLoaded((q) => q.connectQuic, loadQuic),
  QuicEndpoint: core.propWritableLazyLoaded((q) => q.QuicEndpoint, loadQuic),
  QuicBidirectionalStream: core.propWritableLazyLoaded(
    (q) => q.QuicBidirectionalStream,
    loadQuic,
  ),
  QuicConn: core.propWritableLazyLoaded((q) => q.QuicConn, loadQuic),
  QuicListener: core.propWritableLazyLoaded((q) => q.QuicListener, loadQuic),
  QuicReceiveStream: core.propWritableLazyLoaded(
    (q) => q.QuicReceiveStream,
    loadQuic,
  ),
  QuicSendStream: core.propWritableLazyLoaded(
    (q) => q.QuicSendStream,
    loadQuic,
  ),
  QuicIncoming: core.propWritableLazyLoaded((q) => q.QuicIncoming, loadQuic),
  upgradeWebTransport: core.propWritableLazyLoaded(
    (wt) => wt.upgradeWebTransport,
    loadWebTransport,
  ),
});

// denoNsUnstableById[unstableIds.unsafeProto] = { __proto__: null }

denoNsUnstableById[unstableIds.webgpu] = {
  UnsafeWindowSurface: webgpuSurface.UnsafeWindowSurface,
};
ObjectDefineProperties(denoNsUnstableById[unstableIds.webgpu], {
  webgpu: core.propWritableLazyLoaded(
    (webgpu) => webgpu.denoNsWebGPU,
    loadWebGPU,
  ),
});

// denoNsUnstableById[unstableIds.workerOptions] = { __proto__: null }

export { denoNs, denoNsUnstableById, unstableIds };
