export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      lichess_opening_popularity: {
        Row: {
          anchor_fen: string;
          anchor_sans: string[];
          created_at: string;
          eco_code: string;
          family_name: string;
          fetched_at: string | null;
          full_name: string;
          id: number;
          opening_eco_code: string | null;
          popularity_games: number | null;
          type: string;
          variation_name: string | null;
        };
        Insert: {
          anchor_fen: string;
          anchor_sans: string[];
          created_at?: string;
          eco_code: string;
          family_name: string;
          fetched_at?: string | null;
          full_name: string;
          id?: number;
          opening_eco_code?: string | null;
          popularity_games?: number | null;
          type: string;
          variation_name?: string | null;
        };
        Update: {
          anchor_fen?: string;
          anchor_sans?: string[];
          created_at?: string;
          eco_code?: string;
          family_name?: string;
          fetched_at?: string | null;
          full_name?: string;
          id?: number;
          opening_eco_code?: string | null;
          popularity_games?: number | null;
          type?: string;
          variation_name?: string | null;
        };
        Relationships: [];
      };
      opening_lines: {
        Row: {
          created_at: string;
          description: string | null;
          avg_engine_depth: number | null;
          engine_checked: boolean;
          engine_model: string | null;
          engine_provider: string | null;
          eval_cp_by_ply: number[] | null;
          final_eval_cp: number | null;
          final_eval_perspective: Database['public']['Enums']['opening_color'] | null;
          full_name: string | null;
          generation_metadata: Json;
          inclusion_outcome: string | null;
          is_main_line: boolean;
          line_difficulty: Database['public']['Enums']['opening_difficulty'] | null;
          line_kind: string;
          name: string;
          opening_slug: string;
          popularity_games: number | null;
          popularity_rank: number | null;
          popularity_score: number | null;
          primary_category: string | null;
          sans: string[];
          slug: string;
          sort_order: number;
          source_confidence: string | null;
          source_name: string | null;
          variation_depth: number | null;
          variation_anchor_fen: string | null;
          variation_anchor_name: string | null;
          variation_anchor_ply: number | null;
          variation_anchor_sans: string[] | null;
          variation_path: string[] | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          avg_engine_depth?: number | null;
          engine_checked?: boolean;
          engine_model?: string | null;
          engine_provider?: string | null;
          eval_cp_by_ply?: number[] | null;
          final_eval_cp?: number | null;
          final_eval_perspective?: Database['public']['Enums']['opening_color'] | null;
          full_name?: string | null;
          generation_metadata?: Json;
          inclusion_outcome?: string | null;
          is_main_line?: boolean;
          line_difficulty?: Database['public']['Enums']['opening_difficulty'] | null;
          line_kind?: string;
          name: string;
          opening_slug: string;
          popularity_games?: number | null;
          popularity_rank?: number | null;
          popularity_score?: number | null;
          primary_category?: string | null;
          sans: string[];
          slug: string;
          sort_order?: number;
          source_confidence?: string | null;
          source_name?: string | null;
          variation_depth?: number | null;
          variation_anchor_fen?: string | null;
          variation_anchor_name?: string | null;
          variation_anchor_ply?: number | null;
          variation_anchor_sans?: string[] | null;
          variation_path?: string[] | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          avg_engine_depth?: number | null;
          engine_checked?: boolean;
          engine_model?: string | null;
          engine_provider?: string | null;
          eval_cp_by_ply?: number[] | null;
          final_eval_cp?: number | null;
          final_eval_perspective?: Database['public']['Enums']['opening_color'] | null;
          full_name?: string | null;
          generation_metadata?: Json;
          inclusion_outcome?: string | null;
          is_main_line?: boolean;
          line_difficulty?: Database['public']['Enums']['opening_difficulty'] | null;
          line_kind?: string;
          name?: string;
          opening_slug?: string;
          popularity_games?: number | null;
          popularity_rank?: number | null;
          popularity_score?: number | null;
          primary_category?: string | null;
          sans?: string[];
          slug?: string;
          sort_order?: number;
          source_confidence?: string | null;
          source_name?: string | null;
          variation_depth?: number | null;
          variation_anchor_fen?: string | null;
          variation_anchor_name?: string | null;
          variation_anchor_ply?: number | null;
          variation_anchor_sans?: string[] | null;
          variation_path?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'opening_lines_opening_slug_fkey';
            columns: ['opening_slug'];
            isOneToOne: false;
            referencedRelation: 'openings_catalog';
            referencedColumns: ['slug'];
          },
        ];
      };
      opening_line_branch_metadata: {
        Row: {
          advantage_type: string | null;
          branch_key: string;
          branch_score: number | null;
          branch_stem_fen: string;
          branch_stem_ply: number;
          continuation_trace: Json;
          created_at: string;
          eval_after_trigger_cp: number | null;
          eval_before_trigger_cp: number | null;
          eval_gain_cp: number | null;
          final_trained_eval_cp: number | null;
          lesson_title: string | null;
          line_slug: string;
          opening_slug: string;
          parent_line_slug: string;
          parent_opening_slug: string;
          reference_move_san: string | null;
          reference_move_uci: string | null;
          selection_metadata: Json;
          theme_tags: string[];
          trigger_cumulative_play_rate: number | null;
          trigger_move_games: number | null;
          trigger_move_play_rate: number | null;
          trigger_move_san: string;
          trigger_move_uci: string;
          trigger_node_games: number | null;
          trigger_ply: number;
          updated_at: string;
        };
        Insert: {
          advantage_type?: string | null;
          branch_key: string;
          branch_score?: number | null;
          branch_stem_fen: string;
          branch_stem_ply: number;
          continuation_trace?: Json;
          created_at?: string;
          eval_after_trigger_cp?: number | null;
          eval_before_trigger_cp?: number | null;
          eval_gain_cp?: number | null;
          final_trained_eval_cp?: number | null;
          lesson_title?: string | null;
          line_slug: string;
          opening_slug: string;
          parent_line_slug: string;
          parent_opening_slug: string;
          reference_move_san?: string | null;
          reference_move_uci?: string | null;
          selection_metadata?: Json;
          theme_tags?: string[];
          trigger_cumulative_play_rate?: number | null;
          trigger_move_games?: number | null;
          trigger_move_play_rate?: number | null;
          trigger_move_san: string;
          trigger_move_uci: string;
          trigger_node_games?: number | null;
          trigger_ply: number;
          updated_at?: string;
        };
        Update: {
          advantage_type?: string | null;
          branch_key?: string;
          branch_score?: number | null;
          branch_stem_fen?: string;
          branch_stem_ply?: number;
          continuation_trace?: Json;
          created_at?: string;
          eval_after_trigger_cp?: number | null;
          eval_before_trigger_cp?: number | null;
          eval_gain_cp?: number | null;
          final_trained_eval_cp?: number | null;
          lesson_title?: string | null;
          line_slug?: string;
          opening_slug?: string;
          parent_line_slug?: string;
          parent_opening_slug?: string;
          reference_move_san?: string | null;
          reference_move_uci?: string | null;
          selection_metadata?: Json;
          theme_tags?: string[];
          trigger_cumulative_play_rate?: number | null;
          trigger_move_games?: number | null;
          trigger_move_play_rate?: number | null;
          trigger_move_san?: string;
          trigger_move_uci?: string;
          trigger_node_games?: number | null;
          trigger_ply?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'opening_line_branch_metadata_opening_slug_line_slug_fkey';
            columns: ['opening_slug', 'line_slug'];
            isOneToOne: true;
            referencedRelation: 'opening_lines';
            referencedColumns: ['opening_slug', 'slug'];
          },
          {
            foreignKeyName: 'opening_line_branch_metadata_parent_opening_slug_parent_line_slug_fkey';
            columns: ['parent_opening_slug', 'parent_line_slug'];
            isOneToOne: false;
            referencedRelation: 'opening_lines';
            referencedColumns: ['opening_slug', 'slug'];
          },
        ];
      };
      coach_events: {
        Row: {
          analysis_facts: Json;
          classification:
            | 'brilliant'
            | 'great'
            | 'book'
            | 'setup'
            | 'forcing'
            | 'payoff'
            | 'best'
            | 'excellent'
            | 'good'
            | 'inaccuracy'
            | 'mistake'
            | 'blunder'
            | 'miss'
            | 'wrong'
            | 'complete';
          content_version: number;
          created_at: string;
          domain: 'opening_practice' | 'game_analysis' | 'tactics' | 'endgame';
          event_type:
            | 'opening_principle'
            | 'opening_book_move'
            | 'opening_setup'
            | 'opening_forcing'
            | 'opening_deviation'
            | 'tactical_payoff'
            | 'wrong_move'
            | 'line_complete'
            | 'eval_gain'
            | 'eval_loss'
            | 'advantage_gained'
            | 'advantage_lost'
            | 'advantage_preserved'
            | 'missed_win'
            | 'missed_tactic'
            | 'tactic_found'
            | 'best_move'
            | 'only_move'
            | 'brilliant_move'
            | 'great_move'
            | 'good_move'
            | 'inaccuracy'
            | 'mistake'
            | 'blunder'
            | 'king_safety'
            | 'development'
            | 'center_control'
            | 'piece_activity'
            | 'pawn_structure'
            | 'material_trade'
            | 'defensive_resource'
            | 'conversion'
            | 'endgame_transition'
            | 'time_to_simplify'
            | 'game_turning_point'
            | 'phase_summary'
            | 'game_summary';
          id: string;
          message_key: string;
          parent_subject_id: string | null;
          persona: 'friendly' | 'neutral' | 'strict' | 'calm' | 'hype' | 'beginner' | 'technical';
          phase: 'opening' | 'middlegame' | 'endgame' | null;
          ply_index: number;
          severity: 'info' | 'minor' | 'medium' | 'major' | 'critical';
          source: 'opening_practice' | 'engine_analysis' | 'tactical_detector' | 'manual';
          spoken_key: string;
          subject_id: string;
          subject_kind: 'opening_line' | 'game' | 'position' | 'session';
          theme_tags: string[];
          tone: 'neutral' | 'positive' | 'payoff' | 'warning' | 'negative' | 'complete';
          updated_at: string;
          variables: Json;
        };
        Insert: {
          analysis_facts?: Json;
          classification:
            | 'brilliant'
            | 'great'
            | 'book'
            | 'setup'
            | 'forcing'
            | 'payoff'
            | 'best'
            | 'excellent'
            | 'good'
            | 'inaccuracy'
            | 'mistake'
            | 'blunder'
            | 'miss'
            | 'wrong'
            | 'complete';
          content_version?: number;
          created_at?: string;
          domain: 'opening_practice' | 'game_analysis' | 'tactics' | 'endgame';
          event_type:
            | 'opening_principle'
            | 'opening_book_move'
            | 'opening_setup'
            | 'opening_forcing'
            | 'opening_deviation'
            | 'tactical_payoff'
            | 'wrong_move'
            | 'line_complete'
            | 'eval_gain'
            | 'eval_loss'
            | 'advantage_gained'
            | 'advantage_lost'
            | 'advantage_preserved'
            | 'missed_win'
            | 'missed_tactic'
            | 'tactic_found'
            | 'best_move'
            | 'only_move'
            | 'brilliant_move'
            | 'great_move'
            | 'good_move'
            | 'inaccuracy'
            | 'mistake'
            | 'blunder'
            | 'king_safety'
            | 'development'
            | 'center_control'
            | 'piece_activity'
            | 'pawn_structure'
            | 'material_trade'
            | 'defensive_resource'
            | 'conversion'
            | 'endgame_transition'
            | 'time_to_simplify'
            | 'game_turning_point'
            | 'phase_summary'
            | 'game_summary';
          id: string;
          message_key: string;
          parent_subject_id?: string | null;
          persona?: 'friendly' | 'neutral' | 'strict' | 'calm' | 'hype' | 'beginner' | 'technical';
          phase?: 'opening' | 'middlegame' | 'endgame' | null;
          ply_index: number;
          severity: 'info' | 'minor' | 'medium' | 'major' | 'critical';
          source: 'opening_practice' | 'engine_analysis' | 'tactical_detector' | 'manual';
          spoken_key: string;
          subject_id: string;
          subject_kind: 'opening_line' | 'game' | 'position' | 'session';
          theme_tags?: string[];
          tone: 'neutral' | 'positive' | 'payoff' | 'warning' | 'negative' | 'complete';
          updated_at?: string;
          variables?: Json;
        };
        Update: {
          analysis_facts?: Json;
          classification?:
            | 'brilliant'
            | 'great'
            | 'book'
            | 'setup'
            | 'forcing'
            | 'payoff'
            | 'best'
            | 'excellent'
            | 'good'
            | 'inaccuracy'
            | 'mistake'
            | 'blunder'
            | 'miss'
            | 'wrong'
            | 'complete';
          content_version?: number;
          created_at?: string;
          domain?: 'opening_practice' | 'game_analysis' | 'tactics' | 'endgame';
          event_type?:
            | 'opening_principle'
            | 'opening_book_move'
            | 'opening_setup'
            | 'opening_forcing'
            | 'opening_deviation'
            | 'tactical_payoff'
            | 'wrong_move'
            | 'line_complete'
            | 'eval_gain'
            | 'eval_loss'
            | 'advantage_gained'
            | 'advantage_lost'
            | 'advantage_preserved'
            | 'missed_win'
            | 'missed_tactic'
            | 'tactic_found'
            | 'best_move'
            | 'only_move'
            | 'brilliant_move'
            | 'great_move'
            | 'good_move'
            | 'inaccuracy'
            | 'mistake'
            | 'blunder'
            | 'king_safety'
            | 'development'
            | 'center_control'
            | 'piece_activity'
            | 'pawn_structure'
            | 'material_trade'
            | 'defensive_resource'
            | 'conversion'
            | 'endgame_transition'
            | 'time_to_simplify'
            | 'game_turning_point'
            | 'phase_summary'
            | 'game_summary';
          id?: string;
          message_key?: string;
          parent_subject_id?: string | null;
          persona?: 'friendly' | 'neutral' | 'strict' | 'calm' | 'hype' | 'beginner' | 'technical';
          phase?: 'opening' | 'middlegame' | 'endgame' | null;
          ply_index?: number;
          severity?: 'info' | 'minor' | 'medium' | 'major' | 'critical';
          source?: 'opening_practice' | 'engine_analysis' | 'tactical_detector' | 'manual';
          spoken_key?: string;
          subject_id?: string;
          subject_kind?: 'opening_line' | 'game' | 'position' | 'session';
          theme_tags?: string[];
          tone?: 'neutral' | 'positive' | 'payoff' | 'warning' | 'negative' | 'complete';
          updated_at?: string;
          variables?: Json;
        };
        Relationships: [];
      };
      opening_position_evals: {
        Row: {
          best_move_uci: string;
          created_at: string;
          depth: number | null;
          engine_model: string | null;
          fen: string;
          line_count: number;
          lines: Json;
          multipv: number | null;
          ponder_uci: string | null;
          position_key: string;
          provider: string;
          quality: Json;
          raw_eval: Json;
          score_type: string | null;
          score_value: number | null;
          source: string;
          updated_at: string;
          white_score_value: number | null;
        };
        Insert: {
          best_move_uci: string;
          created_at?: string;
          depth?: number | null;
          engine_model?: string | null;
          fen: string;
          line_count?: number;
          lines?: Json;
          multipv?: number | null;
          ponder_uci?: string | null;
          position_key: string;
          provider: string;
          quality?: Json;
          raw_eval?: Json;
          score_type?: string | null;
          score_value?: number | null;
          source: string;
          updated_at?: string;
          white_score_value?: number | null;
        };
        Update: {
          best_move_uci?: string;
          created_at?: string;
          depth?: number | null;
          engine_model?: string | null;
          fen?: string;
          line_count?: number;
          lines?: Json;
          multipv?: number | null;
          ponder_uci?: string | null;
          position_key?: string;
          provider?: string;
          quality?: Json;
          raw_eval?: Json;
          score_type?: string | null;
          score_value?: number | null;
          source?: string;
          updated_at?: string;
          white_score_value?: number | null;
        };
        Relationships: [];
      };
      opening_positions: {
        Row: {
          created_at: string;
          eco_code: string;
          family: string;
          fen: string;
          name: string;
          pgn: string;
          ply: number;
          position_key: string;
          sans: string[];
          source: string;
          updated_at: string;
          variation: string | null;
        };
        Insert: {
          created_at?: string;
          eco_code: string;
          family: string;
          fen: string;
          name: string;
          pgn: string;
          ply: number;
          position_key: string;
          sans: string[];
          source?: string;
          updated_at?: string;
          variation?: string | null;
        };
        Update: {
          created_at?: string;
          eco_code?: string;
          family?: string;
          fen?: string;
          name?: string;
          pgn?: string;
          ply?: number;
          position_key?: string;
          sans?: string[];
          source?: string;
          updated_at?: string;
          variation?: string | null;
        };
        Relationships: [];
      };
      openings_catalog: {
        Row: {
          color: Database['public']['Enums']['opening_color'];
          created_at: string;
          description: string;
          display_tier: string | null;
          difficulty: Database['public']['Enums']['opening_difficulty'];
          eco_code: string;
          has_main_line: boolean;
          is_featured: boolean | null;
          name: string;
          popularity_games: number | null;
          popularity_rank: number | null;
          popularity_score: number | null;
          preview_fen: string | null;
          slug: string;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          color: Database['public']['Enums']['opening_color'];
          created_at?: string;
          description?: string;
          display_tier?: string | null;
          difficulty: Database['public']['Enums']['opening_difficulty'];
          eco_code: string;
          has_main_line?: boolean;
          is_featured?: boolean | null;
          name: string;
          popularity_games?: number | null;
          popularity_rank?: number | null;
          popularity_score?: number | null;
          preview_fen?: string | null;
          slug: string;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          color?: Database['public']['Enums']['opening_color'];
          created_at?: string;
          description?: string;
          display_tier?: string | null;
          difficulty?: Database['public']['Enums']['opening_difficulty'];
          eco_code?: string;
          has_main_line?: boolean;
          is_featured?: boolean | null;
          name?: string;
          popularity_games?: number | null;
          popularity_rank?: number | null;
          popularity_score?: number | null;
          preview_fen?: string | null;
          slug?: string;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      repertoire_openings: {
        Row: {
          added_at: string;
          opening_slug: string;
          repertoire_id: string;
        };
        Insert: {
          added_at?: string;
          opening_slug: string;
          repertoire_id: string;
        };
        Update: {
          added_at?: string;
          opening_slug?: string;
          repertoire_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'repertoire_openings_opening_slug_fkey';
            columns: ['opening_slug'];
            isOneToOne: false;
            referencedRelation: 'openings_catalog';
            referencedColumns: ['slug'];
          },
          {
            foreignKeyName: 'repertoire_openings_repertoire_id_fkey';
            columns: ['repertoire_id'];
            isOneToOne: false;
            referencedRelation: 'user_repertoires';
            referencedColumns: ['id'];
          },
        ];
      };
      user_games: {
        Row: {
          black: string | null;
          black_accuracy: number | null;
          black_avatar_url: string | null;
          black_country: string | null;
          black_elo: string | null;
          black_result: string | null;
          clock_increment_seconds: number | null;
          clock_initial_seconds: number | null;
          created_at: string;
          eco: string | null;
          event: string | null;
          fen: string | null;
          id: string;
          imported_username: string | null;
          label: string | null;
          opening_name: string | null;
          pgn: string;
          played_date: string | null;
          provider_data: Json | null;
          rated: boolean | null;
          result: string | null;
          round: string | null;
          site: string | null;
          source: string;
          source_game_id: string | null;
          source_url: string | null;
          termination: string | null;
          time_class: string | null;
          time_control: string | null;
          user_id: string;
          variant: string | null;
          white: string | null;
          white_accuracy: number | null;
          white_avatar_url: string | null;
          white_country: string | null;
          white_elo: string | null;
          white_result: string | null;
        };
        Insert: {
          black?: string | null;
          black_accuracy?: number | null;
          black_avatar_url?: string | null;
          black_country?: string | null;
          black_elo?: string | null;
          black_result?: string | null;
          clock_increment_seconds?: number | null;
          clock_initial_seconds?: number | null;
          created_at?: string;
          eco?: string | null;
          event?: string | null;
          fen?: string | null;
          id?: string;
          imported_username?: string | null;
          label?: string | null;
          opening_name?: string | null;
          pgn: string;
          played_date?: string | null;
          provider_data?: Json | null;
          rated?: boolean | null;
          result?: string | null;
          round?: string | null;
          site?: string | null;
          source?: string;
          source_game_id?: string | null;
          source_url?: string | null;
          termination?: string | null;
          time_class?: string | null;
          time_control?: string | null;
          user_id: string;
          variant?: string | null;
          white?: string | null;
          white_accuracy?: number | null;
          white_avatar_url?: string | null;
          white_country?: string | null;
          white_elo?: string | null;
          white_result?: string | null;
        };
        Update: {
          black?: string | null;
          black_accuracy?: number | null;
          black_avatar_url?: string | null;
          black_country?: string | null;
          black_elo?: string | null;
          black_result?: string | null;
          clock_increment_seconds?: number | null;
          clock_initial_seconds?: number | null;
          created_at?: string;
          eco?: string | null;
          event?: string | null;
          fen?: string | null;
          id?: string;
          imported_username?: string | null;
          label?: string | null;
          opening_name?: string | null;
          pgn?: string;
          played_date?: string | null;
          provider_data?: Json | null;
          rated?: boolean | null;
          result?: string | null;
          round?: string | null;
          site?: string | null;
          source?: string;
          source_game_id?: string | null;
          source_url?: string | null;
          termination?: string | null;
          time_class?: string | null;
          time_control?: string | null;
          user_id?: string;
          variant?: string | null;
          white?: string | null;
          white_accuracy?: number | null;
          white_avatar_url?: string | null;
          white_country?: string | null;
          white_elo?: string | null;
          white_result?: string | null;
        };
        Relationships: [];
      };
      user_favorites: {
        Row: {
          added_at: string;
          opening_slug: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          opening_slug: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          opening_slug?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_favorites_opening_slug_fkey';
            columns: ['opening_slug'];
            isOneToOne: false;
            referencedRelation: 'openings_catalog';
            referencedColumns: ['slug'];
          },
        ];
      };
      user_profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          skill_level: Database['public']['Enums']['opening_difficulty'] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          skill_level?: Database['public']['Enums']['opening_difficulty'] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          skill_level?: Database['public']['Enums']['opening_difficulty'] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_repertoires: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_variation_progress: {
        Row: {
          created_at: string;
          has_learned: boolean;
          id: string;
          last_practiced_at: string;
          opening_slug: string;
          times_completed: number;
          updated_at: string;
          user_id: string;
          variation_slug: string;
        };
        Insert: {
          created_at?: string;
          has_learned?: boolean;
          id?: string;
          last_practiced_at?: string;
          opening_slug: string;
          times_completed?: number;
          updated_at?: string;
          user_id: string;
          variation_slug: string;
        };
        Update: {
          created_at?: string;
          has_learned?: boolean;
          id?: string;
          last_practiced_at?: string;
          opening_slug?: string;
          times_completed?: number;
          updated_at?: string;
          user_id?: string;
          variation_slug?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      opening_index: {
        Row: {
          anchor_fen: string | null;
          anchor_sans: string[] | null;
          course_color: Database['public']['Enums']['opening_color'] | null;
          course_description: string | null;
          course_difficulty: Database['public']['Enums']['opening_difficulty'] | null;
          course_display_tier: string | null;
          course_has_main_line: boolean | null;
          course_is_featured: boolean | null;
          course_line_count: number | null;
          course_preview_fen: string | null;
          course_slug: string | null;
          course_tags: string[] | null;
          eco_code: string | null;
          family_name: string | null;
          fetched_at: string | null;
          name: string | null;
          popularity_games: number | null;
          popularity_id: number | null;
          practical_branch_count: number | null;
          reference_line_count: number | null;
          reference_line_names: string[] | null;
          reference_line_slugs: string[] | null;
          variation_count: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      handle_new_user: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      handle_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      increment_variation_completion: {
        Args: {
          p_opening_slug: string;
          p_user_id: string;
          p_variation_slug: string;
        };
        Returns: undefined;
      };
      record_variation_learned: {
        Args: {
          p_opening_slug: string;
          p_user_id: string;
          p_variation_slug: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      mastery_level: 'new' | 'learning' | 'familiar' | 'mastered';
      opening_color: 'white' | 'black';
      opening_difficulty: 'beginner' | 'intermediate' | 'advanced';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      mastery_level: ['new', 'learning', 'familiar', 'mastered'],
      opening_color: ['white', 'black'],
      opening_difficulty: ['beginner', 'intermediate', 'advanced'],
    },
  },
} as const;
