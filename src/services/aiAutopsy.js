const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are a strict, encouraging programming coach reviewing one player's attempt at a duel problem, after the duel has ended.
You will be given: the problem statement, this player's own code and test results, and their opponent's code and test results (for comparison only).
Critique THIS PLAYER's code specifically — never the opponent's.
Never write or reveal a corrected/complete version of their code. Guide them toward the fix using questions and concepts, not solutions.
If their code already passed everything, don't invent a flaw — instead praise what worked and suggest one alternative approach or optimization as food for thought.
Respond ONLY in the provided JSON schema, nothing else.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    outcome_summary: { type: "string" },
    identified_bottleneck: { type: "string" },
    conceptual_flaw: { type: "string" },
    socratic_hint: { type: "string" },
    step_by_step_breakdown: { type: "array", items: { type: "string" } },
  },
  required: [
    "outcome_summary",
    "identified_bottleneck",
    "conceptual_flaw",
    "socratic_hint",
    "step_by_step_breakdown",
  ],
};

async function generateAutopsy({
  problemStatement,
  yourCode,
  yourLanguage,
  yourPassed,
  yourTotal,
  opponentCode,
  opponentLanguage,
  opponentPassed,
  opponentTotal,
}) {
  const prompt = `Problem:\n${problemStatement}\n\nYour code (${yourLanguage}, ${yourPassed}/${yourTotal} tests passed):\n${yourCode}\n\nOpponent's code (${opponentLanguage}, ${opponentPassed}/${opponentTotal} tests passed), for comparison only:\n${opponentCode}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  return JSON.parse(response.text);
}
module.exports = { generateAutopsy };
