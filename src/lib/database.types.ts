export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      programs: {
        Row: {
          id: string
          title: string
          description: string | null
          image_url: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          image_url?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          image_url?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_programs: {
        Row: {
          id: string
          user_id: string
          program_id: string
          assigned_at: string
        }
        Insert: {
          id?: string
          user_id: string
          program_id: string
          assigned_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          program_id?: string
          assigned_at?: string
        }
      }
      days: {
        Row: {
          id: string
          program_id: string
          day_number: number
          title: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          day_number: number
          title: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          day_number?: number
          title?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      exercises: {
        Row: {
          id: string
          day_id: string
          exercise_number: number
          name: string
          sets: number
          reps: string
          rest_seconds: number | null
          notes: string | null
          video_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          day_id: string
          exercise_number: number
          name: string
          sets?: number
          reps?: string
          rest_seconds?: number | null
          notes?: string | null
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          day_id?: string
          exercise_number?: number
          name?: string
          sets?: number
          reps?: string
          rest_seconds?: number | null
          notes?: string | null
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      exercise_progress: {
        Row: {
          id: string
          user_id: string
          exercise_id: string
          done_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          exercise_id: string
          done_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          exercise_id?: string
          done_at?: string
          notes?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_day_completion: {
        Args: {
          p_user_id: string
          p_day_id: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Helper types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Program = Database['public']['Tables']['programs']['Row']
export type UserProgram = Database['public']['Tables']['user_programs']['Row']
export type Day = Database['public']['Tables']['days']['Row']
export type Exercise = Database['public']['Tables']['exercises']['Row']
export type ExerciseProgress = Database['public']['Tables']['exercise_progress']['Row']

// Extended types with relations
export type DayWithExercises = Day & {
  exercises: Exercise[]
  completion?: number
}

export type ProgramWithDays = Program & {
  days: Day[]
}

export type ExerciseWithProgress = Exercise & {
  progress?: ExerciseProgress | null
}
