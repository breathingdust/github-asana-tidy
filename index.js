const core = require('@actions/core');
const { Octokit } = require('@octokit/action');
const asana = require('asana');

const ASANA_PAT = core.getInput('asana_pat');
const ASANA_WORKSPACE_GID = core.getInput('asana_workspace_gid');
const ASANA_PROJECT_GID = core.getInput('asana_project_gid');
const ASANA_TARGET_SECTION_GID = core.getInput('asana_target_section_gid');
const ASANA_GITHUB_URL_FIELD_GID = core.getInput('asana_github_url_field_gid');
const GITHUB_RELEASE_NAME = core.getInput('github_release_name');

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkAndCloseLinkedAsana(asanaClient, issueUrl) {
  const params = {
    'projects.any': ASANA_PROJECT_GID,
    completed: false,
    [`custom_fields.${ASANA_GITHUB_URL_FIELD_GID}.value`]: issueUrl,
  };

  let tasks = [];

  try {
    const searchResults = await asanaClient.tasks.searchInWorkspace(ASANA_WORKSPACE_GID, params);
    tasks = searchResults.data;
    if (tasks.length > 0) {
      core.info(`Asana found for ${issueUrl}`);
    } else {
      core.info(`No Asana found for ${issueUrl}`);
    }
  } catch (error) {
    core.setFailed(`Error searching asana tasks by ${issueUrl} ${error}`);
    return false;
  }

  const comment = {
    html_text: `<body>(Automated Message)The GitHub issue linked to this Asana has been resolved in <a href="https://github.com/hashicorp/terraform-provider-aws/releases/tag/${GITHUB_RELEASE_NAME}">${GITHUB_RELEASE_NAME}</a> of the provider. 🎉</body>`,
    is_pinned: false,
  };

  core.info(comment);

  const fn = function createAndClose(task) {
    return Promise.all(
      [
        asanaClient.stories.createOnTask(task.gid, comment),
        asanaClient.sections.addTask(ASANA_TARGET_SECTION_GID, {
          task: task.gid,
        }),
      ],
    );
  };

  try {
    return Promise.all(tasks.map(fn));
  } catch (error) {
    core.setFailed(`Error modifying Asana on task ${tasks.gid}: ${error}`);
    return false;
  }
}

async function main() {
  const asanaClient = asana.Client.create().useAccessToken(ASANA_PAT);
  const octokit = new Octokit();
  let issues = [];

  try {
    issues = await octokit.paginate(octokit.rest.search.issuesAndPullRequests, {
      q: `user:${owner} repo:${repo} milestone:${GITHUB_RELEASE_NAME}`,
    });
    core.info(`Found ${issues.length} issues in release ${GITHUB_RELEASE_NAME}`);
  } catch (error) {
    core.setFailed(`Error retrieving release by tag ${GITHUB_RELEASE_NAME}`);
  }
  /* eslint-disable */
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    await checkAndCloseLinkedAsana(asanaClient, issue.html_url);
    await sleep(1000);
  }
  /* eslint-disable */  
}

try {
  main();
} catch (error) {
  core.setFailed(error);
}