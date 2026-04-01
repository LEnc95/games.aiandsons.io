const {
  buildFeedbackBaselineIssueTitle,
  buildFeedbackIssueDescription,
  buildFeedbackIssueTitle,
  getFeedbackLinearLabelNames,
  normalizeSingleLine,
} = require("./_shared");

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const LABEL_CACHE_TTL_MS = 5 * 60_000;
const BASELINE_CACHE_TTL_MS = 5 * 60_000;
const PROVISION_DEFAULT_LABELS = [
  "setup",
  "tracking",
  "kind/bug",
  "kind/feature",
  "kind/chore",
  "blocked",
  "source/feedback",
  "status/needs-triage",
  "status/agent-ready",
  "status/duplicate",
];

let cachedLabels = null;
let cachedLabelsAt = 0;
let cachedBaselineIssues = null;
let cachedBaselineIssuesAt = 0;
let cachedBaselineProjectId = "";

function getLinearConfig() {
  return {
    apiKey: typeof process.env.LINEAR_API_KEY === "string"
      ? process.env.LINEAR_API_KEY.trim()
      : "",
    teamId: typeof process.env.LINEAR_TEAM_ID === "string"
      ? process.env.LINEAR_TEAM_ID.trim()
      : "",
    projectId: typeof process.env.LINEAR_PROJECT_ID === "string"
      ? process.env.LINEAR_PROJECT_ID.trim()
      : "",
    endpoint: typeof process.env.LINEAR_GRAPHQL_ENDPOINT === "string"
      ? process.env.LINEAR_GRAPHQL_ENDPOINT.trim()
      : LINEAR_ENDPOINT,
  };
}

function isLinearConfigured() {
  const config = getLinearConfig();
  return Boolean(config.apiKey && config.teamId);
}

async function linearRequest(query, variables = {}) {
  const config = getLinearConfig();
  if (!config.apiKey) {
    throw new Error("linear_not_configured");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || `linear_http_${response.status}`);
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry?.message || "Linear request failed").join("; "));
  }

  return payload?.data || {};
}

async function loadLinearLabels() {
  const now = Date.now();
  if (cachedLabels && (now - cachedLabelsAt) < LABEL_CACHE_TTL_MS) {
    return cachedLabels;
  }

  const labels = new Map();
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query FeedbackIssueLabels($after: String) {
        issueLabels(first: 250, after: $after) {
          nodes {
            id
            name
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    const data = await linearRequest(query, { after });
    const labelConnection = data?.issueLabels || {};
    const nodes = Array.isArray(labelConnection.nodes) ? labelConnection.nodes : [];
    for (const node of nodes) {
      const id = normalizeSingleLine(node?.id, 80);
      const name = normalizeSingleLine(node?.name, 120);
      if (id && name) labels.set(name, id);
    }

    const pageInfo = labelConnection.pageInfo || {};
    hasNextPage = Boolean(pageInfo.hasNextPage);
    after = hasNextPage ? pageInfo.endCursor : null;
  }

  cachedLabels = labels;
  cachedLabelsAt = now;
  return labels;
}

async function getLinearLabelIds(labelNames = []) {
  const labels = await loadLinearLabels();
  const ids = [];
  for (const name of labelNames) {
    const normalized = normalizeSingleLine(name, 120);
    if (!normalized) continue;
    const id = labels.get(normalized);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function buildLinearIssueUrl(identifier) {
  const normalized = normalizeSingleLine(identifier, 80);
  return normalized ? `https://linear.app/issue/${normalized}` : "";
}

function buildFeedbackBaselineIssueDescription(game = {}) {
  const gameName = normalizeSingleLine(game?.name || game?.gameName, 120);
  if (!gameName) return "";
  return [
    `Create issue tracking baseline for ${gameName}.`,
    "Define bug, feature, and feedback workflow and keep future work linked here.",
    "Treat player feedback submissions and follow-up agent briefs as children of this baseline issue.",
  ].join(" ");
}

function normalizeBaselineIssueNode(node) {
  const id = normalizeSingleLine(node?.id, 80);
  const title = normalizeSingleLine(node?.title, 200);
  const identifier = normalizeSingleLine(node?.identifier, 80);
  if (!id || !title) return null;
  return {
    id,
    title,
    identifier,
    url: buildLinearIssueUrl(identifier),
  };
}

function normalizeFeedbackGame(game = {}) {
  const slug = normalizeSingleLine(game?.slug || game?.gameSlug, 80);
  const name = normalizeSingleLine(game?.name || game?.gameName, 120);
  if (!slug || !name) return null;
  return {
    slug,
    name,
    label: normalizeSingleLine(game?.label, 120) || `game/${slug}`,
  };
}

function collectLabelIdsFromMap(labels, labelNames = []) {
  const ids = [];
  for (const name of labelNames) {
    const normalizedName = normalizeSingleLine(name, 120);
    if (!normalizedName) continue;
    const id = normalizeSingleLine(labels?.get?.(normalizedName), 80);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function updateCachedLabel(name, id) {
  const normalizedName = normalizeSingleLine(name, 120);
  const normalizedId = normalizeSingleLine(id, 80);
  if (!normalizedName || !normalizedId) return;
  if (!cachedLabels) {
    cachedLabels = new Map();
  }
  cachedLabels.set(normalizedName, normalizedId);
  cachedLabelsAt = Date.now();
}

function updateCachedBaselineIssue(projectId, issue) {
  const normalizedProjectId = normalizeSingleLine(projectId, 80);
  const normalizedIssue = normalizeBaselineIssueNode(issue);
  if (!normalizedProjectId || !normalizedIssue) return;
  if (!cachedBaselineIssues || cachedBaselineProjectId !== normalizedProjectId) {
    cachedBaselineIssues = new Map();
    cachedBaselineProjectId = normalizedProjectId;
  }
  cachedBaselineIssues.set(normalizedIssue.title, normalizedIssue);
  cachedBaselineIssuesAt = Date.now();
}

async function loadProjectBaselineIssues(projectId) {
  const normalizedProjectId = normalizeSingleLine(projectId, 80);
  if (!normalizedProjectId) {
    return new Map();
  }

  const now = Date.now();
  if (
    cachedBaselineIssues
    && cachedBaselineProjectId === normalizedProjectId
    && (now - cachedBaselineIssuesAt) < BASELINE_CACHE_TTL_MS
  ) {
    return cachedBaselineIssues;
  }

  const issues = new Map();
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query FeedbackBaselineIssues($projectId: String!, $after: String) {
        project(id: $projectId) {
          issues(first: 250, after: $after) {
            nodes {
              id
              title
              identifier
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;
    const data = await linearRequest(query, {
      projectId: normalizedProjectId,
      after,
    });
    const issueConnection = data?.project?.issues || {};
    const nodes = Array.isArray(issueConnection.nodes) ? issueConnection.nodes : [];
    for (const node of nodes) {
      const issue = normalizeBaselineIssueNode(node);
      if (issue) issues.set(issue.title, issue);
    }

    const pageInfo = issueConnection.pageInfo || {};
    hasNextPage = Boolean(pageInfo.hasNextPage);
    after = hasNextPage ? pageInfo.endCursor : null;
  }

  cachedBaselineIssues = issues;
  cachedBaselineIssuesAt = now;
  cachedBaselineProjectId = normalizedProjectId;
  return issues;
}

async function createLinearLabel({ name, teamId }) {
  const normalizedName = normalizeSingleLine(name, 120);
  const normalizedTeamId = normalizeSingleLine(teamId, 80);
  if (!normalizedName || !normalizedTeamId) {
    throw new Error("linear_label_invalid_input");
  }

  const mutation = `
    mutation FeedbackIssueLabelCreate($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel {
          id
          name
        }
      }
    }
  `;
  const data = await linearRequest(mutation, {
    input: {
      name: normalizedName,
      teamId: normalizedTeamId,
    },
  });
  const issueLabel = data?.issueLabelCreate?.issueLabel;
  const id = normalizeSingleLine(issueLabel?.id, 80);
  const createdName = normalizeSingleLine(issueLabel?.name, 120) || normalizedName;
  if (!id || !createdName) {
    throw new Error("linear_label_create_failed");
  }
  updateCachedLabel(createdName, id);
  return { id, name: createdName };
}

async function ensureLinearLabels(labelNames = [], { teamId = "" } = {}) {
  const config = getLinearConfig();
  const normalizedTeamId = normalizeSingleLine(teamId || config.teamId, 80);
  if (!config.apiKey || !normalizedTeamId) {
    throw new Error("linear_not_configured");
  }

  const normalizedNames = [...new Set(
    (Array.isArray(labelNames) ? labelNames : [])
      .map((name) => normalizeSingleLine(name, 120))
      .filter(Boolean),
  )];

  const labels = await loadLinearLabels();
  const created = [];

  for (const name of normalizedNames) {
    if (labels.has(name)) continue;
    try {
      const label = await createLinearLabel({ name, teamId: normalizedTeamId });
      labels.set(label.name, label.id);
      created.push(label);
    } catch (error) {
      created.push({
        id: "",
        name,
        error: String(error?.message || error),
      });
    }
  }

  return { labels, created };
}

async function getBaselineIssueForSubmission(submission, projectId) {
  const title = buildFeedbackBaselineIssueTitle(submission);
  if (!title) return null;
  const issues = await loadProjectBaselineIssues(projectId);
  return issues.get(title) || null;
}

async function getBaselineIssueForGame(game, projectId) {
  const title = buildFeedbackBaselineIssueTitle(game);
  if (!title) return null;
  const issues = await loadProjectBaselineIssues(projectId);
  return issues.get(title) || null;
}

async function createBaselineIssue({
  game,
  projectId,
  teamId,
  labels,
} = {}) {
  const normalizedGame = normalizeFeedbackGame(game);
  const normalizedProjectId = normalizeSingleLine(projectId, 80);
  const normalizedTeamId = normalizeSingleLine(teamId, 80);
  if (!normalizedGame || !normalizedProjectId || !normalizedTeamId) {
    throw new Error("linear_baseline_invalid_input");
  }

  const title = buildFeedbackBaselineIssueTitle(normalizedGame);
  const description = buildFeedbackBaselineIssueDescription(normalizedGame);
  const labelIds = collectLabelIdsFromMap(labels, ["setup", "tracking", normalizedGame.label]);
  const mutation = `
    mutation FeedbackBaselineIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
        }
      }
    }
  `;
  const data = await linearRequest(mutation, {
    input: {
      teamId: normalizedTeamId,
      projectId: normalizedProjectId,
      title,
      description,
      priority: 3,
      labelIds,
    },
  });
  const createdIssue = normalizeBaselineIssueNode(data?.issueCreate?.issue);
  if (!createdIssue) {
    throw new Error("linear_baseline_create_failed");
  }
  updateCachedBaselineIssue(normalizedProjectId, createdIssue);
  return createdIssue;
}

async function ensureBaselineIssueForGame(game, {
  projectId = "",
  teamId = "",
  labels = null,
} = {}) {
  const config = getLinearConfig();
  const normalizedProjectId = normalizeSingleLine(projectId || config.projectId, 80);
  const normalizedTeamId = normalizeSingleLine(teamId || config.teamId, 80);
  const normalizedGame = normalizeFeedbackGame(game);
  if (!normalizedProjectId || !normalizedTeamId || !normalizedGame) {
    return { issue: null, created: false };
  }

  const existing = await getBaselineIssueForGame(normalizedGame, normalizedProjectId);
  if (existing) {
    return { issue: existing, created: false };
  }

  const labelSource = labels instanceof Map
    ? labels
    : (await ensureLinearLabels(["setup", "tracking", normalizedGame.label], { teamId: normalizedTeamId })).labels;
  const createdIssue = await createBaselineIssue({
    game: normalizedGame,
    projectId: normalizedProjectId,
    teamId: normalizedTeamId,
    labels: labelSource,
  });
  return { issue: createdIssue, created: true };
}

function getProvisionLabelNamesForGame(game) {
  const normalizedGame = normalizeFeedbackGame(game);
  if (!normalizedGame) return [...PROVISION_DEFAULT_LABELS];
  return [...new Set([
    ...PROVISION_DEFAULT_LABELS,
    normalizedGame.label,
  ])];
}

async function ensureFeedbackLinearResourcesForSubmission(submission) {
  const config = getLinearConfig();
  if (!config.apiKey || !config.teamId) {
    return {
      labels: new Map(),
      createdLabels: [],
      baselineIssue: null,
      createdBaseline: false,
    };
  }

  const game = normalizeFeedbackGame(submission);
  const provisionLabelNames = [...new Set([
    ...getProvisionLabelNamesForGame(game),
    ...getFeedbackLinearLabelNames(submission),
  ])];
  const { labels, created } = await ensureLinearLabels(provisionLabelNames, {
    teamId: config.teamId,
  });

  let baselineIssue = null;
  let createdBaseline = false;
  if (config.projectId && game) {
    try {
      const baselineResult = await ensureBaselineIssueForGame(game, {
        projectId: config.projectId,
        teamId: config.teamId,
        labels,
      });
      baselineIssue = baselineResult.issue;
      createdBaseline = baselineResult.created;
    } catch {
      baselineIssue = null;
      createdBaseline = false;
    }
  }

  return {
    labels,
    createdLabels: created,
    baselineIssue,
    createdBaseline,
  };
}

async function provisionFeedbackLinearResources({
  games = [],
  commonLabels = [],
  projectId = "",
  teamId = "",
} = {}) {
  const config = getLinearConfig();
  if (!config.apiKey || !config.teamId) {
    throw new Error("linear_not_configured");
  }

  const normalizedTeamId = normalizeSingleLine(teamId || config.teamId, 80);
  const normalizedProjectId = normalizeSingleLine(projectId || config.projectId, 80);
  const normalizedGames = [...new Map(
    (Array.isArray(games) ? games : [])
      .map((game) => normalizeFeedbackGame(game))
      .filter(Boolean)
      .map((game) => [game.slug, game]),
  ).values()];
  const labelNames = [...new Set([
    ...(Array.isArray(commonLabels) ? commonLabels : []),
    ...normalizedGames.map((game) => game.label),
  ].map((name) => normalizeSingleLine(name, 120)).filter(Boolean))];

  const { labels, created } = await ensureLinearLabels(labelNames, { teamId: normalizedTeamId });
  const baselineResults = [];

  if (normalizedProjectId) {
    // ⚡ Bolt: Implemented Promise.all concurrency to eliminate N+1 latency
    // when provisioning baseline issues for multiple games.
    const gamePromises = normalizedGames.map(async (game) => {
      try {
        const result = await ensureBaselineIssueForGame(game, {
          projectId: normalizedProjectId,
          teamId: normalizedTeamId,
          labels,
        });
        return {
          gameSlug: game.slug,
          gameName: game.name,
          created: result.created,
          issue: result.issue,
          error: "",
        };
      } catch (error) {
        return {
          gameSlug: game.slug,
          gameName: game.name,
          created: false,
          issue: null,
          error: String(error?.message || error),
        };
      }
    });
    const results = await Promise.all(gamePromises);
    baselineResults.push(...results);
  }

  return {
    createdLabels: created.filter((entry) => entry.id),
    labelErrors: created.filter((entry) => entry.error),
    baselineResults,
    labels,
  };
}

async function attachIssueToBaseline({
  issueId,
  submission,
  projectId,
  baselineIssue = null,
}) {
  const normalizedIssueId = normalizeSingleLine(issueId, 80);
  const normalizedProjectId = normalizeSingleLine(projectId, 80);
  if (!normalizedIssueId || !normalizedProjectId) {
    return null;
  }

  const resolvedBaselineIssue = normalizeBaselineIssueNode(baselineIssue)
    || await getBaselineIssueForSubmission(submission, normalizedProjectId);
  const parentId = normalizeSingleLine(resolvedBaselineIssue?.id, 80);
  if (!parentId || parentId === normalizedIssueId) {
    return null;
  }

  const mutation = `
    mutation FeedbackIssueAttachBaseline($input: IssueUpdateInput!) {
      issueUpdate(input: $input) {
        success
        issue {
          id
        }
      }
    }
  `;
  const data = await linearRequest(mutation, {
    input: {
      id: normalizedIssueId,
      parentId,
    },
  });
  return data?.issueUpdate?.issue?.id ? resolvedBaselineIssue : null;
}

async function createFeedbackIssue({ submission }) {
  const config = getLinearConfig();
  if (!config.apiKey || !config.teamId) {
    throw new Error("linear_not_configured");
  }

  const provisioned = await ensureFeedbackLinearResourcesForSubmission(submission);
  const labelIds = provisioned?.labels instanceof Map
    ? collectLabelIdsFromMap(provisioned.labels, getFeedbackLinearLabelNames(submission))
    : await getLinearLabelIds(getFeedbackLinearLabelNames(submission));
  const input = {
    teamId: config.teamId,
    title: buildFeedbackIssueTitle(submission),
    description: buildFeedbackIssueDescription(submission),
  };
  if (config.projectId) input.projectId = config.projectId;
  if (labelIds.length > 0) input.labelIds = labelIds;

  const mutation = `
    mutation FeedbackIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
        }
      }
    }
  `;

  const data = await linearRequest(mutation, { input });
  const issue = data?.issueCreate?.issue;
  const id = normalizeSingleLine(issue?.id, 80);
  const identifier = normalizeSingleLine(issue?.identifier, 80);
  if (!id || !identifier) {
    throw new Error("linear_issue_create_failed");
  }

  if (config.projectId) {
    let baselineIssue = null;
    try {
      baselineIssue = await attachIssueToBaseline({
        issueId: id,
        submission,
        projectId: config.projectId,
        baselineIssue: provisioned?.baselineIssue || null,
      });
    } catch {
      // Best effort only; issue creation should not fail if baseline lookup/update fails.
    }

    return {
      id,
      identifier,
      url: buildLinearIssueUrl(identifier),
      parentId: baselineIssue?.id || "",
      parentIdentifier: baselineIssue?.identifier || "",
      parentTitle: baselineIssue?.title || "",
      parentUrl: baselineIssue?.url || "",
    };
  }

  return {
    id,
    identifier,
    url: buildLinearIssueUrl(identifier),
    parentId: "",
    parentIdentifier: "",
    parentTitle: "",
    parentUrl: "",
  };
}

async function createIssueComment({ issueId, body }) {
  const normalizedIssueId = normalizeSingleLine(issueId, 80);
  const normalizedBody = String(body || "").trim();
  if (!normalizedIssueId || !normalizedBody) {
    throw new Error("linear_comment_invalid_input");
  }

  const mutation = `
    mutation FeedbackCommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
        }
      }
    }
  `;
  const data = await linearRequest(mutation, {
    input: {
      issueId: normalizedIssueId,
      body: normalizedBody,
    },
  });

  const commentId = normalizeSingleLine(data?.commentCreate?.comment?.id, 80);
  if (!commentId) {
    throw new Error("linear_comment_create_failed");
  }
  return { id: commentId };
}

module.exports = {
  buildLinearIssueUrl,
  createFeedbackIssue,
  createLinearLabel,
  createIssueComment,
  ensureBaselineIssueForGame,
  ensureFeedbackLinearResourcesForSubmission,
  ensureLinearLabels,
  getLinearConfig,
  provisionFeedbackLinearResources,
  __resetLinearCacheForTests() {
    cachedLabels = null;
    cachedLabelsAt = 0;
    cachedBaselineIssues = null;
    cachedBaselineIssuesAt = 0;
    cachedBaselineProjectId = "";
  },
  isLinearConfigured,
};
