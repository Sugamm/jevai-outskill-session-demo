/**
 * Send one email to one or both models and print the full Decision, including raw response.
 *   npx tsx scripts/smoke.ts [jev|llm|both] ["email text"]
 */
import { loadEnv, taskConfig, warnIfPricingStale } from "../lib/config";
import * as jev from "../lib/models/jev";
import * as llm from "../lib/models/llm";

loadEnv();
warnIfPricingStale();
const which = process.argv[2] ?? "both";
const text = process.argv[3] ?? "My blender arrived with a cracked jar. I want my money back please, order #A1042.";
const task = taskConfig();

for (const [name, model] of [["jev", jev], ["llm", llm]] as const) {
  if (which !== "both" && which !== name) continue;
  const decision = await model.classify(text, task.options, task.question);
  console.log(`\n===== ${name.toUpperCase()} =====`);
  console.log(JSON.stringify(decision, null, 2));
}
