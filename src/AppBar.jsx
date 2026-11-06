import { useEffect, useLayoutEffect, useRef } from "react";

// The bar on every screen past the home page: the MediBook+ mark on the left line, the screen's own
// actions on the right. Same .wrap, height and hairline as the home page's nav.
export default function AppBar({ onHome, label, children }) {
  return (
    <header className="appbar">
      <div className="wrap appbar__in">
        <button
          type="button"
          className="nav__logo appbar__logo"
          onClick={onHome}
          aria-label="MediBook+ home"
        >
          <span className="mark" data-mark="dots" aria-hidden="true" />
          MediBook+
          {label && <span className="appbar__label">{label}</span>}
        </button>

        {children && <div className="appbar__right">{children}</div>}
      </div>
    </header>
  );
}

// Moves the kit's .m-tab-ind (motion.css) under the selected tab. The first placement and a
// resize jump; a click slides it (240ms). motion.js is only booted on the home page, so the
// inner screens place the indicator themselves.
function placeIndicator(list, indicator, jump) {
  const selected = list.querySelector('[role="tab"][aria-selected="true"]');

  if (!selected) {
    indicator.style.opacity = "0";
    return;
  }

  if (jump) indicator.classList.add("is-jump");

  indicator.style.opacity = "";
  indicator.style.setProperty("--x", `${selected.offsetLeft}px`);
  indicator.style.setProperty("--y", `${selected.offsetTop}px`);
  indicator.style.setProperty("--w", `${selected.offsetWidth}px`);
  indicator.style.setProperty("--h", `${selected.offsetHeight}px`);

  if (jump) {
    // Commit the jump before the transition comes back.
    void indicator.offsetWidth;
    indicator.classList.remove("is-jump");
  }
}

// A row of .tab buttons with the sliding ink pill behind the selected one.
export function TabRail({ className = "", label, children }) {
  const listRef = useRef(null);
  const indicatorRef = useRef(null);
  const placedRef = useRef(false);

  // After every render: the selection (or a tab's label) may have changed.
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;

    placeIndicator(list, indicator, !placedRef.current);
    placedRef.current = true;
  });

  // A wrap or font swap moves the tabs: follow without sliding.
  useEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => placeIndicator(list, indicator, true));
    observer.observe(list);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={listRef}
      className={`tabs m-has-ind ${className}`.trim()}
      role="tablist"
      aria-label={label}
    >
      <span ref={indicatorRef} className="m-tab-ind" aria-hidden="true" />
      {children}
    </div>
  );
}
