// A missed deadline stays due until a prepared frame can actually be shown.
// Returning to the tab must not postpone a scene for another whole interval.
export function playbackAction(now: number, deadline: number, ready: boolean, busy: boolean, paused: boolean, hidden: boolean, retryAt = 0) {
  if (paused || hidden || busy || now < deadline) return "WAIT";
  if (ready) return "SWAP";
  return now >= retryAt ? "PREPARE" : "WAIT";
}
