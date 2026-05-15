"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { AgentDemo } from "@/components/home/agent-demo";
import { FeaturesShowcase } from "@/components/home/features-showcase";
import { SocialProofStrip, FileTypeMarqueeStrip } from "@/components/home/social-proof-strip";

const rotatingWords = ["Study smarter", "Learn faster", "Ace exams", "Score higher"];

function RotatingBadge() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setIndex((p) => (p + 1) % rotatingWords.length), 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
      <span style={{ color: "#888", fontSize: "1rem", fontFamily: "Inter, sans-serif" }}>
        made to
      </span>
      <div
        className="relative overflow-hidden"
        style={{
          background: "#7C3AED",
          borderRadius: "8px",
          padding: "4px 20px",
          minWidth: "150px",
          height: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 24px rgba(124,58,237,0.4)",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={index}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            style={{
              color: "white",
              fontWeight: 600,
              fontSize: "0.95rem",
              whiteSpace: "nowrap",
              position: "absolute",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {rotatingWords[index]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();

  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "easeOut" as const, delay },
  });

  const dropInVariants = {
    hidden: { opacity: 0, y: -30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: "#000000", fontFamily: "Inter, sans-serif", color: "white" }}
    >
      {/* ── Fixed Navbar ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5"
        style={{
          backdropFilter: "blur(12px)",
          background: "rgba(0,0,0,0.6)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span className="animated-gradient-text text-xl" style={{ fontWeight: 700, cursor: "default" }}>
          LastDayLLM
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dev-test")}
            className="px-5 py-2 rounded-xl text-white text-sm transition-all duration-200"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", fontWeight: 500 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
          >
            Login
          </button>
          <button
            onClick={() => router.push("/dev-test")}
            className="px-5 py-2 rounded-xl text-white text-sm transition-all duration-200"
            style={{ background: "#7C3AED", border: "1px solid transparent", fontWeight: 600 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#8B5CF6"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#7C3AED"; }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative min-h-screen flex items-center justify-center">
        <BackgroundPaths />
        <div
          className="absolute pointer-events-none"
          style={{
            top: "30%", left: "50%", transform: "translateX(-50%)",
            width: "900px", height: "900px",
            background: "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div className="relative flex flex-col items-center text-center px-6 pt-24 pb-16" style={{ zIndex: 1 }}>
          <motion.div {...fadeUp(0.2)}>
            <div
              className="inline-flex items-center gap-2 mb-8"
              style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: "999px", padding: "5px 18px" }}
            >
              <span style={{ color: "#A78BFA", fontSize: "0.82rem", fontWeight: 500, letterSpacing: "0.02em" }}>
                ✦ AI-Powered Study Assistant
              </span>
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.4)} className="mb-2">
            <h1 style={{ fontFamily: "Playfair Display, serif", fontWeight: 900, fontSize: "clamp(2.8rem, 8vw, 5.5rem)", lineHeight: 1.1, color: "#F5F5F5", letterSpacing: "-0.02em" }}>
              Study Smarter with
            </h1>
          </motion.div>

          <motion.div {...fadeUp(0.6)} className="mb-4">
            <h1 className="animated-gradient-text" style={{ fontFamily: "Playfair Display, serif", fontWeight: 900, fontSize: "clamp(2.8rem, 8vw, 5.5rem)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              LastDayLLM
            </h1>
          </motion.div>

          <motion.div {...fadeUp(0.8)}>
            <RotatingBadge />
          </motion.div>

          <motion.div {...fadeUp(1.0)} className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => router.push("/dev-test")}
              style={{ background: "#7C3AED", color: "white", fontWeight: 700, fontSize: "1rem", padding: "14px 32px", borderRadius: "12px", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#8B5CF6"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 28px rgba(124,58,237,0.55)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#7C3AED"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            >
              Get Started Free →
            </button>
            <button
              onClick={() => router.push("/dev-test")}
              style={{ background: "rgba(255,255,255,0.05)", color: "white", fontWeight: 500, fontSize: "1rem", padding: "14px 32px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            >
              See how it works
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Marquee & Social Proof ── */}
      <FileTypeMarqueeStrip />
      <SocialProofStrip />

      {/* ── Say Hello to Hydra Section ── */}
      <section className="relative w-full" style={{ background: "#000000", padding: "120px 0" }}>
        <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: "rgba(255,255,255,0.06)" }} />

        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center">
          {/* Main headline row */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15 } } }}
            className="flex items-center justify-center gap-[20px] flex-wrap"
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: "clamp(2.5rem, 6vw, 5.5rem)", color: "white" }}
          >
            <motion.span variants={dropInVariants}>Say</motion.span>
            <motion.span variants={dropInVariants}>hello</motion.span>
            <motion.span variants={dropInVariants}>to</motion.span>

            {/* Hydra logo image — inline with text */}
            <motion.div variants={dropInVariants} className="flex items-center justify-center">
              <Image
                src="/hydra-logo.png"
                alt="Hydra"
                width={150}
                height={150}
                style={{ objectFit: "contain", filter: "drop-shadow(0 0 14px rgba(124,58,237,0.55))" }}
              />
            </motion.div>

            <motion.span variants={dropInVariants}>Hydra</motion.span>
          </motion.div>

          {/* Subtitle — plain white, simple */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.9 }}
            style={{ marginTop: "72px", color: "white", fontSize: "1.2rem", fontWeight: 400, textAlign: "center", letterSpacing: "0.01em" }}
          >
            Your Autonomous exam strategizing agent
          </motion.p>
        </div>
      </section>

      {/* ── Agent Demo Section ── */}
      <section
        className="relative w-full flex flex-col items-center"
        style={{
          backgroundColor: "#000000",
          backgroundImage: "linear-gradient(rgba(124,58,237,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.07) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          padding: "120px 0",
        }}
      >
        <div style={{ background: "radial-gradient(ellipse at center, transparent 40%, #000000 100%)", position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} />
        <div className="absolute top-0 left-0 right-0 h-[1px] z-10" style={{ background: "rgba(255,255,255,0.06)" }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-col items-center text-center mb-16"
          >
            <div
              className="inline-flex items-center gap-2 mb-6"
              style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "999px", padding: "4px 16px", color: "#A78BFA", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.02em" }}
            >
              ⚡ Live Demo
            </div>
            <h2 className="mb-4 font-mono font-bold text-white" style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              hydra.run(exam_prep)
            </h2>
            <p className="font-mono" style={{ fontSize: "1.1rem", fontWeight: 400, maxWidth: "600px", color: "#555" }}>
              // watch the agent work in real time
            </p>
          </motion.div>
          <AgentDemo />
        </div>
      </section>

      {/* ── Features Showcase ── */}
      <FeaturesShowcase />

      {/* ── Footer ── */}
      <footer className="flex items-center justify-center py-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ color: "#444", fontSize: "0.8rem" }}>© 2025 LastDayLLM. All rights reserved.</span>
      </footer>

      <style>{`
        .animated-gradient-text {
          background: linear-gradient(90deg,hsl(280,100%,60%),hsl(300,100%,65%),hsl(320,100%,65%),hsl(200,100%,60%),hsl(170,100%,55%),hsl(140,100%,55%),hsl(280,100%,60%));
          background-size: 250% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradient-sweep 7s ease-in-out infinite;
          display: inline-block;
        }
        @keyframes gradient-sweep {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}
