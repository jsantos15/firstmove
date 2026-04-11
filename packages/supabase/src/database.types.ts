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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      opening_moves: {
        Row: {
          annotation: string | null
          created_at: string
          fen: string
          id: string
          move_number: number
          opening_id: string
          san: string
        }
        Insert: {
          annotation?: string | null
          created_at?: string
          fen: string
          id?: string
          move_number: number
          opening_id: string
          san: string
        }
        Update: {
          annotation?: string | null
          created_at?: string
          fen?: string
          id?: string
          move_number?: number
          opening_id?: string
          san?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_moves_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "openings"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_variations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          opening_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          opening_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          opening_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_variations_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "openings"
            referencedColumns: ["id"]
          },
        ]
      }
      openings: {
        Row: {
          color: Database["public"]["Enums"]["opening_color"]
          created_at: string
          description: string | null
          difficulty: Database["public"]["Enums"]["opening_difficulty"]
          eco_code: string
          id: string
          name: string
          tags: string[]
        }
        Insert: {
          color: Database["public"]["Enums"]["opening_color"]
          created_at?: string
          description?: string | null
          difficulty: Database["public"]["Enums"]["opening_difficulty"]
          eco_code: string
          id?: string
          name: string
          tags?: string[]
        }
        Update: {
          color?: Database["public"]["Enums"]["opening_color"]
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["opening_difficulty"]
          eco_code?: string
          id?: string
          name?: string
          tags?: string[]
        }
        Relationships: []
      }
      repertoire_openings: {
        Row: {
          added_at: string
          opening_id: string
          repertoire_id: string
        }
        Insert: {
          added_at?: string
          opening_id: string
          repertoire_id: string
        }
        Update: {
          added_at?: string
          opening_id?: string
          repertoire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repertoire_openings_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "openings"
            referencedColumns: ["id"]
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
          opening_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          opening_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          opening_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "openings"
            referencedColumns: ["id"]
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
      user_progress: {
        Row: {
          created_at: string
          id: string
          last_practiced_at: string | null
          mastery_level: Database["public"]["Enums"]["mastery_level"]
          opening_id: string
          success_rate: number
          times_practiced: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          mastery_level?: Database["public"]["Enums"]["mastery_level"]
          opening_id: string
          success_rate?: number
          times_practiced?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          mastery_level?: Database["public"]["Enums"]["mastery_level"]
          opening_id?: string
          success_rate?: number
          times_practiced?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "openings"
            referencedColumns: ["id"]
          },
        ]
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
      variation_moves: {
        Row: {
          annotation: string | null
          fen: string
          id: string
          move_number: number
          san: string
          variation_id: string
        }
        Insert: {
          annotation?: string | null
          fen: string
          id?: string
          move_number: number
          san: string
          variation_id: string
        }
        Update: {
          annotation?: string | null
          fen?: string
          id?: string
          move_number?: number
          san?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variation_moves_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "opening_variations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
