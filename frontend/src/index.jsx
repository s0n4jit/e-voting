import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { BrandProvider } from './context/BrandContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <BrandProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgb(var(--surface))',
                color: 'rgb(var(--fg))',
                border: '1px solid rgb(var(--line))',
                borderRadius: '0.75rem',
                fontSize: '14px',
              },
            }}
          />
          <App />
        </BrandProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
