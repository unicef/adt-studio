import { useEffect, useState } from "react";

export type ScrollDirection = "up" | "down";

/** Scroll direction sampled once per animation frame, plus an at-top flag. */
export function useScrollDirection(topThreshold = 24): {
  direction: ScrollDirection;
  atTop: boolean;
} {
  const [state, setState] = useState<{ direction: ScrollDirection; atTop: boolean }>(
    () => ({ direction: "up", atTop: true }),
  );

  useEffect(() => {
    let previous = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const next = window.scrollY;
      const delta = next - previous;
      previous = next;
      setState((current) => {
        const direction: ScrollDirection =
          delta > 2 ? "down" : delta < -2 ? "up" : current.direction;
        const atTop = next < topThreshold;
        return current.direction === direction && current.atTop === atTop
          ? current
          : { direction, atTop };
      });
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [topThreshold]);

  return state;
}
