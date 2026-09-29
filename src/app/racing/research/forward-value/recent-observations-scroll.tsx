"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ScrollViewport = {
  contentWidth: number;
  left: number;
  width: number;
};

type RecentObservationsScrollProps = {
  children: ReactNode;
  controls: ReactNode;
  stickyHeader: ReactNode;
  tableMinWidth: number;
};

export function hasHorizontalOverflow(element: Pick<HTMLElement, "clientWidth" | "scrollWidth">) {
  return element.scrollWidth > element.clientWidth + 1;
}

export function shouldShowStickyScrollbar(overflowing: boolean, intersecting: boolean) {
  return overflowing && intersecting;
}

export function synchronizeHorizontalScroll(
  source: Pick<HTMLElement, "scrollLeft">,
  target: Pick<HTMLElement, "scrollLeft">,
) {
  if (target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
}

export function RecentObservationsScroll({ children, controls, stickyHeader, tableMinWidth }: RecentObservationsScrollProps) {
  const regionRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const stickyHeaderTrackRef = useRef<HTMLDivElement>(null);
  const tableScrollerRef = useRef<HTMLDivElement>(null);
  const stickyScrollerRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [intersecting, setIntersecting] = useState(false);
  const [viewport, setViewport] = useState<ScrollViewport>({ contentWidth: tableMinWidth, left: 0, width: 0 });

  useEffect(() => {
    const region = regionRef.current;
    const controlsElement = controlsRef.current;
    const tableScroller = tableScrollerRef.current;
    if (!region || !controlsElement || !tableScroller) return;

    const measure = () => {
      const bounds = tableScroller.getBoundingClientRect();
      const left = Math.max(8, bounds.left);
      const right = Math.min(window.innerWidth - 8, bounds.right);
      setControlsHeight(controlsElement.offsetHeight);
      setOverflowing(hasHorizontalOverflow(tableScroller));
      setViewport({ contentWidth: tableScroller.scrollWidth, left, width: Math.max(0, right - left) });
      if (stickyHeaderTrackRef.current) {
        stickyHeaderTrackRef.current.style.transform = `translateX(-${tableScroller.scrollLeft}px)`;
      }
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(controlsElement);
    resizeObserver.observe(tableScroller);
    const table = tableScroller.querySelector("table");
    if (table) resizeObserver.observe(table);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => setIntersecting(entry.isIntersecting),
      { threshold: 0 },
    );
    intersectionObserver.observe(region);

    measure();
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const showStickyScrollbar = shouldShowStickyScrollbar(overflowing, intersecting) && viewport.width > 0;

  useEffect(() => {
    if (showStickyScrollbar && tableScrollerRef.current && stickyScrollerRef.current) {
      synchronizeHorizontalScroll(tableScrollerRef.current, stickyScrollerRef.current);
    }
  }, [showStickyScrollbar]);

  return (
    <div ref={regionRef}>
      <div className="sticky top-0 z-30 bg-stone-50 py-2" data-testid="recent-observations-sticky-filters" ref={controlsRef}>
        {controls}
      </div>
      <div className="mt-3">
        <div
          className="sticky z-20 h-0 overflow-visible"
          data-testid="recent-observations-sticky-header"
          style={{ top: controlsHeight }}
        >
          <div className="mx-px overflow-hidden shadow-sm">
            <div
              aria-hidden="true"
              ref={stickyHeaderTrackRef}
              style={{ transform: "translateX(0)", width: viewport.contentWidth }}
            >
              {stickyHeader}
            </div>
          </div>
        </div>
        <div
          className="overflow-x-auto border border-slate-200 bg-white"
          data-testid="recent-observations-native-scrollbar"
          onScroll={(event) => {
            if (stickyScrollerRef.current) synchronizeHorizontalScroll(event.currentTarget, stickyScrollerRef.current);
            if (stickyHeaderTrackRef.current) stickyHeaderTrackRef.current.style.transform = `translateX(-${event.currentTarget.scrollLeft}px)`;
          }}
          ref={tableScrollerRef}
        >
          {children}
        </div>
      </div>
      {showStickyScrollbar ? (
        <div
          aria-label="Scroll Recent Observations horizontally"
          className="fixed bottom-3 z-30 h-4 overflow-x-auto border border-slate-300 bg-white/95 shadow-sm"
          data-testid="recent-observations-sticky-scrollbar"
          onScroll={(event) => {
            if (tableScrollerRef.current) synchronizeHorizontalScroll(event.currentTarget, tableScrollerRef.current);
            if (stickyHeaderTrackRef.current) stickyHeaderTrackRef.current.style.transform = `translateX(-${event.currentTarget.scrollLeft}px)`;
          }}
          ref={stickyScrollerRef}
          style={{ left: viewport.left, width: viewport.width }}
        >
          <div aria-hidden="true" className="h-px" style={{ width: viewport.contentWidth }} />
        </div>
      ) : null}
    </div>
  );
}
