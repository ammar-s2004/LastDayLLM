import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Filter, Search, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DemoTableData {
  id: number;
  topic: string;
  probability: "HIGH" | "MEDIUM" | "LOW";
  source: string;
}

export interface InteractiveLogsTableProps {
  data?: DemoTableData[];
}

export function InteractiveLogsTable({ data }: InteractiveLogsTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!data) return null;

  return (
    <div className="w-full bg-transparent overflow-hidden border border-[rgba(255,255,255,0.08)] rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-white">
          <thead className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Source</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Topic</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-center">Probability</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right w-32">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
            {data.map((item, index) => (
              <motion.tr
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="hover:bg-[rgba(255,255,255,0.02)] transition-colors"
              >
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.source}</td>
                <td className="px-4 py-3 font-medium">{item.topic}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      item.probability === "HIGH"
                        ? "bg-[rgba(13,148,136,0.15)] border-[rgba(13,148,136,0.3)] text-[#0D9488]"
                        : item.probability === "MEDIUM"
                        ? "bg-[rgba(124,58,237,0.15)] border-[rgba(124,58,237,0.3)] text-[#A78BFA]"
                        : "bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.12)] text-[#666]"
                    }`}
                  >
                    {item.probability}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end relative">
                    <button
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-white transition-colors"
                    >
                      <Play className="w-3 h-3" /> View Answer
                    </button>
                    {/* Inline expand/toast logic */}
                    <AnimatePresence>
                      {expandedId === item.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, x: -10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.9, x: -10 }}
                          className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[#A78BFA] text-xs font-semibold bg-[rgba(124,58,237,0.1)] px-2 py-1 rounded"
                        >
                          Available in full app
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
