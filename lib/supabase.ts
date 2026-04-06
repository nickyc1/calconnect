import { createClient } from '@supabase/supabase-js';
import { User, UserAccount, EventMapping, WatchChannel, WebhookEvent } from './types';

// Database schema types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at'>>;
      };
      user_accounts: {
        Row: UserAccount;
        Insert: Omit<UserAccount, 'id' | 'created_at'>;
        Update: Partial<Omit<UserAccount, 'id' | 'created_at'>>;
      };
      event_mappings: {
        Row: EventMapping;
        Insert: Omit<EventMapping, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EventMapping, 'id' | 'created_at'>>;
      };
      watch_channels: {
        Row: WatchChannel;
        Insert: Omit<WatchChannel, 'id' | 'created_at'>;
        Update: Partial<Omit<WatchChannel, 'id' | 'created_at'>>;
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Omit<WebhookEvent, 'id' | 'processed_at'>;
        Update: Partial<WebhookEvent>;
      };
    };
  };
}

// Create Supabase client with service role (for backend operations)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Alias for consistency
export const supabaseAdmin = supabase;

// Create Supabase client with anon key (for frontend operations)
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
