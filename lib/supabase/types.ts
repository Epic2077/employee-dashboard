export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          username_key: string | null;
          full_name: string;
          employee_code: string | null;
          email: string | null;
          department: string | null;
          department_id: string | null;
          role: "employee" | "manager" | "ceo" | "admin" | "owner";
          avatar_url: string | null;
          must_change_password: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          employee_code?: string | null;
          email?: string | null;
          department?: string | null;
          department_id?: string | null;
          role?: "employee" | "manager" | "ceo" | "admin" | "owner";
          avatar_url?: string | null;
          must_change_password?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          employee_code?: string | null;
          email?: string | null;
          department?: string | null;
          department_id?: string | null;
          role?: "employee" | "manager" | "ceo" | "admin" | "owner";
          avatar_url?: string | null;
          must_change_password?: boolean;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: number;
          price_per_day_irt: number;
          min_lead_days: number;
          max_advance_days: number;
          coffee_price_per_shot_irt: number;
          coffee_max_shots_per_day: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          price_per_day_irt?: number;
          min_lead_days?: number;
          max_advance_days?: number;
          coffee_price_per_shot_irt?: number;
          coffee_max_shots_per_day?: number;
          updated_at?: string;
        };
        Update: {
          price_per_day_irt?: number;
          min_lead_days?: number;
          max_advance_days?: number;
          coffee_price_per_shot_irt?: number;
          coffee_max_shots_per_day?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      weekly_menu: {
        Row: {
          weekday: number;
          main_dish: string;
          side_or_drink: string | null;
          tag: string | null;
          is_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          weekday: number;
          main_dish: string;
          side_or_drink?: string | null;
          tag?: string | null;
          is_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          main_dish?: string;
          side_or_drink?: string | null;
          tag?: string | null;
          is_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      menu_overrides: {
        Row: {
          service_date: string;
          main_dish: string | null;
          side_or_drink: string | null;
          tag: string | null;
          is_closed: boolean;
          updated_at: string;
        };
        Insert: {
          service_date: string;
          main_dish?: string | null;
          side_or_drink?: string | null;
          tag?: string | null;
          is_closed?: boolean;
          updated_at?: string;
        };
        Update: {
          main_dish?: string | null;
          side_or_drink?: string | null;
          tag?: string | null;
          is_closed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      lunch_reservations: {
        Row: {
          id: string;
          user_id: string;
          service_date: string;
          price_irt: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          service_date: string;
          price_irt?: number;
          created_at?: string;
        };
        Update: {
          service_date?: string;
          price_irt?: number;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          slug: string;
          name: string;
          unit_label: string;
          description: string | null;
          price_irt: number;
          max_per_day: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          unit_label?: string;
          description?: string | null;
          price_irt?: number;
          max_per_day?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          unit_label?: string;
          description?: string | null;
          price_irt?: number;
          max_per_day?: number;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_orders: {
        Row: {
          id: string;
          user_id: string;
          service_id: string;
          service_date: string;
          quantity: number;
          unit_price_irt: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          service_id: string;
          service_date: string;
          quantity: number;
          unit_price_irt?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          service_date?: string;
          quantity?: number;
          unit_price_irt?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          name: string;
          manager_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          manager_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          manager_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      digital_settings: {
        Row: {
          id: number;
          self_service_enabled: boolean;
          default_inbound_ids: number[];
          manager_quota_cap: number;
          sub_base_url: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          self_service_enabled?: boolean;
          default_inbound_ids?: number[];
          manager_quota_cap?: number;
          sub_base_url?: string | null;
          updated_at?: string;
        };
        Update: {
          self_service_enabled?: boolean;
          default_inbound_ids?: number[];
          manager_quota_cap?: number;
          sub_base_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      v2ray_quotas: {
        Row: {
          user_id: string;
          max_configs: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          max_configs?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          max_configs?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      v2ray_configs: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          client_id: string;
          sub_id: string;
          email: string;
          inbound_ids: number[];
          status: "active" | "revoked" | "error";
          traffic_limit_gb: number | null;
          expires_on: string | null;
          error_message: string | null;
          created_by: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          client_id: string;
          sub_id: string;
          email: string;
          inbound_ids?: number[];
          status?: "active" | "revoked" | "error";
          traffic_limit_gb?: number | null;
          expires_on?: string | null;
          error_message?: string | null;
          created_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "active" | "revoked" | "error";
          inbound_ids?: number[];
          error_message?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          role: "employee" | "manager" | "ceo" | "admin" | "owner";
          capability: string;
          scope: "none" | "self" | "team" | "all";
          updated_at: string;
        };
        Insert: {
          role: "employee" | "manager" | "ceo" | "admin" | "owner";
          capability: string;
          scope: "none" | "self" | "team" | "all";
          updated_at?: string;
        };
        Update: {
          scope?: "none" | "self" | "team" | "all";
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      resolve_login_email: {
        Args: { p_username: string };
        Returns: string | null;
      };
      can_reserve: {
        Args: { p_service_date: string };
        Returns: boolean;
      };
      normalize_username: {
        Args: { p_username: string };
        Returns: string | null;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
