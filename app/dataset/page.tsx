import Link from "next/link";
import path from "node:path";
import { ROOT, taskConfig } from "@/lib/config";
import { type Email, readJsonl } from "@/lib/jsonl";
import { prettyLabel } from "@/components/format";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILES = { emails: "emails.jsonl", hard: "hard_cases.jsonl", trio: "confidence_trio.jsonl" } as const;
type FileKey = keyof typeof FILES;

export default async function DatasetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const file: FileKey = (sp.file as FileKey) in FILES ? (sp.file as FileKey) : "emails";
  const all = readJsonl<Email>(path.join(ROOT, "data", FILES[file]));
  const rows = all.filter(
    (e) => (!sp.difficulty || e.difficulty === sp.difficulty) && (!sp.gold || e.gold === sp.gold) && (!sp.hard_type || e.hard_type === sp.hard_type),
  );
  const labels = Object.keys(taskConfig().options);
  const hardTypes = [...new Set(all.map((e) => e.hard_type).filter(Boolean))] as string[];
  const reviewed = all.filter((e) => e.reviewed).length;

  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) q.set(k, v);
    return `/dataset?${q}`;
  };
  const chip = (label: string, patch: Record<string, string | undefined>, active: boolean) => (
    <Link key={label} href={link(patch)} className={`chip${active ? " active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow="Synthetic dataset"
        title={`${rows.length} of ${all.length} emails`}
        sub={`${reviewed} of ${all.length} gold labels hand-reviewed · every email is synthetic`}
      />

      <div className="row">
        {chip("All emails", { file: undefined, difficulty: undefined, gold: undefined, hard_type: undefined }, file === "emails")}
        {chip("Hard cases", { file: "hard", difficulty: undefined, gold: undefined, hard_type: undefined }, file === "hard")}
        {chip("Confidence trio", { file: "trio", difficulty: undefined, gold: undefined, hard_type: undefined }, file === "trio")}
      </div>
      {file === "emails" && (
        <>
          <div className="row">
            <span className="muted">Difficulty:</span>
            {chip("any", { difficulty: undefined, hard_type: undefined }, !sp.difficulty)}
            {["easy", "medium", "hard"].map((d) => chip(d, { difficulty: d, hard_type: undefined }, sp.difficulty === d))}
          </div>
          <div className="row">
            <span className="muted">Gold:</span>
            {chip("any", { gold: undefined }, !sp.gold)}
            {labels.map((l) => chip(prettyLabel(l), { gold: l }, sp.gold === l))}
          </div>
          {sp.difficulty === "hard" && (
            <div className="row">
              <span className="muted">Hard type:</span>
              {chip("any", { hard_type: undefined }, !sp.hard_type)}
              {hardTypes.map((h) => chip(prettyLabel(h), { hard_type: h }, sp.hard_type === h))}
            </div>
          )}
        </>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Gold label</th>
              <th>Difficulty</th>
              <th>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="muted">{e.id}</td>
                <td style={{ whiteSpace: "pre-wrap", maxWidth: 1100 }}>{e.text}</td>
                <td>
                  <span className="chip">{prettyLabel(e.gold)}</span>
                </td>
                <td>
                  {e.difficulty}
                  {e.hard_type && <div className="muted">{prettyLabel(e.hard_type)}</div>}
                </td>
                <td>{e.reviewed ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
