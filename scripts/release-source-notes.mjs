const HEADING = "### Release source";
const GITHUB_URL_PREFIX = "https://github.com/";

function githubUrl(value) {
  return typeof value === "string" && value.startsWith(GITHUB_URL_PREFIX);
}

function singleLine(value) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim() : "";
}

function codeValue(value) {
  const normalized = singleLine(value);
  return normalized && !normalized.includes("`") ? normalized : undefined;
}

function formatCommit(label, commit) {
  if (!commit || !githubUrl(commit.url)) return undefined;
  const sha = codeValue(commit.sha);
  if (!sha) return undefined;
  const subject = singleLine(commit.subject);
  return `- ${label}: [\`${sha}\`](${commit.url})${subject ? ` ${subject}` : ""}`;
}

/**
 * Formats the stable markdown contract consumed by both GitHub and the app.
 * The PR list can be partial; the Compare link remains the complete history.
 */
export function formatReleaseSourceSection(source) {
  if (!source || typeof source !== "object") return "";

  const lines = [];
  const branch = codeValue(source.branch);
  if (branch) lines.push(`- Branch: \`${branch}\``);

  const build = formatCommit("Built from", source.buildCommit);
  if (build) lines.push(build);
  const change = formatCommit("Last change", source.changeCommit);
  if (change) lines.push(change);

  for (const pr of Array.isArray(source.prs) ? source.prs : []) {
    if (
      !pr ||
      !Number.isSafeInteger(pr.number) ||
      pr.number <= 0 ||
      !githubUrl(pr.url)
    ) {
      continue;
    }
    const head = codeValue(pr.headRef);
    const base = codeValue(pr.baseRef);
    const refs = head && base ? ` \`${head}\` → \`${base}\`` : "";
    const author = singleLine(pr.author).replace(/^@/, "");
    const by = author ? ` by @${author}` : "";
    const title = singleLine(pr.title);
    const suffix = title ? ` — ${title}` : "";
    lines.push(`- PR [#${pr.number}](${pr.url})${refs}${by}${suffix}`);
  }

  if (source.compare && githubUrl(source.compare.url)) {
    const label = singleLine(source.compare.label);
    if (label && !label.includes("]")) {
      lines.push(`- Compare: [${label}](${source.compare.url})`);
    }
  }

  return lines.length ? `${HEADING}\n\n${lines.join("\n")}` : "";
}

function lastHeadingIndex(body) {
  const pattern = /^### Release source[ \t]*$/gm;
  let index = -1;
  let match;
  while ((match = pattern.exec(body))) index = match.index;
  return index;
}

function parseCommit(line, label) {
  const match = line.match(
    /^- (Built from|Last change): \[`([^`\r\n]+)`\]\((https:\/\/github\.com\/[^)\s]+)\)(?: (.*))?$/,
  );
  if (!match || match[1] !== label || !githubUrl(match[3])) return undefined;
  return { sha: match[2], url: match[3], subject: match[4] || undefined };
}

function parsePullRequest(line) {
  const match = line.match(
    /^- PR \[#([1-9]\d*)\]\((https:\/\/github\.com\/[^)\s]+)\)(?: `([^`\r\n]+)` → `([^`\r\n]+)`)?(?: by @([^\s]+))?(?: — (.*))?$/,
  );
  if (!match || !githubUrl(match[2])) return undefined;
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number)) return undefined;
  return {
    number,
    url: match[2],
    headRef: match[3] || undefined,
    baseRef: match[4] || undefined,
    author: match[5] || undefined,
    title: match[6] || undefined,
  };
}

export function parseReleaseSourceSection(body) {
  if (typeof body !== "string" || !body) {
    return { notes: typeof body === "string" ? body : "", source: undefined };
  }

  const headingIndex = lastHeadingIndex(body);
  if (headingIndex < 0) return { notes: body, source: undefined };

  const section = body.slice(headingIndex).replace(/\r\n/g, "\n");
  const lines = section.split("\n").slice(1);
  const source = { prs: [] };
  let recognized = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("- ")) continue;

    const branch = line.match(/^- Branch: `([^`\r\n]+)`$/);
    if (branch) {
      source.branch = branch[1];
      recognized++;
      continue;
    }

    const buildCommit = parseCommit(line, "Built from");
    if (buildCommit) {
      source.buildCommit = buildCommit;
      recognized++;
      continue;
    }

    const changeCommit = parseCommit(line, "Last change");
    if (changeCommit) {
      source.changeCommit = changeCommit;
      recognized++;
      continue;
    }

    const pr = parsePullRequest(line);
    if (pr) {
      source.prs.push(pr);
      recognized++;
      continue;
    }

    const compare = line.match(
      /^- Compare: \[([^\]\r\n]+)\]\((https:\/\/github\.com\/[^)\s]+)\)$/,
    );
    if (compare && githubUrl(compare[2])) {
      source.compare = { label: compare[1], url: compare[2] };
      recognized++;
    }
  }

  if (!recognized) return { notes: body, source: undefined };
  return {
    notes: body.slice(0, headingIndex).trimEnd(),
    source,
  };
}

export function stripReleaseSourceSection(body) {
  if (typeof body !== "string" || !body) return body;

  const parsed = parseReleaseSourceSection(body);
  if (parsed.source) return parsed.notes;

  const pattern = /<h3\b[^>]*>\s*Release source\s*<\/h3>/gi;
  let index = -1;
  let match;
  while ((match = pattern.exec(body))) index = match.index;
  return index >= 0 ? body.slice(0, index).trimEnd() : body;
}
