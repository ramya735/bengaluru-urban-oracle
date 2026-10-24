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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          created_at: string
          details: Json | null
          event: string
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      copilot_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          scenario_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          scenario_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          scenario_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_registry: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          name: string
          source: string
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          name: string
          source: string
          status: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      gis_features: {
        Row: {
          id: string
          lat: number
          layer: string
          lng: number
          name: string
        }
        Insert: {
          id?: string
          lat: number
          layer: string
          lng: number
          name: string
        }
        Update: {
          id?: string
          lat?: number
          layer?: string
          lng?: number
          name?: string
        }
        Relationships: []
      }
      planning_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          document_id: string
          id: string
        }
        Insert: {
          chunk_index: number
          content: string
          document_id: string
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "planning_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_documents: {
        Row: {
          caution: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          caution: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          caution?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          created_at: string
          description: string | null
          development_type: string
          geocoded_from: string | null
          id: string
          infrastructure_intervention: string
          lat: number | null
          lng: number | null
          location_label: string | null
          name: string
          radius_m: number | null
          transport_intervention: string
          units: number
          user_id: string
          zone_id: string | null
          zone_name: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          development_type: string
          geocoded_from?: string | null
          id?: string
          infrastructure_intervention?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          name: string
          radius_m?: number | null
          transport_intervention?: string
          units: number
          user_id: string
          zone_id?: string | null
          zone_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          development_type?: string
          geocoded_from?: string | null
          id?: string
          infrastructure_intervention?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          name?: string
          radius_m?: number | null
          transport_intervention?: string
          units?: number
          user_id?: string
          zone_id?: string | null
          zone_name?: string | null
        }
        Relationships: []
      }
      simulation_results: {
        Row: {
          created_at: string
          design_options: Json | null
          evidence: Json | null
          id: string
          impact_interpretation: Json | null
          result: Json
          scenario_id: string
          spatial_context: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          design_options?: Json | null
          evidence?: Json | null
          id?: string
          impact_interpretation?: Json | null
          result: Json
          scenario_id: string
          spatial_context?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          design_options?: Json | null
          evidence?: Json | null
          id?: string
          impact_interpretation?: Json | null
          result?: Json
          scenario_id?: string
          spatial_context?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          area_km2: number
          baseline_traffic: number
          color: string
          electricity_capacity: number
          electricity_demand: number
          id: string
          land_use: string
          lat: number
          lng: number
          name: string
          population: number
          road_capacity: number
          water_capacity: number
          water_demand: number
        }
        Insert: {
          area_km2: number
          baseline_traffic: number
          color: string
          electricity_capacity: number
          electricity_demand: number
          id: string
          land_use: string
          lat: number
          lng: number
          name: string
          population: number
          road_capacity: number
          water_capacity: number
          water_demand: number
        }
        Update: {
          area_km2?: number
          baseline_traffic?: number
          color?: string
          electricity_capacity?: number
          electricity_demand?: number
          id?: string
          land_use?: string
          lat?: number
          lng?: number
          name?: string
          population?: number
          road_capacity?: number
          water_capacity?: number
          water_demand?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "planner" | "analyst" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "planner", "analyst", "viewer"],
    },
  },
} as const
