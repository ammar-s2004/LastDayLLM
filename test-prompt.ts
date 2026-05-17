import { buildQuestionGenerationPrompt } from "./lib/ai-prompts";

const prompt = buildQuestionGenerationPrompt({
  moduleName: "Module 1: Introduction to Computer Networks",
  totalModulesInScope: 5,
  topicsWithScores: [
    { name: "OSI Model", band: "HIGH", final_score: 95 },
    { name: "TCP/IP Protocol Suite", band: "MEDIUM", final_score: 75 },
  ],
  examScopeTopics: ["OSI Model", "TCP/IP Protocol Suite"],
  pyqs: ["Explain the 7 layers of OSI model."],
  assignmentQuestions: ["Compare TCP and UDP."],
  teacherHints: "Focus heavily on the network layer and routing algorithms. Expect a 10 mark question on Dijkstra's.",
  paperPattern: "Q1 is compulsory (short notes). Q2-Q6 attempt any 3, each 15 marks.",
});

console.log(prompt);
