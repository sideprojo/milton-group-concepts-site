/**
 * Otto — Google AI Studio & Managed Agent SDK Client (@google/genai >= 2.29.1)
 * Supports:
 * 1. Google AI Studio Interactions API (`client.interactions.create` with `gemini-3.8-flash`)
 * 2. Managed Custom Agent Registration (`client.agents.create` based on `antigravity-preview-09-2026`)
 * 3. Deterministic Local Execution Fallback when GEMINI_API_KEY is not set
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const OTTO_SPEC = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'otto-aistudio-spec.json'), 'utf8')
);

/**
 * Registers or updates Otto as a Custom Managed Agent in Google AI Studio / Gemini API
 * using `@google/genai` >= 2.29.1 (`client.agents.create`).
 */
export async function registerOttoInAiStudio(GoogleGenAI, apiKey = process.env.GEMINI_API_KEY) {
  if (!GoogleGenAI || !apiKey) {
    return {
      ok: false,
      mode: 'DETERMINISTIC_SPEC_READY',
      message: 'Set GEMINI_API_KEY and pass GoogleGenAI from @google/genai to register Otto remotely.',
      spec: OTTO_SPEC
    };
  }
  const client = new GoogleGenAI({ apiKey });
  const agent = await client.agents.create({
    id: OTTO_SPEC.id,
    base_agent: OTTO_SPEC.platforms.googleAiStudio.managedBaseAgent,
    system_instruction: OTTO_SPEC.system_instruction
  });
  return { ok: true, mode: 'AI_STUDIO_MANAGED_AGENT', agent };
}

/**
 * Runs a single turn or multi-turn interaction with Otto via `gemini-3.8-flash`
 * with Otto's function-calling tools and structured output schema attached.
 */
export async function runOttoInteraction(GoogleGenAI, inputPrompt, previousInteractionId = undefined, apiKey = process.env.GEMINI_API_KEY) {
  if (!GoogleGenAI || !apiKey) {
    return {
      ok: true,
      mode: 'DETERMINISTIC_LOCAL_RUNTIME',
      agent: 'Otto',
      callSign: OTTO_SPEC.callSign,
      output_text: `Otto (${OTTO_SPEC.callSign}) deterministic engine active. Ready to execute tools: ${OTTO_SPEC.tools.map(t => t.name).join(', ')}.`
    };
  }
  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create({
    model: OTTO_SPEC.platforms.googleAiStudio.model,
    input: inputPrompt,
    previous_interaction_id: previousInteractionId,
    system_instruction: OTTO_SPEC.system_instruction,
    tools: [{ function_declarations: OTTO_SPEC.tools }],
    generation_config: {
      response_mime_type: 'application/json',
      response_schema: OTTO_SPEC.response_schema
    }
  });
  return {
    ok: true,
    mode: 'GEMINI_3_8_FLASH_LIVE',
    interactionId: interaction.id,
    output_text: interaction.output_text
  };
}
