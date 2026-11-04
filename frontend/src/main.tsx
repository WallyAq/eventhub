import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import '@fontsource-variable/inter';
import './auth.css';
import './access.css';
import './business.css';
import './motion.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

