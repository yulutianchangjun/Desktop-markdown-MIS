/**
 * DSH 沙箱下的本地构建垫片（仅在本机受限环境需要，不影响项目本身）。
 *
 * 背景：Vite 在 Windows 上首次解析路径时会执行 optimizeSafeRealPathSync()，它先探测
 *
 *     fs.realpathSync.native(path.resolve('./'))
 *
 * 只有在这次探测抛出 EISDIR 时，Vite 才会走「safeRealpathSync = fs.realpathSync」的
 * 分支并直接返回；否则它会调用 exec('net use') 去建立网络盘映射表。而 DSH 沙箱禁止
 * 以管道方式创建子进程（child_process 的 stdio: 'pipe' 会得到 EPERM），于是 exec 同步
 * 抛出 spawn EPERM，整个 vite build 在加载配置文件阶段就失败。
 *
 * 本垫片只做一件事：让那一次针对当前工作目录的探测抛出 Vite 已经在处理的 EISDIR，
 * 使 Vite 走它自己的回退分支（普通 realpathSync），从而完全跳过 shell 探测。
 * 垫片不修改 node_modules，只在显式设置 NODE_OPTIONS 时生效：
 *
 *     NODE_OPTIONS="--import file:///<abs>/tools/dsh-build-shim.mjs"
 *
 * 在没有沙箱限制的机器上不需要它，直接 `pnpm build` 即可。
 */
import fs from 'node:fs';
import path from 'node:path';

const realpathNative = fs.realpathSync.native;
let probeConsumed = false;

fs.realpathSync.native = function realpathSyncNativeShim(target, ...rest) {
  if (!probeConsumed && typeof target === 'string') {
    let resolved;
    try {
      resolved = path.resolve(target);
    } catch {
      resolved = null;
    }

    // 只拦截 Vite 那一次「对 cwd 的探测」，且仅一次；其余调用原样透传。
    if (resolved === process.cwd()) {
      probeConsumed = true;
      const error = new Error('EISDIR: illegal operation on a directory, realpath');
      error.code = 'EISDIR';
      error.errno = -4068;
      error.syscall = 'realpath';
      throw error;
    }
  }

  return realpathNative.call(this, target, ...rest);
};
