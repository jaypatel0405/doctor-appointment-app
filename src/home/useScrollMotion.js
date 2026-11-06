import { useEffect } from "react";

// Scroll animations the client asked for (an override of the taste skill's "nothing on scroll"):
// - reveals: section headings, leads and lists rise and fade in once (20px, 650ms, ease-out); groups
//   stagger 70ms; the finder and dashboard windows ease up from scale .98; the dashboard rows slide
//   into place after their window. Each plays once a visit.
// - progress: the hero window's ground drifts a few percent as the hero scrolls away (parallax), and
//   the closing call settles from 96% as the footer comes up.
// Content is never left hidden: only what sits below the first screen when the page mounts is held,
// nothing under reduced motion or data-motion="off", and only transform and opacity animate (no
// layout shift). The CSS is in home.css (.sr-*).

const GROUPS = [
  // [selector, stagger in ms, variant]
  ["main > section:not(.hero):not([data-moment]) > .wrap h2", 0, "rise"],
  ["#doctors .fd-intro", 0, "rise"],
  ["#doctors .app", 0, "lift"],
  ["#dashboard .stack-dash > *", 70, "rise"],
  ["#dashboard .dash-frame", 0, "lift"],
  ["#dashboard .dash-win__rows > li", 60, "slide"],
  ["#faq .stack-dash > *", 70, "rise"],
  ["#faq .faq__item", 80, "rise"],
  ["footer.closing .section-head > *", 70, "rise"],
  ["footer.closing .closing__links .grid > *", 70, "rise"],
];

const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.motion === "off";

export default function useScrollMotion(rootRef, ready) {
  useEffect(() => {
    const root = rootRef.current?.closest(".home") || rootRef.current;
    if (!ready || !root || still() || !("IntersectionObserver" in window)) return undefined;

    const held = new Set();
    const fold = window.innerHeight;

    GROUPS.forEach(([selector, step, variant]) => {
      root.querySelectorAll(selector).forEach((el, index) => {
        if (held.has(el) || el.getBoundingClientRect().top < fold) return;
        el.classList.add("sr", `sr--${variant}`, "sr-hold");
        el.style.setProperty("--sr-delay", `${index * step + (variant === "slide" ? 260 : 0)}ms`);
        held.add(el);
      });
    });

    const play = (el) => {
      if (!held.has(el) || !el.classList.contains("sr-hold")) return;
      el.classList.remove("sr-hold");
      el.classList.add("sr-in");
      const done = (event) => {
        // animations inside the element (the kit's loops) bubble up here too
        if (event.target !== el) return;
        el.removeEventListener("animationend", done);
        el.classList.remove("sr", "sr-in", "sr--rise", "sr--lift", "sr--slide");
        el.style.removeProperty("--sr-delay");
      };
      el.addEventListener("animationend", done);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          play(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0 }
    );
    held.forEach((el) => io.observe(el));

    // progress: the hero ground's drift and the closing call settling in
    const ground = () => root.querySelector(".hero__window > canvas");
    const close = root.querySelector("footer.closing .closing__cta");
    let frame = 0;

    const draw = () => {
      frame = 0;
      const vh = window.innerHeight;
      const canvas = ground();
      if (canvas) {
        const travel = Math.min(1, Math.max(0, window.scrollY / vh));
        canvas.style.transform = `translate3d(0, ${(travel * 3.5).toFixed(2)}%, 0) scale(1.08)`;
      }
      if (close) {
        const top = close.getBoundingClientRect().top;
        const k = Math.min(1, Math.max(0, (vh - top) / (vh * 0.6)));
        // a slide only: a scale would pull the h2 and the big button off the page's left line
        close.style.transform = k >= 1 ? "" : `translate3d(0, ${((1 - k) * 32).toFixed(1)}px, 0)`;
      }
      // fallback for an IntersectionObserver that never calls back: whatever is held and already
      // on screen plays now, so nothing stays hidden
      held.forEach((el) => {
        if (!el.classList.contains("sr-hold")) return;
        if (el.getBoundingClientRect().top < vh * 0.88) {
          io.unobserve(el);
          play(el);
        }
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      held.forEach((el) => {
        el.classList.remove("sr", "sr-hold", "sr-in", "sr--rise", "sr--lift", "sr--slide");
        el.style.removeProperty("--sr-delay");
      });
      const canvas = ground();
      if (canvas) canvas.style.transform = "";
      if (close) close.style.transform = "";
    };
  }, [rootRef, ready]);
}
