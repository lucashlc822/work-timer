/**
 * This build's version, from `package.json` (substituted by Vite at build time).
 *
 * The server can ask apps older than `app_config.min_client_version` to update
 * before they sync again; this is what that minimum is compared against.
 */
export const APP_VERSION: string = __APP_VERSION__;

const parse = (v: string): [number, number, number] | null => {
  // A pre-release or build suffix (`1.0.0-beta`, `1.0.0+abc`) is ignored.
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

/**
 * Compare two `major.minor.patch` versions: -1 if `a` is older, 1 if newer,
 * 0 if the same. Null if either isn't a version at all, so a typo on the
 * server can be ignored rather than read as "everyone must update".
 */
export const compareVersions = (a: string, b: string): -1 | 0 | 1 | null => {
  const pa = parse(a);
  const pb = parse(b);
  if (pa === null || pb === null) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i]! < pb[i]!) return -1;
    if (pa[i]! > pb[i]!) return 1;
  }
  return 0;
};
