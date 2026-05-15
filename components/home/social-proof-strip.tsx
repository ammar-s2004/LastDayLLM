"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Marquee } from "../ui/marquee";
import { FileText, Presentation, File, Image as ImageIcon, Link, Mic } from "lucide-react";

// ── Animated spring counter ───────────────────────────────────────────────────

function SpringCounter({ to, duration = 2000 }: { to: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const raf = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Spring-like easing
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.round(eased * to));
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {count.toLocaleString()}
    </span>
  );
}

// ── Gradient Avatar ───────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #7C3AED, #A78BFA)",
  "linear-gradient(135deg, #0D9488, #34D399)",
  "linear-gradient(135deg, #EC4899, #FB7185)",
  "linear-gradient(135deg, #4C1D95, #7C3AED)",
  "linear-gradient(135deg, #0891B2, #38BDF8)",
];

const AVATAR_INITIALS = ["A", "K", "M", "R", "S"];

function AvatarCluster() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {AVATAR_GRADIENTS.map((grad, i) => (
        <div
          key={i}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: grad,
            border: "2px solid rgba(255,255,255,0.15)",
            marginLeft: i === 0 ? 0 : -12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "white",
            fontFamily: "Inter, sans-serif",
            zIndex: AVATAR_GRADIENTS.length - i,
            position: "relative",
            boxShadow: "0 0 0 1px rgba(15,10,30,0.8)",
          }}
        >
          {AVATAR_INITIALS[i]}
        </div>
      ))}
    </div>
  );
}

// ── Testimonial items ─────────────────────────────────────────────────────────

const TESTIMONIALS = [
  "Predicted 9/10 questions in my Physics final",
  "Saved 40 hours of revision",
  "Got an A* after one week",
  "My entire syllabus processed in 8 minutes",
  "Feels like having a professor on demand",
  "Best AI tool I've used for exam prep",
  "Hydra knew what questions were coming",
  "Went from C to A in one month",
  "Study plan was shockingly accurate",
  "Teacher signal feature is insane",
];

function TestimonialItem({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        color: "#9CA3AF",
        whiteSpace: "nowrap",
        padding: "0 16px",
      }}
    >
      <span style={{ color: "#7C3AED", fontSize: 8 }}>●</span>
      {text}
    </span>
  );
}

// ── File type chips for hero marquee (GLOBAL 02) ──────────────────────────────

const HERO_CHIPS: Array<{ label: string; icon: React.ElementType; color: string; bg: string }> = [
  { label: "PDF",        icon: FileText,    color: "#F87171", bg: "rgba(239,68,68,0.12)" },
  { label: "PPTX",       icon: Presentation,color: "#FB923C", bg: "rgba(249,115,22,0.12)" },
  { label: "DOCX",       icon: File,        color: "#60A5FA", bg: "rgba(59,130,246,0.12)" },
  { label: "Images",     icon: ImageIcon,   color: "#F472B6", bg: "rgba(236,72,153,0.12)" },
  { label: "Links",      icon: Link,        color: "#2DD4BF", bg: "rgba(20,184,166,0.12)" },
  { label: "Audio",      icon: Mic,         color: "#C084FC", bg: "rgba(168,85,247,0.12)" },
];

export function FileTypeMarqueeStrip() {
  return (
    <div
      style={{
        width: "100%",
        padding: "16px 0",
        borderTop: "1px solid rgba(124,58,237,0.12)",
        borderBottom: "1px solid rgba(124,58,237,0.12)",
        background: "rgba(15,10,30,0.5)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Marquee pauseOnHover repeat={6} className="[--duration:25s]">
        {HERO_CHIPS.map(({ label, icon: Icon, color, bg }) => (
          <span
            key={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: bg,
              color,
              border: `1px solid ${color}33`,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 14px",
              fontFamily: "Inter, sans-serif",
              marginRight: 12,
            }}
          >
            <Icon size={12} strokeWidth={2} />
            {label}
          </span>
        ))}
      </Marquee>
    </div>
  );
}

// ── Social Proof Strip (GLOBAL 05) ────────────────────────────────────────────

export function SocialProofStrip() {
  return (
    <section
      style={{
        background: "#000000",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "48px 10vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 32,
      }}
    >
      {/* Avatar cluster + counter */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <AvatarCluster />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontFamily: "'Georgia', 'Playfair Display', serif",
              fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1.1,
            }}
          >
            <SpringCounter to={12473} duration={2000} />
          </div>
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              color: "#6B7280",
              fontWeight: 400,
            }}
          >
            students aced their exams with Hydra
          </div>
        </div>

        {/* Trust badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(124,58,237,0.12)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 999,
            padding: "6px 14px",
            color: "#A78BFA",
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          ✦ Trusted by students at 60+ universities
        </div>
      </div>

      {/* Testimonials ticker */}
      <div style={{ width: "100%", overflow: "hidden" }}>
        <Marquee pauseOnHover repeat={4} className="[--duration:35s]">
          {TESTIMONIALS.map((t) => (
            <TestimonialItem key={t} text={t} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}
