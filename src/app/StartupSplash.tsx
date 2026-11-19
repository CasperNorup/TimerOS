import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import mark from "../assets/branding/TimerOS-mark-transparent.png";
import bloomUrl from "../assets/branding/TimerOS-splash-bloom.json?url";
import origamiUrl from "../assets/branding/TimerOS-splash-origami.json?url";
import signalUrl from "../assets/branding/TimerOS-splash-signal.json?url";
import type { SplashChoice } from "./appearance";

const animations = { Bloom: bloomUrl, Origami: origamiUrl, Signal: signalUrl };

export function StartupSplash({ choice, onComplete }: { choice: Exclude<SplashChoice, "Off">; onComplete: () => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = container.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!stage || motion.matches) {
      onComplete();
      return;
    }

    const request = new AbortController();
    let animation: AnimationItem | undefined;
    const finish = () => {
      if (!request.signal.aborted) onComplete();
    };
    const timeout = window.setTimeout(finish, 6500);
    motion.addEventListener("change", finish);

    async function playAnimation() {
      const [response, { default: lottie }] = await Promise.all([
        fetch(animations[choice], { signal: request.signal }),
        import("lottie-web/build/player/lottie_light"),
      ]);
      if (!response.ok) throw new Error("The startup animation is unavailable.");
      const playback = await response.json();
      if (!stage || request.signal.aborted) return;

      // The kit's portrait background fills the desktop window independently.
      const backdrop = playback.assets.find((asset: { id: string }) => asset.id === "back");
      if (backdrop?.p) stage.parentElement?.style.setProperty("--splash-backdrop", 'url("' + backdrop.p + '")');
      playback.layers = playback.layers.filter((layer: { refId?: string }) => layer.refId !== "back");
      playback.assets = playback.assets.filter((asset: { id: string }) => asset.id !== "back");

      animation = lottie.loadAnimation({
        container: stage,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData: playback,
      });
      animation.addEventListener("DOMLoaded", () => {
        if (request.signal.aborted) return;
        stage.classList.add("is-playing");
        animation?.play();
      });
      animation.addEventListener("complete", finish);
      animation.addEventListener("data_failed", finish);
      animation.addEventListener("error", finish);
    }

    void playAnimation().catch(finish);
    return () => {
      request.abort();
      window.clearTimeout(timeout);
      motion.removeEventListener("change", finish);
      animation?.destroy();
    };
  }, [choice, onComplete]);

  return (
    <div className="startup" role="status" aria-label="Starting TimerOS">
      <div className="startup-animation" ref={container} aria-hidden="true" />
      <img className="startup-mark" src={mark} alt="" width={108} height={108} />
    </div>
  );
}
