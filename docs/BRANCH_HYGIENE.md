# Branch hygiene

Rules for creating, keeping and deleting branches in `unicef/adt-studio`. Read this
before you delete, prune or clean up any branch, local or remote.

## The rules

1. **A merged PR's branch is deleted automatically.** The repository setting
   "Automatically delete head branches" has been on since 2026-11-25. When it deletes a
   branch that is the base of an open stacked PR, GitHub retargets that PR. Don't
   recreate a branch after its PR merges. Open a new branch from `develop` instead.
2. **Never delete a branch by hand while it is the head or base of an open PR.** Deleting
   a base branch whose own PR has not merged *closes* every PR stacked on it. After its
   own PR merges, GitHub retargets those PRs to the merged PR's base branch, as in rule 1.
3. **Judge "merged" by the PR, not by `git branch --merged`.** The repo squash-merges, so
   git does not see a merged branch as merged. A branch counts as merged only when its PR
   merged **and** the branch tip is the PR's merged head commit or an ancestor of it.
   Any other commits on the branch are unmerged work.
4. **Ask the owner before deleting anything else.** Branches whose PR closed without
   merging, and branches that never had a PR, may hold work in progress. The owner is
   the PR author, or, for a branch without a PR, the last person to commit.
5. **Some branches are infrastructure and are never cleaned up:**

   | Branch | Why it stays |
   |---|---|
   | `main`, `develop` | Release branches; protected by the "Protect main and develop" ruleset |
   | `landing-page` | `site.yml` deploys the live site (`unicef.github.io/adt-studio`) from it; protected |
   | `staging/pr-<n>` | Created by `staging.yml` and deleted by `staging-cleanup.yml` when PR `<n>` closes. Delete one by hand only when its PR is closed and the workflow missed it |

   Other `staging/*` branches are ordinary branches and follow rule 4.

6. **Tags are never touched.** Release versions are calculated from `v*` tags (see
   [RELEASING.md](RELEASING.md)).

## Restoring a deleted branch

A branch that had a PR can be restored with the **Restore branch** button on that PR's
page. For any branch, you can push its last commit back while GitHub still has the
commit:

```bash
git fetch origin <sha>
git push origin <sha>:refs/heads/<branch>
```

The one-time cleanup records each deleted branch's commit ID for this purpose.

## Local hygiene (recommended)

```bash
git config fetch.prune true        # drop remote-tracking refs for deleted branches
git config fetch.pruneTags true
git maintenance start              # background prefetch, commit-graph and repacking
git branch -vv | grep ': gone]'    # local branches whose remote was deleted
```

Before you delete a local branch marked `gone`, compare its tip with its PR's head
commit. A local branch can hold commits that were never pushed.

## Cleanup history

- [2026-11-25: one-time cleanup of merged branches](maintenance/2026-11-25-branch-cleanup.md)
