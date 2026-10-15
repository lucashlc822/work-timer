export interface VersionFile {
  path: string;
  /** Every place the file states its version (the lockfile states it twice). */
  versions: (string | null)[];
}

export function readVersions(root: string): VersionFile[];
export function parseVersion(input: string): string;
export function setVersion(root: string, version: string): void;
export function checkVersion(
  root: string,
  version: string,
): { path: string; found: string | null }[];
