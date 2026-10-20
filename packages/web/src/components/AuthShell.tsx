"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { CivicBackground } from "./CivicBackground";

/* Shared surface kit for the /auth routes.
   Kept in one file so the sign-in and sign-up wizards cannot drift apart:
   same frame, same step rail, same field chrome, same code entry.

   Colour rule, matching the rest of the app: black (#020202) base, #0a0a0a
   wells, #222/#333 hairlines, white at low alpha for glass, and emerald-500
   only for the active/affirmative state. No new hues. */

export const AUTH_PRIMARY_BTN =
  "w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 transition-colors";

export const AUTH_GHOST_BTN =
  "w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#333] hover:border-[#444] hover:bg-[#111] text-gray-300 hover:text-white text-sm font-medium py-2.5 px-4 transition-colors";

function TrustStrip() {
  return (
    <div className="mt-5 space-y-1.5 text-center">
      <p className="text-[11px] leading-relaxed text-gray-500">
        Independent citizen preparation toolkit. Not affiliated with Pune
        Municipal Corporation or any government body.
      </p>
      <p className="text-[11px] text-gray-600">
        Aadhaar digits are masked in volatile RAM and never written to disk.
      </p>
    </div>
  );
}

export function AuthShell({
  children,
  width = "md",
}: {
  children: React.ReactNode;
  width?: "md" | "2xl";
}) {
  return (
    <div className="relative w-full flex-1 flex items-center justify-center">
      {/* Bounded backdrop panel: the blueprint lattice plus the eligibility
          constellation, framed the way a survey sheet is framed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl border border-[#181818]"
      >
        <CivicBackground variant="blueprint" />
      </div>

      <div
        className={`relative z-10 w-full py-4 ${
          width === "2xl" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        {/* Brand lockup, matching the sidebar treatment. */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-9 h-9 rounded overflow-hidden flex items-center justify-center shrink-0 border border-[#222]">
            <Image
              src="/logo.jpg"
              alt="NagrikSetu Logo"
              width={36}
              height={36}
              className="object-cover scale-[1.6] origin-top"
            />
          </div>
          <span className="mt-3 font-semibold tracking-tight text-white text-xl">
            NagrikSetu
          </span>
          <span className="text-[11px] text-gray-500">
            पुणे महानगरपालिका योजना कक्ष
          </span>
        </div>

        <div className="ww-rise bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-7 sm:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] transition-colors duration-500">
          {children}
        </div>

        <TrustStrip />
      </div>
    </div>
  );
}

export function AuthHeading({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="text-center space-y-2">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="text-xs leading-relaxed text-gray-400 max-w-sm mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function AuthStepRail({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center justify-center gap-2 mb-7">
      {steps.map((label, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums transition-colors ${
                isDone
                  ? "bg-emerald-500 text-black"
                  : isActive
                    ? "border border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                    : "border border-[#333] text-gray-600"
              }`}
            >
              {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={`text-[11px] font-medium tracking-wide transition-colors ${
                isActive ? "text-white" : isDone ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`h-px w-5 shrink-0 ${
                  isDone ? "bg-emerald-500/50" : "bg-[#333]"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const FIELD_CHROME =
  "w-full rounded-md border bg-[#0a0a0a] text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
}

export function AuthField({ label, icon, hint, className, ...props }: AuthFieldProps) {
  return (
    <div>
      <label
        htmlFor={props.id}
        className="block text-xs font-medium text-gray-300 mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
            {icon}
          </span>
        )}
        <input
          {...props}
          className={`${FIELD_CHROME} border-[#333] py-2.5 pr-3 ${
            icon ? "pl-10" : "pl-3"
          } ${className ?? ""}`}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

interface AuthSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: React.ReactNode;
}

export function AuthSelect({ label, hint, className, children, ...props }: AuthSelectProps) {
  return (
    <div>
      <label
        htmlFor={props.id}
        className="block text-xs font-medium text-gray-300 mb-1.5"
      >
        {label}
      </label>
      <select
        {...props}
        className={`${FIELD_CHROME} border-[#333] py-2.5 pl-3 pr-3 ${className ?? ""}`}
      >
        {children}
      </select>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

/* One-time-code entry.
   Digit-only, auto-advances on entry, backspace steps back, arrow keys move
   between slots, and a pasted code fills every slot at once. */
export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  // Supabase's admin API (`generateLink`) issues an 8-digit OTP, while a code
  // emailed by the normal flow follows the project's configured length (often
  // 6). There is no API to force the admin code down to 6, so the input renders
  // 8 slots and the pages accept anything from 6 digits upward. A 6-digit code
  // simply leaves the last two slots empty.
  const LENGTH = 8;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const slots = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  /* Focus we moved ourselves, so the onFocus guard below can tell a programmatic
     advance apart from a user click. Without this marker the guard reads a stale
     `value` prop (it runs before React commits the just-typed digit) and yanks
     focus straight back to the slot the digit landed in — which, being full and
     maxLength=1, then swallows every further keystroke. */
  const intended = useRef<number | null>(null);

  const focusSlot = (i: number) => {
    intended.current = i;
    inputs.current[i]?.focus();
  };

  const write = (i: number, digit: string) => {
    const next = slots.slice();
    next[i] = digit;
    onChange(next.join(""));
  };

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    write(i, digit);
    if (i < LENGTH - 1) focusSlot(i + 1);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (slots[i]) {
        write(i, "");
      } else if (i > 0) {
        write(i - 1, "");
        focusSlot(i - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusSlot(i - 1);
    }
    if (e.key === "ArrowRight" && i < LENGTH - 1) {
      e.preventDefault();
      focusSlot(i + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, LENGTH);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    focusSlot(Math.min(digits.length, LENGTH - 1));
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-300 mb-1.5">
        Verification code
      </label>
      <div
        className="flex items-center justify-between gap-1.5"
        role="group"
        aria-label="One-time verification code"
      >
        {slots.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={() => {
              // A move we made ourselves — keep it.
              if (intended.current === i) {
                intended.current = null;
                return;
              }
              // User-initiated focus (click or Tab). If an earlier slot is still
              // empty, move there so a digit can never be stranded behind a gap.
              const firstEmpty = inputs.current.findIndex((el) => el?.value === "");
              if (firstEmpty !== -1 && i > firstEmpty) focusSlot(firstEmpty);
            }}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            className="h-12 w-full min-w-0 rounded-md border border-[#333] bg-[#0a0a0a] text-center text-lg font-semibold tabular-nums text-white outline-none transition-colors placeholder-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            placeholder="·"
          />
        ))}
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-md border border-friction-600/40 bg-friction-600/10 px-3 py-2 text-[11px] text-friction-100">
      {children}
    </p>
  );
}

export function AuthNote({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "affirmative";
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-[11px] leading-relaxed ${
        tone === "affirmative"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
          : "border-[#222] bg-[#0a0a0a] text-gray-400"
      }`}
    >
      {tone === "affirmative" && (
        <Check className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={3} />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* Numbered sub-card used inside the profile step, mirroring the numbered
   sections on /profile so the two screens read as the same document. */
export function AuthSection({
  index,
  title,
  icon,
  description,
  children,
}: {
  index: number;
  title: string;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-[#222] bg-[#080808]/70 p-4">
      <div className="border-b border-[#1c1c1c] pb-2">
        <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white">
          {icon && <span className="shrink-0 text-emerald-500/80">{icon}</span>}
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-emerald-500/10 text-[9px] font-bold tabular-nums text-emerald-400">
            {index}
          </span>
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function AuthRadioGroup<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; accent?: string }>;
  hint?: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-medium text-gray-300">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-200"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className={`h-4 w-4 ${o.accent ?? "accent-emerald-500"}`}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </fieldset>
  );
}

export function AuthCheckbox({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2 text-xs text-gray-200"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-emerald-500"
        />
        <span>{label}</span>
      </label>
      {hint && <p className="mt-1 pl-6 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}




