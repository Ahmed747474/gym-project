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
          role: 'admin' | 'coach' | 'trainee'
          coach_id: string | null
          coach_code: string | null
          coach_accepting_new: boolean
          coach_status: 'active' | 'deactivated' | null // New column
          gender: string | null
          birth_date: string | null
          phone: string | null
          avatar_url: string | null
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'coach' | 'trainee'
          coach_id?: string | null
          coach_code?: string | null
          coach_accepting_new?: boolean
          coach_status?: 'active' | 'deactivated' | null
          gender?: string | null
          birth_date?: string | null
          phone?: string | null
          avatar_url?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: string
          coach_id?: string | null
          coach_code?: string | null
          coach_accepting_new?: boolean
          coach_status?: 'active' | 'deactivated' | null
          gender?: string | null
          birth_date?: string | null
          phone?: string | null
          avatar_url?: string | null
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
          owner_coach_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          image_url?: string | null
          created_by?: string | null
          owner_coach_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          image_url?: string | null
          created_by?: string | null
          owner_coach_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_programs: {
        Row: {
          id: string
          user_id: string
          program_id: string
          coach_id: string | null
          assigned_at: string
        }
        Insert: {
          id?: string
          user_id: string
          program_id: string
          coach_id?: string | null
          assigned_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          program_id?: string
          coach_id?: string | null
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
      assignment_exercise_progress: {
        Row: {
          id: string;
          assignment_day_id: string;
          exercise_id: string;
          user_id: string;
          done: boolean;
          done_at: string | null;
        };
        Insert: {
          id?: string;
          assignment_day_id: string;
          exercise_id: string;
          user_id?: string;
          done?: boolean;
          done_at?: string | null;
        };
        Update: {
          id?: string;
          assignment_day_id?: string;
          exercise_id?: string;
          user_id?: string;
          done?: boolean;
          done_at?: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          target_id: string | null
          target_table: string | null
          meta: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          target_id?: string | null
          target_table?: string | null
          meta?: Json
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          target_id?: string | null
          target_table?: string | null
          meta?: Json
          created_at?: string
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

export type AssignmentExerciseProgress = Database['public']['Tables']['assignment_exercise_progress']['Row'];
export type ExerciseWithAssignmentProgress = Exercise & {
  progress?: AssignmentExerciseProgress | null;
};
export type ExerciseWithProgress = Exercise & {
  progress?: ExerciseProgress | null;
};
