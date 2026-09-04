/**
 * Stage 3: Deep-tier agent. Uses Groq's larger tool-calling model
 * (openai/gpt-oss-120b) — same tiered architecture as originally designed for
 * Claude, swapped to a free provider. Only called for genuinely AMBIGUOUS records.
 *
 * This is a REAL tool-calling loop: the model decides which tools to call, we
 * execute them against MySQL, feed results back, and it keeps investigating
 * until it reaches a decision. The full trace is returned so the frontend can
 * stream it live — this is the demo's strongest visual moment.
 */

const Groq = require('groq-sdk');
const { toolDefinitions, toolExecutors } = require('./tools');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
/**
 * Stage 3: Deep-tier agent. Uses Groq's larger tool-calling model
 * (openai/gpt-oss-120b) — same tiered architecture as originally designed for
 * Claude, swapped to a free provider. Only called for genuinely AMBIGUOUS records.
 *
 * This is a REAL tool-calling loop: the model decides which tools to call, we
 * execute them against MySQL, feed results back, and it keeps investigating
 * until it reaches a decision. The full trace is returned so the frontend can
 * stream it live — this is the demo's strongest visual moment.
 */



const SYSTEM_PROMPT = `You are a finance reconciliation investigator. You've been handed a
record that a cheaper first-pass model flagged as ambiguous. Investigate using the tools
available — check invoices, payments, credit notes, payment history, and duplicates as needed.

Do not guess. Only reach a conclusion once you have enough evidence. When you're done
investigating (no more tool calls needed), respond with ONLY a JSON object in this exact format:

{
  "status": "matched" | "partial_payment" | "pending" | "overdue" | "exception",
  "confidence": <number 0-100>,
  "evidence": ["short bullet of what you checked and found", "..."],
  "recommended_action": "one clear sentence on what a human should do next"
}

If you genuinely cannot resolve it, that's fine — report status "exception" with confidence
reflecting your actual uncertainty and say so plainly in recommended_action. An honest
"needs human review" is better than a confident wrong guess.`;

// Convert our tool schema to OpenAI/Groq function-calling format
const groqTools = toolDefinitions.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema
  }
}));

async function investigate(record, candidatePayment, onToolCall) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Investigate this record: ${JSON.stringify(record)}
Closest candidate payment found nearby (may be null): ${JSON.stringify(candidatePayment)}`
    }
  ];

  const trace = [];
  const MAX_TURNS = 6;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages,
      tools: groqTools,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 1024,
      reasoning_effort: 'low'
    });

    const choice = response.choices[0].message;
    messages.push(choice);

    const toolCalls = choice.tool_calls || [];

    if (toolCalls.length === 0) {
      const parsed = tryParseJSON(choice.content);
      return { result: parsed || fallbackResult(choice.content), trace };
    }

    for (const toolCall of toolCalls) {
      const { name, arguments: argsStr } = toolCall.function;
      let args;
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }

      const executor = toolExecutors[name];
      let output;
      try {
        output = executor ? await executor(args) : { error: 'unknown tool' };
      } catch (err) {
        output = { error: err.message };
      }

      const traceEntry = { tool: name, input: args, output };
      trace.push(traceEntry);
      if (onToolCall) onToolCall(traceEntry);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(output)
      });
    }
  }

  return {
    result: {
      status: 'exception',
      confidence: 0,
      evidence: ['Investigation exceeded max turns without reaching a conclusion.'],
      recommended_action: 'Needs manual review — automated investigation was inconclusive.'
    },
    trace
  };
}

function tryParseJSON(text) {
  if (!text) return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : JSON.parse(text);
  } catch {
    return null;
  }
}

function fallbackResult(text) {
  return {
    status: 'exception',
    confidence: 0,
    evidence: [`Agent response was not parseable: ${(text || '').slice(0, 200)}`],
    recommended_action: 'Needs manual review — could not parse agent conclusion.'
  };
}

module.exports = { investigate };