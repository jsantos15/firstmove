export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      opening_lines: {
        Row: {
          created_at: string
          description: string | null
          engine_checked: boolean
          eval_cp_by_ply: number[] | null
          final_eval_cp: number | null
          final_eval_perspective: Database["public"]["Enums"]["opening_color"] | null
          full_name: string | null
          inclusion_outcome: string | null
          is_main_line: boolean
          line_difficulty: Database["public"]["Enums"]["opening_difficulty"] | null
          name: string
          opening_slug: string
          popularity_games: number | null
          popularity_rank: number | null
          popularity_score: number | null
          primary_category: string | null
          sans: string[]
          slug: string
          sort_order: number
          source_confidence: string | null
          source_name: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          engine_checked?: boolean
          eval_cp_by_ply?: number[] | null
          final_eval_cp?: number | null
          final_eval_perspective?: Database["public"]["Enums"]["opening_color"] | null
          full_name?: string | null
          inclusion_outcome?: string | null
          is_main_line?: boolean
          line_difficulty?: Database["public"]["Enums"]["opening_difficulty"] | null
          name: string
          opening_slug: string
          popularity_games?: number | null
          popularity_rank?: number | null
          popularity_score?: number | null
          primary_category?: string | null
          sans: string[]
          slug: string
          sort_order?: number
          source_confidence?: string | null
          source_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          engine_checked?: boolean
          eval_cp_by_ply?: number[] | null
          final_eval_cp?: number | null
          final_eval_perspective?: Database["public"]["Enums"]["opening_color"] | null
          full_name?: string | null
          inclusion_outcome?: string | null
          is_main_line?: boolean
          line_difficulty?: Database["public"]["Enums"]["opening_difficulty"] | null
          name?: string
          opening_slug?: string
          popularity_games?: number | null
          popularity_rank?: number | null
          popularity_score?: number | null
          primary_category?: string | null
          sans?: string[]
          slug?: string
          sort_order?: number
          source_confidence?: string | null
          source_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_lines_opening_slug_fkey"
            columns: ["opening_slug"]
            isOneToOne: false
            referencedRelation: "openings_catalog"
            referencedColumns: ["slug"]
          },
        ]
      }
      openings_catalog: {
        Row: {
          color: Database["public"]["Enums"]["opening_color"]
          created_at: string
          description: string
          display_tier: string | null
          difficulty: Database["public"]["Enums"]["opening_difficulty"]
          eco_code: string
          has_main_line: boolean
          is_featured: boolean | null
          name: string
          popularity_games: number | null
          popularity_rank: number | null
          popularity_score: number | null
          slug: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          color: Database["public"]["Enums"]["opening_color"]
          created_at?: string
          description?: string
          display_tier?: string | null
          difficulty: Database["public"]["Enums"]["opening_difficulty"]
          eco_code: string
          has_main_line?: boolean
          is_featured?: boolean | null
          name: string
          popularity_games?: number | null
          popularity_rank?: number | null
          popularity_score?: number | null
          slug: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          color?: Database["public"]["Enums"]["opening_color"]
          created_at?: string
          description?: string
          display_tier?: string | null
          difficulty?: Database["public"]["Enums"]["opening_difficulty"]
          eco_code?: string
          has_main_line?: boolean
          is_featured?: boolean | null
          name?: string
          popularity_games?: number | null
          popularity_rank?: number | null
          popularity_score?: number | null
          slug?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      repertoire_openings: {
        Row: {
          added_at: string
          opening_slug: string
          repertoire_id: string
        }
        Insert: {
          added_at?: string
          opening_slug: string
          repertoire_id: string
        }
        Update: {
          added_at?: string
          opening_slug?: string
          repertoire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repertoire_openings_opening_slug_fkey"
            columns: ["opening_slug"]
            isOneToOne: false
            referencedRelation: "openings_catalog"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "repertoire_openings_repertoire_id_fkey"
            columns: ["repertoire_id"]
            isOneToOne: false
            referencedRelation: "user_repertoires"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorites: {
        Row: {
          added_at: string
          opening_slug: string
          user_id: string
        }
        Insert: {
          added_at?: string
          opening_slug: string
          user_id: string
        }
        Update: {
          added_at?: string
          opening_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_opening_slug_fkey"
            columns: ["opening_slug"]
            isOneToOne: false
            referencedRelation: "openings_catalog"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          skill_level: Database["public"]["Enums"]["opening_difficulty"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          skill_level?: Database["public"]["Enums"]["opening_difficulty"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          skill_level?: Database["public"]["Enums"]["opening_difficulty"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_repertoires: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_variation_progress: {
        Row: {
          created_at: string
          has_learned: boolean
          id: string
          last_practiced_at: string
          opening_slug: string
          times_completed: number
          updated_at: string
          user_id: string
          variation_slug: string
        }
        Insert: {
          created_at?: string
          has_learned?: boolean
          id?: string
          last_practiced_at?: string
          opening_slug: string
          times_completed?: number
          updated_at?: string
          user_id: string
          variation_slug: string
        }
        Update: {
          created_at?: string
          has_learned?: boolean
          id?: string
          last_practiced_at?: string
          opening_slug?: string
          times_completed?: number
          updated_at?: string
          user_id?: string
          variation_slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      handle_updated_at: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      increment_variation_completion: {
        Args: {
          p_opening_slug: string
          p_user_id: string
          p_variation_slug: string
        }
        Returns: undefined
      }
      record_variation_learned: {
        Args: {
          p_opening_slug: string
          p_user_id: string
          p_variation_slug: string
        }
        Returns: undefined
      }
    }
    Enums: {
      mastery_level: "new" | "learning" | "familiar" | "mastered"
      opening_color: "white" | "black"
      opening_difficulty: "beginner" | "intermediate" | "advanced"
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
      mastery_level: ["new", "learning", "familiar", "mastered"],
      opening_color: ["white", "black"],
      opening_difficulty: ["beginner", "intermediate", "advanced"],
    },
  },
} as const
