// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { fetchSummary } from '../api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend, 
  LineChart, Line, AreaChart, Area 
} from 'recharts';

type SummaryRow = { status: string; resolved_by_tier: string; count: number };

// Updated colors for 3-tier system
const STATUS_COLORS = {
  matched: '#10B981',
  partial_payment: '#F59E0B',
  pending: '#3B82F6',
  overdue: '#F97316',
  exception: '#EF4444'
};

const TIER_COLORS = {
  rule: '#94A3B8',    // Gray - Free/Cheap
  groq: '#8B5CF6',    // Purple - Mid-tier
  claude: '#6366F1'   // Indigo - Deep tier
};

const TIER_ICONS = {
  rule: '⚡',
  groq: '🤖',
  claude: '🧠'
};

const TIER_LABELS = {
  rule: 'Rule Match',
  groq: 'Groq AI',
  claude: 'Claude AI'
};

const STATUS_ICONS = {
  matched: '✅',
  partial_payment: '📊',
  pending: '⏳',
  overdue: '⚠️',
  exception: '🚨'
};

const STATUS_LABELS = {
  matched: 'Matched',
  partial_payment: 'Partial Payment',
  pending: 'Pending',
  overdue: 'Overdue',
  exception: 'Exception'
};

// Cost per record (in cents)
const TIER_COSTS = {
  rule: 0,        // Free
  groq: 0.001,    // $0.001 per record
  claude: 0.03    // $0.03 per record
};

// Time per record (in seconds)
const TIER_SPEED = {
  rule: 0.1,      // Instant
  groq: 0.8,      // Fast
  claude: 2.5     // Slow but accurate
};

export default function Dashboard() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary()
      .then(res => {
        console.log('📊 Summary data:', res.data);
        
        // Handle both array and object responses
        let data = res.data;
        
        // If data is an object with a summary property, extract it
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          // Check if it has detailed_stats or summary arrays
          if (data.detailed_stats && Array.isArray(data.detailed_stats)) {
            data = data.detailed_stats;
          } else if (data.summary && Array.isArray(data.summary)) {
            data = data.summary;
          } else {
            // Try to convert object to array
            const arr: SummaryRow[] = [];
            // Check for status counts
         
            data = arr;
          }
        }
        
        // Ensure data is an array
        if (!Array.isArray(data)) {
          console.warn('Data is not an array, using empty array:', data);
          data = [];
        }
        
        setSummary(data);
        setError(null);
      })
      .catch(err => {
        console.error('Dashboard error:', err);
        setError('Failed to load dashboard data. Please try again.');
        setSummary([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Calculate statistics - safe with fallbacks
  const statusCounts = summary.reduce((acc, row) => {
    if (row && row.status) {
      acc[row.status] = (acc[row.status] || 0) + row.count;
    }
    return acc;
  }, {} as Record<string, number>);

  const tierCounts = summary.reduce((acc, row) => {
    if (row && row.resolved_by_tier) {
      acc[row.resolved_by_tier] = (acc[row.resolved_by_tier] || 0) + row.count;
    }
    return acc;
  }, {} as Record<string, number>);

  // Calculate cost savings
  const totalRecords = Object.values(tierCounts).reduce((a, b) => a + b, 0);
  const ruleCount = tierCounts.rule || 0;
  const groqCount = tierCounts.groq || 0;
  const claudeCount = tierCounts.claude || 0;

  // Calculate costs
  const totalCost = (groqCount * TIER_COSTS.groq) + (claudeCount * TIER_COSTS.claude);
  const costWithoutRule = ((groqCount + ruleCount) * TIER_COSTS.groq) + (claudeCount * TIER_COSTS.claude);
  const savings = costWithoutRule - totalCost;
  const savingsPercentage = totalRecords > 0 ? (savings / costWithoutRule * 100) : 0;

  // Calculate efficiency
  const avgTime = totalRecords > 0 
    ? ((ruleCount * TIER_SPEED.rule) + (groqCount * TIER_SPEED.groq) + (claudeCount * TIER_SPEED.claude)) / totalRecords
    : 0;

  const statusData = Object.entries(statusCounts).map(([name, value]) => ({
    name: STATUS_LABELS[name as keyof typeof STATUS_LABELS] || name.replace('_', ' ').toUpperCase(),
    key: name,
    value,
    color: STATUS_COLORS[name as keyof typeof STATUS_COLORS] || '#6B7280',
    icon: STATUS_ICONS[name as keyof typeof STATUS_ICONS] || '📌'
  }));

  const tierData = Object.entries(tierCounts).map(([name, value]) => ({
    name: TIER_LABELS[name as keyof typeof TIER_LABELS] || name.charAt(0).toUpperCase() + name.slice(1),
    key: name,
    value,
    color: TIER_COLORS[name as keyof typeof TIER_COLORS] || '#6B7280',
    icon: TIER_ICONS[name as keyof typeof TIER_ICONS] || '📌',
    cost: TIER_COSTS[name as keyof typeof TIER_COSTS] || 0
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ 
          background: 'white', 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '12px', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>{payload[0].name}</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: payload[0].payload?.color || '#1a1a2e' }}>
            {payload[0].value}
          </p>
          {payload[0].payload?.cost !== undefined && (
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Cost: ${(payload[0].payload.cost).toFixed(4)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '256px', 
        background: 'white', 
        borderRadius: '12px', 
        border: '1px solid #e5e7eb' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: '#6b7280', fontWeight: 500 }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px',
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #fecaca'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <p style={{ color: '#dc2626', fontWeight: 500 }}>{error}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{
            marginTop: '16px',
            padding: '8px 24px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // No data state
  if (totalRecords === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '60px 20px',
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>📊</div>
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px' }}>
          No Data Available
        </h2>
        <p style={{ color: '#6b7280', maxWidth: '400px', margin: '0 auto' }}>
          Upload data and run reconciliation to see dashboard metrics.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#1a1a2e' }}>Dashboard</h1>
        <p style={{ color: '#6b7280', marginTop: '4px' }}>Overview of your financial reconciliation status</p>
      </div>

      {/* Stats Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
        gap: '16px', 
        marginBottom: '32px',
        maxWidth: '1280px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          border: '1px solid #e5e7eb', 
          padding: '20px', 
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>Total Records</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', marginTop: '4px' }}>{totalRecords}</p>
          <div style={{ 
            width: '44px', 
            height: '44px', 
            background: '#eff6ff', 
            borderRadius: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '22px', 
            margin: '8px auto 0' 
          }}>📊</div>
        </div>

        {statusData.slice(0, 3).map((item) => (
          <div key={item.key} style={{ 
            background: 'white', 
            borderRadius: '12px', 
            border: '1px solid #e5e7eb', 
            padding: '20px', 
            textAlign: 'center' 
          }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>{item.name}</p>
            <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color: item.color }}>{item.value}</p>
            <div style={{ 
              width: '44px', 
              height: '44px', 
              borderRadius: '12px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '22px', 
              margin: '8px auto 0', 
              background: item.color + '20' 
            }}>{item.icon}</div>
          </div>
        ))}

        {/* AI Efficiency Score */}
        <div style={{ 
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', 
          borderRadius: '12px', 
          border: '1px solid #bbf7d0', 
          padding: '20px', 
          textAlign: 'center' 
        }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#166534' }}>AI Efficiency</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>
            {savingsPercentage.toFixed(0)}%
          </p>
          <div style={{ 
            width: '44px', 
            height: '44px', 
            borderRadius: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '22px', 
            margin: '8px auto 0', 
            background: 'rgba(22, 163, 74, 0.15)' 
          }}>🎯</div>
        </div>
      </div>

      {/* Charts Section */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', 
        gap: '24px', 
        marginBottom: '32px',
        maxWidth: '1280px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        {/* Status Distribution */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '16px' }}>
            Status Distribution
          </h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name}\n${(percent * 100).toFixed(0)}%`}
                  outerRadius={90}
                  innerRadius={50}
                  fill="#8884d8"
                  dataKey="value"
                  paddingAngle={2}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span style={{ fontSize: '12px', color: '#6b7280' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tier Distribution */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '16px' }}>
            Resolution by Tier
          </h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tierData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: 12, fontWeight: 500 }}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="value" 
                  fill="#8884d8"
                  radius={[0, 8, 8, 0]}
                  barSize={35}
                >
                  {tierData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Cost Optimization Section */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        border: '1px solid #e5e7eb', 
        padding: '24px',
        maxWidth: '1280px',
        marginLeft: 'auto',
        marginRight: 'auto',
        marginBottom: '32px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e' }}>💰 AI Cost Efficiency</h3>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            fontSize: '12px',
            background: savings > 0 ? '#d1fae5' : '#fef3c7',
            color: savings > 0 ? '#065f46' : '#92400e',
            padding: '4px 12px',
            borderRadius: '999px',
            fontWeight: 500
          }}>
            {savings > 0 ? '✅ Optimized' : '⚠️ Review'}
          </div>
        </div>

        {/* Tier Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '16px',
          marginBottom: '20px'
        }}>
          {tierData.map((tier) => {
            const isRule = tier.key === 'rule';
            const isGroq = tier.key === 'groq';
            const isClaude = tier.key === 'claude';
            
            return (
              <div key={tier.key} style={{ 
                background: isRule ? 'linear-gradient(135deg, #f8fafc, #f1f5f9)' :
                           isGroq ? 'linear-gradient(135deg, #f5f3ff, #ede9fe)' :
                           'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                borderRadius: '12px', 
                padding: '20px', 
                textAlign: 'center', 
                border: `1px solid ${tier.color}40`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px' }}>{tier.icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#4b5563' }}>{tier.name}</span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: tier.color }}>{tier.value}</div>
                <div style={{ fontSize: '11px', color: isRule ? '#065f46' : isGroq ? '#5b21b6' : '#3730a3', marginTop: '8px', fontWeight: 500 }}>
                  {isRule ? '💰 Free' : `💰 $${(tier.value * tier.cost).toFixed(4)}`}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  {isRule ? 'Instant • Zero cost' : 
                   isGroq ? 'Fast • Cheap AI' : 
                   'Deep • Accurate AI'}
                </div>
                {isRule && tier.value > 0 && (
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#16a34a', 
                    marginTop: '8px', 
                    fontWeight: 600,
                    background: '#dcfce7',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    display: 'inline-block'
                  }}>
                    Saved ${(tier.value * 0.02).toFixed(2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Cost Summary */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #f3f4f6'
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Total AI Cost</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a2e' }}>${totalCost.toFixed(4)}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Saved by Rule</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#16a34a' }}>${savings.toFixed(2)}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Avg Response Time</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#6366f1' }}>
              {avgTime.toFixed(2)}s
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Cost per Record</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#8b5cf6' }}>
              ${(totalRecords > 0 ? totalCost / totalRecords : 0).toFixed(4)}
            </p>
          </div>
        </div>
      </div>

      {/* 3-Tier AI Flow Visualization */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        border: '1px solid #e5e7eb', 
        padding: '24px',
        maxWidth: '1280px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '20px', textAlign: 'center' }}>
          🔄 3-Tier AI Processing Flow
        </h3>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '20px'
        }}>
          {/* Tier 1: Rule */}
          <div style={{ 
            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
            borderRadius: '12px',
            padding: '20px',
            border: '2px solid #e5e7eb',
            position: 'relative'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '-10px', 
              left: '50%', 
              transform: 'translateX(-50%)',
              background: '#94A3B8',
              color: 'white',
              padding: '2px 12px',
              borderRadius: '999px',
              fontSize: '10px',
              fontWeight: 600
            }}>
              TIER 1
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '32px' }}>⚡</span>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', margin: '8px 0 4px' }}>Rule Match</h4>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>Instant • Free • High Confidence</p>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700, 
                color: '#374151',
                margin: '8px 0'
              }}>
                {ruleCount || 0}
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: '#16a34a',
                background: '#dcfce7',
                padding: '2px 12px',
                borderRadius: '999px',
                display: 'inline-block'
              }}>
                Saved ${((ruleCount || 0) * 0.02).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Tier 2: Groq */}
          <div style={{ 
            background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
            borderRadius: '12px',
            padding: '20px',
            border: '2px solid #c4b5fd',
            position: 'relative'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '-10px', 
              left: '50%', 
              transform: 'translateX(-50%)',
              background: '#8B5CF6',
              color: 'white',
              padding: '2px 12px',
              borderRadius: '999px',
              fontSize: '10px',
              fontWeight: 600
            }}>
              TIER 2
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '32px' }}>🤖</span>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#5b21b6', margin: '8px 0 4px' }}>Groq AI</h4>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>Fast • Cheap • 75-90% Confidence</p>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700, 
                color: '#7c3aed',
                margin: '8px 0'
              }}>
                {groqCount || 0}
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: '#5b21b6',
                background: '#ede9fe',
                padding: '2px 12px',
                borderRadius: '999px',
                display: 'inline-block'
              }}>
                Cost: ${((groqCount || 0) * 0.001).toFixed(4)}
              </div>
            </div>
          </div>

          {/* Tier 3: Claude */}
          <div style={{ 
            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
            borderRadius: '12px',
            padding: '20px',
            border: '2px solid #a5b4fc',
            position: 'relative'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '-10px', 
              left: '50%', 
              transform: 'translateX(-50%)',
              background: '#6366F1',
              color: 'white',
              padding: '2px 12px',
              borderRadius: '999px',
              fontSize: '10px',
              fontWeight: 600
            }}>
              TIER 3
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '32px' }}>🧠</span>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#3730a3', margin: '8px 0 4px' }}>Claude AI</h4>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>Deep • Accurate • 90+% Confidence</p>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700, 
                color: '#4f46e5',
                margin: '8px 0'
              }}>
                {claudeCount || 0}
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: '#3730a3',
                background: '#e0e7ff',
                padding: '2px 12px',
                borderRadius: '999px',
                display: 'inline-block'
              }}>
                Cost: ${((claudeCount || 0) * 0.03).toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* Flow Arrow */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          gap: '8px',
          marginTop: '16px',
          fontSize: '12px',
          color: '#6b7280'
        }}>
          <span style={{ fontWeight: 500 }}>📥 Incoming</span>
          <span>→</span>
          <span style={{ color: '#94A3B8', fontWeight: 500 }}>Rule Match</span>
          <span>→</span>
          <span style={{ color: '#8B5CF6', fontWeight: 500 }}>Groq AI</span>
          <span>→</span>
          <span style={{ color: '#6366F1', fontWeight: 500 }}>Claude AI</span>
          <span>→</span>
          <span style={{ fontWeight: 500 }}>✅ Resolved</span>
        </div>

        <div style={{ 
          marginTop: '12px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '8px',
          fontSize: '11px',
          color: '#6b7280',
          textAlign: 'center',
          border: '1px dashed #e5e7eb'
        }}>
          💡 Only unresolved items flow to the next tier • Rule match saves ~{savingsPercentage.toFixed(0)}% on AI costs
        </div>
      </div>
    </div>
  );
}