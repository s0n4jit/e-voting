import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  showCloseButton = true,
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-slide-up my-8`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-headline"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 id="modal-headline" className="text-lg font-semibold text-gray-900">
            {title}
          </h3>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-6 max-h-[calc(85vh-120px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
