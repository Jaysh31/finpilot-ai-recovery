// src/pages/Export.tsx
import { useState } from 'react';
import { getCAExport } from '../api';
import * as XLSX from 'xlsx';

interface CAReportData {
  generated_at: string;
  summary: {
    total_records: number;
    matched_no_ai: number;
    matched_ai_assisted: number;
    unresolved_exceptions: number;
    total_amount: number;
    by_type: {
      sales: number;
      purchases: number;
    };
    by_status: {
      matched: number;
      partial_payment: number;
      pending: number;
      overdue: number;
      exception: number;
    };
    total_amount_note: string;
  };
  tier_breakdown: Record<string, { count: number; amount: number }>;
  matched_clean: any[];
  ai_assisted_matches: any[];
  unresolved_exceptions: any[];
  all_records: any[];
  disclaimer: string;
}

export default function Export() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CAReportData | null>(null);
  const [reportType, setReportType] = useState<'full' | 'summary' | 'exceptions'>('full');

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await getCAExport();
      setData(res.data);
    } catch (err) {
      alert('Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (!data) return;
    
    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Executive Summary
    const summaryData = [
      ['CA Audit Report'],
      ['Generated on:', new Date(data.generated_at).toLocaleString('en-IN')],
      ['Financial Year:', '2026-27'],
      [],
      ['EXECUTIVE SUMMARY'],
      ['Metric', 'Value'],
      ['Total Records', data.summary.total_records],
      ['Total Amount', data.summary.total_amount],
      ['Matched (Rule)', data.summary.matched_no_ai],
      ['AI Assisted', data.summary.matched_ai_assisted],
      ['Unresolved', data.summary.unresolved_exceptions],
      [],
      ['STATUS BREAKDOWN'],
      ['Status', 'Count'],
      ['Matched', data.summary.by_status.matched],
      ['Partial Payment', data.summary.by_status.partial_payment],
      ['Pending', data.summary.by_status.pending],
      ['Overdue', data.summary.by_status.overdue],
      ['Exception', data.summary.by_status.exception],
      [],
      ['RECORD TYPE BREAKDOWN'],
      ['Type', 'Count'],
      ['Sales', data.summary.by_type.sales],
      ['Purchases', data.summary.by_type.purchases],
      [],
      ['AI TIER BREAKDOWN'],
      ['Tier', 'Count', 'Amount'],
    ];
    
    Object.entries(data.tier_breakdown).forEach(([tier, stats]) => {
      summaryData.push([tier, stats.count, stats.amount]);
    });
    
    summaryData.push([], ['Disclaimer:', data.disclaimer]);
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    
    // Sheet 2: All Records
    const headers = [
      'ID', 'Record ID', 'Type', 'Status', 'Tier', 'Confidence', 
      'Amount', 'Party', 'Party Email', 'Due Date', 'Recommended Action'
    ];
    
    const recordsData = data.all_records.map((r: any) => [
      r.id,
      r.record_id,
      r.record_type,
      r.status,
      r.resolved_by_tier,
      r.confidence || '',
      r.amount || '',
      r.party_name || '',
      r.party_email || '',
      r.due_date || '',
      r.recommended_action || ''
    ]);
    
    const recordsSheet = XLSX.utils.aoa_to_sheet([headers, ...recordsData]);
    XLSX.utils.book_append_sheet(wb, recordsSheet, 'All Records');
    
    // Sheet 3: Unresolved Exceptions
    if (data.unresolved_exceptions.length > 0) {
      const unresolvedData = data.unresolved_exceptions.map((r: any) => [
        r.id,
        r.record_id,
        r.record_type,
        r.status,
        r.resolved_by_tier,
        r.confidence || '',
        r.amount || '',
        r.party_name || '',
        r.party_email || '',
        r.due_date || '',
        r.recommended_action || ''
      ]);
      const unresolvedSheet = XLSX.utils.aoa_to_sheet([headers, ...unresolvedData]);
      XLSX.utils.book_append_sheet(wb, unresolvedSheet, 'Unresolved');
    }
    
    // Sheet 4: Matched Records
    if (data.matched_clean.length > 0) {
      const matchedData = data.matched_clean.map((r: any) => [
        r.id,
        r.record_id,
        r.record_type,
        r.status,
        r.resolved_by_tier,
        r.confidence || '',
        r.amount || '',
        r.party_name || '',
        r.party_email || '',
        r.due_date || '',
        r.recommended_action || ''
      ]);
      const matchedSheet = XLSX.utils.aoa_to_sheet([headers, ...matchedData]);
      XLSX.utils.book_append_sheet(wb, matchedSheet, 'Matched');
    }
    
    // Generate Excel file
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CA_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!data) return;
    
    const headers = [
      'ID', 'Record ID', 'Type', 'Status', 'Tier', 'Confidence', 
      'Amount', 'Party', 'Party Email', 'Due Date', 'Recommended Action'
    ];
    
    const rows = data.all_records.map((r: any) => [
      r.id,
      r.record_id,
      r.record_type,
      r.status,
      r.resolved_by_tier,
      r.confidence || '',
      r.amount || '',
      r.party_name || '',
      r.party_email || '',
      r.due_date || '',
      `"${(r.recommended_action || '').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CA_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CA_Report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      matched: 'bg-green-100 text-green-800',
      partial_payment: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-blue-100 text-blue-800',
      overdue: 'bg-red-100 text-red-800',
      exception: 'bg-purple-100 text-purple-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      matched: '✅',
      partial_payment: '📊',
      pending: '⏳',
      overdue: '⚠️',
      exception: '🚨'
    };
    return icons[status] || '📌';
  };

  return (
    <div className="max-w-full">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📋 CA-Ready Export</h1>
            <p className="text-gray-500 mt-1">Generate professional audit-ready reports for Chartered Accountants</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
              📊 Financial Year 2026-27
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {/* Disclaimer */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-yellow-600 text-xl">⚠️</span>
            <div>
              <p className="text-sm text-yellow-800 font-medium">Important Disclaimer</p>
              <p className="text-sm text-yellow-700">
                This report pre-sorts records to speed up review. It does not constitute 
                certified verification. All AI-assisted and unresolved items should be reviewed 
                by a qualified professional before sign-off.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-4 mb-6">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? '⏳ Generating...' : '📊 Generate CA Report'}
          </button>
          {data && (
            <>
              <button
                onClick={downloadExcel}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition flex items-center gap-2"
              >
                📊 Download Excel
              </button>
              <button
                onClick={downloadCSV}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition flex items-center gap-2"
              >
                📄 Download CSV
              </button>
              <button
                onClick={downloadJSON}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition flex items-center gap-2"
              >
                📥 Download JSON
              </button>
            </>
          )}
        </div>

        {/* Report Preview */}
        {data && (
          <div className="space-y-6">
            {/* Executive Summary */}
            <div className="border rounded-lg p-6 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span>📊</span> Executive Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-500">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900">{data.summary.total_records}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-500">Total Amount</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.total_amount)}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-500">Matched (Rule)</p>
                  <p className="text-2xl font-bold text-blue-600">{data.summary.matched_no_ai}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-500">Unresolved</p>
                  <p className="text-2xl font-bold text-red-600">{data.summary.unresolved_exceptions}</p>
                </div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span>📈</span> Status Breakdown
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(data.summary.by_status).map(([status, count]) => (
                  <div key={status} className={`rounded-lg p-3 text-center border ${getStatusBadge(status)}`}>
                    <p className="text-2xl font-bold">{count as number}</p>
                    <p className="text-xs capitalize">{status.replace('_', ' ')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier Breakdown */}
            <div className="border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span>🤖</span> AI Tier Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(data.tier_breakdown).map(([tier, stats]) => (
                  <div key={tier} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="font-medium capitalize">{tier}</p>
                    <p className="text-2xl font-bold">{stats.count}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(stats.amount)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Type Breakdown */}
            <div className="border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span>📁</span> Record Type Breakdown
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                  <p className="text-sm text-gray-600">Sales Invoices</p>
                  <p className="text-2xl font-bold text-emerald-600">{data.summary.by_type.sales}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-gray-600">Purchase Orders</p>
                  <p className="text-2xl font-bold text-blue-600">{data.summary.by_type.purchases}</p>
                </div>
              </div>
            </div>

            {/* Detailed Records Table */}
            <div className="border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span>📋</span> Detailed Records
              </h3>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Record ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Party</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {data.all_records.slice(0, 50).map((record: any) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-500">{record.id}</td>
                        <td className="px-3 py-2 text-sm font-mono text-gray-900">{record.record_id}</td>
                        <td className="px-3 py-2 text-sm capitalize">{record.record_type}</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(record.status)}`}>
                            {getStatusIcon(record.status)} {record.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            record.resolved_by_tier === 'rule' ? 'bg-gray-100 text-gray-700' :
                            record.resolved_by_tier === 'groq' ? 'bg-purple-100 text-purple-700' :
                            'bg-indigo-100 text-indigo-700'
                          }`}>
                            {record.resolved_by_tier}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-medium">
                          {record.amount ? formatCurrency(record.amount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">{record.party_name || '—'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{formatDate(record.due_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.all_records.length > 50 && (
                  <p className="text-sm text-gray-500 text-center py-2 border-t">
                    Showing 50 of {data.all_records.length} records. Download full report for complete data.
                  </p>
                )}
              </div>
            </div>

            {/* Disclaimer Footer */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-xl">ℹ️</span>
                <div>
                  <p className="text-xs text-gray-500">
                    Generated on {new Date(data.generated_at).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {data.disclaimer}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!data && !loading && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-gray-500 text-lg">Click "Generate CA Report" to create a professional audit-ready report</p>
            <p className="text-gray-400 text-sm mt-2">Includes executive summary, status breakdown, and detailed records</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 animate-pulse">⏳</div>
            <p className="text-gray-500 text-lg">Generating CA Report...</p>
            <p className="text-gray-400 text-sm mt-2">Please wait while we compile the data</p>
          </div>
        )}
      </div>
    </div>
  );
}