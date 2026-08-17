import { lstat, readlink, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

const PROFILE_SINGLETON_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"];

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export async function clearStaleProfileLock(profileDir) {
  const lockPath = join(profileDir, "SingletonLock");
  let lockTarget;
  try {
    const lock = await lstat(lockPath);
    if (!lock.isSymbolicLink()) return false;
    lockTarget = await readlink(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }

  const separator = lockTarget.lastIndexOf("-");
  const lockHost = lockTarget.slice(0, separator);
  const lockPid = Number(lockTarget.slice(separator + 1));
  if (!lockHost || !Number.isSafeInteger(lockPid) || lockPid <= 0) return false;

  // A live process on this host owns the profile. Never break its lock. A
  // foreign-host lock is left behind when a persistent sandbox is restored.
  if (lockHost === hostname() && processIsAlive(lockPid)) return false;

  for (const filename of PROFILE_SINGLETON_FILES) {
    const path = join(profileDir, filename);
    try {
      const entry = await lstat(path);
      if (entry.isSymbolicLink()) await unlink(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return true;
}
