import { Navigate, createBrowserRouter } from 'react-router-dom';
import { LineChart, MessagesSquare, Sparkles } from 'lucide-react';
import { AppShell } from './AppShell';
import { readStoredState } from '@/state/storage';
import type { AppMode } from '@/data/types';
import { defaultRouteFor } from './navigation';
import { StudentHome } from '@/features/student/StudentHome';
import { MyDay } from '@/features/student/MyDay';
import { Schedule } from '@/features/student/Schedule';
import { Homework } from '@/features/student/Homework';
import { TeacherOverview } from '@/features/teacher/TeacherOverview';
import { Classes } from '@/features/teacher/Classes';
import { Assignments } from '@/features/teacher/Assignments';
import { Students } from '@/features/teacher/Students';
import { FuturePage } from '@/features/shared/FuturePage';
import { NotFound } from '@/features/shared/NotFound';

/** The landing route honours the workspace the demo was left in. */
function StartRedirect() {
  const stored = readStoredState<{ mode: AppMode }>();
  return <Navigate to={defaultRouteFor(stored?.mode === 'teacher' ? 'teacher' : 'student')} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <StartRedirect /> },

      { path: 'student', element: <Navigate to="/student/home" replace /> },
      { path: 'student/home', element: <StudentHome /> },
      { path: 'student/day', element: <MyDay /> },
      { path: 'student/schedule', element: <Schedule /> },
      { path: 'student/homework', element: <Homework /> },
      {
        path: 'student/ask',
        element: (
          <FuturePage
            titleKey="future.askSchoolTitle"
            bodyKey="future.askSchoolBody"
            version="v1.1"
            icon={<MessagesSquare size={22} aria-hidden />}
            backTo="/student/home"
            backLabelKey="nav.home"
            pointKeys={['future.askSchoolP1', 'future.askSchoolP2', 'future.askSchoolP3']}
          />
        ),
      },
      {
        path: 'student/tutor',
        element: (
          <FuturePage
            titleKey="future.aiTutorTitle"
            bodyKey="future.aiTutorBody"
            version="v1.4"
            icon={<Sparkles size={22} aria-hidden />}
            backTo="/student/home"
            backLabelKey="nav.home"
            pointKeys={['future.aiTutorP1', 'future.aiTutorP2', 'future.aiTutorP3']}
          />
        ),
      },

      { path: 'teacher', element: <Navigate to="/teacher/overview" replace /> },
      { path: 'teacher/overview', element: <TeacherOverview /> },
      { path: 'teacher/classes', element: <Classes /> },
      { path: 'teacher/assignments', element: <Assignments /> },
      { path: 'teacher/students', element: <Students /> },
      {
        path: 'teacher/pulse',
        element: (
          <FuturePage
            titleKey="future.classPulseTitle"
            bodyKey="future.classPulseBody"
            version="v1.7"
            icon={<LineChart size={22} aria-hidden />}
            backTo="/teacher/overview"
            backLabelKey="nav.overview"
            pointKeys={['future.classPulseP1', 'future.classPulseP2', 'future.classPulseP3']}
          />
        ),
      },
      {
        path: 'teacher/ai',
        element: (
          <FuturePage
            titleKey="future.teacherAiTitle"
            bodyKey="future.teacherAiBody"
            version="v1.6"
            icon={<Sparkles size={22} aria-hidden />}
            backTo="/teacher/overview"
            backLabelKey="nav.overview"
            pointKeys={['future.teacherAiP1', 'future.teacherAiP2', 'future.teacherAiP3']}
          />
        ),
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
