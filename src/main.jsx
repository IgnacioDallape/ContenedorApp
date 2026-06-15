import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './i18n/index.js';
import '../css/styles.css';
import '../css/importapro-theme.css'; // tema "Minimal / Petróleo" — va DESPUÉS de styles.css

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('No se pudo registrar el service worker:', error);
    });
  });
}

createRoot(document.getElementById('root')).render(<App />);
