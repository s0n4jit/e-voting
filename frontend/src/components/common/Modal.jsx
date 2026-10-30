import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg', showCloseButton = true }) => {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // callers pass a new onClose every render; it must not re-run the effect

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto card shadow-modal animate-pop-in focus:outline-none`}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <h3 className="font-semibold">{title}</h3>
            {showCloseButton && (
              <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
