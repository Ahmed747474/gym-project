# Workout Player PWA

A Progressive Web App for tracking workout programs and exercises, built with React, Vite, Tailwind CSS, and Supabase.

## Features

- **Email/Password Authentication** - Secure login via Supabase Auth
- **Programs List** - View all workout programs assigned to you
- **Program Details** - See all days in a program with progress tracking
- **Day Exercises** - View exercises for each day with completion status
- **Exercise Player** - Watch embedded Google Drive videos, see exercise details
- **Progress Tracking** - Mark exercises as done with timestamps
- **Admin Mode** - Create/edit programs, days, and exercises; assign programs to users
- **PWA Support** - Install as an app on mobile/desktop, works offline
- **Mobile Optimized** - Touch-friendly UI designed for phones

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **PWA**: vite-plugin-pwa with Workbox

## Getting Started

### 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the schema in `supabase/schema.sql`
3. Go to **Settings > API** and copy your project URL and anon key

### 2. Configure Environment

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
npm run preview
```

## Database Schema

### Tables

- **profiles** - User profiles (extends auth.users)
- **programs** - Workout programs
- **user_programs** - Program assignments (many-to-many)
- **days** - Days within programs
- **exercises** - Exercises within days
- **exercise_progress** - User completion tracking

### Row Level Security (RLS)

All tables have RLS enabled:
- Users can only see programs assigned to them
- Users can only modify their own progress
- Admins can view/modify all data

## Making a User Admin

To make a user an admin, run this SQL in Supabase:

```sql
UPDATE profiles SET is_admin = TRUE WHERE email = 'admin@example.com';
```

## Google Drive Video Integration

To use Google Drive videos:

1. Upload your video to Google Drive
2. Right-click > Share > "Anyone with the link"
3. Copy the share link (e.g., `https://drive.google.com/file/d/FILE_ID/view`)
4. Paste into the Video URL field when creating an exercise

The app automatically converts share links to embeddable preview URLs.

## PWA Installation

### Mobile (iOS/Android)
1. Open the app in your browser
2. Tap the share button
3. Select "Add to Home Screen"

### Desktop (Chrome/Edge)
1. Look for the install icon in the address bar
2. Click "Install"

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── JumpToInput.tsx
│   ├── Layout.tsx
│   ├── LoadingSpinner.tsx
│   └── ProtectedRoute.tsx
├── contexts/
│   └── AuthContext.tsx  # Authentication context
├── lib/
│   ├── database.types.ts # TypeScript types for Supabase
│   └── supabase.ts      # Supabase client configuration
├── pages/
│   ├── AdminPage.tsx    # Admin panel + days management
│   ├── DayExercisesPage.tsx
│   ├── ExercisePlayerPage.tsx
│   ├── LoginPage.tsx
│   ├── ProgramDetailsPage.tsx
│   ├── ProgramsPage.tsx
│   └── SignupPage.tsx
├── App.tsx              # Main app with routing
├── index.css            # Tailwind + custom styles
└── main.tsx             # Entry point

supabase/
└── schema.sql           # Database schema + RLS policies

public/
├── favicon.svg          # App icon
├── icon-192.svg         # PWA icon (192x192)
└── icon-512.svg         # PWA icon (512x512)
```

## License

MIT
