export interface ReleaseSourcePullRequest {
  number: number;
  url: string;
  headRef?: string;
  baseRef?: string;
  author?: string;
  title?: string;
}

export interface ReleaseSourceCommit {
  sha: string;
  url: string;
  subject?: string;
}

export interface ReleaseSource {
  branch?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  buildCommit?: ReleaseSourceCommit;
  changeCommit?: ReleaseSourceCommit;
  prs: ReleaseSourcePullRequest[];
  compare?: { label: string; url: string };
}

export declare function formatReleaseSourceSection(
  source?: Partial<ReleaseSource>,
): string;
export declare function parseReleaseSourceSection(body: string): {
  notes: string;
  source?: ReleaseSource;
};
export declare function parseReleasePresentation(body: string): {
  title?: string;
  coverUrl?: string;
  coverAlt?: string;
  notes: string;
};
export declare function stripReleaseSourceSection(body: string): string;
