import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import path from "node:path";

// Test constants
const VALID_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";

const INVALID_JPEG_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const INVALID_BASE64_PAYLOAD = "data:image/png;base64,NotAnImageJustText";
const NON_PNG_BASE64 = "data:image/png;base64,SGVsbG8gV29ybGQ="; // "Hello World"

// Helper function to create oversized logo data URI
const createOversizedLogoDataUri = (): string => {
  const oversizedPng = readFileSync(
    path.join(__dirname, "fixtures", "logo.png"),
  );
  return `data:image/png;base64,${oversizedPng.toString("base64")}`;
};

// Helper function to validate error response structure
const expectValidationError = async (
  response: any,
  expectedStatus: number = 400
) => {
  expect(response.status()).toBe(expectedStatus);
  
  const body = await response.json();
  expect(body).toHaveProperty("error");
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  
  return body;
};

// Helper function for cleanup
const cleanupLogo = async (request: any, makeApiRequest: any) => {
  try {
    await makeApiRequest({
      request,
      method: "patch",
      urlSuffix: "/api/organization",
      data: { logo: null },
    });
  } catch (error) {
    // Ignore cleanup errors to avoid test failures
    console.warn("Failed to cleanup logo:", error);
  }
};

test.describe("Organization API logo validation", () => {
  test.describe("Error handling", () => {
    test("should reject invalid Base64 payload with proper error response", async ({
      request,
      makeApiRequest,
    }) => {
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: INVALID_BASE64_PAYLOAD },
        ignoreStatusCheck: true,
      });

      const errorBody = await expectValidationError(response);
      expect(errorBody.error).toContain("Base64");
    });

    test("should reject valid Base64 with non-PNG content with proper error response", async ({
      request,
      makeApiRequest,
    }) => {
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: NON_PNG_BASE64 },
        ignoreStatusCheck: true,
      });

      const errorBody = await expectValidationError(response);
      expect(errorBody.error).toContain("PNG");
    });

    test("should reject wrong MIME type prefix with proper error response", async ({
      request,
      makeApiRequest,
    }) => {
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: INVALID_JPEG_BASE64 },
        ignoreStatusCheck: true,
      });

      const errorBody = await expectValidationError(response);
      expect(errorBody.error).toContain("PNG");
    });

    test("should reject oversized PNG logo with proper error response", async ({
      request,
      makeApiRequest,
    }) => {
      const oversizedLogo = createOversizedLogoDataUri();
      
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: oversizedLogo },
        ignoreStatusCheck: true,
      });

      const errorBody = await expectValidationError(response);
      expect(errorBody.error).toContain("size");
    });

    test("should handle malformed request body gracefully", async ({
      request,
      makeApiRequest,
    }) => {
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: undefined },
        ignoreStatusCheck: true,
      });

      // Should either succeed (undefined treated as missing) or fail gracefully
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("Success cases", () => {
    test("should accept valid PNG logo and return correct response", async ({
      request,
      makeApiRequest,
    }) => {
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: VALID_PNG_BASE64 },
      });

      expect(response.status()).toBe(200);
      
      const body = await response.json();
      expect(body).toHaveProperty("logo");
      expect(body.logo).toBe(VALID_PNG_BASE64);
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("name");

      // Cleanup
      await cleanupLogo(request, makeApiRequest);
    });

    test("should accept null logo (removal) and maintain other fields", async ({
      request,
      makeApiRequest,
    }) => {
      // First set a logo
      await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: VALID_PNG_BASE64 },
      });

      // Then remove it
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: null },
      });

      expect(response.status()).toBe(200);
      
      const body = await response.json();
      expect(body.logo).toBeNull();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("name");
    });

    test("should handle concurrent logo updates gracefully", async ({
      request,
      makeApiRequest,
    }) => {
      const logo1 = VALID_PNG_BASE64;
      const logo2 = `data:image/png;base64,${Buffer.from("test2").toString("base64")}`;

      // Send concurrent requests
      const [response1, response2] = await Promise.all([
        makeApiRequest({
          request,
          method: "patch",
          urlSuffix: "/api/organization",
          data: { logo: logo1 },
        }),
        makeApiRequest({
          request,
          method: "patch",
          urlSuffix: "/api/organization",
          data: { logo: logo2 },
        }),
      ]);

      // Both should succeed (last write wins pattern)
      expect([200, 200]).toContain(response1.status());
      expect([200, 200]).toContain(response2.status());

      // Cleanup
      await cleanupLogo(request, makeApiRequest);
    });
  });

  test.describe("Boundary conditions", () => {
    test("should handle empty request body", async ({
      request,
      makeApiRequest,
    }) => {
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: {},
      });

      expect(response.status()).toBe(200);
      
      const body = await response.json();
      expect(body).toHaveProperty("id");
    });

    test("should reject extremely large data URI", async ({
      request,
      makeApiRequest,
    }) => {
      // Create a very large string (10MB)
      const largeData = "A".repeat(10 * 1024 * 1024);
      const largeLogo = `data:image/png;base64,${Buffer.from(largeData).toString("base64")}`;
      
      const response = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: "/api/organization",
        data: { logo: largeLogo },
        ignoreStatusCheck: true,
      });

      // Should fail due to size limits
      expect([400, 413]).toContain(response.status());
    });
  });
});
