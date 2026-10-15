import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accessTokenFromFirebaseToken,
  assertUnenforced,
  disableAppCheckEnforcement,
  projectIdFromArgs,
  projectNumberFromMetadata,
  shouldDisableFromArgs,
  verifyAppCheckDisabled,
} from "./disable-appcheck-enforcement.mjs";

describe("disable-appcheck-enforcement", () => {
  it("requires an explicit project ID", () => {
    assert.equal(projectIdFromArgs(["--project", "eki-staging"]), "eki-staging");
    assert.throws(() => projectIdFromArgs([]), /Missing --project/);
  });

  it("extracts and validates a Firebase project number", () => {
    assert.equal(projectNumberFromMetadata({ projectNumber: "12345" }), "12345");
    assert.equal(projectNumberFromMetadata({ name: "projects/67890" }), "67890");
    assert.throws(() => projectNumberFromMetadata({ projectNumber: "not-a-number" }), /valid project number/);
  });

  it("fails closed when a required service is still enforced", () => {
    assert.throws(() => assertUnenforced({ enforcementMode: "ENFORCED" }, "firestore.googleapis.com"), /still enforced/);
  });

  it("recognizes the explicit enforcement mode", () => {
    assert.equal(shouldDisableFromArgs(["--project", "eki-staging", "--disable"]), true);
    assert.equal(shouldDisableFromArgs(["--project", "eki-staging"]), false);
  });

  it("exchanges a Firebase CLI refresh token for a short-lived access token", async () => {
    const accessToken = await accessTokenFromFirebaseToken("refresh-token", async (url, init) => {
      assert.equal(url, "https://www.googleapis.com/oauth2/v3/token");
      assert.equal(init.method, "POST");
      assert.match(init.body.toString(), /refresh_token=refresh-token/);
      return { ok: true, json: async () => ({ access_token: "access-token" }) };
    });

    assert.equal(accessToken, "access-token");
  });

  it("supports an already-issued access token", async () => {
    const accessToken = await accessTokenFromFirebaseToken("access-token", async () => ({
      ok: false,
      status: 400,
    }));

    assert.equal(accessToken, "access-token");
  });

  it("verifies both required services using the project number", async () => {
    const requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(url);
      if (url.includes("oauth2/v3/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token" }) };
      }
      if (url.includes("firebase.googleapis.com/v1beta1")) {
        return { ok: true, json: async () => ({ projectNumber: "12345" }) };
      }
      return { ok: true, json: async () => ({ enforcementMode: "UNENFORCED" }) };
    };

    const result = await verifyAppCheckDisabled({
      projectId: "eki-staging",
      token: "test-token",
      fetchImpl,
    });

    assert.equal(result.projectNumber, "12345");
    assert.equal(requestedUrls.length, 4);
    assert.ok(requestedUrls.some((url) => url.endsWith("projects/12345/services/firestore.googleapis.com")));
    assert.ok(requestedUrls.some((url) => url.endsWith("projects/12345/services/firebasedatabase.googleapis.com")));
  });

  it("disables enforcement for both required services", async () => {
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
      requests.push({ url, init });
      if (url.includes("oauth2/v3/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token" }) };
      }
      if (url.includes("firebase.googleapis.com/v1beta1")) {
        return { ok: true, json: async () => ({ projectNumber: "12345" }) };
      }
      return { ok: true, json: async () => ({ enforcementMode: "UNENFORCED" }) };
    };

    await disableAppCheckEnforcement({
      projectId: "eki-staging",
      token: "refresh-token",
      fetchImpl,
    });

    const updates = requests.filter(({ init }) => init.method === "PATCH");
    assert.equal(updates.length, 2);
    for (const { url, init } of updates) {
      assert.match(url, /updateMask=enforcementMode$/);
      assert.deepEqual(JSON.parse(init.body), {
        name: url.slice(url.indexOf("projects/"), url.indexOf("?")),
        enforcementMode: "UNENFORCED",
      });
    }
  });
});
