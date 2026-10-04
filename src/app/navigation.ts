import {
  BookOpenCheck,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  Presentation,
  ScanLine,
  Sparkles,
  Target,
  Users2,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AppMode } from '@/data/types';
import type { TranslationKey } from '@/i18n';

export interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  /** Set when the destination is a planned capability, not a built one. */
  futureVersion?: string;
}

export interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

export const modeIcons: Record<AppMode, LucideIcon> = {
  student: GraduationCap,
  teacher: Presentation,
};

export const studentNav: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      { to: '/student/home', labelKey: 'nav.home', icon: LayoutDashboard },
      { to: '/student/day', labelKey: 'nav.myDay', icon: Sun },
      { to: '/student/schedule', labelKey: 'nav.schedule', icon: CalendarDays },
      { to: '/student/homework', labelKey: 'nav.homework', icon: BookOpenCheck },
    ],
  },
  {
    labelKey: 'nav.groupAi',
    items: [
      { to: '/student/ask', labelKey: 'nav.askSchool', icon: MessagesSquare },
      { to: '/student/snap', labelKey: 'nav.snapHomework', icon: ScanLine },
      { to: '/student/planner', labelKey: 'nav.aiPlanner', icon: CalendarCheck },
      { to: '/student/quiz', labelKey: 'nav.quiz', icon: Target },
      { to: '/student/tutor', labelKey: 'nav.aiTutor', icon: GraduationCap },
    ],
  },
  {
    labelKey: 'nav.groupFamily',
    items: [{ to: '/student/parents', labelKey: 'nav.parents', icon: Users2 }],
  },
];

export const teacherNav: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      { to: '/teacher/overview', labelKey: 'nav.overview', icon: LayoutDashboard },
      { to: '/teacher/classes', labelKey: 'nav.classes', icon: Users },
      { to: '/teacher/assignments', labelKey: 'nav.assignments', icon: ClipboardList },
      { to: '/teacher/students', labelKey: 'nav.students', icon: GraduationCap },
    ],
  },
  {
    labelKey: 'nav.groupAi',
    items: [
      { to: '/teacher/ai', labelKey: 'nav.teacherAi', icon: Sparkles },
      { to: '/teacher/pulse', labelKey: 'nav.classPulse', icon: LineChart },
    ],
  },
];

export const navigationFor = (mode: AppMode): NavGroup[] =>
  mode === 'student' ? studentNav : teacherNav;

export const defaultRouteFor = (mode: AppMode): string =>
  mode === 'student' ? '/student/home' : '/teacher/overview';

export const modeOfPath = (pathname: string): AppMode =>
  pathname.startsWith('/teacher') ? 'teacher' : 'student';

/** Flat lookup used by the topbar to name the current section. */
export function findNavItem(pathname: string): NavItem | undefined {
  return [...studentNav, ...teacherNav]
    .flatMap((group) => group.items)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
