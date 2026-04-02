import test from "node:test";
import assert from "node:assert/strict";
import { verifyReceipt } from "../../../src/core/billing.js";

test("verifyReceipt", async (t) => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;

  t.afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  await t.test("successfully verifies receipt and returns payload", async () => {
    const mockReceiptToken = "valid-token-123";
    const mockResponsePayload = { success: true, status: "active" };

    let fetchCalledWithUrl = "";
    let fetchCalledWithOptions = null;

    global.fetch = async (url, options) => {
      fetchCalledWithUrl = url;
      fetchCalledWithOptions = options;
      return {
        ok: true,
        json: async () => mockResponsePayload,
      };
    };

    const result = await verifyReceipt(mockReceiptToken);

    assert.equal(fetchCalledWithUrl, "/api/billing/verify");
    assert.deepEqual(fetchCalledWithOptions, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: mockReceiptToken }),
    });
    assert.deepEqual(result, mockResponsePayload);
  });

  await t.test("throws error and logs when response is not ok", async () => {
    const mockReceiptToken = "invalid-token-456";

    global.fetch = async () => {
      return {
        ok: false,
      };
    };

    let consoleErrorArgs = null;
    console.error = (...args) => {
      consoleErrorArgs = args;
    };

    await assert.rejects(
      async () => {
        await verifyReceipt(mockReceiptToken);
      },
      {
        name: "Error",
        message: "Verification failed",
      }
    );

    assert.ok(consoleErrorArgs !== null, "console.error should have been called");
    assert.equal(consoleErrorArgs[0], "Receipt verification error:");
    assert.equal(consoleErrorArgs[1].message, "Verification failed");
  });

  await t.test("throws error and logs when network request fails", async () => {
    const mockReceiptToken = "network-fail-token";
    const networkError = new Error("Network error");

    global.fetch = async () => {
      throw networkError;
    };

    let consoleErrorArgs = null;
    console.error = (...args) => {
      consoleErrorArgs = args;
    };

    await assert.rejects(
      async () => {
        await verifyReceipt(mockReceiptToken);
      },
      {
        name: "Error",
        message: "Network error",
      }
    );

    assert.ok(consoleErrorArgs !== null, "console.error should have been called");
    assert.equal(consoleErrorArgs[0], "Receipt verification error:");
    assert.equal(consoleErrorArgs[1], networkError);
  });
});
