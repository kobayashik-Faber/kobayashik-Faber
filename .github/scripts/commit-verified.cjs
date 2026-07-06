// Commits the managed README files via the GitHub GraphQL API so the resulting
// commit is signed with GitHub's key (shows as "Verified") and satisfies the
// "Require signed commits" branch protection on main. Invoked from
// actions/github-script, which supplies { github, context, core }.
const fs = require('fs');
const { execSync } = require('child_process');

const MANAGED_FILES = ['README.md', 'assets/banner.svg'];

module.exports = async ({ github, context, core }) => {
  // Which managed files actually changed?
  const changed = MANAGED_FILES.filter((f) => {
    try {
      execSync(`git diff --quiet -- ${f}`, { stdio: 'ignore' });
      return false; // no diff
    } catch {
      return true; // diff present
    }
  });
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
