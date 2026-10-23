// Node 22+ supplies DOMException globally. Preserve the legacy CJS/default export.
module.exports = globalThis.DOMException;
