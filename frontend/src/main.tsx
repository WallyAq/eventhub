import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import '@fontsource-variable/inter';
import './auth.css';
import './business.css';
import './motion.css';
import './organization-theme.css';
import './participant-theme.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

