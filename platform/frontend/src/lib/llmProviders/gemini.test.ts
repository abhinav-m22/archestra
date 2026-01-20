import { describe, expect, it } from "vitest";
import type { Interaction } from "./common";
import GeminiGenerateContentInteraction from "./gemini";

// Mock types locally since we might not have access to the full shared types in test environment easily.
// We use 'unknown' cast to 'Interaction' to satisfy TS while mocking only growing parts.

describe("GeminiGenerateContentInteraction", () => {
  it("should return text from the last user message", () => {
    const interaction = {
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello Gemini" }],
          },
        ],
      },
      response: { modelVersion: "gemini-1.5-pro" },
    } as unknown as Interaction;

    const gemini = new GeminiGenerateContentInteraction(interaction);
    expect(gemini.getLastUserMessage()).toBe("Hello Gemini");
  });

  it("should return empty string for image-only message (current behavior / bug reproduction)", () => {
    const interaction = {
      request: {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: "base64..." } },
            ],
          },
        ],
      },
      response: { modelVersion: "gemini-1.5-pro" },
    } as unknown as Interaction;

    // This expects the FIXED behavior
    const gemini = new GeminiGenerateContentInteraction(interaction);
    expect(gemini.getLastUserMessage()).toBe("[image/png data]");
  });

  it("should return [File: doc.pdf] for file-only message", () => {
    const interaction = {
      request: {
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: "https://example.com/doc.pdf",
                  mimeType: "application/pdf",
                },
              },
            ],
          },
        ],
      },
      response: { modelVersion: "gemini-1.5-pro" },
    } as unknown as Interaction;

    const gemini = new GeminiGenerateContentInteraction(interaction);
    // This expects the FIXED behavior
    expect(gemini.getLastUserMessage()).toBe("[File: doc.pdf]");
  });

  it("should return [Function call: search] for function call message", () => {
    const interaction = {
      request: {
        contents: [
          {
            role: "user",
            parts: [
              { functionCall: { name: "search", args: { query: "test" } } },
            ],
          },
        ],
      },
      response: { modelVersion: "gemini-1.5-pro" },
    } as unknown as Interaction;

    const gemini = new GeminiGenerateContentInteraction(interaction);
    expect(gemini.getLastUserMessage()).toBe("[Function call: search]");
  });

  it("should return [Function response: search] for function response message", () => {
    const interaction = {
      request: {
        contents: [
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: "search",
                  response: { result: "ok" },
                },
              },
            ],
          },
        ],
      },
      response: { modelVersion: "gemini-1.5-pro" },
    } as unknown as Interaction;

    const gemini = new GeminiGenerateContentInteraction(interaction);
    expect(gemini.getLastUserMessage()).toBe("[Function response: search]");
  });
});
