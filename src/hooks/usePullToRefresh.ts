import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70; // px the user must pull before a refresh fires
const MAX = 100; // cap on the visual pull distance

/**
 * Touch pull-to-refresh for a scrollable element. When the user drags down from
 * the very top past THRESHOLD and releases, `onRefresh` runs. Returns the live
 * pull distance + a refreshing flag so the caller can render an indicator.
 *
 * Uses refs for the gesture state so the touch listeners attach once (no
 * re-binding on every move) and never read stale values.
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void | Promise<void>
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const setPullDistance = (p: number) => {
      pullRef.current = p;
      setPull(p);
    };

    function onTouchStart(e: TouchEvent) {
      startY.current = el && el.scrollTop <= 0 ? e.touches[0].clientY : null;
    }
    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshingRef.current || !el) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && el.scrollTop <= 0) setPullDistance(Math.min(dy * 0.5, MAX));
      else if (dy <= 0) setPullDistance(0);
    }
    async function onTouchEnd() {
      if (startY.current === null) return;
      const shouldRefresh = pullRef.current >= THRESHOLD;
      startY.current = null;
      if (shouldRefresh) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDistance(THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [scrollRef]);

  return { pull, refreshing };
}
