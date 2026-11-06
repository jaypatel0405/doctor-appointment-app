import { useEffect, useLayoutEffect } from "react";

// The taste-skill kit lives in /public/taste and is loaded at runtime, so Vite never bundles it.
// system.js mounts the nav sheet, fragments, the hero ground and the moments; motion.js the hover
// layer; layout.js the hero window's steps. Each module runs its init once on first import, so a
// later visit to the home page calls init again on the fresh DOM. The page passes ready once its
// data has loaded, so every fragment and the moment are in the DOM when the kit mounts them.
const MODULES = [
  "/taste/system.js",
  "/taste/motion/motion.js",
  "/taste/layout/layout.js",
];

const kitUrl = (path) => new URL(path, window.location.origin).href;

let booted = false;
let moments = null;

export default function useTasteKit(mainRef, ready) {
  useEffect(() => {
    if (!ready) return undefined;

    let cancelled = false;

    async function boot() {
      const modules = await Promise.all(
        MODULES.map((path) => import(/* @vite-ignore */ kitUrl(path)))
      );

      moments = await import(
        /* @vite-ignore */ kitUrl("/taste/moments/moments.js")
      );

      if (cancelled) return;

      if (booted) {
        modules.forEach((module) => module.default?.init?.());
        moments.mountAll?.(document);
      }

      booted = true;
    }

    boot().catch((error) => console.warn("Taste kit failed to load:", error));

    return () => {
      cancelled = true;
    };
  }, [ready]);

  // take the scroll moment down while its section is still in the document
  useLayoutEffect(() => {
    const main = mainRef.current;

    return () => {
      moments?.unmountAll?.(main);
    };
  }, [mainRef]);
}
