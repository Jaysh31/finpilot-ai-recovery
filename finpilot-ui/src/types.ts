// src/types.ts
export interface SalesRecord {
    invoice_id: string;
    customer_id: string;
    customer_name: string;
    amount: number;
    invoice_date: string;
    due_date: string;
  }
  
  export interface PurchaseRecord {
    purchase_id: string;
    vendor_id: string;
    vendor_name: string;
    amount: number;
    purchase_date: string;
    due_date: string;
  }
  
  export interface PaymentRecord {
    payment_id: string;
    reference_id: string;
    party_id: string;
    amount: number;
    payment_date: string;
    payment_type: 'receivable' | 'payable';
    raw_note: string;
  }
  
  export type ExceptionStatus = 'matched' | 'partial_payment' | 'pending' | 'overdue' | 'exception';
  export type ResolvedByTier = 'rule' | 'groq' | 'claude';
  
  // src/types.ts
// src/types.ts
export interface ExceptionRecord {
  id: number;
  record_type: string;
  record_id: string;
  payment_id?: string;
  status: string;
  resolved_by_tier: string;
  confidence?: number;
  evidence?: string[];
  recommended_action?: string;
  escalated_at?: string;
  escalated_to?: string;
  created_at: string;
  // Follow-up fields
  followup_sent_at?: string;
  followup_sent_to?: string;
  followup_message_id?: string;
  followup_status?: string;
  followup_reply?: string;
  followup_reply_at?: string;
  // WhatsApp fields
  whatsapp_sid?: string;
  whatsapp_sent_to?: string;
  whatsapp_status?: string;
  whatsapp_reply?: string;
  whatsapp_replied_at?: string;
}
  
  // For the SSE events from /api/reconcile
  export interface ReconcileProgressEvent {
    stage: string;
    record?: string;
    message?: string;
    result?: {
      decision?: string;
      status?: string;
      reasoning?: string;
      confidence?: number;
    };
    toolCall?: {
      tool: string;
      input: any;
      output: any;
    };
    stats?: {
      total: number;
      matched: number;
      partial: number;
      pending: number;
      overdue: number;
      exception: number;
    };
  }