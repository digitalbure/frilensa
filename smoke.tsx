import React from 'react';
import { createRoot } from 'react-dom/client';
import './src/index.css';
import AdminBrandingView from './src/components/AdminBrandingView';
createRoot(document.getElementById('root')!).render(<AdminBrandingView showToast={m => console.log('TOAST', m)} />);
