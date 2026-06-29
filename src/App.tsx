import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import PublicDashboard from './components/PublicDashboard';
import AdminAuth from './components/AdminAuth';
import BackgroundEffects from './components/BackgroundEffects';

import { applyCustomTheme } from './utils/theme';

export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      if (savedTheme.startsWith('#')) {
        applyCustomTheme(savedTheme);
      } else {
        document.documentElement.className = savedTheme;
      }
    }
  }, []);

  return (
    <>
      <BackgroundEffects />
      <Routes>
        <Route path="/" element={<PublicDashboard />} />
        <Route path="/admin" element={<AdminAuth />} />
      </Routes>
    </>
  );
}
