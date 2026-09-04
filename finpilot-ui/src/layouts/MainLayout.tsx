// src/layouts/MainLayout.tsx
// src/layouts/MainLayout.tsx
import type { ReactNode } from 'react';
import Sidebar from '../components/Sidebar';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      background: '#f0f2f5',
      width: '100%'
    }}>
      <Sidebar />
      <div style={{ 
        flex: 1, 
        minHeight: '100vh',
        padding: '32px',
        overflowX: 'hidden',
        width: '100%'
      }}>
        {children}
      </div>
    </div>
  );
}