import Link from "next/link";

/** Live / Replay switch; replay mode is carried in the URL as `?replay=...`. */
export function ModeToggle({ path, replay, replayValue = "1" }: { path: string; replay: boolean; replayValue?: string }) {
  return (
    <div className="chips" role="group" aria-label="Mode">
      <Link className={`chip${replay ? "" : " active"}`} href={path}>
        Live
      </Link>
      <Link className={`chip${replay ? " active" : ""}`} href={`${path}?replay=${encodeURIComponent(replayValue)}`}>
        Replay
      </Link>
    </div>
  );
}

export function ReplayBanner({ path, side }: { path: string; side: string }) {
  return (
    <div className="banner">
      <span>{side} failed 3 times in a row. Switch to replay?</span>
      <Link href={`${path}?replay=1`}>Switch to replay</Link>
    </div>
  );
}
