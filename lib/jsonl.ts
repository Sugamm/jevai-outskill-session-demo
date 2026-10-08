import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

/** Write via a temp file so an interrupted write never leaves a truncated dataset. */
export function writeJsonl<T>(file: string, rows: T[]): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  renameSync(tmp, file);
}

export interface Email {
  id: string;
  text: string;
  gold: string;
  difficulty: "easy" | "medium" | "hard";
  hard_type?: string | null;
  note?: string;
  reviewed: boolean;
  generator_model?: string;
}
