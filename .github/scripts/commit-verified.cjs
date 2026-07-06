// Commits the managed README files via the GitHub GraphQL API so the resulting
// commit is signed with GitHub's key (shows as "Verified") and satisfies the
// "Require signed commits" branch protection on main. Invoked from
// actions/github-script, which supplies { github, context, core }.
const fs = require('fs');
const { execSync } = require('child_process');

const MANAGED_FILES = ['README.md', 'assets/banner.svg'];

// buildBanner() stamps a minute-resolution "Updated:" timestamp into the banner
// on every run, so banner.svg always differs even when nothing else changed.
// Treat a banner whose only change is that timestamp as unchanged, so we don't
// create a commit for a timestamp bump alone.
const stripTimestamp = (svg) => svg.replace(/Updated:[^<]*/g, 'Updated:');

// Does this managed file have a change worth committing?
function hasRealChange(path) {
  try {
    execSync(`git diff --quiet -- ${path}`, { stdio: 'ignore' });
    return false; // no diff at all
  } catch {
    // diff present — for the banner, ignore a timestamp-only change
    if (path === 'assets/banner.svg') {
      const head = execSync(`git show HEAD:${path}`).toString();
      const work = fs.readFileSync(path, 'utf8');
      return stripTimestamp(head) !== stripTimestamp(work);
    }
    return true;
  }
}

module.exports = async ({ github, context, core }) => {
  // Which managed files actually changed (ignoring the banner timestamp)?
  const changed = MANAGED_FILES.filter(hasRealChange);
  if (changed.length === 0) {
    core.info('No changes.');
    return;
  }

  const additions = changed.map((path) => ({
    path,
    contents: fs.readFileSync(path).toString('base64'),
  }));

  // HEAD the API must fast-forward from.
  const expectedHeadOid = execSync('git rev-parse HEAD').toString().trim();

  const mutation = `
    mutation ($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
        commit { oid }
      }
    }`;

  const result = await github.graphql(mutation, {
    input: {
      branch: {
        repositoryNameWithOwner: `${context.repo.owner}/${context.repo.repo}`,
        branchName: context.ref.replace('refs/heads/', ''),
      },
      message: { headline: '🤖 Refresh README and banner' },
      fileChanges: { additions },
      expectedHeadOid,
    },
  });

  core.info(`Committed ${result.createCommitOnBranch.commit.oid}`);
};
