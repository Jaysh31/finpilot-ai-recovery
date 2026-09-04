  // src/pages/Reconciliation.tsx
  import { useState, useRef, useEffect } from 'react';
  import { getReconcileStreamUrl } from '../api';

  interface LogEntry {
    id: number;
    stage: string;
    record?: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'groq' | 'claude' | 'rule';
    timestamp: Date;
    data?: any;
  }

  export default function Reconciliation() {
    const [recordType, setRecordType] = useState<'sales' | 'purchases'>('purchases');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [currentRecord, setCurrentRecord] = useState<string>('');
    const [progress, setProgress] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
      setLogs(prev => [...prev, {
        ...entry,
        id: prev.length + 1,
        timestamp: new Date()
      }]);
    };

    const startReconciliation = () => {
      setLogs([]);
      setStats(null);
      setCurrentRecord('');
      setProgress(0);
      setIsRunning(true);
      
      const url = getReconcileStreamUrl(recordType);
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      let processedCount = 0;
      let totalCount = 0;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch(data.stage) {
            case 'start':
              addLog({ stage: 'start', message: data.message || 'Starting...', type: 'info' });
              break;

            case 'stage0':
              if (data.message && data.message.includes('Found')) {
                const match = data.message.match(/(\d+)/);
                if (match) totalCount = parseInt(match[0]);
              }
              addLog({ stage: 'stage0', message: data.message || 'Processing...', type: 'info' });
              break;

            case 'rule':
              if (data.record) {
                setCurrentRecord(data.record);
                processedCount++;
                setProgress(totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0);
                addLog({
                  stage: 'rule',
                  record: data.record,
                  message: data.message || `Rule matching: ${data.record}`,
                  type: 'rule'
                });
              }
              break;

            case 'groq':
              if (data.record && data.result) {
                addLog({
                  stage: 'groq',
                  record: data.record,
                  message: data.message || `Groq analyzing: ${data.record}`,
                  type: 'groq',
                  data: data.result
                });
              }
              break;

            case 'claude_tool_call':
              if (data.record && data.toolCall) {
                const toolName = data.toolCall.tool.replace(/_/g, ' ');
                addLog({
                  stage: 'claude',
                  record: data.record,
                  message: data.message || `Claude: Calling ${toolName}`,
                  type: 'claude',
                  data: data.toolCall
                });
              }
              break;

            case 'claude_final':
              if (data.record && data.result) {
                const status = data.result.status || 'unknown';
                const confidence = data.result.confidence || 0;
                addLog({
                  stage: 'claude',
                  record: data.record,
                  message: data.message || `Claude decision: ${status} (${confidence}% confidence)`,
                  type: 'success',
                  data: data.result
                });
              }
              break;

            case 'complete':
              setIsRunning(false);
              if (data.stats) {
                setStats(data.stats);
                setProgress(100);
                addLog({
                  stage: 'complete',
                  message: data.message || '✅ Reconciliation complete!',
                  type: 'success',
                  data: data.stats
                });
              }
              break;

            case 'error':
              setIsRunning(false);
              addLog({
                stage: 'error',
                message: `❌ ${data.message || 'Unknown error'}`,
                type: 'error'
              });
              break;

            default:
              if (data.message) {
                addLog({
                  stage: data.stage || 'info',
                  message: data.message,
                  type: 'info'
                });
              }
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsRunning(false);
        addLog({
          stage: 'error',
          message: '❌ Connection closed unexpectedly.',
          type: 'error'
        });
      };
    };

    const stopReconciliation = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsRunning(false);
        addLog({
          stage: 'stop',
          message: '⏹️ Stopped by user.',
          type: 'warning'
        });
      }
    };

    useEffect(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, [logs]);

    useEffect(() => {
      return () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
      };
    }, []);

    const getStatsColor = (label: string) => {
      const colors: Record<string, string> = {
        total: '#1a1a2e',
        rule: '#3b82f6',
        groq: '#8b5cf6',
        claude: '#6366f1',
        partial: '#f59e0b',
        overdue: '#f97316',
        exceptions: '#ef4444'
      };
      return colors[label] || '#6b7280';
    };

    const getStatsIcon = (label: string) => {
      const icons: Record<string, string> = {
        total: '📊',
        rule: '⚡',
        groq: '🤖',
        claude: '🧠',
        partial: '📊',
        overdue: '⚠️',
        exceptions: '🚨'
      };
      return icons[label] || '📌';
    };

    return (
      <div style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#1a1a2e' }}>🔄 Reconciliation Agent Trace</h1>
          <p style={{ color: '#6b7280', marginTop: '4px' }}>Watch the AI agent in action as it reconciles your financial records</p>
        </div>

        {/* Controls */}
        <div style={{
          background: 'white',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>Record Type:</label>
              <select 
                value={recordType} 
                onChange={(e) => setRecordType(e.target.value as any)} 
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: 'white',
                  color: '#1a1a2e',
                  outline: 'none',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  opacity: isRunning ? 0.6 : 1
                }}
                disabled={isRunning}
              >
                <option value="sales">📄 Sales Invoices</option>
                <option value="purchases">📄 Purchase Orders</option>
              </select>
            </div>
            
            <button
              onClick={startReconciliation}
              disabled={isRunning}
              style={{
                background: isRunning ? '#9ca3af' : '#4f46e5',
                color: 'white',
                padding: '10px 24px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.background = '#4338ca';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.background = '#4f46e5';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {isRunning ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                  Running...
                </>
              ) : (
                '▶️ Start Reconciliation'
              )}
            </button>
            
            {isRunning && (
              <button
                onClick={stopReconciliation}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  padding: '10px 24px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                }}
              >
                ⏹️ Stop
              </button>
            )}
            
            <button
              onClick={() => setLogs([])}
              style={{
                background: '#f3f4f6',
                color: '#374151',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
              }}
            >
              🗑️ Clear Logs
            </button>

            {currentRecord && isRunning && (
              <div style={{ 
                marginLeft: 'auto', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Processing:</span>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  background: '#eef2ff',
                  color: '#4f46e5',
                  padding: '4px 16px',
                  borderRadius: '20px',
                  fontWeight: 600
                }}>
                  {currentRecord}
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#6b7280', marginBottom: '6px' }}>
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div style={{
                height: '6px',
                background: '#e5e7eb',
                borderRadius: '3px',
                overflow: 'hidden',
                width: '100%'
              }}>
                <div style={{
                  height: '100%',
                  borderRadius: '3px',
                  background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                  transition: 'width 0.5s ease',
                  width: `${progress}%`
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '12px',
            marginBottom: '24px'
          }}>
            {Object.entries(stats).map(([key, value]) => {
              if (key === 'total' || key === 'rule' || key === 'groq' || key === 'claude' || key === 'partial' || key === 'overdue' || key === 'exceptions') {
                const color = getStatsColor(key);
                const icon = getStatsIcon(key);
                const label = key.charAt(0).toUpperCase() + key.slice(1);
                
                return (
                  <div key={key} style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    padding: '16px',
                    textAlign: 'center',
                    transition: 'all 0.2s ease'
                  }}>
                    <div style={{ fontSize: '24px' }}>{icon}</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color, marginTop: '4px' }}>{value as number}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {/* Logs Terminal */}
        <div style={{
          background: 'white',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            background: '#f8fafc',
            padding: '12px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>📋 Agent Trace Logs</span>
              <span style={{
                fontSize: '11px',
                background: '#e5e7eb',
                color: '#6b7280',
                padding: '2px 12px',
                borderRadius: '12px',
                fontWeight: 500
              }}>
                {logs.length} events
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Live</span>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isRunning ? '#22c55e' : '#d1d5db',
                animation: isRunning ? 'pulse 1.5s infinite' : 'none'
              }} />
            </div>
          </div>
          
          <div ref={logContainerRef} style={{
            background: '#0f172a',
            padding: '20px',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '13px',
            color: '#e2e8f0',
            height: '420px',
            overflowY: 'auto',
            border: '1px solid #1e293b'
          }}>
            {logs.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#64748b'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
                <p style={{ fontSize: '18px', fontWeight: 500 }}>Agent trace will appear here...</p>
                <p style={{ fontSize: '14px', color: '#475569', marginTop: '8px' }}>Click "Start Reconciliation" to begin</p>
              </div>
            ) : (
              logs.map((log) => {
                const badgeColors: Record<string, { bg: string; color: string }> = {
                  info: { bg: '#1e293b', color: '#94a3b8' },
                  rule: { bg: '#1e293b', color: '#94a3b8' },
                  groq: { bg: '#7c3aed20', color: '#a78bfa' },
                  claude: { bg: '#3b82f620', color: '#60a5fa' },
                  success: { bg: '#05966920', color: '#34d399' },
                  warning: { bg: '#d9770620', color: '#fbbf24' },
                  error: { bg: '#dc262620', color: '#f87171' }
                };
                
                const badgeStyle = badgeColors[log.type] || badgeColors.info;
                
                return (
                  <div key={log.id} style={{
                    padding: '4px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}>
                    <span style={{
                      color: '#64748b',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      minWidth: '80px',
                      paddingTop: '1px'
                    }}>
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      padding: '1px 10px',
                      borderRadius: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      whiteSpace: 'nowrap',
                      background: badgeStyle.bg,
                      color: badgeStyle.color
                    }}>
                      {log.type.toUpperCase()}
                    </span>
                    <span style={{ flex: 1, wordBreak: 'break-word' }}>
                      {log.message}
                      {log.record && (
                        <span style={{
                          marginLeft: '8px',
                          color: '#64748b',
                          fontSize: '12px',
                          background: '#1e293b',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {log.record}
                        </span>
                      )}
                    </span>
                    {log.data && (
                      <div style={{
                        marginTop: '8px',
                        marginLeft: '180px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '12px',
                        color: '#94a3b8',
                        overflowX: 'auto',
                        border: '1px solid rgba(71, 85, 105, 0.5)',
                        width: '100%'
                      }}>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(log.data, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          fontSize: '14px',
          padding: '12px 16px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#1e293b', borderRadius: '50%' }}></span>
            <span style={{ color: '#6b7280' }}>Rule</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#7c3aed', borderRadius: '50%' }}></span>
            <span style={{ color: '#6b7280' }}>Groq (Cheap AI)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#3b82f6', borderRadius: '50%' }}></span>
            <span style={{ color: '#6b7280' }}>Claude (Deep AI)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '50%' }}></span>
            <span style={{ color: '#6b7280' }}>Success</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '50%' }}></span>
            <span style={{ color: '#6b7280' }}>Warning</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%' }}></span>
            <span style={{ color: '#6b7280' }}>Error</span>
          </div>
        </div>

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    );
  }