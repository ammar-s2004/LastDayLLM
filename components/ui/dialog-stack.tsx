"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Portal from "@radix-ui/react-portal";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

interface DialogStackContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  totalItems: number;
  setTotalItems: Dispatch<SetStateAction<number>>;
  clickable: boolean;
}

const DialogStackContext = createContext<DialogStackContextValue | null>(null);

export function useDialogStack() {
  const ctx = useContext(DialogStackContext);
  if (!ctx) throw new Error("useDialogStack must be used inside <DialogStack>");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  DialogStack (root)                                                        */
/* -------------------------------------------------------------------------- */

interface DialogStackProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  clickable?: boolean;
}

export function DialogStack({
  children,
  open: controlledOpen,
  onOpenChange,
  activeIndex: controlledActiveIndex,
  onActiveIndexChange,
  clickable = true,
}: DialogStackProps) {
  const [internalOpen, setInternalOpen] = useState(controlledOpen ?? false);
  const [internalActiveIndex, setInternalActiveIndex] = useState(controlledActiveIndex ?? 0);
  const [totalItems, setTotalItems] = useState(0);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const activeIndex = controlledActiveIndex !== undefined ? controlledActiveIndex : internalActiveIndex;

  const handleSetOpen: Dispatch<SetStateAction<boolean>> = useCallback(
    (value) => {
      const next = typeof value === "function" ? value(open) : value;
      if (onOpenChange) onOpenChange(next);
      else setInternalOpen(next);
    },
    [open, onOpenChange]
  );

  const handleSetActiveIndex: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      const next = typeof value === "function" ? value(activeIndex) : value;
      if (onActiveIndexChange) onActiveIndexChange(next);
      else setInternalActiveIndex(next);
    },
    [activeIndex, onActiveIndexChange]
  );

  return (
    <DialogStackContext.Provider
      value={{
        open,
        setOpen: handleSetOpen,
        activeIndex,
        setActiveIndex: handleSetActiveIndex,
        totalItems,
        setTotalItems,
        clickable,
      }}
    >
      {children}
    </DialogStackContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  DialogStackTrigger                                                        */
/* -------------------------------------------------------------------------- */

interface DialogStackTriggerProps {
  children: ReactNode;
  className?: string;
}

export function DialogStackTrigger({ children, className }: DialogStackTriggerProps) {
  const { setOpen } = useDialogStack();

  return (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  DialogStackOverlay                                                        */
/* -------------------------------------------------------------------------- */

interface DialogStackOverlayProps {
  className?: string;
}

export function DialogStackOverlay({ className }: DialogStackOverlayProps) {
  const { open, setOpen, clickable } = useDialogStack();

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("fixed inset-0 z-50 bg-black/80", className)}
      onClick={clickable ? () => setOpen(false) : undefined}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  DialogStackBody — with Portal (default) or inline                         */
/* -------------------------------------------------------------------------- */

interface DialogStackBodyProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** When true, renders inline instead of in a Portal */
  inline?: boolean;
}

export function DialogStackBody({ children, className, style, inline }: DialogStackBodyProps) {
  const { open } = useDialogStack();

  if (!open) return null;

  const body = (
    <AnimatePresence>
      <div
        className={cn(
          inline
            ? "relative"
            : "fixed inset-0 z-50 flex items-center justify-center",
          className
        )}
        style={style}
      >
        {children}
      </div>
    </AnimatePresence>
  );

  if (inline) return body;

  return <Portal.Root>{body}</Portal.Root>;
}

/* -------------------------------------------------------------------------- */
/*  DialogStackContent — individual stacked card                              */
/* -------------------------------------------------------------------------- */

interface DialogStackContentProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Override animation props for the outgoing card */
  animateOverride?: Record<string, any>;
  transitionOverride?: Record<string, any>;
}

export function DialogStackContent({
  children,
  className,
  style,
  animateOverride,
  transitionOverride,
}: DialogStackContentProps) {
  return (
    <motion.div
      className={cn(
        "absolute inset-0 rounded-2xl border border-black/5 bg-background shadow-lg",
        className
      )}
      style={style}
      {...(animateOverride ? { animate: animateOverride } : {})}
      {...(transitionOverride ? { transition: transitionOverride } : {})}
    >
      <div className="h-full w-full rounded-2xl bg-neutral-800/10 p-4">
        {children}
      </div>
    </motion.div>
  );
}
