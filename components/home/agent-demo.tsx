"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import { Check, MessageSquare, FileText, Settings as SettingsIcon, BarChart2, ArrowUp } from "lucide-react";
import SqueezeLoader from "@/components/ui/loading-indicator";
import { FileUploadCard } from "@/components/ui/file-upload-card";
import { TimelineUpload } from "@/components/ui/timeline-upload";
import Plan, { type Task } from "@/components/ui/agent-plan";
import { InteractiveLogsTable, type DemoTableData } from "@/components/ui/interactive-logs-table";
import { HydraLogo } from "@/components/ui/hydra-logo";

const hydraBubble = {
  background: "rgba(124,58,237,0.08)",
  border: "1px solid rgba(124,58,237,0.2)",
  borderRadius: "2px 12px 12px 12px",
  padding: "12px 16px",
  maxWidth: "78%",
  color: "#e0e0e0",
  fontSize: "13px",
  lineHeight: 1.7,
  fontFamily: "monospace",
  position: "relative" as const,
};

const userBubble = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px 2px 12px 12px",
  padding: "10px 16px",
  maxWidth: "65%",
  alignSelf: "flex-end" as const,
  color: "#ccc",
  fontSize: "13px",
  fontFamily: "monospace",
};

function useTypewriter(text: string, speed = 30, active = false) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  
  useEffect(() => {
    if (!active) return;
    let i = 0;
    setDisplayed('');
    setDone(false);
    
    // Slight delay before typing starts to make it feel natural
    const startDelay = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      
      // Cleanup for the interval
      return () => clearInterval(interval);
    }, 300); // 300ms pause before starting to type

    return () => clearTimeout(startDelay);
  }, [text, speed, active]);
  
  return { displayed, done };
}

// Fixed mock data logic
export function AgentDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  
  const [currentStep, setCurrentStep] = useState(0);

  // File Upload State
  const [uploadFiles, setUploadFiles] = useState<any[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Timeline Upload State
  const [timelineFiles, setTimelineFiles] = useState<any[]>([
    { id: "1", file: { name: "Lecture_Notes_LLM.pdf" }, progress: 0, status: "uploading" },
    { id: "2", file: { name: "Teacher_Handouts.pdf" }, progress: 0, status: "uploading" },
    { id: "3", file: { name: "Reference_Material.pdf" }, progress: 0, status: "uploading" }
  ]);
  const [timelineSuccessCount, setTimelineSuccessCount] = useState(0);

  // Auto Scroll Hook
  useEffect(() => {
    if (currentStep > 0) {
      const t = setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: "smooth" });
        }
      }, 100);
      return () => clearTimeout(t);
    }
  });

  // Start sequence
  useEffect(() => {
    if (isInView && currentStep === 0) {
      setCurrentStep(1);
    }
  }, [isInView, currentStep]);

  // Hook return values
  const tw1 = useTypewriter("Hi! I'm Hydra 👋\nLet me help you prepare for your exam.\nTo get started, please upload your syllabus.", 30, currentStep >= 1);
  const tw3 = useTypewriter("Got it! Syllabus received ✅\nNow please upload your class notes or teacher notes.", 30, currentStep >= 3);
  const tw4 = useTypewriter("Perfect! I've analyzed your materials 🔍\nNow let's define your exam scope.\nSelect which modules and topics are covered.", 30, currentStep >= 4);
  const tw5 = useTypewriter("Do you have previous year papers or past exam questions?\nThey significantly improve prediction accuracy 📈", 30, currentStep >= 5);
  const tw7 = useTypewriter("✅ Analysis complete! Here's your exam prediction matrix.\nFocus on HIGH probability topics first 🎯", 30, currentStep >= 7);

  // Step 1: File Upload Simulation
  useEffect(() => {
    if (tw1.done && currentStep === 1) {
      let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>, t3: ReturnType<typeof setTimeout>, t4: ReturnType<typeof setTimeout>;
      
      t1 = setTimeout(() => {
        // file selected
        setUploadFiles([{ id: "file1", file: { name: "LLM_Syllabus_2024.pdf", size: 1560000, type: "application/pdf" }, progress: 0, status: "uploading" }]);
      }, 2500);
      
      t2 = setTimeout(() => {
        // progress to 100%
        setUploadFiles([{ id: "file1", file: { name: "LLM_Syllabus_2024.pdf", size: 1560000, type: "application/pdf" }, progress: 100, status: "uploading" }]);
      }, 2600); // starts animating up

      t3 = setTimeout(() => {
        // success state
        setUploadFiles([{ id: "file1", file: { name: "LLM_Syllabus_2024.pdf", size: 1560000, type: "application/pdf" }, progress: 100, status: "completed" }]);
        setUploadSuccess(true);
      }, 4600);

      t4 = setTimeout(() => {
        setCurrentStep(2); // move to step 2 after success shows for 1s
      }, 5600);

      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }
  }, [tw1.done, currentStep]);

  // Step 2: Auto advance to Step 3
  useEffect(() => {
    if (currentStep === 2) {
      const t = setTimeout(() => setCurrentStep(3), 1000);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  // Step 3: Timeline Upload Simulation
  useEffect(() => {
    if (tw3.done && currentStep === 3) {
      let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>, t3: ReturnType<typeof setTimeout>, t4: ReturnType<typeof setTimeout>;
      
      // Start all progress bars
      t1 = setTimeout(() => {
        setTimelineFiles(prev => [
          { ...prev[0], progress: 100 },
          { ...prev[1], progress: 100 },
          { ...prev[2], progress: 100 }
        ]);
      }, 100);

      // File 1 completes after 3s
      t2 = setTimeout(() => {
        setTimelineFiles(prev => [{ ...prev[0], status: "done" }, prev[1], prev[2]]);
        setTimelineSuccessCount(1);
      }, 3000);

      // File 2 completes after 3.8s
      t3 = setTimeout(() => {
        setTimelineFiles(prev => [prev[0], { ...prev[1], status: "done" }, prev[2]]);
        setTimelineSuccessCount(2);
      }, 3800);

      // File 3 completes after 4.6s
      t4 = setTimeout(() => {
        setTimelineFiles(prev => [prev[0], prev[1], { ...prev[2], status: "done" }]);
        setTimelineSuccessCount(3);
      }, 4600);

      const t5 = setTimeout(() => {
        setCurrentStep(4);
      }, 5600);

      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
    }
  }, [tw3.done, currentStep]);

  // Step 4: Exam Scope
  useEffect(() => {
    if (tw4.done && currentStep === 4) {
      const t = setTimeout(() => setCurrentStep(5), 5000);
      return () => clearTimeout(t);
    }
  }, [tw4.done, currentStep]);

  // Step 5: Buttons
  const [yesClicked, setYesClicked] = useState(false);
  useEffect(() => {
    if (tw5.done && currentStep === 5) {
      const t = setTimeout(() => {
        setYesClicked(true);
        setTimeout(() => setCurrentStep(6), 300);
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [tw5.done, currentStep]);

  // Step 6: Plan Auto Advance
  // Handled by Plan internally hitting duration, but we just set a fixed timeout since it plays for about 6s
  useEffect(() => {
    if (currentStep === 6) {
      const t = setTimeout(() => setCurrentStep(7), 5500);
      return () => clearTimeout(t);
    }
  }, [currentStep]);


  const mockPlanTasks: Task[] = [
    { id: "1", title: "Parsing syllabus structure...", description: "", status: "pending", priority: "high", level: 0, dependencies: [], subtasks: [] },
    { id: "2", title: "Indexing class notes...", description: "", status: "pending", priority: "high", level: 0, dependencies: [], subtasks: [] },
    { id: "3", title: "Cross-referencing past papers...", description: "", status: "pending", priority: "high", level: 0, dependencies: [], subtasks: [] },
    { id: "4", title: "Identifying high-frequency topics...", description: "", status: "pending", priority: "high", level: 0, dependencies: [], subtasks: [] },
    { id: "5", title: "Generating probability matrix...", description: "", status: "pending", priority: "high", level: 0, dependencies: [], subtasks: [] }
  ];

  const tableData: DemoTableData[] = [
    { id: 1, topic: "Explain the Transformer architecture and self-attention", probability: "HIGH", source: "Module 1" },
    { id: 2, topic: "What is RLHF and how is it used in fine-tuning?", probability: "HIGH", source: "Module 2" },
    { id: 3, topic: "Compare BLEU and ROUGE evaluation metrics", probability: "MEDIUM", source: "Module 3" },
    { id: 4, topic: "Describe the tokenization process in modern LLMs", probability: "HIGH", source: "Module 1" },
    { id: 5, topic: "What causes hallucination in LLMs?", probability: "MEDIUM", source: "Module 3" },
    { id: 6, topic: "Explain prompt engineering techniques with examples", probability: "MEDIUM", source: "Module 3" },
    { id: 7, topic: "What are pre-training objectives used in LLMs?", probability: "LOW", source: "Module 2" },
    { id: 8, topic: "Describe fine-tuning strategies for domain adaptation", probability: "HIGH", source: "Module 2" },
  ];

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center">
      {/* Demo Window */}
      <div 
        className="w-full mx-auto flex flex-col"
        style={{
          borderRadius: "16px",
          padding: "1px",
          background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(13,148,136,0.2), rgba(124,58,237,0.1))",
          boxShadow: "0 0 0 1px rgba(124,58,237,0.2), 0 24px 80px rgba(124,58,237,0.15), 0 8px 32px rgba(0,0,0,0.8)",
          maxWidth: "900px"
        }}
      >
        <div style={{
          background: "#0a0a0a",
          borderRadius: "15px",
          overflow: "hidden",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
        }}>
          {/* Header Bar */}
          <div 
            style={{
              background: "#111111",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              padding: 0,
              height: "44px",
              display: "flex",
              alignItems: "center",
              position: "relative"
            }}
          >
            {/* Left section */}
            <div className="flex items-center gap-2 px-4">
              <div className="w-[12px] h-[12px] rounded-full bg-[#FF5F57]" />
              <div className="w-[12px] h-[12px] rounded-full bg-[#FFBD2E]" />
              <div className="w-[12px] h-[12px] rounded-full bg-[#28C840]" />
            </div>

            {/* Center section */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
              <HydraLogo width={18} height={18} />
              <span className="text-white font-medium text-[13px]">hydra</span>
              <span className="text-[#555] text-[11px] font-medium" style={{ marginLeft: "4px" }}>agent v1.0</span>
            </div>

            {/* Right section */}
            <div className="ml-auto px-4 flex items-center">
              <div style={{ background: "rgba(13,148,136,0.15)", border: "1px solid rgba(13,148,136,0.3)", borderRadius: "999px", padding: "3px 10px", fontSize: "10px", fontWeight: "bold", color: "#0D9488", letterSpacing: "0.05em" }}>
                ● RUNNING
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <div style={{
            background: "#0d0d0d",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            padding: "0 16px",
            display: "flex",
            gap: "2px",
            height: "36px",
            alignItems: "flex-end"
          }}>
            <div style={{
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "none",
              borderRadius: "6px 6px 0 0",
              padding: "6px 16px",
              color: "white",
              fontSize: "12px",
            }}>
              <span style={{ color: "#7C3AED", marginRight: "6px" }}>●</span>exam-agent.ts
            </div>
            <div style={{
              background: "transparent",
              color: "#555",
              fontSize: "12px",
              padding: "6px 16px",
            }}>
              config.json
            </div>
          </div>

          {/* Main content area */}
          <div style={{ display: "flex", flexDirection: "row", height: "580px" }}>
            {/* Left sidebar */}
            <div className="hidden sm:flex" style={{
              background: "#0d0d0d",
              borderRight: "1px solid rgba(255,255,255,0.05)",
              width: "48px",
              flexShrink: 0,
              flexDirection: "column",
              alignItems: "center",
              paddingTop: "20px",
              gap: "24px"
            }}>
              <MessageSquare size={16} color="#7C3AED" />
              <FileText size={16} color="#444" />
              <SettingsIcon size={16} color="#444" />
              <BarChart2 size={16} color="#444" />
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col" style={{ overflow: "hidden" }}>
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto" style={{
                background: "#0a0a0a",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(124,58,237,0.3) transparent"
              }}>
          
          {/* STEP 1 */}
          {currentStep >= 1 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 w-full">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <AnimatePresence>
                  {!tw1.done && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}
                    >
                      <SqueezeLoader size={24} color1="#7C3AED" color2="#A78BFA" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-col w-full">
                  <div style={{ color: "#7C3AED", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px" }}>hydra ▸</div>
                  <div style={hydraBubble} className="whitespace-pre-line">
                    {tw1.displayed}
                  </div>
                </div>
              </div>
              
              <AnimatePresence>
                {tw1.done && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <div 
                      className="w-full mt-2"
                      style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", maxWidth: "520px" }}
                    >
                      <FileUploadCard 
                        files={uploadFiles}
                        onFilesChange={() => {}} 
                        onFileRemove={() => {}} 
                        className="bg-transparent border-none shadow-none text-white [&_*]:text-white [&_.bg-muted]:bg-[rgba(255,255,255,0.05)] [&_.flex-1>.bg-primary]:transition-[transform] [&_.flex-1>.bg-primary]:duration-[2000ms] [&_.flex-1>.bg-primary]:ease-out"
                      />
                    </div>
                    {uploadSuccess && (
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex items-center gap-2 text-[#0D9488] text-sm font-medium">
                         <Check className="w-4 h-4" /> LLM_Syllabus_2024.pdf uploaded successfully
                       </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* STEP 2 */}
          {currentStep >= 2 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col w-full">
              <div className="flex flex-col self-end mb-4 w-full">
                <div style={{ color: "#555", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px", alignSelf: "flex-end" }}>user ▸</div>
                <div style={userBubble}>
                  📄 LLM_Syllabus_2024.pdf
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3 */}
          {currentStep >= 3 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 w-full">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <AnimatePresence>
                  {!tw3.done && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}
                    >
                      <SqueezeLoader size={24} color1="#7C3AED" color2="#A78BFA" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-col w-full">
                  <div style={{ color: "#7C3AED", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px" }}>hydra ▸</div>
                  <div style={hydraBubble} className="whitespace-pre-line">
                    {tw3.displayed}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {tw3.done && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <div 
                      className="p-3 w-full mt-2"
                      style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", maxWidth: "520px" }}
                    >
                      <div className="text-white [&_.bg-card]:bg-transparent [&_.border-border]:border-[rgba(255,255,255,0.08)] [&_.text-muted-foreground]:text-[#aaa] [&_.bg-muted]:bg-[rgba(255,255,255,0.08)] [&_.bg-primary]:bg-[#7C3AED] [&_.text-blue-500]:text-[#7C3AED] [&_.bg-primary]:transition-[transform] [&_.bg-primary]:duration-[3000ms] [&_.bg-primary]:ease-out transition-all">
                        <TimelineUpload files={timelineFiles} />
                      </div>
                    </div>
                    {timelineSuccessCount === 3 && (
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex items-center gap-2 text-[#0D9488] text-sm font-medium">
                         <Check className="w-4 h-4 text-[#0D9488] bg-[rgba(13,148,136,0.15)] rounded-full p-0.5" /> 3 files uploaded successfully
                       </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* STEP 4 */}
          {currentStep >= 4 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col w-full">
              <div className="flex flex-col self-end mb-4 w-full">
                <div style={{ color: "#555", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px", alignSelf: "flex-end" }}>user ▸</div>
                <div style={userBubble}>
                  📚 Uploaded 3 files
                </div>
              </div>
              
              <div className="flex flex-col gap-4 w-full mt-2">
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <AnimatePresence>
                  {!tw4.done && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}
                    >
                      <SqueezeLoader size={24} color1="#7C3AED" color2="#A78BFA" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-col w-full">
                  <div style={{ color: "#7C3AED", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px" }}>hydra ▸</div>
                  <div style={hydraBubble} className="whitespace-pre-line">
                    {tw4.displayed}
                  </div>
                </div>
              </div>

                <AnimatePresence>
                  {tw4.done && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                      <div 
                        className="p-5 w-full flex flex-col gap-4 mt-2"
                        style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", maxWidth: "520px" }}
                      >
                        <input 
                          readOnly 
                          value="Large Language Models — Final Exam"
                          className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2.5 text-white text-sm font-semibold outline-none pointer-events-none"
                        />
                        <div className="flex flex-col gap-3 mt-1">
                          {[
                            { title: "Module 1: Foundations of LLMs", items: [{l:"History of M",c:true}, {l:"Transformer Architecture",c:true}, {l:"Attention Mechanisms",c:true}, {l:"Tokenization",c:true}] },
                            { title: "Module 2: Training & Fine-tuning", items: [{l:"Pre-training Objectives",c:true}, {l:"RLHF",c:true}, {l:"Distributed Training",c:false}, {l:"Fine-tuning Strategies",c:true}] },
                            { title: "Module 3: Applications & Evaluation", items: [{l:"Prompt Engineering",c:true}, {l:"Evaluation Metrics",c:true}, {l:"Hallucination & Safety",c:true}, {l:"Deployment Pipelines",c:false}] },
                          ].map((mod, i) => (
                            <div key={i} className="flex flex-col gap-2">
                              <span className="text-white font-bold text-[0.9rem]">{mod.title}</span>
                              <div className="flex flex-wrap gap-2">
                                {mod.items.map((it, j) => (
                                  <div key={j} className="flex items-center gap-1.5">
                                    <div 
                                      className="flex items-center justify-center w-[14px] h-[14px] rounded-[3px] transition-colors"
                                      style={{
                                        background: it.c ? "#7C3AED" : "transparent",
                                        border: it.c ? "1px solid #7C3AED" : "1px solid rgba(255,255,255,0.2)"
                                      }}
                                    >
                                      {it.c && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                    </div>
                                    <span style={{ color: it.c ? "white" : "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>
                                      {it.l.replace("M","Language Models")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* STEP 5 */}
          {currentStep >= 5 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col w-full">
              <div className="flex flex-col gap-4 w-full">
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <AnimatePresence>
                  {!tw5.done && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}
                    >
                      <SqueezeLoader size={24} color1="#7C3AED" color2="#A78BFA" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-col w-full">
                  <div style={{ color: "#7C3AED", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px" }}>hydra ▸</div>
                  <div style={hydraBubble} className="whitespace-pre-line">
                    {tw5.displayed}
                  </div>
                </div>
              </div>

                <AnimatePresence>
                  {tw5.done && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                      <div className="flex gap-3 mt-2">
                        <button 
                          className="transition-all rounded-lg px-5 py-2 text-sm font-semibold"
                          style={{
                            border: yesClicked ? "1px solid rgba(13,148,136,0.8)" : "1px solid rgba(13,148,136,0.4)",
                            color: "#0D9488",
                            background: yesClicked ? "rgba(13,148,136,0.2)" : "rgba(13,148,136,0.08)",
                            transform: yesClicked ? "scale(0.98)" : "scale(1)"
                          }}
                        >
                          Yes, I have them
                        </button>
                        <button 
                          className="rounded-lg px-5 py-2 text-sm font-semibold"
                          style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#888", background: "rgba(255,255,255,0.04)" }}
                        >
                          No, skip this
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* STEP 6 */}
          {currentStep >= 6 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col w-full">
              <div className="flex flex-col self-end mb-4 w-full">
                <div style={{ color: "#555", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px", alignSelf: "flex-end" }}>user ▸</div>
                <div style={userBubble}>
                  Yes, uploading now 📎
                </div>
              </div>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-2">
                <div 
                  className="w-full"
                  style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", maxWidth: "520px" }}
                >
                  <div className="[&_.bg-card]:bg-transparent [&_.border-border]:border-none [&_.text-foreground]:text-white [&_.bg-secondary\\/40]:bg-[rgba(255,255,255,0.05)] [&_.text-secondary-foreground]:text-white [&_.bg-muted]:bg-[rgba(255,255,255,0.08)]">
                    <Plan tasks={mockPlanTasks} autoPlayDelay={1000} />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 7 */}
          {currentStep >= 7 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col w-full pb-8">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <AnimatePresence>
                  {!tw7.done && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}
                    >
                      <SqueezeLoader size={24} color1="#7C3AED" color2="#A78BFA" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-col w-full">
                  <div style={{ color: "#7C3AED", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", marginBottom: "4px" }}>hydra ▸</div>
                  <div style={hydraBubble} className="whitespace-pre-line">
                    {tw7.displayed}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {tw7.done && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <div 
                      className="w-full mt-2"
                      style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", maxWidth: "520px" }}
                    >
                      <InteractiveLogsTable data={tableData} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          <div className="h-4 w-full flex-shrink-0" />
              </div>

              {/* Bottom input bar */}
              <div style={{
                background: "#0d0d0d",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                padding: "12px 16px",
                display: "flex",
                gap: "10px",
                alignItems: "center"
              }}>
                <span style={{ color: "#7C3AED", fontSize: "16px", fontFamily: "monospace", fontWeight: "bold" }}>▸</span>
                
                <div className="relative flex-1">
                  <input
                    disabled
                    placeholder="ask hydra anything..."
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "6px",
                      color: "#888",
                      fontFamily: "monospace",
                      fontSize: "13px",
                      padding: "8px 14px",
                      outline: "none"
                    }}
                  />
                  {currentStep >= 7 && (
                     <div 
                       className="absolute left-[162px] top-1/2 -translate-y-1/2"
                       style={{ width: "8px", height: "14px" }}
                     >
                        <motion.div
                           animate={{ opacity: [1, 0, 1] }}
                           transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                           style={{ color: "#7C3AED", fontFamily: "monospace", fontSize: "14px", fontWeight: "bold", marginLeft: "2px" }}
                        >
                           |
                        </motion.div>
                     </div>
                  )}
                </div>

                <button 
                  className="group flex items-center justify-center transition-all"
                  style={{
                    background: "#7C3AED",
                    borderRadius: "6px",
                    width: "32px",
                    height: "32px",
                    cursor: "default"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 12px rgba(124,58,237,0.5)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  <ArrowUp size={16} color="white" />
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
