import { Navigate, createBrowserRouter } from 'react-router-dom';
import { LineChart, Sparkles } from 'lucide-react';
import { AppShell } from './AppShell';
import { RequireAuth, RequireRole, SessionRedirect } from './guards';
import { Login } from '@/features/auth/Login';
import { StudentHome } from '@/features/student/StudentHome';
import { MyDay } from '@/features/student/MyDay';
import { Schedule } from '@/features/student/Schedule';
import { Homework } from '@/features/student/Homework';
import { AskSchool } from '@/features/student/ask/AskSchool';
import { SnapHomework } from '@/features/student/snap/SnapHomework';
import { AiPlanner } from '@/features/student/planner/AiPlanner';
import { TeacherOverview } from '@/features/teacher/TeacherOverview';
import { Classes } from '@/features/teacher/Classes';
import { Assignments } from '@/features/teacher/Assignments';
import { Students } from '@/features/teacher/Students';
import { FuturePage } from '@/features/shared/FuturePage';
import { NotFound } from '@/features/shared/NotFound';

/* ------------------------------------------------------------------
   One application, one login, two role-gated workspaces.

   The role guards are route-level rather than per-screen, so a new
   screen cannot be added to a workspace without inheriting its
   access rule.
   ------------------------------------------------------------------ */

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },

  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <SessionRedirect /> },

          /* ---- student workspace ---- */
          {
            element: <RequireRole role="student" />,
            children: [
              { path: 'student', element: <Navigate to="/student/home" replace /> },
              { path: 'student/home', element: <StudentHome /> },
              { path: 'student/day', element: <MyDay /> },
              { path: 'student/schedule', element: <Schedule /> },
              { path: 'student/homework', element: <Homework /> },
              { path: 'student/ask', element: <AskSchool /> },
              { path: 'student/snap', element: <SnapHomework /> },
              { path: 'student/planner', element: <AiPlanner /> },
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
            ],
          },

          /* ---- teacher workspace ---- */
          {
            element: <RequireRole role="teacher" />,
            children: [
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
            ],
          },

          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
