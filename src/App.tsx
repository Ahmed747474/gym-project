import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import AdminPage, { AdminDaysPage } from './pages/AdminPage';
import DayExercisesPage from './pages/DayExercisesPage';
import ExercisePlayerPage from './pages/ExercisePlayerPage';
import LoginPage from './pages/LoginPage';
import ProgramDetailsPage from './pages/ProgramDetailsPage';
import ProgramsPage from './pages/ProgramsPage';
import SignupPage from './pages/SignupPage';
import WorkoutHome from './pages/WorkoutHome';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/gym-project">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/programs/:programId" element={<ProgramDetailsPage />} />
            <Route path="/programs/:programId/days/:dayId" element={<DayExercisesPage />} />
            <Route path="/programs/:programId/days/:assignmentDayId/exercises/:exerciseId" element={<ExercisePlayerPage />} />
            {/* Admin routes */}
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/programs/:programId/days" element={<AdminDaysPage />} />
          </Route>
          {/* Workout Home route */}
          <Route path="/workout" element={<WorkoutHome />} />
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/programs" replace />} />
          <Route path="*" element={<Navigate to="/programs" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
