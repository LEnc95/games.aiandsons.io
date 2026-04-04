// @ts-check

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendError(res, statusCode, message, code) {
  sendJson(res, statusCode, {
    ok: false,
    error: message,
    code,
  });
}

function allowMethods(req, res, methods) {
  if (methods.includes(req.method || "")) {
    return true;
  }

  res.setHeader("Allow", methods.join(", "));
  sendError(res, 405, "Method not allowed.", "method_not_allowed");
  return false;
}

async function readJsonBody(req, { maxBytes = 4096 } = {}) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    const trimmed = req.body.trim();
    return trimmed ? JSON.parse(trimmed) : {};
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error("Request body exceeded maximum size.");
      // @ts-ignore
      error.statusCode = 413;
      throw error;
    }
    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body.");
    // @ts-ignore
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  allowMethods,
  readJsonBody,
  sendError,
  sendJson,
};
