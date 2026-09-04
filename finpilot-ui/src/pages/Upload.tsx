// src/pages/Upload.tsx
import { useDropzone } from 'react-dropzone';
import { useState } from 'react';
import { uploadFile } from '../api';
import * as XLSX from 'xlsx';

function excelToCSV(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(firstSheet);
        const blob = new Blob([csv], { type: 'text/csv' });
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.csv')));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export default function Upload() {
  const [uploadType, setUploadType] = useState<'sales' | 'purchases' | 'payments'>('sales');
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({
    type: null,
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ sales: boolean; purchases: boolean; payments: boolean }>({
    sales: false,
    purchases: false,
    payments: false
  });

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    setLoading(true);
    setUploadStatus({ type: 'info', message: 'Uploading...' });
    
    try {
      let fileToUpload = file;
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        fileToUpload = await excelToCSV(file);
      }
      const res = await uploadFile(uploadType, fileToUpload);
      
      setUploadedFiles(prev => ({ ...prev, [uploadType]: true }));
      setUploadStatus({ 
        type: 'success', 
        message: `✅ Successfully uploaded ${res.data.inserted} records${res.data.rejected > 0 ? `, ${res.data.rejected} rejected` : ''}`
      });
    } catch (err: any) {
      setUploadStatus({ 
        type: 'error', 
        message: `❌ Error: ${err.response?.data?.error || err.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 
      'text/csv': ['.csv'], 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xls'] 
    },
    maxFiles: 1
  });

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'sales': return 'Sales Invoices';
      case 'purchases': return 'Purchase Orders';
      case 'payments': return 'Payments';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'sales': return '📄';
      case 'purchases': return '📋';
      case 'payments': return '💰';
      default: return '📁';
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'sales': return '#4f46e5';
      case 'purchases': return '#7c3aed';
      case 'payments': return '#059669';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#1a1a2e' }}>📤 Upload Financial Data</h1>
        <p style={{ color: '#6b7280', marginTop: '4px' }}>Upload CSV or Excel files to start reconciliation</p>
      </div>

      {/* Main Card */}
      <div style={{ 
        maxWidth: '900px', 
        margin: '0 auto',
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}>
        {/* Upload Type Selector */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
            Select record type:
          </label>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '12px'
          }}>
            {['sales', 'purchases', 'payments'].map((type) => {
              const isActive = uploadType === type;
              const isUploaded = uploadedFiles[type as keyof typeof uploadedFiles];
              const color = getTypeColor(type);
              
              return (
                <button
                  key={type}
                  onClick={() => setUploadType(type as any)}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${isUploaded ? '#059669' : isActive ? color : '#e5e7eb'}`,
                    background: isUploaded ? '#ecfdf5' : isActive ? '#f5f3ff' : 'white',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    transform: isActive ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: isActive ? '0 4px 12px rgba(79, 70, 229, 0.15)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive && !isUploaded) {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.background = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive && !isUploaded) {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.background = 'white';
                    }
                  }}
                >
                  <div style={{ fontSize: '32px' }}>{getTypeIcon(type)}</div>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    marginTop: '8px',
                    color: isUploaded ? '#065f46' : isActive ? color : '#374151'
                  }}>
                    {getTypeLabel(type)}
                  </div>
                  {isUploaded && (
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#065f46', 
                      marginTop: '4px',
                      fontWeight: 500
                    }}>
                      ✅ Uploaded
                    </div>
                  )}
                  {isActive && !isUploaded && (
                    <div style={{ 
                      fontSize: '12px', 
                      color: color, 
                      marginTop: '4px',
                      fontWeight: 500
                    }}>
                      Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? '#4f46e5' : loading ? '#d1d5db' : '#d1d5db'}`,
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center',
            cursor: loading ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
            background: isDragActive ? '#eef2ff' : loading ? '#f9fafb' : 'white',
            opacity: loading ? 0.6 : 1,
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            if (!isDragActive && !loading) {
              e.currentTarget.style.borderColor = '#4f46e5';
              e.currentTarget.style.background = '#fafafa';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragActive && !loading) {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.background = 'white';
            }
          }}
        >
          <input {...getInputProps()} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ 
              fontSize: '64px', 
              marginBottom: '16px',
              animation: isDragActive ? 'bounce 1s infinite' : 'none'
            }}>
              {isDragActive ? '📥' : '📤'}
            </div>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#1a1a2e',
              marginBottom: '8px'
            }}>
              {isDragActive ? 'Drop your file here' : 'Drag & drop your file here'}
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              or click to browse files
            </p>
            <div style={{ 
              display: 'flex', 
              gap: '16px', 
              marginTop: '16px',
              fontSize: '12px',
              color: '#9ca3af'
            }}>
              <span style={{ padding: '4px 12px', background: '#f3f4f6', borderRadius: '6px' }}>📄 CSV</span>
              <span style={{ padding: '4px 12px', background: '#f3f4f6', borderRadius: '6px' }}>📊 Excel (XLSX)</span>
              <span style={{ padding: '4px 12px', background: '#f3f4f6', borderRadius: '6px' }}>📈 Excel (XLS)</span>
            </div>
            {uploadType && (
              <div style={{ 
                marginTop: '16px',
                padding: '6px 16px',
                background: '#f3f4f6',
                borderRadius: '20px',
                fontSize: '14px',
                color: '#374151'
              }}>
                Uploading: <strong>{getTypeLabel(uploadType)}</strong>
              </div>
            )}
            {loading && (
              <div style={{ 
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#4f46e5'
              }}>
                <span style={{ 
                  display: 'inline-block',
                  width: '20px',
                  height: '20px',
                  border: '3px solid #e5e7eb',
                  borderTop: '3px solid #4f46e5',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span>Uploading...</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Messages */}
        {uploadStatus.type && (
          <div style={{ 
            marginTop: '20px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: uploadStatus.type === 'success' ? '#ecfdf5' : 
                       uploadStatus.type === 'error' ? '#fef2f2' : 
                       '#eff6ff',
            border: `1px solid ${
              uploadStatus.type === 'success' ? '#a7f3d0' : 
              uploadStatus.type === 'error' ? '#fecaca' : 
              '#bfdbfe'
            }`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '20px' }}>
              {uploadStatus.type === 'success' ? '✅' : 
               uploadStatus.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span style={{ 
              color: uploadStatus.type === 'success' ? '#065f46' : 
                     uploadStatus.type === 'error' ? '#991b1b' : 
                     '#1e40af',
              fontSize: '14px'
            }}>
              {uploadStatus.message}
            </span>
          </div>
        )}

        {/* Upload Tips */}
        <div style={{ 
          marginTop: '24px',
          padding: '20px',
          background: '#f8fafc',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <h4 style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#374151',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📝 File Requirements
          </h4>
          <ul style={{ 
            fontSize: '14px', 
            color: '#6b7280',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#4f46e5' }}>•</span>
              Files must be in <strong>CSV</strong> or <strong>Excel (XLSX/XLS)</strong> format
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#4f46e5' }}>•</span>
              First row must contain column headers
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#4f46e5' }}>•</span>
              Required columns:
              <span style={{ color: '#374151', fontWeight: 500 }}>
                {uploadType === 'sales' && '(invoice_id, customer_id, amount, invoice_date, due_date)'}
                {uploadType === 'purchases' && '(purchase_id, vendor_id, amount, purchase_date, due_date)'}
                {uploadType === 'payments' && '(payment_id, reference_id, party_id, amount, payment_date, payment_type)'}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Uploaded Files Summary */}
      {Object.values(uploadedFiles).some(v => v) && (
        <div style={{ 
          maxWidth: '900px', 
          margin: '24px auto 0',
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          padding: '24px 32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#374151',
            marginBottom: '12px'
          }}>
            📊 Uploaded Files
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {Object.entries(uploadedFiles).map(([key, value]) => (
              value && (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#ecfdf5',
                  color: '#065f46',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: '1px solid #a7f3d0'
                }}>
                  <span>{getTypeIcon(key)}</span>
                  <span>{getTypeLabel(key)}</span>
                  <span style={{ color: '#059669' }}>✓</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}