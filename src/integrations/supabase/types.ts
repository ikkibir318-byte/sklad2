export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      cable_coils: {
        Row: {
          coil_number: string
          created_at: string
          created_by: string | null
          id: string
          meters: number
          notes: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          coil_number: string
          created_at?: string
          created_by?: string | null
          id?: string
          meters?: number
          notes?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          coil_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          meters?: number
          notes?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cable_coils_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cable_products"
            referencedColumns: ["id"]
          },
        ]
      }
      cable_products: {
        Row: {
          batch: string | null
          brand: string
          created_at: string
          created_by: string | null
          cross_section: string
          id: string
          low_stock_threshold: number
          notes: string | null
          purchase_price: number
          sale_price: number
          stock_meters: number
          stock_quantity: number
          supplier: string | null
          unit_type: string
          updated_at: string
        }
        Insert: {
          batch?: string | null
          brand: string
          created_at?: string
          created_by?: string | null
          cross_section: string
          id?: string
          low_stock_threshold?: number
          notes?: string | null
          purchase_price?: number
          sale_price?: number
          stock_meters?: number
          stock_quantity?: number
          supplier?: string | null
          unit_type?: string
          updated_at?: string
        }
        Update: {
          batch?: string | null
          brand?: string
          created_at?: string
          created_by?: string | null
          cross_section?: string
          id?: string
          low_stock_threshold?: number
          notes?: string | null
          purchase_price?: number
          sale_price?: number
          stock_meters?: number
          stock_quantity?: number
          supplier?: string | null
          unit_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          coil_id: string | null
          coil_number_snapshot: string | null
          created_at: string
          id: string
          line_total: number
          meters: number
          quantity: number
          product_id: string
          product_name_snapshot: string
          sale_id: string
          unit_cost: number
          unit_type: string
          unit_price: number
        }
        Insert: {
          coil_id?: string | null
          coil_number_snapshot?: string | null
          created_at?: string
          id?: string
          line_total: number
          meters: number
          quantity?: number
          product_id: string
          product_name_snapshot: string
          sale_id: string
          unit_cost?: number
          unit_type?: string
          unit_price: number
        }
        Update: {
          coil_id?: string | null
          coil_number_snapshot?: string | null
          created_at?: string
          id?: string
          line_total?: number
          meters?: number
          quantity?: number
          product_id?: string
          product_name_snapshot?: string
          sale_id?: string
          unit_cost?: number
          unit_type?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_coil_id_fkey"
            columns: ["coil_id"]
            isOneToOne: false
            referencedRelation: "cable_coils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cable_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cost_total: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          discount: number
          id: string
          notes: string | null
          sold_at: string
          total: number
        }
        Insert: {
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          discount?: number
          id?: string
          notes?: string | null
          sold_at?: string
          total?: number
        }
        Update: {
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          discount?: number
          id?: string
          notes?: string | null
          sold_at?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          change_meters: number
          change_quantity: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          product_id: string
          sale_id: string | null
        }
        Insert: {
          change_meters: number
          change_quantity?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          product_id: string
          sale_id?: string | null
        }
        Update: {
          change_meters?: number
          change_quantity?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          product_id?: string
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cable_products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_sale_item: {
        Args: {
          _coil_id: string
          _meters: number
          _product_id: string
          _sale_id: string
          _unit_price: number
        }
        Returns: string
      }
      adjust_stock: {
        Args: {
          _change_meters: number
          _kind: string
          _note: string
          _product_id: string
        }
        Returns: undefined
      }
      calculate_stock_from_coils: {
        Args: { _product_id: string }
        Returns: number
      }
      create_sale: {
        Args: { _customer_id: string; _items: Json; _notes: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      recompute_sale_totals: { Args: { _sale_id: string }; Returns: undefined }
      return_sale_item: {
        Args: { _meters: number; _note?: string; _sale_item_id: string }
        Returns: undefined
      }
      set_sale_discount: {
        Args: { _discount: number; _sale_id: string }
        Returns: undefined
      }
      set_sale_item_price: {
        Args: { _sale_item_id: string; _unit_price: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
