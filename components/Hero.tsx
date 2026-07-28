"use client";

import React, { 
  useRef, useState, useEffect, useMemo, useCallback, memo, 
  KeyboardEvent as ReactKeyboardEvent 
} from "react";
import { 
  motion, AnimatePresence, useReducedMotion, 
  useSpring, useTransform, useMotionValue 
} from "framer-motion";

/** 
 * --- TYPES & CONFIGURATION ---
 */
interface FileState extends File {
  readonly id: string; // name-size-lastModified
}

const RELEASE_CONFIG = {
  MAX_SIZE: 20 * 1024 * 1024,
  MAX_COUNT: 100,
  TIMEOUT: 300000, // 5m
  STEPS: ["Preparing", "Uploading", "Processing", "Optimizing", "Packaging", "Finalizing"] as const,
};

/** 
 * --- MEMOIZED ATOMIC COMPONENTS ---
 */

const BackgroundLayers = memo(() => {
  const reducedMotion = useReducedMotion();
  return (
    <div className="release-bg" aria-hidden="true">
      <div className="bg-mesh" />
      <div className="bg-noise" />
      {!reducedMotion && (
        <>
          <motion.div animate={{ opacity: [0.1, 0.15, 0.1] }} transition={{ duration: 8, repeat: Infinity }} className="blob blob-p" />
          <motion.div animate={{ opacity: [0.05, 0.1, 0.05] }} transition={{ duration: 12, repeat: Infinity }} className="blob blob-b" />
        </>
      )}
    </div>
  );
});
BackgroundLayers.displayName = "BackgroundLayers";

const FileRow = memo(({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled: boolean }) => {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
  const sizeStr = useMemo(() => {
    const i = Math.floor(Math.log(file.size) / Math.log(1024));
    return (file.size / Math.pow(1024, i)).toFixed(1) + " " + ["B", "KB", "MB", "GB"][i];
  }, [file.size]);

  return (
    <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="file-row">
      <div className="file-info">
        <div className={`file-badge ${isZip ? 'zip' : 'img'}`}>{isZip ? 'ZIP' : 'IMG'}</div>
        <span className="file-name" title={file.name}>{file.name}</span>
      </div>
      <div className="file-meta">
        <span className="file-size">{sizeStr}</span>
        {!disabled && (
          <button onClick={onRemove} className="remove-btn" aria-label={`Remove ${file.name}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
    </motion.div>
  );
});
FileRow.displayName = "FileRow";

/** 
 * --- MAIN APPLICATION ---
 */
export default function Hero() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rAFRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();

  // Motion Values for GPU acceleration
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-400, 400], [5, -5]), { stiffness: 100, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-5, 5]), { stiffness: 100, damping: 30 });

  // State
  const [files, setFiles] = useState<FileState[]>([]);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState(0);

  /** 
   * ENGINEERING: Cleanup logic
   */
  const cleanup = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDownloadUrl("");
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    };
  }, [cleanup]);

  /** 
   * ENGINEERING: Cursor performance (rAF throttled)
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current || reducedMotion) return;
    if (rAFRef.current) cancelAnimationFrame(rAFRef.current);

    rAFRef.current = requestAnimationFrame(() => {
      const rect = cardRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseX.set(x - rect.width / 2);
      mouseY.set(y - rect.height / 2);
      cardRef.current!.style.setProperty("--mx", `${x}px`);
      cardRef.current!.style.setProperty("--my", `${y}px`);
    });
  }, [reducedMotion, mouseX, mouseY]);

  /** 
   * ENGINEERING: File validation logic (Preserved)
   */
  const handleFileSelection = useCallback((incoming: File[]) => {
    if (processing) return;
    setError(null);
    setSuccess(false);

    const currentKeys = new Set(files.map(f => f.id));
    const valid: FileState[] = [];
    let oversize = false;

    incoming.forEach(f => {
      const isAccepted = f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip");
      if (!isAccepted) return;
      
      const id = `${f.name}-${f.size}-${f.lastModified}`;
      if (currentKeys.has(id)) return;
      
      if (f.size > RELEASE_CONFIG.MAX_SIZE) {
        oversize = true;
        return;
      }

      Object.defineProperty(f, 'id', { value: id, writable: false });
      valid.push(f as FileState);
    });

    if (files.length + valid.length > RELEASE_CONFIG.MAX_COUNT) {
      setError(`Max limit is ${RELEASE_CONFIG.MAX_COUNT} files.`);
      return;
    }

    if (oversize) setError("Some items exceed 20MB.");
    setFiles(prev => [...prev, ...valid]);
  }, [files, processing]);

  /** 
   * ENGINEERING: Processing pipeline (Preserved)
   */
  const processPipeline = async () => {
    if (files.length === 0 || processing) return;
    setProcessing(true); setError(null); setSuccess(false); cleanup();

    const fd = new FormData();
    files.forEach(f => fd.append("image", f));

    const ctrl = new AbortController();
    const tId = setTimeout(() => ctrl.abort(), RELEASE_CONFIG.TIMEOUT);

    try {
      setStep(0);
      const stepTimer = setInterval(() => setStep(s => (s < RELEASE_CONFIG.STEPS.length - 1 ? s + 1 : s)), 1500);

      const res = await fetch("/api/process", { method: "POST", body: fd, signal: ctrl.signal });
      clearInterval(stepTimer);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Neural execution failed.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setDownloadUrl(url);
      setSuccess(true);
      setFiles([]);
    } catch (e: any) {
      setError(e.name === "AbortError" ? "Processing timeout." : e.message);
    } finally {
      clearTimeout(tId);
      setProcessing(false);
    }
  };

  /** 
   * ENGINEERING: Accessibility
   */
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (processing) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <main className="rc-container">
      <BackgroundLayers />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rc-content">
        <header className="rc-header">
          <div className="rc-badge" aria-hidden="true">Neural Sanitizer RC-1</div>
          <h1>Optimize <span className="gradient-text">Stateless</span> Assets.</h1>
          <p>Strip metadata and normalize creative assets for production environments.</p>
        </header>

        {/* UPLOAD SURFACE */}
        <motion.div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          style={!reducedMotion ? { rotateX, rotateY, transformStyle: "preserve-3d" } : {}}
          className={`rc-card ${isDragging ? "dragging" : ""} ${processing ? "active" : ""}`}
          onClick={() => !processing && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelection(Array.from(e.dataTransfer.files)); }}
          tabIndex={0}
          role="button"
          aria-label="File upload surface"
          aria-disabled={processing}
          onKeyDown={onKeyDown}
        >
          <div className="card-fx-glow" />
          <div className="card-fx-border" />
          
          <div className="card-body">
            <AnimatePresence mode="wait">
              {processing ? (
                <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-view" role="status" aria-live="polite">
                  <div className={`p-spinner ${reducedMotion ? 'static' : ''}`} />
                  <motion.h3 key={step} initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{RELEASE_CONFIG.STEPS[step]}...</motion.h3>
                  <div className="p-bar"><motion.div initial={{ width: 0 }} animate={{ width: `${((step + 1) / RELEASE_CONFIG.STEPS.length) * 100}%` }} className="p-fill" /></div>
                </motion.div>
              ) : (
                <motion.div key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="i-view">
                  <div className="i-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                  <h3>{files.length > 0 ? "Add More Assets" : "Drop Files Here"}</h3>
                  <p>PNG, JPG, WEBP or ZIP (max 20MB per file)</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <input ref={inputRef} type="file" hidden multiple accept="image/*,.zip" onChange={(e) => { if (e.target.files) { handleFileSelection(Array.from(e.target.files)); e.target.value = ""; } }} />
        </motion.div>

        {/* QUEUE */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rc-queue">
              <div className="queue-head">
                <span>Items in queue ({files.length})</span>
                {!processing && <button onClick={() => setFiles([])}>Clear All</button>}
              </div>
              <div className="queue-list custom-scrollbar">
                {files.map((f) => (
                  <FileRow key={f.id} file={f} disabled={processing} onRemove={() => setFiles(p => p.filter(x => x.id !== f.id))} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTIONS */}
        <footer className="rc-footer">
          <div className="status-box" role="status" aria-live="polite">
            <AnimatePresence mode="wait">
              {error && <motion.div key="e" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="toast err">{error}</motion.div>}
              {success && <motion.div key="s" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="toast succ">Sanitization complete</motion.div>}
            </AnimatePresence>
          </div>

          <div className="btn-stack">
            {files.length > 0 && (
              <motion.button whileHover={!reducedMotion ? { scale: 1.02 } : {}} whileTap={!reducedMotion ? { scale: 0.98 } : {}} onClick={processPipeline} disabled={processing} className="btn-primary">
                {processing ? "Executing..." : `Process ${files.length} Assets`}
                <div className="btn-shine" />
              </motion.button>
            )}
            {downloadUrl && !processing && (
              <motion.a initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} href={downloadUrl} download="sanitized_bundle.zip" className="btn-secondary">Download Optimized Bundle</motion.a>
            )}
          </div>
        </footer>
      </motion.div>

      <style jsx>{`
        .rc-container {
          min-height: 100vh;
          width: 100%;
          display: flex;
          justify-content: center;
          padding: 80px 24px;
          background: #030014;
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        /* --- BACKGROUND --- */
        .release-bg { position: fixed; inset: 0; pointer-events: none; }
        .bg-mesh { position: absolute; inset: 0; background: radial-gradient(circle at 50% -10%, #1e1b4b 0%, transparent 60%); }
        .bg-noise { position: absolute; inset: 0; opacity: 0.02; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
        .blob { position: absolute; width: 40%; height: 40%; border-radius: 50%; filter: blur(120px); }
        .blob-p { background: #7c3aed; top: -10%; right: -10%; }
        .blob-b { background: #4338ca; bottom: -10%; left: -10%; }

        .rc-content { position: relative; z-index: 10; width: 100%; max-width: 950px; display: flex; flex-direction: column; gap: 3rem; }

        .rc-header { text-align: center; }
        .rc-badge { display: inline-block; padding: 6px 14px; border-radius: 100px; background: rgba(167, 139, 250, 0.05); border: 1px solid rgba(167, 139, 250, 0.15); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #a78bfa; margin-bottom: 1.5rem; }
        h1 { font-size: clamp(2.5rem, 8vw, 4rem); font-weight: 900; letter-spacing: -0.04em; margin-bottom: 1rem; line-height: 1.1; }
        .gradient-text { background: linear-gradient(to right, #fff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #94a3b8; font-size: 1.2rem; max-width: 600px; margin: 0 auto; line-height: 1.6; }

        /* --- CARD --- */
        .rc-card {
          position: relative;
          background: rgba(10, 10, 24, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 40px;
          padding: 80px 40px;
          cursor: pointer;
          backdrop-filter: blur(20px);
          overflow: hidden;
          transition: border-color 0.4s, background 0.4s;
        }
        .rc-card:focus-visible { outline: 2px solid #a78bfa; outline-offset: 4px; }
        .rc-card.dragging { border-color: #a78bfa; background: rgba(167, 139, 250, 0.05); }
        .card-fx-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at var(--mx) var(--my), rgba(167, 139, 250, 0.12), transparent 400px); }
        .card-fx-border { position: absolute; inset: 0; padding: 1.5px; border-radius: 40px; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); mask-composite: exclude; background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent, rgba(255,255,255,0.1)); pointer-events: none; }

        .card-body { position: relative; z-index: 1; text-align: center; }
        .i-icon { width: 64px; height: 64px; background: rgba(167, 139, 250, 0.1); border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; color: #a78bfa; }
        .i-view h3 { font-size: 1.7rem; font-weight: 800; margin-bottom: 0.5rem; }
        .i-view p { color: #64748b; font-size: 1rem; }

        /* --- PROCESSING --- */
        .p-spinner { width: 40px; height: 40px; border: 3px solid rgba(167, 139, 250, 0.1); border-top-color: #a78bfa; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
        .p-spinner.static { animation: none; border-top-color: rgba(167, 139, 250, 0.4); }
        .p-bar { width: 100%; max-width: 300px; height: 4px; background: rgba(255,255,255,0.05); border-radius: 10px; margin: 1rem auto; overflow: hidden; }
        .p-fill { height: 100%; background: #a78bfa; box-shadow: 0 0 10px #a78bfa; transition: width 0.4s ease; }

        /* --- QUEUE --- */
        .rc-queue { background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 24px; overflow: hidden; }
        .queue-head { padding: 14px 24px; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.05); background: rgba(255,255,255,0.01); font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .queue-head button { background: none; border: none; color: #f87171; cursor: pointer; font-size: 0.8rem; font-weight: 700; }
        .queue-list { max-height: 300px; overflow-y: auto; padding: 8px; }
        .file-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-radius: 12px; transition: 0.2s; }
        .file-row:hover { background: rgba(255,255,255,0.03); }
        .file-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .file-name { font-size: 0.9rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
        .file-badge { font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; }
        .file-badge.img { background: rgba(167, 139, 250, 0.1); color: #a78bfa; }
        .file-badge.zip { background: rgba(59, 130, 246, 0.1); color: #60a5fa; }
        .file-meta { display: flex; align-items: center; gap: 16px; color: #475569; font-size: 0.8rem; font-weight: 600; }
        .remove-btn { background: none; border: none; color: #334155; cursor: pointer; padding: 4px; border-radius: 6px; transition: 0.2s; }
        .remove-btn:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

        /* --- FOOTER --- */
        .rc-footer { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
        .status-box { height: 40px; display: flex; align-items: center; justify-content: center; }
        .toast { padding: 8px 20px; border-radius: 100px; font-size: 0.85rem; font-weight: 700; border: 1px solid transparent; }
        .toast.err { background: rgba(248, 113, 113, 0.1); color: #f87171; border-color: rgba(248, 113, 113, 0.2); }
        .toast.succ { background: rgba(52, 211, 153, 0.1); color: #34d399; border-color: rgba(52, 211, 153, 0.2); }

        .btn-stack { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; }
        .btn-primary { position: relative; background: #fff; color: #000; border: none; padding: 18px 48px; border-radius: 100px; font-weight: 900; font-size: 1.1rem; cursor: pointer; overflow: hidden; width: 100%; max-width: 400px; }
        .btn-shine { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transform: translateX(-100%) skewX(-20deg); animation: shine 6s infinite; }
        .btn-secondary { background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); padding: 16px 36px; border-radius: 100px; font-weight: 700; text-decoration: none; transition: 0.2s; }
        .btn-secondary:hover { background: rgba(255,255,255,0.1); border-color: #a78bfa; }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shine { 0% { transform: translateX(-100%) skewX(-20deg); } 12%, 100% { transform: translateX(200%) skewX(-20deg); } }

        @media (max-width: 768px) {
          .rc-container { padding: 40px 20px; }
          h1 { font-size: 2.4rem; }
          .rc-card { padding: 60px 24px; }
          .btn-primary { padding: 16px 32px; }
        }
      `}</style>
    </main>
  );
}
