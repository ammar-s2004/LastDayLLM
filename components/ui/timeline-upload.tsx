import * as React from "react"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { Circle, CheckCircle2, Trash2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

export type UploadFile = {
  id: string
  file: File
  progress: number
  status: "uploading" | "done"
}

interface TimelineUploadProps {
  files: UploadFile[]
  onRemove?: (id: string) => void
}

export function TimelineUpload({ files, onRemove }: TimelineUploadProps) {
  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="secondary" className="bg-[#7C3AED] text-white hover:bg-[#6D28D9] text-sm h-8 px-4 rounded-full border-none pointer-events-none transition-colors">
          Upload Notes
        </Button>
      </div>
      
      <div className="flex flex-col gap-5">
        {files.map((file, i) => (
          <div key={file.id} className="flex items-start gap-4">
            {/* Timeline connector */}
            <div className="flex flex-col items-center mt-1">
              {file.status === "done" ? (
                <div className="w-5 h-5 rounded-full bg-[rgba(13,148,136,0.2)] flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-[#0D9488]" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-[2px] border-[#7C3AED] bg-transparent" />
              )}
              {i !== files.length - 1 && (
                <div className="w-px h-16 bg-[rgba(255,255,255,0.1)] my-1" />
              )}
            </div>

            {/* File Card */}
            <Card className="w-full bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.06)] shadow-none">
              <CardContent className="p-3.5 space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-[#A78BFA]" />
                  </div>
                  <div className="flex flex-col flex-1 gap-1 overflow-hidden">
                    <div className="flex justify-between items-center w-full">
                      <p className="font-medium text-[0.9rem] text-white truncate pr-2">{file.file.name}</p>
                      {onRemove && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-50 hover:opacity-100 flex-shrink-0" onClick={() => onRemove(file.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-white" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[0.75rem] font-medium uppercase tracking-wider" style={{ color: file.status === "done" ? "#0D9488" : "#A78BFA" }}>
                        {file.status === "done" ? "Completed" : "Uploading"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {file.status !== "done" && (
                  <div className="w-full flex items-center gap-3">
                    <Progress value={file.progress} className="h-1.5 flex-1 bg-[rgba(255,255,255,0.05)] [&>div]:bg-[#7C3AED]" />
                    <span className="text-[0.7rem] tabular-nums text-muted-foreground font-medium">{Math.round(file.progress)}%</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
