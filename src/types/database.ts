export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_runs: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          input_hash: string | null
          kind: Database["public"]["Enums"]["aiau_ai_run_kind"]
          requested_by: string
          started_at: string | null
          status: Database["public"]["Enums"]["aiau_ai_run_status"]
          trip_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input_hash?: string | null
          kind: Database["public"]["Enums"]["aiau_ai_run_kind"]
          requested_by: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["aiau_ai_run_status"]
          trip_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input_hash?: string | null
          kind?: Database["public"]["Enums"]["aiau_ai_run_kind"]
          requested_by?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["aiau_ai_run_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string
          author_name: string
          created_at: string
          deleted_at: string | null
          id: string
          processed: boolean
          processed_at: string | null
          text: string
          trip_id: string
        }
        Insert: {
          author_id: string
          author_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          processed?: boolean
          processed_at?: string | null
          text: string
          trip_id: string
        }
        Update: {
          author_id?: string
          author_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          processed?: boolean
          processed_at?: string | null
          text?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      note_operations: {
        Row: {
          actor_id: string | null
          after_state: Json
          before_state: Json | null
          created_at: string
          id: string
          note_id: string | null
          op: string
          reverted_at: string | null
          reverted_by: string | null
          run_id: string | null
          source_message_id: string | null
          trip_id: string
        }
        Insert: {
          actor_id?: string | null
          after_state: Json
          before_state?: Json | null
          created_at?: string
          id?: string
          note_id?: string | null
          op: string
          reverted_at?: string | null
          reverted_by?: string | null
          run_id?: string | null
          source_message_id?: string | null
          trip_id: string
        }
        Update: {
          actor_id?: string | null
          after_state?: Json
          before_state?: Json | null
          created_at?: string
          id?: string
          note_id?: string | null
          op?: string
          reverted_at?: string | null
          reverted_by?: string | null
          run_id?: string | null
          source_message_id?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_operations_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_operations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_operations_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_operations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          attrs: Json
          author_id: string | null
          created_at: string
          deleted_at: string | null
          hold_reason: string | null
          id: string
          memo: string | null
          origin: Database["public"]["Enums"]["aiau_note_origin"]
          revision: number
          source_message_id: string | null
          status: Database["public"]["Enums"]["aiau_note_status"]
          title: string
          trip_id: string
          updated_at: string
          user_touched: boolean
          x: number
          y: number
        }
        Insert: {
          attrs?: Json
          author_id?: string | null
          created_at?: string
          deleted_at?: string | null
          hold_reason?: string | null
          id?: string
          memo?: string | null
          origin: Database["public"]["Enums"]["aiau_note_origin"]
          revision?: number
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["aiau_note_status"]
          title: string
          trip_id: string
          updated_at?: string
          user_touched?: boolean
          x?: number
          y?: number
        }
        Update: {
          attrs?: Json
          author_id?: string | null
          created_at?: string
          deleted_at?: string | null
          hold_reason?: string | null
          id?: string
          memo?: string | null
          origin?: Database["public"]["Enums"]["aiau_note_origin"]
          revision?: number
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["aiau_note_status"]
          title?: string
          trip_id?: string
          updated_at?: string
          user_touched?: boolean
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "notes_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          link: string | null
          plan_id: string | null
          read_at: string | null
          title: string
          trip_id: string | null
          type: Database["public"]["Enums"]["aiau_notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          plan_id?: string | null
          read_at?: string | null
          title: string
          trip_id?: string | null
          type: Database["public"]["Enums"]["aiau_notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          plan_id?: string | null
          read_at?: string | null
          title?: string
          trip_id?: string | null
          type?: Database["public"]["Enums"]["aiau_notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_conflicts: {
        Row: {
          base_revision: number
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          local_state: Json
          resolution:
            | Database["public"]["Enums"]["aiau_offline_resolution"]
            | null
          resolved_at: string | null
          server_revision: number
          server_state: Json
          status: Database["public"]["Enums"]["aiau_offline_conflict_status"]
          user_id: string
        }
        Insert: {
          base_revision: number
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          local_state: Json
          resolution?:
            | Database["public"]["Enums"]["aiau_offline_resolution"]
            | null
          resolved_at?: string | null
          server_revision: number
          server_state: Json
          status?: Database["public"]["Enums"]["aiau_offline_conflict_status"]
          user_id: string
        }
        Update: {
          base_revision?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          local_state?: Json
          resolution?:
            | Database["public"]["Enums"]["aiau_offline_resolution"]
            | null
          resolved_at?: string | null
          server_revision?: number
          server_state?: Json
          status?: Database["public"]["Enums"]["aiau_offline_conflict_status"]
          user_id?: string
        }
        Relationships: []
      }
      personal_events: {
        Row: {
          all_day: boolean
          attrs: Json
          created_at: string
          deleted_at: string | null
          end_at: string
          id: string
          reminder_minutes: number | null
          revision: number
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          attrs?: Json
          created_at?: string
          deleted_at?: string | null
          end_at: string
          id?: string
          reminder_minutes?: number | null
          revision?: number
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          attrs?: Json
          created_at?: string
          deleted_at?: string | null
          end_at?: string
          id?: string
          reminder_minutes?: number | null
          revision?: number
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_options: {
        Row: {
          attrs: Json
          created_at: string
          deleted_at: string | null
          end_at: string
          id: string
          kind: Database["public"]["Enums"]["aiau_plan_option_kind"]
          note_id: string | null
          reason: string | null
          revision: number
          slot_id: string
          start_at: string
          title: string
          updated_at: string
          user_touched: boolean
        }
        Insert: {
          attrs?: Json
          created_at?: string
          deleted_at?: string | null
          end_at: string
          id?: string
          kind?: Database["public"]["Enums"]["aiau_plan_option_kind"]
          note_id?: string | null
          reason?: string | null
          revision?: number
          slot_id: string
          start_at: string
          title: string
          updated_at?: string
          user_touched?: boolean
        }
        Update: {
          attrs?: Json
          created_at?: string
          deleted_at?: string | null
          end_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["aiau_plan_option_kind"]
          note_id?: string | null
          reason?: string | null
          revision?: number
          slot_id?: string
          start_at?: string
          title?: string
          updated_at?: string
          user_touched?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_options_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_options_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "plan_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_slots: {
        Row: {
          confirmed_option_id: string | null
          created_at: string
          deleted_at: string | null
          end_at: string
          id: string
          plan_id: string
          revision: number
          start_at: string
          status: Database["public"]["Enums"]["aiau_plan_slot_status"]
          updated_at: string
        }
        Insert: {
          confirmed_option_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_at: string
          id?: string
          plan_id: string
          revision?: number
          start_at: string
          status?: Database["public"]["Enums"]["aiau_plan_slot_status"]
          updated_at?: string
        }
        Update: {
          confirmed_option_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_at?: string
          id?: string
          plan_id?: string
          revision?: number
          start_at?: string
          status?: Database["public"]["Enums"]["aiau_plan_slot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_slots_confirmed_option_fkey"
            columns: ["confirmed_option_id"]
            isOneToOne: false
            referencedRelation: "plan_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_slots_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          actor_id: string | null
          created_at: string
          plan_id: string
          snapshot: Json
          source: string
          summary: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          plan_id: string
          snapshot: Json
          source: string
          summary: string
          version: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          plan_id?: string
          snapshot?: Json
          source?: string
          summary?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          created_by: string
          current_version: number
          id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version?: number
          id?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version?: number
          id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_reminder_minutes: number
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_reminder_minutes?: number
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_reminder_minutes?: number
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_rate_limits: {
        Row: {
          expires_at: string
          request_count: number
          token_hash: string
          window_start: string
        }
        Insert: {
          expires_at: string
          request_count?: number
          token_hash: string
          window_start: string
        }
        Update: {
          expires_at?: string
          request_count?: number
          token_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          expires_at: string | null
          id: string
          p256dh: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          expires_at?: string | null
          id?: string
          p256dh: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          expires_at?: string | null
          id?: string
          p256dh?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          plan_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          plan_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          revoked_at: string | null
          token_hash: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          token_hash: string
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          token_hash?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          joined_at: string
          nickname: string
          role: Database["public"]["Enums"]["aiau_member_role"]
          trip_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          nickname: string
          role?: Database["public"]["Enums"]["aiau_member_role"]
          trip_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          nickname?: string
          role?: Database["public"]["Enums"]["aiau_member_role"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget: number | null
          created_at: string
          created_by: string
          currency: string
          ends_at: string | null
          id: string
          origin: string | null
          revision: number
          starts_at: string | null
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          created_by: string
          currency?: string
          ends_at?: string | null
          id?: string
          origin?: string | null
          revision?: number
          starts_at?: string | null
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          ends_at?: string | null
          id?: string
          origin?: string | null
          revision?: number
          starts_at?: string | null
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          option_id: string
          slot_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          slot_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          slot_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_option_id_slot_id_fkey"
            columns: ["option_id", "slot_id"]
            isOneToOne: false
            referencedRelation: "plan_options"
            referencedColumns: ["id", "slot_id"]
          },
          {
            foreignKeyName: "votes_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "plan_slots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_note_operations: {
        Args: { p_operations: Json; p_run_id: string; p_trip_id: string }
        Returns: Json
      }
      apply_plan_command: {
        Args: { p_command: Json; p_expected_version: number; p_plan_id: string }
        Returns: Json
      }
      cast_vote: {
        Args: { p_option_id: string; p_slot_id: string }
        Returns: Json
      }
      confirm_option: {
        Args: {
          p_expected_version: number
          p_option_id: string
          p_slot_id: string
        }
        Returns: Json
      }
      create_share_link: {
        Args: { p_expires_at?: string; p_plan_id: string }
        Returns: string
      }
      create_trip: {
        Args: {
          p_budget?: number
          p_currency?: string
          p_ends_at?: string
          p_nickname: string
          p_origin?: string
          p_starts_at?: string
          p_timezone?: string
          p_title: string
        }
        Returns: {
          invite_token: string
          plan_id: string
          trip_id: string
        }[]
      }
      create_trip_invite: {
        Args: { p_expires_at?: string; p_trip_id: string }
        Returns: string
      }
      enqueue_due_reminders: { Args: never; Returns: number }
      get_calendar_feed: {
        Args: { p_from: string; p_timezone?: string; p_to: string }
        Returns: {
          all_day: boolean
          attrs: Json
          end_at: string
          id: string
          kind: string
          note_id: string
          plan_id: string
          revision: number
          source: string
          start_at: string
          title: string
        }[]
      }
      get_public_plan: { Args: { p_share_token: string }; Returns: Json }
      join_trip: {
        Args: { p_invite_token: string; p_nickname: string }
        Returns: string
      }
      resolve_offline_conflict: {
        Args: {
          p_conflict_id: string
          p_resolution: Database["public"]["Enums"]["aiau_offline_resolution"]
        }
        Returns: Json
      }
      restore_plan_version: {
        Args: {
          p_expected_version: number
          p_plan_id: string
          p_version: number
        }
        Returns: Json
      }
      revoke_share_link: {
        Args: { p_share_link_id: string }
        Returns: undefined
      }
      revoke_trip_invite: { Args: { p_invite_id: string }; Returns: undefined }
      undo_note_operation: { Args: { p_operation_id: string }; Returns: string }
      upsert_personal_event: {
        Args: { p_event: Json; p_expected_revision?: number }
        Returns: Json
      }
    }
    Enums: {
      aiau_ai_run_kind: "extract_notes" | "generate_plan"
      aiau_ai_run_status: "pending" | "processing" | "completed" | "failed"
      aiau_member_role: "owner" | "member"
      aiau_note_origin: "ai" | "user"
      aiau_note_status: "active" | "held"
      aiau_notification_type:
        | "plan_change"
        | "reminder"
        | "offline_conflict"
        | "invite"
        | "system"
      aiau_offline_conflict_status: "pending" | "resolved"
      aiau_offline_resolution: "local" | "server"
      aiau_plan_option_kind: "activity" | "travel" | "all_day" | "placeholder"
      aiau_plan_slot_status: "open" | "confirmed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      aiau_ai_run_kind: ["extract_notes", "generate_plan"],
      aiau_ai_run_status: ["pending", "processing", "completed", "failed"],
      aiau_member_role: ["owner", "member"],
      aiau_note_origin: ["ai", "user"],
      aiau_note_status: ["active", "held"],
      aiau_notification_type: [
        "plan_change",
        "reminder",
        "offline_conflict",
        "invite",
        "system",
      ],
      aiau_offline_conflict_status: ["pending", "resolved"],
      aiau_offline_resolution: ["local", "server"],
      aiau_plan_option_kind: ["activity", "travel", "all_day", "placeholder"],
      aiau_plan_slot_status: ["open", "confirmed"],
    },
  },
} as const
