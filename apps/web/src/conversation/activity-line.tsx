import { useEffect, useState } from 'react';
import type { NativeToolActivity } from '@workprint/api-client';
import { ShownImages } from './shown-images.js';
import './activity-line.css';

const seconds = (since: number) => Math.max(0, Math.floor((Date.now() - since) / 1000));

/** Time since the tool started, ticking each second while it runs. */
function Elapsed({ since }: { since: number }) {
  const [value, setValue] = useState(() => seconds(since));
  useEffect(() => {
    const timer = setInterval(() => setValue(seconds(since)), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return <span className="wp-act-elapsed">{value}s</span>;
}

/**
 * One tool's activity line, phrased by the server. Running pulses with elapsed time when this page saw it
 * start; done shows a tick and the tool's summary, then any images it shows; a tool that failed or never
 * finished claims no result.
 */
export function ActivityLine({ activity, startedAt }: { activity: NativeToolActivity; startedAt?: number }) {
  if (activity.state === 'running') return <div className="wp-act" data-state="running"><span className="wp-act-run">{activity.phrase}</span>{startedAt !== undefined && <Elapsed since={startedAt} />}</div>;
  if (activity.state === 'done') return <><div className="wp-act" data-state="done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg><span>{activity.summary ?? 'Done'}</span></div>{activity.images && <ShownImages ids={activity.images} />}</>;
  return <div className="wp-act" data-state={activity.state}><span>{activity.phrase.replace(/…$/, '')} · didn’t finish</span></div>;
}
