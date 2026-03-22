const {
  buildFeedbackIssueDescription,
  buildFeedbackIssueTitle,
  getFeedbackLinearLabelNames,
  normalizeSingleLine,
} = require("./_shared");

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const LABEL_CACHE_TTL_MS = 5 * 60_000;

let cachedLabels = null;
let cachedLabelsAt = 0;

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

async function createFeedbackIssue({ submission }) {
  const config = getLinearConfig();
  if (!config.apiKey || !config.teamId) {
    throw new Error("linear_not_configured");
  }

  const labelIds = await getLinearLabelIds(getFeedbackLinearLabelNames(submission));
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

  return {
    id,
    identifier,
    url: buildLinearIssueUrl(identifier),
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
  createIssueComment,
  getLinearConfig,
  isLinearConfigured,
};
