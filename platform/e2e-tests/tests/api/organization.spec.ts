import { expect, test } from "./fixtures";

// Minimal valid 1x1 transparent PNG (Base64-encoded)
const VALID_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";

test.describe("Organization API logo validation", () => {
  test("should reject invalid Base64 payload with 400", async ({
    request,
    makeApiRequest,
  }) => {
    const response = await makeApiRequest({
      request,
      method: "patch",
      urlSuffix: "/api/organization",
      data: { logo: "data:image/png;base64,NotAnImageJustText" },
      ignoreStatusCheck: true,
    });

    expect(response.status()).toBe(400);
  });

  test("should reject valid Base64 with non-PNG content with 400", async ({
    request,
    makeApiRequest,
  }) => {
    // "Hello World" encoded as Base64, valid encoding but not a PNG
    const response = await makeApiRequest({
      request,
      method: "patch",
      urlSuffix: "/api/organization",
      data: { logo: "data:image/png;base64,SGVsbG8gV29ybGQ=" },
      ignoreStatusCheck: true,
    });

    expect(response.status()).toBe(400);
  });

  test("should accept valid PNG logo with 200", async ({
    request,
    makeApiRequest,
  }) => {
    const response = await makeApiRequest({
      request,
      method: "patch",
      urlSuffix: "/api/organization",
      data: { logo: VALID_PNG_BASE64 },
    });

    const body = await response.json();
    expect(response.status()).toBe(200);
    expect(body.logo).toBe(VALID_PNG_BASE64);

    // Clean up: remove the logo
    await makeApiRequest({
      request,
      method: "patch",
      urlSuffix: "/api/organization",
      data: { logo: null },
    });
  });
});
