import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import { ContentEngineError } from "./content-engine";

// Turn anything thrown in a route into a JSON error the UI can show.
export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json({ error: "Some fields are missing or invalid.", issues: error.issues }, { status: 400 });
  }
  if (error instanceof ContentEngineError) {
    return Response.json({ error: error.message }, { status: 502 });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return Response.json(
      { error: "Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY in .env.local and restart the dev server." },
      { status: 500 },
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Rate limited by the AI provider. Wait a moment and try again." }, { status: 429 });
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Anthropic API error", error.status, error.message);
    return Response.json({ error: `AI provider error (${error.status ?? "network"}). Please try again.` }, { status: 502 });
  }
  console.error(error);
  const message =
    error instanceof Error && /api key|authentication/i.test(error.message)
      ? "Anthropic API key is missing. Set ANTHROPIC_API_KEY in .env.local and restart the dev server."
      : "Something went wrong. Please try again.";
  return Response.json({ error: message }, { status: 500 });
}
