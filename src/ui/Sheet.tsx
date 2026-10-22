// Bottom sheet on phones (drag the handle down to close), centred modal on laptops.
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export function Sheet({ open, onClose, title, wide, children, size = 'md', hidden = false }: { open: boolean; onClose: () => void; title: string; wide: boolean; children: ReactNode; size?: 'md' | 'lg'; hidden?: boolean }) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  const from = reduce ? { opacity: 0 } : wide ? { opacity: 0, scale: 0.97, y: 8 } : { y: '100%' };
  const to = reduce ? { opacity: 1 } : wide ? { opacity: 1, scale: 1, y: 0 } : { y: 0 };
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className={`scrim${hidden ? ' drag-hidden' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`${wide ? 'modal' : 'sheet'} ${size}${hidden ? ' drag-hidden' : ''}`}
            initial={from}
            animate={to}
            exit={from}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: wide ? 0 : 0.12, duration: 0.38 }}
            drag={wide || reduce ? false : 'y'}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.7 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) onClose(); }}
          >
            <header className="sheet-head" onPointerDown={(e) => !wide && controls.start(e)}>
              {!wide && <span className="grabber" aria-hidden="true" />}
              <h2>{title}</h2>
              <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
            </header>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
