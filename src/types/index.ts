export interface Category {
  id: number;
  name: string;
  description?: string;
  icon: string;
  parent_id: number | null;
  sort_order: number;
  created_at: string;
  product_count?: number;
}

export type UnitType = 'each' | 'per_foot' | 'per_meter' | 'per_box' | 'per_roll' | 'per_pair' | 'per_set' | 'per_hour' | 'per_month' | 'per_year';

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  each: 'Each',
  per_foot: 'Per Foot',
  per_meter: 'Per Meter',
  per_box: 'Per Box',
  per_roll: 'Per Roll',
  per_pair: 'Per Pair',
  per_set: 'Per Set',
  per_hour: 'Per Hour',
  per_month: 'Per Month',
  per_year: 'Per Year',
};

export interface Product {
  id: number;
  category_id: number | null;
  category_name?: string;
  name: string;
  model_number: string | null;
  description: string | null;
  unit_price: number;
  unit_type: UnitType;
  quantity_per_unit: number;
  sku: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  effective_unit_price?: number;
}

export interface LaborRate {
  id: number;
  name: string;
  rate_per_hour: number;
  description: string | null;
  is_active: number;
  created_at: string;
}

export interface Assembly {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category_name?: string;
  default_labor_rate_id: number | null;
  default_labor_minutes: number;
  default_multiplier: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  components?: AssemblyComponent[];
  labor_rate?: LaborRate;
  total_material_cost?: number;
  total_labor_cost?: number;
  total_cost?: number;
}

export interface AssemblyComponent {
  id: number;
  assembly_id: number;
  product_id: number;
  quantity: number;
  notes: string | null;
  product?: Product;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'archived';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  archived: 'Archived',
};

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-rose-100 text-rose-700',
  archived: 'bg-amber-100 text-amber-700',
};

export interface Quote {
  id: number;
  quote_number: string;
  status: QuoteStatus;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_company: string | null;
  customer_address: string | null;
  job_name: string;
  job_description: string | null;
  scope_of_work: string | null;
  notes: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  discount_type: 'flat' | 'percent';
  total: number;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  expires_at: string | null;
  line_items?: QuoteLineItem[];
}

export type LineItemType = 'product' | 'assembly' | 'custom' | 'labor';

export interface QuoteLineItem {
  id: number;
  quote_id: number;
  sort_order: number;
  item_type: LineItemType;
  product_id: number | null;
  assembly_id: number | null;
  labor_rate_id: number | null;
  description: string | null;
  quantity: number;
  unit_type: string;
  unit_price: number;
  multiplier: number;
  labor_minutes: number;
  labor_rate_override: number | null;
  line_total: number;
  notes: string | null;
  created_at: string;
  category_name?: string | null;
  product?: Product;
  assembly?: Assembly;
  labor_rate?: LaborRate;
}

export interface ImportedProduct {
  name: string;
  model_number: string;
  price: number;
  category_suggestion: string;
  description?: string;
}

export const CATEGORY_ICONS: Record<string, string> = {
  'video-security': 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  'access-control': 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
  'intercom': 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-4h8m-4-8a3 3 0 00-3 3v4a3 3 0 006 0v-4a3 3 0 00-3-3z',
  'sensors': 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z',
  'alarms': 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  'networking': 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0',
  'av': 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  'cabling': 'M13 10V3L4 14h7v7l9-11h-7z',
  'mounts': 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z',
  'box': 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
};
