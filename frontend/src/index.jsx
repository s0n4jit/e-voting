import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster, ToastBar, toast, useToasterStore } from 'react-hot-toast';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { BrandProvider } from './context/BrandContext';

/**
 * Ensures toasts never stack infinitely into the upper header/tabs.
 * Caps visible toasts to a clean, manageable limit (default: 3).
 */
function ToastLimiter({ max = 3 }) {
  const { toasts } = useToasterStore();
  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= max)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts, max]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrandProvider>
      <ThemeProvider>
        <BrowserRouter>
          <ToastLimiter max={3} />
          <Toaster
            position="bottom-right"
            containerStyle={{
              bottom: 24,
              right: 24,
              zIndex: 9999,
            }}
            gutter={8}
            toastOptions={{
              duration: 3500,
            }}
          >
            {(t) => (
              <ToastBar
                toast={t}
                style={{
                  ...t.style,
                  background: 'rgba(var(--surface), 0.88)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  color: 'rgb(var(--fg))',
                  border: '1px solid rgba(var(--line), 0.85)',
                  boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.16), 0 4px 10px -2px rgba(0, 0, 0, 0.08)',
                  borderRadius: '0.875rem',
                  padding: '10px 16px',
                  fontSize: '13.5px',
                  fontWeight: 500,
                  opacity: t.visible ? 1 : 0,
                  filter: t.visible ? 'blur(0px)' : 'blur(8px)',
                  transform: t.visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(8px)',
                  transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {({ icon, message }) => (
                  <>
                    {icon}
                    {message}
                  </>
                )}
              </ToastBar>
            )}
          </Toaster>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </BrandProvider>
  </React.StrictMode>
);
