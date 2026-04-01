/**
 * Check if isolated-vm (via secure-exec) is available on this platform/Node version.
 * Used to skip sandbox tests when prebuilt binaries are missing (e.g. Node 20 in CI).
 */
let _available: boolean | null = null;

export function canUseIsolate(): boolean {
  if (_available !== null) return _available;
  try {
    require("isolated-vm");
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}
