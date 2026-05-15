import * as React from "react";
import { UploadCloud, X, CheckCircle2, Trash2, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  file: File;
  progress: number; // 0-100
  status: "uploading" | "completed" | "error";
}

interface FileUploadCardProps {
  className?: string;
  files: UploadedFile[];
  onFilesChange: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  onClose?: () => void;
}

export const FileUploadCard = React.forwardRef<HTMLDivElement, FileUploadCardProps>(
  ({ className, files = [], onFilesChange, onFileRemove, onClose }, ref) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles && droppedFiles.length > 0) {
        onFilesChange(droppedFiles);
      }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      if (selectedFiles.length > 0) {
        onFilesChange(selectedFiles);
      }
    };

    const triggerFileSelect = () => fileInputRef.current?.click();

    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return "0 KB";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };
    
    const cardVariants = {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    };
    
    const fileItemVariants = {
      hidden: { opacity: 0, x: -20 },
      visible: { opacity: 1, x: 0 },
    };

    return (
      <motion.div
        ref={ref}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.3 }}
        className={className}
        style={{
          background: "#111111",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: "8px",
          overflow: "hidden",
          maxWidth: "480px",
          fontFamily: "monospace",
          width: "100%"
        }}
      >
        {/* Header Row */}
        <div style={{
          background: "#0d0d0d",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              background: "rgba(124,58,237,0.15)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: "6px",
              padding: "6px",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <UploadCloud size={16} color="#7C3AED" />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "white", fontSize: "13px", fontWeight: 500 }}>syllabus_upload.pdf</span>
              <span style={{ color: "#555", fontSize: "11px" }}>// drag &amp; drop or browse</span>
            </div>
          </div>
          {onClose && (
             <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px" }} onClick={onClose}>
               <X size={14} color="#555" />
             </button>
          )}
        </div>

        {/* Dropzone */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          style={{
            background: "rgba(124,58,237,0.03)",
            border: isDragging ? "1.5px dashed rgba(124,58,237,0.6)" : "1.5px dashed rgba(124,58,237,0.3)",
            borderRadius: "6px",
            margin: "12px",
            padding: "28px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: "pointer",
            transition: "border 0.2s"
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <UploadCloud size={24} color="#7C3AED" style={{ marginBottom: "12px" }} />
          <p style={{ color: "#888", fontSize: "13px", margin: "0 0 4px 0" }}>drop file here</p>
          <p style={{ color: "#555", fontSize: "11px", margin: "0 0 16px 0" }}>
            accepted: .pdf .docx .txt
          </p>
          <button 
            className="group flex items-center justify-center transition-all"
            style={{
              background: "rgba(124,58,237,0.15)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: "6px",
              padding: "6px 20px",
              color: "#A78BFA",
              fontFamily: "monospace",
              fontSize: "12px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(124,58,237,0.25)"; e.currentTarget.style.borderColor = "#7C3AED"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(124,58,237,0.15)"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; }}
          >
            browse_files()
          </button>
        </div>
        
        {/* File Item Rows */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              <AnimatePresence>
                {files.map((file) => (
                  <motion.li
                    key={file.id}
                    variants={fileItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    layout
                    style={{
                      background: "#0d0d0d",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      padding: "10px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontFamily: "monospace",
                      fontSize: "12px"
                    }}
                  >
                    <FileText size={16} color="#7C3AED" style={{ flexShrink: 0 }} />
                    
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ color: "white", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {file.file.name}
                        </span>
                        
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {file.status === "uploading" && (
                            <span style={{ color: "#555" }}>
                              {formatFileSize((file.file.size * file.progress) / 100)} / {formatFileSize(file.file.size)}
                            </span>
                          )}
                          {file.status === "completed" && (
                            <span style={{ color: "#555" }}>{formatFileSize(file.file.size)}</span>
                          )}
                          
                          {file.status === 'completed' && (
                            <div style={{
                               background: "rgba(13,148,136,0.15)", 
                               border: "1px solid rgba(13,148,136,0.3)", 
                               color: "#0D9488", 
                               borderRadius: "4px", 
                               padding: "2px 8px", 
                               fontSize: "11px"
                            }}>
                               ✓ indexed
                            </div>
                          )}

                          <div 
                             style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "#555", transition: "color 0.2s" }}
                             onClick={() => onFileRemove(file.id)}
                             onMouseEnter={(e) => { e.currentTarget.style.color = "#EC4899"; }}
                             onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; }}
                          >
                             <Trash2 size={14} color="inherit" />
                          </div>
                        </div>
                      </div>
                      
                      {file.status === 'uploading' && (
                        <div style={{ background: "rgba(124,58,237,0.15)", height: "2px", borderRadius: "1px", width: "100%", marginTop: "6px" }}>
                          <div style={{ background: "#7C3AED", height: "100%", width: `${file.progress}%`, borderRadius: "1px" }} />
                        </div>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </motion.div>
    );
  }
);
FileUploadCard.displayName = "FileUploadCard";
