const { getFeedbackAttachment } = require("./_store");
const {
  getQuery,
  normalizeSingleLine,
  sendError,
  verifyFeedbackAttachmentSignature,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  try {
    const query = getQuery(req);
    const attachmentId = normalizeSingleLine(query.id, 80);
    const signature = normalizeSingleLine(query.sig, 128);
    if (!attachmentId || !signature) {
      return sendError(res, 400, "Attachment id and signature are required.", "missing_attachment_id");
    }

    if (!verifyFeedbackAttachmentSignature(attachmentId, signature)) {
      return sendError(res, 403, "Attachment signature is invalid.", "invalid_attachment_signature");
    }

    const attachment = await getFeedbackAttachment(attachmentId);
    if (!attachment || !attachment.base64Data) {
      return sendError(res, 404, "Attachment not found.", "attachment_not_found");
    }

    const filename = String(attachment.name || attachment.id || "attachment")
      .replace(/["\r\n]+/g, " ")
      .trim();
    const contentType = attachment.contentType || "application/octet-stream";
    const buffer = Buffer.from(attachment.base64Data, "base64");
    const disposition = /^(image\/|text\/|application\/pdf$)/.test(contentType)
      ? "inline"
      : "attachment";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    res.end(buffer);
  } catch (error) {
    return sendError(res, 500, "Could not load attachment.", "feedback_attachment_failed", {
      message: String(error && error.message ? error.message : error),
    });
  }
};
