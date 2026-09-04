// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Reconciliation from './pages/Reconciliation';
import Exceptions from './pages/Exceptions';
import Export from './pages/Export';

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/reconcile" element={<Reconciliation />} />
          <Route path="/exceptions" element={<Exceptions />} />
          <Route path="/export" element={<Export />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;