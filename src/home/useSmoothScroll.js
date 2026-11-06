import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Smooth wheel scrolling on the home page (a request of the client's, over the taste skill's default).
// One Lenis instance while the page is mounted. Lenis moves the native scroll position, so the
// pinned-chapters moment (position: sticky and its scroll listener) keeps working under it. Off under
// prefers-reduced-motion; touch keeps the native scroll (no syncTouch).

let instance = null;

export function scrollToTarget(target) {
  if (!target) return;
  if (instance) instance.scrollTo(target);
  else target.scrollIntoView({ block: "start" });
}

export default function useSmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    function start() {
      if (instance || reduced.matches) return;
      instance = new Lenis({
        lerp: 0.1,
        duration: 1.1,
        smoothWheel: true,
        syncTouch: false,
        anchors: true,
        // the phone nav sheet scrolls on its own; let it keep its wheel
        allowNestedScroll: true,
        autoRaf: true,
      });
    }

    function stop() {
      instance?.destroy();
      instance = null;
    }

    function sync() {
      if (reduced.matches) stop();
      else start();
    }

    start();
    reduced.addEventListener("change", sync);

    // the phone nav sheet locks the page: Lenis stops while it is open and starts again when it closes
    const nav = document.querySelector(".nav");
    const sheet = nav
      ? new MutationObserver(() => {
          if (!instance) return;
          if (nav.classList.contains("is-open")) instance.stop();
          else instance.start();
        })
      : null;
    sheet?.observe(nav, { attributes: true, attributeFilter: ["class"] });

    return () => {
      sheet?.disconnect();
      reduced.removeEventListener("change", sync);
      stop();
    };
  }, []);
}
