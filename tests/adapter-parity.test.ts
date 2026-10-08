import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { taskConfig } from "../lib/config";
import { buildChatRequest, toChoiceAnswer } from "../lib/models/adapter";

const fixture = JSON.parse(readFileSync("tests/fixtures/adapter_parity.json", "utf8"));
const task = taskConfig();

describe("TS adapter port matches system-one-adapter-python", () => {
  it.each(fixture.cases as any[])("$state", (c) => {
    const request = buildChatRequest(c.request.model, c.state, task.question_id, task.question, task.options);
    expect(JSON.stringify(request)).toBe(JSON.stringify(c.request));

    const answer = toChoiceAnswer(JSON.stringify({ answers: { [task.question_id]: c.fake_output } }), task.question_id, Object.keys(task.options));
    expect(answer.choice).toBe(c.answer.choice);
    expect(answer.confidence).toBeCloseTo(c.answer.confidence, 12);
    for (const [label, p] of Object.entries(c.answer.probabilities)) expect(answer.probabilities[label]).toBeCloseTo(p as number, 12);
  });

  it("rejects extra keys and out-of-range probabilities like the strict Pydantic model", () => {
    const labels = Object.keys(task.options);
    const ok = { complaint: 0.2, refund_request: 0.7, cancel_account: 0.1 };
    const wrap = (d: unknown) => JSON.stringify({ answers: { [task.question_id]: d } });
    expect(() => toChoiceAnswer(wrap({ ...ok, other: 0 }), task.question_id, labels)).toThrow(/extra \[other\]/);
    expect(() => toChoiceAnswer(wrap({ ...ok, complaint: 1.2 }), task.question_id, labels)).toThrow(/probability/);
    expect(() => toChoiceAnswer(wrap({ complaint: 1 }), task.question_id, labels)).toThrow(/missing/);
    expect(toChoiceAnswer("```json\n" + wrap(ok) + "\n```", task.question_id, labels).choice).toBe("refund_request");
  });
});
