import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

import './styles/globals.css';
import './styles/neumorphism.css';
import './styles/depth3d.css';
import './styles/legacy-palette.css';
import './styles/animations.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
