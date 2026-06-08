import { Routes, Route } from 'react-router-dom';
import PublicDashboard from './components/PublicDashboard';
import AdminAuth from './components/AdminAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicDashboard />} />
      <Route path="/admin" element={<AdminAuth />} />
    </Routes>
  );
}
