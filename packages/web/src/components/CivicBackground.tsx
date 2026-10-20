import type { CSSProperties } from "react";
import { EligibilityConstellation } from "./EligibilityConstellation";

/* Layered decorative backdrop for NagrikSetu.
   Every layer is pointer-events-none and aria-hidden, so it never interferes
   with interaction or assistive tech.

   Techniques, and where they come from:
   - Blueprint lattice  : two superimposed linear-gradient rule sets (fine 32px
                          + major 160px), the classic engineering-drawing grid.
   - Grain              : inline SVG <feTurbulence> used as a background-image
                          (the CSS-Tricks "grainy gradients" approach). It is a
                          rasterised image, not a live filter, so it is cheap.
                          Scaled past 100% so the tile seams never line up.
   - Aurora / horizon   : soft emerald radial + linear washes, matching the
                          emerald-500 accent used across the app.
   - Vignette           : darkens the edges so the centred glass card keeps its
                          focus instead of floating in a flat field.
   - Registration marks : drafting crosshairs, tying into the municipal /
                          survey-plan feel of the ward data.

   Colour rule: everything is white at a low alpha or emerald. No new hues. */

export type BackgroundVariant = "blueprint" | "dots" | "contour" | "hatch" | "none";

const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

const TEXTURES: Record<Exclude<BackgroundVariant, "none">, CSSProperties> = {
  /* Engineering lattice: a fine 32px rule every cell, reinforced every 5th. */
  blueprint: {
    backgroundImage: [
      "linear-gradient(to right, rgba(255,255,255,0.028) 1px, transparent 1px)",
      "linear-gradient(to bottom, rgba(255,255,255,0.028) 1px, transparent 1px)",
      "linear-gradient(to right, rgba(255,255,255,0.055) 1px, transparent 1px)",
      "linear-gradient(to bottom, rgba(255,255,255,0.055) 1px, transparent 1px)",
    ].join(", "),
    backgroundSize: "32px 32px, 32px 32px, 160px 160px, 160px 160px",
  },
  /* Point matrix, with a dimmer emerald marker every 5th dot. */
  dots: {
    backgroundImage: [
      "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
      "radial-gradient(rgba(16,185,129,0.18) 1.5px, transparent 1.5px)",
    ].join(", "),
    backgroundSize: "28px 28px, 140px 140px",
    backgroundPosition: "0 0, 14px 14px",
  },
  /* Topographic contours radiating out of the top-right corner. */
  contour: {
    backgroundImage:
      "repeating-radial-gradient(circle at 84% 12%, rgba(255,255,255,0.05) 0 1px, transparent 1px 46px)",
  },
  /* Diagonal engineering hatch. */
  hatch: {
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 14px)",
  },
};

function RegistrationMarks() {
  return (
    <>
      {["top-5 left-5", "top-5 right-5", "bottom-5 left-5", "bottom-5 right-5"].map((pos) => (
        <span key={pos} className={`absolute ${pos} h-3 w-3 opacity-25`}>
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white" />
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white" />
        </span>
      ))}
    </>
  );
}

export function CivicBackground({
  variant = "blueprint",
  constellation = true,
}: {
  variant?: BackgroundVariant;
  constellation?: boolean;
}) {
  if (variant === "none" && !constellation) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Base wash */}
      <div className="absolute inset-0 bg-[#020202]" />

      {/* Aurora glows. Drift is disabled under prefers-reduced-motion (see globals.css). */}
      <div className="ww-drift-a absolute -left-[15%] -top-[25%] h-[55%] w-[55%] rounded-full bg-emerald-500/10 blur-[130px]" />
      <div className="ww-drift-b absolute -bottom-[25%] -right-[12%] h-[45%] w-[45%] rounded-full bg-emerald-600/10 blur-[110px]" />

      {/* Emerald horizon, lifting the bottom of the viewport off pure black. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[45%]"
        style={{ background: "linear-gradient(to top, rgba(16,185,129,0.07) 0%, transparent 70%)" }}
      />

      {/* Texture lattice */}
      {variant !== "none" && <div className="absolute inset-0" style={TEXTURES[variant]} />}

      {/* Eligibility constellation: drifting nodes + hairline links */}
      {constellation && <EligibilityConstellation />}

      {/* Focal vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Grain, overscanned so the 256px tile never seams. */}
      <div
        className="absolute -inset-[8%]"
        style={{
          backgroundImage: `url("${NOISE}")`,
          backgroundRepeat: "repeat",
          opacity: 0.055,
          mixBlendMode: "overlay",
        }}
      />

      <RegistrationMarks />
    </div>
  );
}
