import Link from "next/link";
import { PageHeader } from "@/components/ui";

const DEMOS = [
  ["/race", "Demo 1", "The race", "500 emails through both models at once: speed, cost, accuracy."],
  ["/confidence", "Demo 2", "Confidence", "How sure is each model, and what should the software do about it?"],
  ["/stress", "Demo 3", "Break it", "Paste an audience email and see both answers side by side."],
  ["/calibration", "For builders", "Calibration", "When a model says 80% sure, is it right 80% of the time?"],
  ["/dataset", "Data", "The dataset", "Browse the 500 synthetic support emails and their gold labels."],
  ["/health", "Pre-flight", "Health check", "Ping both APIs before going live."],
] as const;

export default function Home() {
  return (
    <>
      <PageHeader
        eyebrow="Live workshop"
        title={
          <>
            <span className="jev-text">Jev</span> vs a frontier <span className="llm-text">LLM</span>
          </>
        }
        sub="Same emails, same three options, same machine. One model makes typed decisions with probabilities; the other is a chat model forced into the same format."
      />
      <div className="tile-grid">
        {DEMOS.map(([href, eyebrow, title, blurb]) => (
          <Link key={href} href={href} className="tile">
            <div className="eyebrow">{eyebrow}</div>
            <h2>{title}</h2>
            <p>{blurb}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
