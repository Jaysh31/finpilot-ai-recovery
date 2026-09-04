// src/components/Sidebar.tsx
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/upload', label: 'Upload Data', icon: '📤' },
  { path: '/reconcile', label: 'Reconcile', icon: '🔄' },
  { path: '/exceptions', label: 'Exceptions', icon: '🚨' },
  { path: '/export', label: 'Export Report', icon: '📥' },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div style={{
      width: '260px',
      minHeight: '100vh',
      background: 'white',
      borderRight: '1px solid #e5e7eb',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '24px', flex: 1 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'linear-gradient(135deg, #4f46e5, #4338ca)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '18px',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
          }}>
            FP
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a1a2e' }}>FinPilot</span>
            <span style={{ 
              marginLeft: '6px', 
              fontSize: '10px', 
              background: '#dbeafe', 
              color: '#4f46e5', 
              padding: '2px 8px', 
              borderRadius: '999px', 
              fontWeight: '600' 
            }}>AI</span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  color: active ? '#4f46e5' : '#64748b',
                  background: active ? '#eef2ff' : 'transparent',
                  fontWeight: active ? '600' : '500',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.color = '#0f172a';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#64748b';
                  }
                }}
              >
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ fontSize: '14px' }}>{item.label}</span>
                {active && (
                  <span style={{ 
                    marginLeft: 'auto', 
                    width: '6px', 
                    height: '32px', 
                    background: '#4f46e5', 
                    borderRadius: '999px',
                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)'
                  }} />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div style={{ padding: '24px', borderTop: '1px solid #f3f4f6' }}>
        <div style={{ 
          background: '#f8fafc', 
          borderRadius: '12px', 
          padding: '16px', 
          border: '1px solid #e5e7eb' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ 
                width: '8px', 
                height: '8px', 
                background: '#22c55e', 
                borderRadius: '999px' 
              }} />
              <div style={{ 
                position: 'absolute', 
                inset: 0, 
                width: '8px', 
                height: '8px', 
                background: '#22c55e', 
                borderRadius: '999px', 
                animation: 'pulse 2s infinite',
                opacity: 0.75
              }} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '500', color: '#1a1a2e' }}>System Status</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Operational</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>v1.0.0</div>
        </div>
      </div>
    </div>
  );
}