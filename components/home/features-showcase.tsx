"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import { FeaturesAuroraBg, FeaturesParticleLayer } from "../features-aurora-bg";
import { FileText, Presentation, File, Image as ImageIcon, Link, Mic, Brain, ChartBar, Clock, UploadCloud, CheckCircle, Video, FileArchive, TrendingUp, Database } from "lucide-react";
import { GlowEffect } from "../ui/glow-effect";
import { FileTypeMarqueeStrip } from "./social-proof-strip";
import { TypewriterEffect } from "../ui/typewriter-effect";
import { AnimatedBeam } from "../ui/animated-beam";
import { OrbitingCircles } from "../ui/orbiting-circles";
import { BorderBeam } from "../ui/border-beam";
import { Marquee } from "../ui/marquee";
import { GlowCard } from "../ui/spotlight-card";
import * as THREE from "three";

// ── Utility ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | boolean)[]) {
  return classes.filter(Boolean).join(" ");
}

// ── NumberTicker ─────────────────────────────────────────────────────────────

interface NumberTickerProps {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}

function NumberTicker({ value, duration = 2000, suffix = "", className }: NumberTickerProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const raf = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString()}{suffix}
    </span>
  );
}

// ── AnimatedList ─────────────────────────────────────────────────────────────

interface AnimatedListProps {
  items: React.ReactNode[];
  delay?: number;
  className?: string;
}

function AnimatedList({ items, delay = 1800, className }: AnimatedListProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false });

  useEffect(() => {
    if (!inView) return;
    const timer = setInterval(() => {
      setVisibleCount(c => {
        if (c >= items.length) {
          clearInterval(timer);
          return c;
        }
        return c + 1;
      });
    }, delay);
    return () => clearInterval(timer);
  }, [inView, items.length, delay]);

  return (
    <div ref={ref} className={cn("flex flex-col gap-2", className)}>
      {items.slice(0, visibleCount).map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {item}
        </motion.div>
      ))}
    </div>
  );
}

// ── Utility ─────────────────────────────────────────────────────────────────

function Pill({ children, color = "#7C3AED" }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ 
      display: "inline-flex", alignItems: "center", padding: "2px 8px", 
      borderRadius: "999px", fontSize: "10px", fontWeight: 600, 
      background: `${color}22`, color: color, border: `1px solid ${color}44` 
    }}>
      {children}
    </span>
  );
}

// ── MacFrame ─────────────────────────────────────────────────────────────────

function MacFrame({ children, minHeight }: { children: React.ReactNode; minHeight?: number | string }) {
  return (
    <div
      style={{
        backdropFilter: "blur(12px)",
        background: "rgba(15,10,30,0.6)",
        border: "1px solid rgba(124,58,237,0.2)",
        borderRadius: "16px",
        boxShadow: "0 0 0 1px rgba(124, 58, 237, 0.15), 0 24px 48px rgba(0, 0, 0, 0.4)",
        overflow: "hidden",
        minHeight: `${minHeight}px`,
        width: "100%",
      }}
    >
      {/* macOS title bar */}
      <div
        style={{
          background: "rgba(10,6,24,0.7)",
          height: "36px",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: "6px",
          borderBottom: "1px solid rgba(124,58,237,0.15)",
          flexShrink: 0,
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFBD2E" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

// ── FileTypeChip (GLOBAL 02) ──────────────────────────────────────────────────

const FILE_TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  PDF:      { icon: FileText,      bg: "rgba(239,68,68,0.10)",   text: "#F87171", border: "rgba(239,68,68,0.20)" },
  PPTX:     { icon: Presentation,  bg: "rgba(249,115,22,0.10)",  text: "#FB923C", border: "rgba(249,115,22,0.20)" },
  DOCX:     { icon: File,          bg: "rgba(59,130,246,0.10)",  text: "#60A5FA", border: "rgba(59,130,246,0.20)" },
  Images:   { icon: ImageIcon,     bg: "rgba(236,72,153,0.10)",  text: "#F472B6", border: "rgba(236,72,153,0.20)" },
  Links:    { icon: Link,          bg: "rgba(20,184,166,0.10)",  text: "#2DD4BF", border: "rgba(20,184,166,0.20)" },
  Audio:    { icon: Mic,           bg: "rgba(168,85,247,0.10)",  text: "#C084FC", border: "rgba(168,85,247,0.20)" },
  "Paper Pattern Analysis": { icon: Brain,   bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  "Teacher Signal":         { icon: Brain,   bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  "Recency Bias":           { icon: Clock,   bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  "Co-occurrence":          { icon: ChartBar,bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  "HP Questions":   { icon: Brain,   bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  "MP Questions":   { icon: Brain,   bg: "rgba(99,102,241,0.10)", text: "#818CF8", border: "rgba(99,102,241,0.20)" },
  "LP Questions":   { icon: Brain,   bg: "rgba(75,85,99,0.10)",   text: "#9CA3AF", border: "rgba(75,85,99,0.20)" },
  "Teacher-tone Answers": { icon: Mic, bg: "rgba(20,184,166,0.10)", text: "#2DD4BF", border: "rgba(20,184,166,0.20)" },
  "3hr Crunch Mode":   { icon: Clock, bg: "rgba(239,68,68,0.10)",   text: "#F87171", border: "rgba(239,68,68,0.20)" },
  "12hr Sprint":       { icon: Clock, bg: "rgba(249,115,22,0.10)",  text: "#FB923C", border: "rgba(249,115,22,0.20)" },
  "5-Day Prep":        { icon: Clock, bg: "rgba(59,130,246,0.10)",  text: "#60A5FA", border: "rgba(59,130,246,0.20)" },
  "Smart Reweighting": { icon: Brain, bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  // Model names
  "GPT-4o":    { icon: Brain, bg: "rgba(16,163,127,0.10)",  text: "#34D399", border: "rgba(16,163,127,0.20)" },
  "Claude 3.5":{ icon: Brain, bg: "rgba(124,58,237,0.10)",  text: "#A78BFA", border: "rgba(124,58,237,0.20)" },
  "Gemini Pro":{ icon: Brain, bg: "rgba(66,133,244,0.10)",  text: "#60A5FA", border: "rgba(66,133,244,0.20)" },
  "Llama 3.1": { icon: Brain, bg: "rgba(0,130,251,0.10)",   text: "#60A5FA", border: "rgba(0,130,251,0.20)" },
  "Perplexity":{ icon: Brain, bg: "rgba(29,185,84,0.10)",   text: "#4ADE80", border: "rgba(29,185,84,0.20)" },
};

const DEFAULT_CHIP = { icon: File, bg: "rgba(124,58,237,0.10)", text: "#A78BFA", border: "rgba(124,58,237,0.20)" };

function FileTypeChip({ label }: { label: string }) {
  const cfg = FILE_TYPE_CONFIG[label] ?? DEFAULT_CHIP;
  const Icon = cfg.icon;
  return (
    <motion.span
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="file-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 500,
        padding: "4px 10px",
        whiteSpace: "nowrap" as const,
        position: "relative",
        overflow: "hidden",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = cfg.text;
        const shimmer = e.currentTarget.querySelector(".chip-shimmer") as HTMLElement;
        if (shimmer) shimmer.style.animation = "chip-shimmer-sweep 0.6s ease forwards";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = cfg.border;
        const shimmer = e.currentTarget.querySelector(".chip-shimmer") as HTMLElement;
        if (shimmer) { shimmer.style.animation = "none"; }
      }}
    >
      <span className="chip-shimmer" style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(90deg, transparent 0%, ${cfg.text}33 50%, transparent 100%)`,
        transform: "translateX(-100%)",
        pointerEvents: "none",
      }} />
      <Icon size={11} strokeWidth={2} />
      {label}
    </motion.span>
  );
}

// ── GlowCTAButton (GLOBAL 03) ─────────────────────────────────────────────────

function GlowCTAButton() {
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <GlowEffect
        colors={["#7C3AED", "#A78BFA", "#4C1D95", "#7C3AED"]}
        mode="flowHorizontal"
        blur="soft"
        duration={3}
        scale={0.9}
      />
      <motion.button
        whileHover={{ scale: 1.04, boxShadow: "0 0 20px rgba(124,58,237,0.5)" }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        style={{
          position: "relative",
          background: "#1A0F2E",
          border: "1px solid #7C3AED",
          color: "white",
          fontSize: "13px",
          padding: "8px 18px",
          borderRadius: "8px",
          cursor: "pointer",
          fontFamily: "Inter, sans-serif",
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          transition: "border-color 0.2s",
          zIndex: 1,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#A78BFA"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#7C3AED"; }}
      >
        Try it free →
      </motion.button>
    </div>
  );
}

// ── Feature layout (GLOBAL 03 + 04) ──────────────────────────────────────────

interface FeatureRowProps {
  label: string;
  headline: string;
  body: string;
  pills: string[];
  cta: string;
  reverse?: boolean;
  mockup: React.ReactNode;
  textOffset?: number;
}

function FeatureRow({ label, headline, body, pills, cta, reverse, mockup, textOffset = 0 }: FeatureRowProps) {
  // We no longer strictly need useInView here if we rely on global observer, 
  // but we can keep the component simpler by just rendering the markup. 
  // Global observer handles the .in-view class.

  const text = (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "20px" }}>
      <span className="anim anim-up" style={{ transitionDelay: `${textOffset}s`, fontFamily: "monospace", fontSize: "13px", color: "#7C3AED", letterSpacing: "0.15em" }}>
        {label}
      </span>
      <h2
        className="anim anim-up"
        style={{
          transitionDelay: `${textOffset + 0.1}s`,
          fontFamily: "'Georgia', 'Playfair Display', serif",
          fontWeight: 700,
          fontSize: "clamp(2rem, 4vw, 3.5rem)",
          color: "#FFFFFF",
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {headline}
      </h2>
      <p className="anim anim-up" style={{ transitionDelay: `${textOffset + 0.2}s`, fontFamily: "Inter, sans-serif", fontSize: "1.05rem", lineHeight: 1.75, color: "#9CA3AF", margin: 0 }}>
        {body}
      </p>
      <div className="anim anim-up" style={{ transitionDelay: `${textOffset + 0.3}s`, display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {pills.map(p => <FileTypeChip key={p} label={p} />)}
      </div>
      <div className="anim anim-up" style={{ transitionDelay: `${textOffset + 0.4}s` }}>
        <a
          href="#"
          style={{
            fontSize: "0.95rem",
            color: "#8B5CF6",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            transition: "color 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#A78BFA")}
          onMouseLeave={e => (e.currentTarget.style.color = "#8B5CF6")}
        >
          {cta} →
        </a>
      </div>
    </div>
  );

  const visual = (
    <div
      style={{ width: "100%", position: "relative" }}
    >
      {mockup}
      {/* GLOBAL 03 — CTA glow button, absolute bottom-right of mockup */}
      <div className="anim anim-up" style={{ position: "absolute", bottom: -16, right: 0, transitionDelay: "1.15s" }}>
        <GlowCTAButton />
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", zIndex: 1 }} className="feature-section">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: reverse ? "56% 38%" : "38% 56%",
          gap: "6%",
          padding: "100px 10vw 116px",
          alignItems: "center",
        }}
        className="feature-row-grid"
      >
        {reverse ? [visual, text] : [text, visual]}
      </div>
      <div style={{ height: "1px", background: "rgba(124,58,237,0.15)", margin: "0 10vw" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 01 — Upload (FIX 01, 02, 03)
// ─────────────────────────────────────────────────────────────────────────────

const UPLOAD_FILE_DATA = [
  { name: "physics_notes.pdf", size: "4.1 MB", pages: "124 pages", type: "PDF", color: "#EF4444", icon: FileText },
  { name: "syllabus_2024.docx", size: "1.2 MB", pages: "12 pages", type: "DOCX", color: "#3B82F6", icon: File },
  { name: "lecture_slides.pptx", size: "5.3 MB", pages: "84 slides", type: "PPTX", color: "#F97316", icon: Presentation },
  { name: "teacher_hints.txt", size: "0.2 MB", pages: "3 pages", type: "TXT", color: "#8B5CF6", icon: FileText },
  { name: "recording_l3.mp4", size: "112 MB", pages: "45 mins", type: "MP4", color: "#EC4899", icon: Video },
  { name: "past_papers.zip", size: "14 MB", pages: "9 files", type: "ZIP", color: "#10B981", icon: FileArchive },
];

function FileCard({ file }: { file: typeof UPLOAD_FILE_DATA[0] }) {
  const Icon = file.icon;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // 0: Initial, 1: Progress, 2: Done
    const t1 = setTimeout(() => setStage(1), 300);
    const t2 = setTimeout(() => setStage(2), 1500); // 0.8s for bar + extra to show check
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.015, boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}
      style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `4px solid ${file.color}`,
        borderRadius: "10px",
        padding: "10px 14px",
        gap: "12px",
        position: "relative",
        overflow: "hidden",
        width: "100%",
        marginBottom: "8px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `rgba(255,255,255,0.15)`;
        (e.currentTarget as HTMLElement).style.borderLeftColor = file.color;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `rgba(255,255,255,0.08)`;
      }}
    >
      <Icon color={file.color} size={20} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div style={{ color: "white", fontSize: "13px", fontWeight: 500, textOverflow: "ellipsis", overflow: "hidden" }}>
          {file.name}
        </div>
        <div style={{ color: "#6B7280", fontSize: "11px" }}>
          {file.pages} · {file.size}
        </div>
      </div>
      
      {/* Right side status */}
      <div style={{ width: "80px", position: "relative", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        {stage !== 2 && (
          <div style={{
            width: "100%", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", position: "relative", padding: "12px 0"
          }}>
             <div style={{
               position: "absolute", inset: "0", background: "rgba(255,255,255,0.1)", borderRadius: "4px", height: "4px", margin: "auto"
             }} />
             {stage === 1 && (
               <div style={{
                 position: "absolute", left: 0, height: "4px", margin: "auto", top: 0, bottom: 0, borderRadius: "4px",
                 background: file.color, width: "100%", transformOrigin: "left", animation: "upload-fill 1.1s ease-out forwards"
               }} className="shimmer-progress">
                 <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)", animation: "shimmer 1.2s infinite linear" }} />
               </div>
             )}
          </div>
        )}
        {stage === 2 && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
             <span style={{ fontSize: "11px", color: "#10B981" }}>Processed</span>
             <CheckCircle className="text-green-500" size={14} color="#10B981" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function FileCardList() {
  return (
    <div style={{ width: "100%", marginTop: "16px" }}>
      {UPLOAD_FILE_DATA.map((file, i) => (
        <div 
          key={file.name} 
          className="anim anim-up" 
          style={{ transitionDelay: `${0.8 + i * 0.15}s` }}
        >
          <FileCard file={file} />
        </div>
      ))}
    </div>
  );
}

function UploadMockup() {
  const counterRef = useRef<HTMLSpanElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const inView = useInView(mockupRef, { once: true });

  useEffect(() => {
    if (!inView || !counterRef.current) return;
    const el = counterRef.current;
    const target = 1600;
    const duration = 2000;
    const start = performance.now();
    const raf = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [inView]);

  return (
    <div className="anim anim-right" style={{ transitionDelay: '0.25s', position: "relative" }}>
      <MacFrame>
        <style>{`
          @keyframes breathe {
            0%, 100% { box-shadow: 0 0 8px rgba(124,58,237,0.3); border-color: #7C3AED; }
            50% { box-shadow: 0 0 28px rgba(124,58,237,0.7); border-color: #A78BFA; }
          }
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          @keyframes upload-fill {
            0% { width: 0%; }
            100% { width: 100%; }
          }
        `}</style>

        {/* Counter */}
        <div ref={mockupRef} style={{ textAlign: "center", marginBottom: "20px", transitionDelay: '0.35s' }} className="anim anim-up">
          <div style={{ fontFamily: "monospace", fontSize: "32px", fontWeight: 700, color: "#FFFFFF" }}>
            <span ref={counterRef} style={{ fontVariantNumeric: "tabular-nums" }}>0</span>{" "}
            <span style={{ color: "#7C3AED" }}>pages processed</span>
          </div>
        </div>

        {/* Breathing Drop Zone */}
        <div
          className="anim anim-up"
          style={{
            transitionDelay: '0.5s',
            border: "2px dashed #7C3AED",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "24px 16px 16px",
            animation: "breathe 2.5s ease-in-out infinite",
            background: "rgba(124,58,237,0.01)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <BorderBeam size={200} duration={8} colorFrom="#7c3aed" colorTo="#2dd4bf" borderWidth={1.5} />

          <div style={{ opacity: 0.8 }}>
            <UploadCloud size={48} color="#A78BFA" />
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#FFFFFF", fontSize: "16px", fontWeight: 600, marginTop: "8px" }}>Drop anything.</div>
            <div style={{ color: "#A78BFA", fontSize: "12px", marginTop: "4px", marginBottom: "16px" }}>PDFs, slides, notes, videos — we digest it all.</div>
          </div>

          {/* Marquee strip embedded into dropzone */}
          <div className="anim anim-up" style={{ width: "100%", pointerEvents: "none", transitionDelay: "0.65s" }}>
            <Marquee pauseOnHover style={{ "--duration": "30s" } as React.CSSProperties} className="py-1">
              {['Links', 'Audio', 'PDF', 'PPTX', 'DOCX', 'Images', 'TXT', 'MP4', 'ZIP'].map(f => (
                <span key={f} className="mx-2 px-3 py-1 rounded-full border border-white/20 text-xs text-white/60">{f}</span>
              ))}
            </Marquee>
          </div>
        </div>

        {/* Animated FileList */}
        <FileCardList />
      </MacFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 02 — NNPWE (FIX 01 & FIX 02)
// ─────────────────────────────────────────────────────────────────────────────

const NNPWE_TOPICS = [
  { name: 'Quantum Mechanics', pct: 94 },
  { name: 'Nuclear Physics', pct: 91 },
  { name: 'Thermodynamics', pct: 89 },
  { name: 'Mechanics', pct: 83 },
  { name: 'Electrochemistry', pct: 76 },
  { name: 'Optics', pct: 71 },
  { name: 'Wave Theory', pct: 68 },
];

function NNPWEMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [statusStage, setStatusStage] = useState<0 | 1>(0);
  const counter87Ref = useRef<HTMLSpanElement>(null);
  const counter34Ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (inView) {
      const timer = setTimeout(() => setStatusStage(1), 2000);
      return () => clearTimeout(timer);
    }
  }, [inView]);

  // CountUp for 87%
  useEffect(() => {
    if (!inView || !counter87Ref.current) return;
    const el = counter87Ref.current;
    const target = 87;
    const duration = 1500;
    const start = performance.now();
    const raf = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [inView]);

  // CountUp for 34%
  useEffect(() => {
    if (!inView || !counter34Ref.current) return;
    const el = counter34Ref.current;
    const target = 34;
    const duration = 1200;
    const start = performance.now();
    const raf = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [inView]);

  return (
    <div className="anim anim-left" style={{ transitionDelay: '0.2s', position: "relative" }}>
      <div style={{ opacity: 0.15 }}>
        <GlowEffect
          colors={['#4f46e5']}
          mode="static"
          blur="strong"
          scale={0.8}
          className="-z-10"
        />
      </div>
      <MacFrame>
        <style>{`
          @keyframes blink-opacity { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        `}</style>
        <div ref={ref}>
          {/* Prediction model status */}
          <div className="anim anim-up" style={{ transitionDelay: '0.4s', height: "24px", marginBottom: "20px", display: "flex", alignItems: "center" }}>
            {statusStage === 0 ? (
              <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#7C3AED", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ animation: "blink-opacity 0.8s infinite" }}>⟳ Recalculating topic weights...</span>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontFamily: "monospace", fontSize: "13px", color: "#10B981", display: "flex", alignItems: "center", gap: "6px", fontWeight: 500 }}>
                Prediction model updated <span className="inline-block animate-pulse text-green-400" style={{ marginLeft: "4px" }}>✓</span>
              </motion.div>
            )}
          </div>

          {/* Topic Probability Bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {NNPWE_TOPICS.map((topic, index) => (
              <div key={topic.name} className="anim anim-up" style={{ transitionDelay: `${0.5 + index * 0.1}s` }}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/70">{topic.name}</span>
                  <span className="text-purple-400 font-mono">{topic.pct}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: inView ? `${topic.pct}%` : '0%', transitionDelay: `${0.6 + index * 0.1}s` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Split Comparison Stat Card */}
          <div
            className="anim anim-up"
            style={{
              transitionDelay: '0.9s',
              marginTop: "32px",
              background: "rgba(124,58,237,0.03)",
              border: "1px solid rgba(124,58,237,0.15)",
              borderRadius: "14px",
              boxShadow: "0 0 40px rgba(124, 58, 237, 0.12)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            <BorderBeam colorFrom="#f59e0b" colorTo="#10b981" duration={6} />
            {/* subtle top glow */}
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.5), transparent)" }} />
            
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {/* Left Col (Hydra) */}
              <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ 
                  background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B", 
                  fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" 
                }}>
                  +53pts vs average
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "4px" }}>
                  <span style={{ fontSize: "56px", fontWeight: 700, color: "#A78BFA", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    <span ref={counter87Ref}>0</span>%
                  </span>
                  <TrendingUp size={24} color="#10B981" style={{ marginTop: "6px" }} />
                </div>
                <div style={{ color: "#D1D5DB", fontSize: "12px", marginTop: "8px", fontWeight: 500 }}>exam prediction accuracy</div>
              </div>

              {/* Divider */}
              <div style={{ width: "1px", background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent)" }} />

              {/* Right Col (Without Hydra) */}
              <div className="anim anim-up" style={{ transitionDelay: '1.0s', flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", justifyContent: "flex-end" }}>
                <span style={{ fontSize: "56px", fontWeight: 700, color: "rgba(255,255,255,0.25)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  <span ref={counter34Ref}>0</span>%
                </span>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginTop: "8px" }}>studying without Hydra</div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", color: "#6B7280", fontSize: "11px", marginTop: "16px", fontStyle: "italic" }}>
            *Based on analysis of 50,000+ past exam papers
          </div>
        </div>
      </MacFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 03 — Model Router (FIX 01, 02, 03)
// ─────────────────────────────────────────────────────────────────────────────

function Section03ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene | null, camera: THREE.OrthographicCamera | null, renderer: THREE.WebGLRenderer | null,
    mesh: THREE.Mesh | null, uniforms: any, animationId: number | null
  }>({ scene: null, camera: null, renderer: null, mesh: null, uniforms: null, animationId: null });

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    const vertexShader = `attribute vec3 position; void main() { gl_Position = vec4(position, 1.0); }`;
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 base = vec3(0.059, 0.039, 0.118); // #0F0A1E
        
        // timeScale: 0.4 meaning slower animation (original was 0.15, now 0.06)
        float t = time * 0.06; 
        float n1 = noise(vec2(uv.x * 2.5 + t * 0.3, uv.y * 1.8 + t * 0.1));
        float n2 = noise(vec2(uv.x * 3.2 - t * 0.2, uv.y * 2.4 - t * 0.15));
        float aurora = n1 * 0.5 + n2 * 0.5;
        
        vec3 colorCyan = vec3(0.024, 0.714, 0.831); // #06B6D4
        vec3 colorViolet = vec3(0.486, 0.227, 0.929); // #7C3AED
        vec3 colorDeep = vec3(0.298, 0.114, 0.584); // #4C1D95
        
        float blend = fract(aurora * 2.0 + t);
        vec3 auroraFinal = mix(mix(colorDeep, colorViolet, blend), colorCyan, smoothstep(0.6, 1.0, aurora));
        
        float intensity = aurora * 0.4 * (0.85 + 0.15 * sin(time * 0.1));
        gl_FragColor = vec4(mix(base, auroraFinal, intensity), 1.0);
      }
    `;

    sceneRef.current.scene = new THREE.Scene();
    sceneRef.current.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    sceneRef.current.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    sceneRef.current.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);
    sceneRef.current.uniforms = { resolution: { value: [canvas.offsetWidth, canvas.offsetHeight] }, time: { value: 0.0 } };

    const pts = new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, 1,-1,0, -1,1,0, 1,1,0]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    sceneRef.current.mesh = new THREE.Mesh(geo, new THREE.RawShaderMaterial({ vertexShader, fragmentShader, uniforms: sceneRef.current.uniforms }));
    sceneRef.current.scene.add(sceneRef.current.mesh);

    const resize = () => {
      const p = canvasRef.current?.parentElement;
      if (!p || !sceneRef.current.renderer) return;
      sceneRef.current.renderer.setSize(p.offsetWidth, p.offsetHeight, false);
      sceneRef.current.uniforms.resolution.value = [p.offsetWidth, p.offsetHeight];
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      sceneRef.current.uniforms.time.value += 0.01;
      sceneRef.current.renderer?.render(sceneRef.current.scene!, sceneRef.current.camera!);
      sceneRef.current.animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (sceneRef.current.animationId) cancelAnimationFrame(sceneRef.current.animationId);
      window.removeEventListener("resize", resize);
      sceneRef.current.renderer?.dispose();
    };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      {/* Radial overlay vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)" }} />
      
      {/* Faint orbiting background */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.15, transform: "scale(1.2)" }}>
         <OrbitingCircles radius={140} duration={30}>
           <div style={{ background: "#7C3AED", color: "white", padding: "6px", borderRadius: "8px", fontSize: "10px", fontWeight: "bold" }}>Claude</div>
           <div style={{ background: "#10A37F", color: "white", padding: "6px", borderRadius: "8px", fontSize: "10px", fontWeight: "bold" }}>GPT-4o</div>
           <div style={{ background: "#4285F4", color: "white", padding: "6px", borderRadius: "8px", fontSize: "10px", fontWeight: "bold" }}>Gemini</div>
         </OrbitingCircles>
         <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#A78BFA", fontSize: "18px", fontWeight: 800 }}>Hydra</div>
      </div>
    </div>
  );
}

const ROUTING_SEQUENCES = [
  { question: "Derive the Schrödinger equation...", target: "Claude 3.5" },
  { question: "Write a persuasive essay on climate...", target: "GPT-4o" },
  { question: "Debug this Python function...", target: "GPT-4o" },
  { question: "Solve this integral step by step...", target: "Gemini Pro" },
];

const MODELS = [
  { name: "GPT-4o", cap: "Reasoning & Coding", badge: "OpenAI", badgeColor: "#10A37F" },
  { name: "Claude 3.5", cap: "STEM & Deep Logic", badge: "Anthropic", badgeColor: "#7C3AED" },
  { name: "Gemini Pro", cap: "Multimodal Math", badge: "Google", badgeColor: "#4285F4" },
];

function TypewriterText({ text, speed = 25, className }: { text: string; speed?: number, className?: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return <span className={className}>{displayed}</span>;
}

function TypewriterVanilla({ effectTarget, text, delay, speed = 20, active = true }: { effectTarget: string, text: string, delay: number, speed?: number, active?: boolean }) {
  useEffect(() => {
    if (!active) return;
    const el = document.querySelector(effectTarget) as HTMLElement;
    if (!el) return;
    const t1 = setTimeout(() => {
      el.textContent = '';
      let i = 0;
      const t2 = setInterval(() => {
        el.textContent += text[i++];
        if (i >= text.length) clearInterval(t2);
      }, speed);
      return () => clearInterval(t2);
    }, delay);
    return () => clearTimeout(t1);
  }, [active, effectTarget, text, delay, speed]);
  return null;
}

const CYCLING_ANSWERS = [
  "Here's how to think about this logically:\n1. Identify the bounds.\n2. Integrate with respect to dy first.\n3. Substitute the boundary limits.",
  "The key concept here is integration by parts...\n∫u dv = uv - ∫v du\nApply this with u = x and dv = eˣdx",
  "For this proof, start with the contrapositive...\nAssume ¬Q and derive ¬P step by step.",
];

function AnswerQualityToggle() {
  const [isHydra, setIsHydra] = useState(false);
  const [answerIdx, setAnswerIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setIsHydra(true), 2000);
    return () => clearTimeout(t);
  }, [inView]);

  // Cycle answers every 5s when hydra panel is active
  useEffect(() => {
    if (!isHydra) return;
    const t = setInterval(() => setAnswerIdx(i => (i + 1) % CYCLING_ANSWERS.length), 5000);
    return () => clearInterval(t);
  }, [isHydra]);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "24px" }}>
      {/* Pill Toggle */}
      <div className="anim anim-up" style={{ transitionDelay: "1.1s", display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: "99px", padding: "4px", position: "relative" }}>
          {['Single model', 'Hydra routed'].map((opt, i) => {
            const active = (i === 1) === isHydra;
            return (
              <button
                key={opt}
                onClick={() => setIsHydra(i === 1)}
                style={{
                  position: "relative", padding: "6px 16px", fontSize: "12px", fontWeight: 500, zIndex: 1,
                  color: active ? "white" : "#9CA3AF", cursor: "pointer", background: "none", border: "none",
                  overflow: "hidden",
                }}
              >
                {active && (
                  <motion.div
                    layoutId="toggle-bubble"
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                    style={{ position: "absolute", inset: 0, background: "#7C3AED", borderRadius: "99px", zIndex: -1, overflow: "hidden" }}
                  >
                    {i === 1 && <BorderBeam colorFrom="#7c3aed" colorTo="#2dd4bf" duration={3} size={80} />}
                  </motion.div>
                )}
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Answer Panel Compare */}
      <div className="anim anim-up" style={{ transitionDelay: "1.25s", position: "relative", height: "180px" }}>
        <AnimatePresence mode="wait">
          {!isHydra ? (
            <motion.div
              key="single"
              initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 20, filter: "blur(4px)" }}
              transition={{ duration: 0.3 }}
              style={{
                position: "absolute", inset: 0, padding: "16px", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#9CA3AF", fontFamily: "monospace", fontSize: "11px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "#D1D5DB" }}>Generic response</span>
                <span style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B", padding: "2px 8px", borderRadius: "4px", fontWeight: "bold" }}>6.1 / 10</span>
              </div>
              "The equation can be solved by applying standard derivation techniques. You first find the integral and then deduce the core value using theoretical application..."
            </motion.div>
          ) : (
            <motion.div
              key="hydra"
              initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 20, filter: "blur(4px)" }}
              transition={{ duration: 0.3 }}
              style={{
                position: "absolute", inset: 0, padding: "16px", background: "rgba(124,58,237,0.04)",
                border: "1px solid rgba(124,58,237,0.4)", boxShadow: "0 0 20px rgba(124,58,237,0.15)",
                borderRadius: "12px", color: "white", fontSize: "12px", overflow: "auto"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "#A78BFA", fontWeight: "bold" }}>Teacher-tone via RAG</span>
                <span style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", padding: "2px 8px", borderRadius: "4px", fontWeight: "bold" }}>9.4 / 10</span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#E5E7EB", whiteSpace: "pre-line", lineHeight: 1.7 }}>
                <TypewriterText key={`answer-${answerIdx}`} text={CYCLING_ANSWERS[answerIdx]} speed={30} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ModelRouterMockup() {
  const [seq, setSeq] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLDivElement>(null);
  const gptRef = useRef<HTMLDivElement>(null);

  const inView = useInView(containerRef, { once: false });

  useEffect(() => {
    if (!inView) return;
    const interval = setInterval(() => {
      setSeq(s => (s + 1) % ROUTING_SEQUENCES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [inView]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "680px", overflow: "hidden", borderRadius: "16px" }}>
      <GlowEffect
        colors={['#4c1d95', '#7c3aed']}
        mode="static"
        blur="strong"
        scale={1.05}
        className="-z-10"
      />
      {/* Custom Section03 Background overlay */}
      <Section03ShaderBackground />

      {/* Content wrapper relative on top of background */}
      <div className="anim anim-right" style={{ transitionDelay: '0.2s', position: "relative", zIndex: 1, padding: "32px 24px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        
        {/* Animated Routing Sequence */}
        <div ref={containerRef} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", alignItems: "center", position: "relative", minHeight: "220px" }}>
          
          {/* Left panel: Input source */}
          <div ref={inputRef} className="anim anim-up" style={{ transitionDelay: "0.5s", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "120px", zIndex: 10 }}>
            <div style={{ fontSize: "11px", color: "#7C3AED", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Hydra Routing Engine</div>
            <div style={{ fontFamily: "monospace", fontSize: "14px", color: "#E5E7EB", lineHeight: 1.5 }}>
              <TypewriterText key={seq} text={ROUTING_SEQUENCES[seq].question} speed={25} className="cursor-blink" />
            </div>
          </div>

          {/* Right panel: Target Models */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", zIndex: 10 }}>
            {MODELS.map((m, i) => {
              const active = m.name === ROUTING_SEQUENCES[seq].target;
              const isGPT = i === 0;
              const rowDelay = isGPT ? "0.65s" : i === 1 ? "0.8s" : "0.95s";
              return (
                <div
                  key={m.name}
                  className="anim anim-right"
                  style={{ transitionDelay: rowDelay }}
                  ref={isGPT ? gptRef : undefined}
                >
                  <GlowCard
                    customSize
                    glowColor="purple"
                    backdropColor={active ? "rgba(124,58,237,0.08)" : "rgba(10,6,24,0.4)"}
                    className="w-full"
                  >
                    <motion.div
                      ref={(el) => { if (el) targetRefs.current[i] = el; }}
                      layout
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "10px",
                        background: active ? "rgba(124,58,237,0.12)" : "transparent",
                        border: active ? "1px solid rgba(124,58,237,0.5)" : "1px solid transparent",
                        borderLeft: active ? "3px solid #7C3AED" : "3px solid transparent",
                        opacity: active ? 1 : 0.4,
                        position: "relative", overflow: "hidden",
                      }}
                    >
                      {active && isGPT && <BorderBeam colorFrom="#a78bfa" colorTo="#7c3aed" duration={4} size={150} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {active && <motion.div animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: 6, height: 6, background: "#A78BFA", borderRadius: "50%" }} />}
                          <span style={{ color: "white", fontSize: "14px", fontWeight: 600 }}>{m.name}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{m.cap}</div>
                      </div>
                      <div style={{ fontSize: "10px", color: m.badgeColor, background: `${m.badgeColor}15`, border: `1px solid ${m.badgeColor}33`, padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                        {m.badge}
                      </div>
                    </motion.div>
                  </GlowCard>
                </div>
              );
            })}
          </div>

          {/* Hero beam: input → GPT-4o */}
          {containerRef.current && inputRef.current && gptRef.current && (
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={inputRef}
              toRef={gptRef}
              curvature={-30}
              startYOffset={10}
              endYOffset={-10}
              gradientStartColor="#7c3aed"
              gradientStopColor="#a78bfa"
              pathWidth={2}
              pathOpacity={0.4}
              animationDuration={3}
            />
          )}
          {/* Beams for all models */}
          {MODELS.map((m, i) => {
            const isTarget = m.name === ROUTING_SEQUENCES[seq].target;
            if (!containerRef.current || !inputRef.current || !targetRefs.current[i]) return null;
            return (
              <AnimatedBeam
                key={`beam-${m.name}`}
                containerRef={containerRef}
                fromRef={inputRef}
                toRef={{ current: targetRefs.current[i] }}
                curvature={45}
                pathWidth={isTarget ? 3 : 1}
                colorFrom="#7C3AED"
                colorTo="#A78BFA"
                duration={1.5}
                delay={0}
                startXOffset={10}
                endXOffset={-10}
              />
            );
          })}
        </div>

        {/* Answer Quality Comparison Toggle */}
        <AnswerQualityToggle />

        {/* Footer Disclaimer */}
        <div style={{ textAlign: "center", marginTop: "32px", fontSize: "11px", color: "#6B7280" }}>
          *Routes to the best available model independently. Not affiliated with model providers.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 04 — Question Bank
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 04 — Question Bank
// ─────────────────────────────────────────────────────────────────────────────

const QUESTIONS = {
  HP: [
    { q: "Derive the equation of motion using Newton's second law for a spring-mass system.", topic: "Mechanics", prob: "94%" },
    { q: "Evaluate the convergence of the Riemann series and implications.", topic: "Analysis", prob: "89%" },
  ],
  MP: [
    { q: "Describe the role of ATP in cellular energy transfer.", topic: "Biochem", prob: "67%" },
    { q: "How does the photoelectric effect confirm particles?", topic: "Physics", prob: "52%" },
  ],
  LP: [
    { q: "List differences between Gram+ and Gram- bacteria.", topic: "Microbio", prob: "31%" },
  ],
};

function LiveQuestionCountRow({ inView }: { inView: boolean }) {
  return (
    <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "11px", color: "#6B7280", textAlign: "center", fontFamily: "monospace" }}>
        Your predicted exam — generated from 3 uploaded files
      </div>
      <div style={{ display: "flex", gap: "12px", justifyContent: "space-between" }}>
        <div className="anim anim-up" style={{ transitionDelay: '0.2s', flex: 1, display: "flex" }}>
          <StatCard inView={inView} val={47} label="High Priority Questions" color="#F59E0B" pulse />
        </div>
        <div className="anim anim-up" style={{ transitionDelay: '0.35s', flex: 1, display: "flex" }}>
          <StatCard inView={inView} val={23} label="Medium Priority" color="#60A5FA" />
        </div>
        <div className="anim anim-up" style={{ transitionDelay: '0.5s', flex: 1, display: "flex" }}>
          <StatCard inView={inView} val={31} label="Lower Priority" color="rgba(255,255,255,0.4)" />
        </div>
      </div>
    </div>
  );
}

function StatCounterVanilla({ val, inView }: { val: number, inView: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    let start = 0;
    const target = val;
    const duration = 1800;
    const step = target / (duration / 16);
    const t = setInterval(() => {
      start += step;
      el.textContent = Math.floor(start).toLocaleString();
      if (start >= target) { el.textContent = target.toLocaleString(); clearInterval(t); }
    }, 16);
    return () => clearInterval(t);
  }, [inView, val]);
  return <span ref={ref}>0</span>;
}

function StatCard({ inView, val, label, color, pulse = false }: { inView: boolean, val: number, label: string, color: string, pulse?: boolean }) {
  const [done, setDone] = useState(false);
  
  useEffect(() => {
    if (inView) {
      const t = setTimeout(() => setDone(true), 1500);
      return () => clearTimeout(t);
    }
    setDone(false);
  }, [inView]);

  return (
    <motion.div
      animate={pulse && done ? { boxShadow: ["0 0 0px transparent", "0 0 24px rgba(245,158,11,0.5)", "0 0 0px transparent"] } : {}}
      transition={{ duration: 0.8 }}
      style={{
        flex: 1, background: "rgba(255,255,255,0.02)", borderRadius: "10px", padding: "12px 14px",
        border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center"
      }}
    >
      <span style={{ fontSize: "28px", fontWeight: 700, color, lineHeight: 1, fontFamily: "var(--font-mono, monospace)" }}>
        <StatCounterVanilla inView={inView} val={val} />
      </span>
      <span style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "4px", fontWeight: 600 }}>{label}</span>
    </motion.div>
  );
}

function TypewriterAnswerReveal() {
  const [complete, setComplete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const textToType = "The convergence implies that the series can be summed, and in the context of the zeta function, Riemann proved that its distribution is deeply tied to the spacing of prime numbers.";

  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!inView) return;
    const tDelay = setTimeout(() => {
      let i = 0;
      const timer = setInterval(() => {
        i++;
        setDisplayed(textToType.slice(0, i));
        if (i >= textToType.length) {
          clearInterval(timer);
          setComplete(true);
        }
      }, 20); // user requested 20ms speed typically
      return () => clearInterval(timer);
    }, 1800); // 1800ms delay requested by user
    return () => clearTimeout(tDelay);
  }, [inView]);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
      {/* Question Chip */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderLeft: "4px solid #7C3AED", borderRadius: "8px", padding: "10px 14px" }}>
        <div style={{ color: "white", fontSize: "13px", fontWeight: 500 }}>
          <span style={{ color: "#A78BFA", marginRight: "6px" }}>Q:</span>
          Evaluate the convergence of the Riemann series and its implications for number theory.
        </div>
      </div>
      
      {/* Answer Box */}
      <motion.div
        animate={{ 
          borderColor: complete ? "rgba(16,185,129,0.4)" : "rgba(124,58,237,0.2)",
          boxShadow: complete ? "0 0 15px rgba(16,185,129,0.1)" : "0 0 0px transparent"
        }}
        transition={{ duration: 0.8 }}
        style={{
          background: "rgba(0,0,0,0.4)", backdropFilter: "blur(12px)", borderRadius: "10px", padding: "16px",
          border: "1px solid rgba(124,58,237,0.2)", position: "relative", minHeight: "100px"
        }}
      >
        {complete && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ position: "absolute", top: "12px", right: "16px", display: "flex", alignItems: "center", gap: "4px", background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)", padding: "4px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700 }}
          >
            <CheckCircle size={12} /> Answer ready
          </motion.div>
        )}
        
        <div style={{ fontFamily: "monospace", fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.9)", marginTop: complete ? "12px" : "0", transition: "margin-top 0.4s ease" }}>
          {displayed}
          <span className={complete ? "cursor-complete" : "cursor-typing"} style={{ color: "#7C3AED", marginLeft: "2px" }}>|</span>
        </div>
        
        <style>{`
          span.cursor-typing { animation: blink 0.7s step-end infinite; }
          span.cursor-complete { animation: fadeOutCursor 2s forwards; }
          @keyframes fadeOutCursor {
            0% { opacity: 1; }
            80% { opacity: 1; }
            100% { opacity: 0; display: none; }
          }
        `}</style>
      </motion.div>
    </div>
  );
}

function Section04TeacherToggle() {
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIsTeacher(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: "99px", padding: "4px", position: "relative" }}>
           {['Generic AI', 'Teacher Tone (RAG)'].map((opt, i) => {
             const active = (i === 1) === isTeacher;
             return (
               <button
                 key={opt}
                 onClick={() => setIsTeacher(i === 1)}
                 style={{ 
                   position: "relative", padding: "6px 16px", fontSize: "12px", fontWeight: 600, zIndex: 1,
                   color: active ? "white" : "#9CA3AF", cursor: "pointer", background: "none", border: "none"
                 }}
               >
                 {active && <motion.div layoutId="s4-toggle-bubble" transition={{ type: "spring", stiffness: 300, damping: 24 }} style={{ position: "absolute", inset: 0, background: "#7C3AED", borderRadius: "99px", zIndex: -1 }} />}
                 {opt}
               </button>
             );
           })}
        </div>
      </div>

      <div style={{ position: "relative", height: "200px" }}>
        <AnimatePresence mode="wait">
          {!isTeacher ? (
            <motion.div
              key="single"
              initial={{ opacity: 0, scale: 0.97, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ position: "absolute", inset: 0, padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "#D1D5DB", fontWeight: 600, fontSize: "13px" }}></span>
                <span style={{ background: "rgba(255,255,255,0.1)", color: "#E5E7EB", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" }}>Generic</span>
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "12px", lineHeight: 1.5, fontFamily: "serif" }}>
                "The Riemann hypothesis is a conjecture about the distribution of prime numbers. It states that all nontrivial zeros of the Riemann zeta function have real part 1/2."
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="hydra"
              initial={{ opacity: 0, scale: 0.97, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ position: "absolute", inset: 0, padding: "16px", background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.4)", boxShadow: "0 0 30px rgba(124,58,237,0.1)", borderRadius: "10px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ color: "#A78BFA", fontSize: "10px", display: "flex", alignItems: "center", gap: "6px" }}><Database size={12}/> Sourced from your uploaded notes + 50K paper database</span>
                <span style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>Teacher Tone ✓</span>
              </div>
              <div style={{ color: "white", fontSize: "12px", lineHeight: 1.4 }}>
                <strong style={{ color: "#A78BFA" }}>Key Concept:</strong> The Riemann hypothesis isn't just about math; it's the DNA of prime numbers.
                <div style={{ background: "rgba(245,158,11,0.1)", borderLeft: "3px solid #F59E0B", padding: "6px 10px", margin: "6px 0", color: "#FCD34D", fontSize: "11px" }}>
                  <strong>Real-world analogy:</strong> Imagine prime numbers as trees in a massive forest. Riemann's zeros act as the map showing exactly where they grow.
                </div>
                <div style={{ background: "rgba(16,185,129,0.1)", borderLeft: "3px solid #10B981", padding: "6px 10px", margin: "0", color: "#6EE7B7", fontSize: "11px" }}>
                  <strong>Exam tip:</strong> Professor Harrison always looks for the connection to the "Prime Number Theorem" in long-form answers. Always mention it.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuestionBankMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  const colConfig = [
    { key: "HP", label: "High Priority", color: "#F59E0B", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", headerDelay: "0.6s", startDelay: 0.7 },
    { key: "MP", label: "Medium Priority", color: "#60A5FA", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", headerDelay: "0.75s", startDelay: 0.9 },
    { key: "LP", label: "Low Priority", color: "#9CA3AF", bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.05)", headerDelay: "0.9s", startDelay: 1.1 },
  ] as const;

  return (
    <div className="anim anim-left" style={{ transitionDelay: '0s' }}>
      <MacFrame>
        <div ref={ref} style={{ display: "flex", flexDirection: "column", padding: "16px" }}>
          
          <LiveQuestionCountRow inView={inView} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", position: "relative" }}>
            {/* subtle amber glow behind HP column */}
            <div style={{ position: "absolute", top: 0, left: 0, width: "33%", height: "100%", background: "radial-gradient(ellipse at top, rgba(245,158,11,0.08), transparent 70%)", zIndex: 0, pointerEvents: "none" }} />
            
            {colConfig.map((col, colIndex) => (
              <div 
                key={col.key} 
                style={{ display: "flex", flexDirection: "column", gap: "12px", zIndex: 1 }}
              >
                {/* Header Badge */}
                <div className="anim anim-up" style={{ transitionDelay: col.headerDelay, background: col.bg, border: `1px solid ${col.border}`, color: col.color, padding: "6px 12px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em", display: "inline-block", alignSelf: "flex-start" }}>
                  {col.label}
                </div>

                {QUESTIONS[col.key as keyof typeof QUESTIONS].map((q, i) => {
                  const isHp = col.key === "HP";
                  const isLp = col.key === "LP";
                  const cardDelay = `${col.startDelay + i * 0.15}s`;
                  return (
                    <motion.div
                      key={i}
                      className="anim anim-up"
                      style={{
                        transitionDelay: cardDelay,
                        background: isHp ? "rgba(245,158,11,0.04)" : isLp ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isHp ? "rgba(245,158,11,0.2)" : isLp ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"}`,
                        borderLeft: `3px solid ${isHp ? "#F59E0B" : isLp ? "rgba(255,255,255,0.2)" : "#60A5FA"}`,
                        borderRadius: "8px",
                        padding: "10px",
                        opacity: isLp ? 0.55 : 1,
                        cursor: "pointer",
                      }}
                      whileHover={isHp ? { boxShadow: "0 0 20px rgba(245,158,11,0.15)", transform: "translateY(-2px)" } : isLp ? { opacity: 0.85 } : {}}
                    >
                      <div style={{ color: "#E5E7EB", fontSize: "11px", lineHeight: 1.4, marginBottom: "8px" }}>{q.q}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Pill color={col.color}>{q.topic}</Pill>
                        <span style={{ fontSize: "10px", color: col.color, fontWeight: 700 }}>{q.prob}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
            <div className="anim anim-up" style={{ transitionDelay: "1.25s", display: "flex" }}>
              <TypewriterAnswerReveal />
            </div>
            <div className="anim anim-right" style={{ transitionDelay: "1.4s", display: "flex" }}>
              <Section04TeacherToggle />
            </div>
          </div>

        </div>
      </MacFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 05 — Study Planner
// ─────────────────────────────────────────────────────────────────────────────

type PlanMode = "3hr" | "12hr" | "5day";

const PLANS: Record<PlanMode, Array<{ label: string; duration: string; level: "hp" | "mp" | "lp" }>> = {
  "3hr": [
    { label: "HP Topic 1 — Mechanics", duration: "45 min", level: "hp" },
    { label: "HP Topic 2 — Thermodynamics", duration: "45 min", level: "hp" },
    { label: "HP Topic 3 — Real Analysis", duration: "45 min", level: "hp" },
    { label: "Quick Review — All Topics", duration: "15 min", level: "lp" },
  ],
  "12hr": [
    { label: "HP Topic 1", duration: "2hr", level: "hp" },
    { label: "HP Topic 2", duration: "2hr", level: "hp" },
    { label: "HP Topic 3", duration: "1.5hr", level: "hp" },
    { label: "HP Topic 4", duration: "1.5hr", level: "hp" },
    { label: "HP Topic 5", duration: "1hr", level: "hp" },
    { label: "MP Topic 1", duration: "1hr", level: "mp" },
    { label: "MP Topic 2", duration: "1hr", level: "mp" },
    { label: "LP Review", duration: "1hr", level: "lp" },
  ],
  "5day": [
    { label: "Mon: HP Foundation", duration: "3 sessions", level: "hp" },
    { label: "Tue: HP Advanced", duration: "3 sessions", level: "hp" },
    { label: "Wed: MP Core", duration: "3 sessions", level: "mp" },
    { label: "Thu: MP Practice", duration: "3 sessions", level: "mp" },
    { label: "Fri: LP + Review", duration: "3 sessions", level: "lp" },
  ],
};

const LEVEL_COLORS: Record<string, string> = {
  hp: "#7C3AED",
  mp: "#4C1D95",
  lp: "#2D1B69",
};

function StudyPlannerMockup() {
  const [mode, setMode] = useState<PlanMode>("3hr");
  const [render, setRender] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  const switchMode = (m: PlanMode) => {
    setRender(r => r + 1);
    setMode(m);
  };

  useEffect(() => {
    if (!inView) return;
    const t1 = setTimeout(() => switchMode("12hr"), 2000);
    const t2 = setTimeout(() => switchMode("5day"), 3500);
    const t3 = setTimeout(() => switchMode("3hr"), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [inView]);

  const items = PLANS[mode];

  return (
    <div className="anim anim-right" style={{ transitionDelay: '0.2s' }}>
      <MacFrame>
        <div ref={ref}>
          {/* Mode toggle */}
          <div className="anim anim-up" style={{ display: "flex", gap: "8px", marginBottom: "16px", transitionDelay: "0.4s" }}>
            {(["3hr", "12hr", "5day"] as PlanMode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: m === mode ? "none" : "1px solid #3B1F6A",
                  background: m === mode ? "#7C3AED" : "transparent",
                  color: m === mode ? "#fff" : "#9CA3AF",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {m === "3hr" ? "3hr Crunch" : m === "12hr" ? "12hr Sprint" : "5-Day Prep"}
              </button>
            ))}
          </div>

          {/* Plan blocks */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {items.map((item, i) => (
              <div key={`${render}-${i}`} className="anim anim-up" style={{ transitionDelay: `${0.55 + i * 0.15}s` }}>
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                  style={{
                    transformOrigin: "left",
                    background: LEVEL_COLORS[item.level],
                    borderRadius: "8px",
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#fff", fontSize: "12px", fontFamily: "monospace" }}>{item.label}</span>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "monospace" }}>{item.duration}</span>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </MacFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: Features Showcase
// ─────────────────────────────────────────────────────────────────────────────

export function FeaturesShowcase() {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('in-view');
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.feature-section').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="features-wrapper"
      style={{
        background: "#0F0A1E",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aurora WebGL background — z-index 0 */}
      <FeaturesAuroraBg />

      {/* Floating particles — z-index 0 */}
      <FeaturesParticleLayer />

      {/* Section header */}
      <div style={{ padding: "100px 10vw 60px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "inline-block",
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: "999px",
            padding: "4px 18px",
            color: "#A78BFA",
            fontSize: "12px",
            fontFamily: "monospace",
            marginBottom: "24px",
          }}
        >
          ✦ Features
        </div>
        <h2
          style={{
            fontFamily: "'Georgia', 'Playfair Display', serif",
            fontWeight: 700,
            fontSize: "clamp(2.2rem, 4vw, 3.5rem)",
            color: "#fff",
            margin: "0 0 16px",
          }}
        >
          Everything you need to ace your exam
        </h2>
        <p style={{ color: "#9CA3AF", fontSize: "1.1rem", maxWidth: "500px", margin: "0 auto" }}>
          Five powerful systems. One AI. Zero panic.
        </p>
      </div>

      <div style={{ height: "1px", background: "rgba(124,58,237,0.15)", margin: "0 10vw", position: "relative", zIndex: 1 }} />

      <FeatureRow
        label="01 —"
        headline="Feed it everything. It digests it all."
        body="Upload your syllabus, lecture notes, assignments, past papers, teacher hints, WhatsApp summaries — whatever you have, in any format. Hydra processes up to 1,600 pages of material in a single run."
        pills={["PDF", "PPTX", "DOCX", "Images", "Links", "Audio"]}
        cta="See supported formats"
        mockup={<UploadMockup />}
      />

      <FeatureRow
        label="02 —"
        headline="Not a prompt. An actual prediction engine."
        body="Our Neural Network Probabilistic Weightage Engine cross-references your material against paper patterns, teacher emphasis signals, assignment frequency, and historical exam data. Every topic gets a probability score."
        pills={["Paper Pattern Analysis", "Teacher Signal", "Recency Bias", "Co-occurrence"]}
        cta="How NNPWE works"
        reverse
        mockup={<NNPWEMockup />}
      />

      <FeatureRow
        label="03 —"
        headline="Different questions deserve different minds."
        body="Hydra Pro doesn't use one model. It routes every question to the model that handles that type best — reasoning, conceptual explanation, synthesis, formula derivation. The right brain for the right problem."
        pills={["GPT-4o", "Claude 3.5", "Gemini Pro", "Llama 3.1", "Perplexity"]}
        cta="Explore model routing"
        mockup={<ModelRouterMockup />}
      />

      <FeatureRow
        label="04 —"
        headline="Your exam, predicted. Question by question."
        body="Hydra outputs a curated question bank split by priority — High Probability, Medium Probability, Low Probability. Each question comes with a model-generated answer shaped to sound like your teacher via RAG on their notes."
        pills={["HP Questions", "MP Questions", "LP Questions", "Teacher-tone Answers"]}
        cta="See a sample question bank"
        reverse
        mockup={<QuestionBankMockup />}
      />

      <FeatureRow
        label="05 —"
        headline="3 hours or 5 days. Hydra recalibrates either way."
        body="Tell Hydra how much time you have. It recalibrates your study plan, reweights priorities, and tells you exactly what to do next — whether you're cramming tonight or grinding it out properly."
        pills={["3hr Crunch Mode", "12hr Sprint", "5-Day Prep", "Smart Reweighting"]}
        cta="Try the study planner"
        mockup={<StudyPlannerMockup />}
      />

      <style>{`
        @keyframes chip-shimmer-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @media (max-width: 900px) {
          .feature-row-grid {
            grid-template-columns: 1fr !important;
          }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #7C3AED; border-radius: 4px; }
      `}</style>
    </section>
  );
}
