import Link from "next/link";
import { pct, when } from "@/components/format";
import { MODEL_NAMES, PageHeader, type Side } from "@/components/ui";
import { type Calibration, calibrate, calibrationSentence, EDGES } from "@/lib/calibration";
import { listRaceRuns, loadRaceRun, SIDES } from "@/lib/race";

export const dynamic = "force-dynamic";

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const runs = listRaceRuns();
  const file = sp.run ?? sp.replay ?? runs.find((r) => !r.aborted)?.file ?? runs[0]?.file;

  const header = (
    <PageHeader
      eyebrow="For builders · Calibration"
      title="When it says 80%, is it right 80% of the time?"
      sub="Stated = probability each model gave its chosen label. Dots group answers by stated probability; on the dashed line, stated equals actual."
    />
  );
  if (!file) {
    return (
      <>
        {header}
        <div className="card">
          <p className="muted">No race has been run yet. Run one on the Race page, then come back.</p>
        </div>
      </>
    );
  }

  const record = loadRaceRun(file);
  const gold = record.meta.emails.map((e) => e.gold);
  const cal = Object.fromEntries(
    SIDES.map((side) => [
      side,
      calibrate(
        record.decisions[side].flatMap((d, i) => (d && !d.error && d.label && d.top_prob != null ? [{ p: d.top_prob, correct: d.label === gold[i] }] : [])),
      ),
    ]),
  ) as Record<Side, Calibration>;

  return (
    <>
      {header}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="chips">
          <span className="chip">
            Race run <b>{when(record.meta.started_at)}</b>
          </span>
          <span className="chip">
            <b>{record.meta.n}</b> emails
          </span>
          <span className="chip">
            Gold labels reviewed <b>{record.meta.reviewed}</b>
          </span>
        </div>
        {runs.length > 1 && (
          <div className="chips">
            {runs.slice(0, 4).map((r) => (
              <Link key={r.file} href={`/calibration?run=${encodeURIComponent(r.file)}`} className={`chip${r.file === file ? " active" : ""}`}>
                {when(r.started_at)} · {r.n}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="split">
        <section className="card" style={{ padding: 20 }}>
          <ReliabilityChart cal={cal} />
        </section>
        <section className="card" style={{ display: "grid", gap: 24, alignContent: "start" }}>
          <BucketTable cal={cal} />
          {SIDES.map((side) => (
            <p key={side} style={{ fontSize: 17 }} className={`${side}-text`}>
              {calibrationSentence(MODEL_NAMES[side], cal[side])}
            </p>
          ))}
          <p className="muted">
            Errors left out (Jev {record.summary.jev.errors}, LLM {record.summary.llm.errors}). Calibration error: Jev {fmtEce(cal.jev.ece)}, LLM {fmtEce(cal.llm.ece)}, lower is
            better.
            {SIDES.some((s) => cal[s].below.n) && ` Predictions under 50%: Jev ${cal.jev.below.n}, LLM ${cal.llm.below.n}.`}
          </p>
        </section>
      </div>
    </>
  );
}

const fmtEce = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)} pts`);

function BucketTable({ cal }: { cal: Record<Side, Calibration> }) {
  const maxN = Math.max(1, ...SIDES.flatMap((s) => cal[s].buckets.map((b) => b.n)));
  return (
    <table className="compact">
      <thead>
        <tr>
          <th>Stated</th>
          {SIDES.map((s) => (
            <th key={s}>
              <span className={`badge ${s}`}>{MODEL_NAMES[s].toUpperCase()}</span> right / n
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cal.jev.buckets.map((b, i) => (
          <tr key={b.lo}>
            <td className="muted">
              {pct(b.lo)}–{pct(b.hi)}
            </td>
            {SIDES.map((s) => {
              const x = cal[s].buckets[i];
              return (
                <td key={s} className={`${s}`}>
                  <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
                    <span style={{ minWidth: 44 }}>{x.accuracy == null ? "—" : pct(x.accuracy)}</span>
                    <span className="muted" style={{ minWidth: 44 }}>
                      n={x.n}
                    </span>
                    <span className="bar-track" style={{ flex: 1 }}>
                      <span className="bar-fill" style={{ display: "block", width: `${(x.n / maxN) * 100}%` }} />
                    </span>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Reliability diagram. Jev is drawn as circles, the LLM as diamonds; dot area grows with n. */
function ReliabilityChart({ cal }: { cal: Record<Side, Calibration> }) {
  const W = 770,
    H = 560,
    L = 110,
    R = 40,
    T = 80,
    B = 96;
  const x = (p: number) => L + ((p - 0.5) / 0.5) * (W - L - R);
  const y = (a: number) => T + (1 - a) * (H - T - B);
  const maxN = Math.max(1, ...SIDES.flatMap((s) => cal[s].buckets.map((b) => b.n)));
  const r = (n: number) => 8 + 26 * Math.sqrt(n / maxN);
  const color: Record<Side, string> = { jev: "var(--jev)", llm: "var(--llm)" };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Calibration chart: stated probability versus actual accuracy">
      {[0, 0.25, 0.5, 0.75, 1].map((a) => (
        <g key={a}>
          <line x1={L} x2={W - R} y1={y(a)} y2={y(a)} stroke="#2E332B" />
          <text x={L - 16} y={y(a) + 9} textAnchor="end" fill="#B4B9AE" fontSize="19">
            {Math.round(a * 100)}%
          </text>
        </g>
      ))}
      {EDGES.map((p) => (
        <text key={p} x={x(p)} y={H - B + 40} textAnchor="middle" fill="#B4B9AE" fontSize="19">
          {Math.round(p * 100)}%
        </text>
      ))}
      <text x={(L + W - R) / 2} y={H - 16} textAnchor="middle" fill="#F2F2EE" fontSize="19">
        Stated probability
      </text>
      <text x={28} y={(T + H - B) / 2} textAnchor="middle" fill="#F2F2EE" fontSize="19" transform={`rotate(-90 28 ${(T + H - B) / 2})`}>
        Actual accuracy
      </text>
      <line x1={x(0.5)} y1={y(0.5)} x2={x(1)} y2={y(1)} stroke="#B4B9AE" strokeWidth="2" strokeDasharray="10 10" />
      <text x={x(0.6)} y={y(0.6) - 18} fill="#B4B9AE" fontSize="17" transform={`rotate(-45 ${x(0.6)} ${y(0.6) - 18})`}>
        perfectly calibrated
      </text>

      {(["llm", "jev"] as Side[]).map((side) => {
        const pts = cal[side].buckets.filter((b) => b.n > 0 && b.mean_p != null && b.accuracy != null);
        return (
          <g key={side}>
            <polyline
              points={pts.map((b) => `${x(b.mean_p!)},${y(b.accuracy!)}`).join(" ")}
              fill="none"
              stroke={color[side]}
              strokeWidth="2"
              opacity="0.6"
            />
            {pts.map((b) => {
              const cx = x(b.mean_p!),
                cy = y(b.accuracy!),
                rr = r(b.n);
              return (
                <g key={b.lo}>
                  {side === "jev" ? (
                    <circle cx={cx} cy={cy} r={rr} fill={color[side]} fillOpacity="0.85" stroke="#121312" strokeWidth="2" />
                  ) : (
                    <rect x={cx - rr * 0.8} y={cy - rr * 0.8} width={rr * 1.6} height={rr * 1.6} transform={`rotate(45 ${cx} ${cy})`} fill={color[side]} fillOpacity="0.85" stroke="#121312" strokeWidth="2" />
                  )}
                  <text
                    x={Math.min(cx, W - R)}
                    y={side === "jev" ? cy - rr - 10 : cy + rr + 28}
                    textAnchor={cx > W - R - 80 ? "end" : "middle"}
                    fill={color[side]}
                    fontSize="17"
                    fontWeight="700"
                  >
                    {MODEL_NAMES[side]} n={b.n}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
