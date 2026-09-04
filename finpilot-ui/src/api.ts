// src/api.ts
import axios from 'axios';
import type { ExceptionRecord } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Add request interceptor for debugging
api.interceptors.request.use(request => {
  console.log('🚀 Request:', request.method?.toUpperCase(), request.baseURL + request.url);
  return request;
});

export const uploadFile = (type: 'sales' | 'purchases' | 'payments' | 'parties' | 'credit_notes', file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/upload/${type}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getReconcileStreamUrl = (type: 'sales' | 'purchases') =>
  `${API_BASE_URL}/api/reconcile?type=${type}`;

export const fetchExceptions = (status?: string) =>
  api.get<ExceptionRecord[]>('/report/exceptions', { params: { status } });

export const fetchSummary = () =>
  api.get('/report/summary');

export const getCAExport = () =>
  api.get('/report/ca-export');

export const escalateException = (exceptionId: number, options?: { channels?: string[] }) => {
  const channels = options?.channels || ['email', 'whatsapp'];
  return api.post(`/escalate/${exceptionId}`, { channels });
};

// ==================== FOLLOW-UP API FUNCTIONS ====================

export const previewFollowup = (exceptionId: number, customMessage?: string) => {
  return api.post(`/escalate/followup/preview/${exceptionId}`, { customMessage });
};

export const sendFollowup = (exceptionId: number, customMessage?: string) => {
  return api.post(`/escalate/followup/${exceptionId}`, { customMessage });
};

export const recordFollowupReply = (exceptionId: number, reply: string, status?: string) => {
  return api.post(`/escalate/followup/reply/${exceptionId}`, { reply, status });
};


export const getFollowupTracking = () => {
  return api.get('/escalate/followup/tracking');
};

