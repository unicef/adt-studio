export interface ReleaseVersionCore {
  major: number;
  minor: number;
  patch: number;
}

export interface ReleaseVersion extends ReleaseVersionCore {
  prerelease: readonly (string | number)[] | null;
}

export declare const RELEASE_VERSION_PATTERN: RegExp;
export declare function parseReleaseTag(value: string): ReleaseVersion | null;
export declare function isBetaVersion(version: ReleaseVersion): boolean;
export declare function betaNumberOf(version: ReleaseVersion): number | null;
export declare function compareReleaseVersions(
  left: ReleaseVersion,
  right: ReleaseVersion,
): number;
export declare function compareCore(
  left: ReleaseVersionCore,
  right: ReleaseVersionCore,
): number;
export declare function formatCore(version: ReleaseVersionCore): string;
export declare function listGitTags(): string[];
