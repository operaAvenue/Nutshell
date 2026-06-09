import { Routes, Route } from 'react-router-dom';
import PublicDashboard from './components/PublicDashboard';
import AdminAuth from './components/AdminAuth';
import BackgroundEffects from './components/BackgroundEffects';

export default function App() {
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
