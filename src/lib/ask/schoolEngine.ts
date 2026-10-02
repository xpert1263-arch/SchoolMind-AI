import { announcements as allAnnouncements } from '@/data/school';
import { classHasLessonsOn, lessonsOfClass, subjectById } from '@/data/queries';
import { resolveText } from '@/data/types';
import type { Assignment, ID, Locale, ScheduledLesson, SchoolClass, Weekday } from '@/data/types';
import type { Translator } from '@/i18n';
import {
  addDays,
  daysFromToday,
  minutesOf,
  nowMinutes,
  todayISO,
  toISODate,
  weekdayOf,
  weekdayOfISO,
} from '@/lib/dates';
import { dayLabel } from '@/lib/labels';
import { ORDINAL_CUES, QUESTION_CUES, SCHOOL_TOPIC, SCHOOL_TOPIC_WORDS, TIME_CUES, WEEKDAY_CUES } from './lexicon';
import { detectSubjectId } from './subjectMatch';
import { hasStem, hasWord, normalise } from './text';
import type { AnswerBlock, AskAction, AskFocus } from './types';

/* ------------------------------------------------------------------
   School-data engine.

   Every SchoolMind fact an answer states comes from here, resolved
   against the shared dataset. The model is never asked for a lesson
   time, a room, a teacher, a deadline or a test date.

   The engine reasons over (topic x time x subject x ordinal) rather
   than matching whole phrases, so wording can vary freely.
   ------------------------------------------------------------------ */

export interface SchoolEngineInput {
  question: string;
  locale: Locale;
  t: Translator;
  schoolClass: SchoolClass;
  assignments: Assignment[];
  completedIds: ID[];
  focus: AskFocus;
}

export interface SchoolEngineResult {
  resolved: boolean;
  blocks: AnswerBlock[];
  actions: AskAction[];
  focus: AskFocus;
  /** Compact restatement of the facts, for the model on hybrid routes. */
  factSummary: string;
}

const SCHEDULE_ACTION: AskAction = { labelKey: 'ask.action.openSchedule', to: '/student/schedule' };
const HOMEWORK_ACTION: AskAction = { labelKey: 'ask.action.openHomework', to: '/student/homework' };
const HOME_ACTION: AskAction = { labelKey: 'ask.action.openHome', to: '/student/home' };
const MY_DAY_ACTION: AskAction = { labelKey: 'ask.action.openMyDay', to: '/student/day' };

/** Longer weekday names are tested first: "shanba" is a substring of
 *  "dushanba", "chorshanba" and "yakshanba". */
const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 7, 5, 6];

function detectWeekday(text: string): Weekday | undefined {
  for (const weekday of WEEKDAY_ORDER) {
    const entry = WEEKDAY_CUES.find((cue) => cue.weekday === weekday);
    if (entry && hasStem(text, entry.stems)) return weekday;
  }
  return undefined;
}

/** Next date with this weekday, today included. */
function nextDateForWeekday(weekday: Weekday): string {
  const start = new Date();
  for (let i = 0; i < 7; i += 1) {
    const candidate = addDays(start, i);
    if (weekdayOf(candidate) === weekday) return toISODate(candidate);
  }
  return todayISO();
}

interface Intent {
  text: string;
  subjectId?: ID;
  dateISO?: string;
  /** True when the question names a day ("today", "Friday"). */
  hasDate: boolean;
  weekScope: boolean;
  topic: {
    lesson: boolean;
    homework: boolean;
    test: boolean;
    teacher: boolean;
    room: boolean;
    announcement: boolean;
  };
  ordinal: { first: boolean; next: boolean; last: boolean };
  count: boolean;
  when: boolean;
  deadline: boolean;
}

function readIntent(question: string, focus: AskFocus): Intent {
  const text = normalise(question);

  let dateISO: string | undefined;
  let hasDate = true;
  if (hasStem(text, TIME_CUES.today)) dateISO = todayISO();
  else if (hasStem(text, TIME_CUES.tomorrow)) dateISO = toISODate(addDays(new Date(), 1));
  else if (hasStem(text, TIME_CUES.yesterday)) dateISO = toISODate(addDays(new Date(), -1));
  else {
    const weekday = detectWeekday(text);
    if (weekday) dateISO = nextDateForWeekday(weekday);
    else hasDate = false;
  }

  return {
    text,
    subjectId: detectSubjectId(text) ?? focus.subjectId,
    dateISO,
    hasDate,
    weekScope: hasStem(text, TIME_CUES.week),
    topic: {
      lesson: hasStem(text, SCHOOL_TOPIC.lesson),
      homework: hasStem(text, SCHOOL_TOPIC.homework),
      test: hasStem(text, SCHOOL_TOPIC.test),
      teacher: hasStem(text, SCHOOL_TOPIC.teacher) || hasWord(text, SCHOOL_TOPIC_WORDS.teacher),
      room: hasStem(text, SCHOOL_TOPIC.room) || hasWord(text, SCHOOL_TOPIC_WORDS.room),
      announcement: hasStem(text, SCHOOL_TOPIC.announcement),
    },
    ordinal: {
      first: hasStem(text, ORDINAL_CUES.first),
      next: hasStem(text, ORDINAL_CUES.next),
      last: hasStem(text, ORDINAL_CUES.last),
    },
    count: hasStem(text, QUESTION_CUES.count),
    when: hasStem(text, QUESTION_CUES.when),
    deadline: hasStem(text, QUESTION_CUES.deadline),
  };
}

/** Upcoming lessons of a subject, scanning forward from right now. */
function findNextLesson(
  classId: ID,
  subjectId: ID,
  days = 14,
): { entry: ScheduledLesson; dateISO: string } | undefined {
  const now = nowMinutes();
  for (let i = 0; i < days; i += 1) {
    const date = addDays(new Date(), i);
    const dayLessons = lessonsOfClass(classId, weekdayOf(date));
    for (const entry of dayLessons) {
      if (entry.subject.id !== subjectId) continue;
      if (i === 0 && minutesOf(entry.slot.start) <= now) continue;
      return { entry, dateISO: toISODate(date) };
    }
  }
  return undefined;
}

export function answerFromSchool(input: SchoolEngineInput): SchoolEngineResult {
  const { locale, t, schoolClass, assignments, completedIds, focus } = input;
  const intent = readIntent(input.question, focus);

  const classAssignments = assignments.filter((a) => a.classId === schoolClass.id);
  const homework = classAssignments.filter((a) => a.kind !== 'test');
  const tests = classAssignments.filter((a) => a.kind === 'test');
  const openHomework = homework.filter((a) => !completedIds.includes(a.id));

  const nextFocus: AskFocus = { ...focus };
  const facts: string[] = [];

  const result = (
    blocks: AnswerBlock[],
    actions: AskAction[],
  ): SchoolEngineResult => ({
    resolved: true,
    blocks,
    actions,
    focus: nextFocus,
    factSummary: facts.join('\n'),
  });

  const unresolved: SchoolEngineResult = {
    resolved: false,
    blocks: [],
    actions: [],
    focus,
    factSummary: '',
  };

  /* ---- announcements ---------------------------------------------- */
  if (intent.topic.announcement) {
    const visible = allAnnouncements.filter((a) => !a.classId || a.classId === schoolClass.id);
    if (visible.length === 0) {
      return result(
        [{ kind: 'empty', titleKey: 'student.home.announcementsEmpty' }],
        [HOME_ACTION],
      );
    }
    facts.push(
      ...visible.slice(0, 3).map((a) => `Announcement: ${resolveText(a.title, locale)} (${a.date})`),
    );
    return result(
      [
        { kind: 'text', text: t('ask.a.announcements') },
        { kind: 'announcements', announcementIds: visible.slice(0, 3).map((a) => a.id) },
      ],
      [HOME_ACTION],
    );
  }

  /* ---- tests ------------------------------------------------------- */
  if (intent.topic.test) {
    let upcoming = tests
      .filter((a) => daysFromToday(a.dueDate) >= 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (intent.subjectId) upcoming = upcoming.filter((a) => a.subjectId === intent.subjectId);
    if (intent.weekScope) upcoming = upcoming.filter((a) => daysFromToday(a.dueDate) <= 7);
    if (intent.ordinal.next) upcoming = upcoming.slice(0, 1);

    if (upcoming.length === 0) {
      return result([{ kind: 'empty', titleKey: 'ask.a.testsNone' }], [HOME_ACTION]);
    }
    nextFocus.subjectId = upcoming[0].subjectId;
    nextFocus.assignmentId = upcoming[0].id;
    facts.push(
      ...upcoming.map((a) => `Test: ${resolveText(a.title, locale)} — ${a.dueDate}`),
    );
    return result(
      [
        { kind: 'text', text: t('ask.a.tests') },
        { kind: 'tests', assignmentIds: upcoming.map((a) => a.id) },
      ],
      [HOME_ACTION],
    );
  }

  /* ---- homework ----------------------------------------------------- */
  if (intent.topic.homework || (intent.deadline && !intent.topic.lesson)) {
    let items = openHomework;
    if (intent.subjectId) items = items.filter((a) => a.subjectId === intent.subjectId);

    /* "Qachongacha?" right after a homework answer. */
    if (intent.deadline && focus.assignmentId && !intent.subjectId) {
      const focused = homework.find((a) => a.id === focus.assignmentId);
      if (focused) items = [focused];
    }

    if (intent.dateISO) items = items.filter((a) => a.dueDate === intent.dateISO);
    else if (intent.deadline || intent.ordinal.next) {
      items = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 1);
    }

    if (items.length === 0) {
      return result(
        [{ kind: 'empty', titleKey: 'ask.a.homeworkNone', bodyKey: 'ask.a.homeworkNoneBody' }],
        [HOMEWORK_ACTION],
      );
    }

    const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    nextFocus.assignmentId = sorted[0].id;
    nextFocus.subjectId = sorted[0].subjectId;
    facts.push(
      ...sorted.map(
        (a) =>
          `Homework: ${resolveText(a.title, locale)} (${subjectById(a.subjectId).name[locale]}) due ${a.dueDate}`,
      ),
    );

    const heading = intent.deadline
      ? t('ask.a.nearestDeadline')
      : intent.dateISO
        ? t('ask.a.homeworkOnDay', { day: dayLabel(intent.dateISO, t, locale) })
        : intent.subjectId
          ? t('ask.a.homeworkFor', { subject: subjectById(intent.subjectId).name[locale] })
          : t('ask.a.homeworkOpen');

    return result(
      [
        { kind: 'text', text: heading },
        { kind: 'homework', assignmentIds: sorted.map((a) => a.id) },
      ],
      [HOMEWORK_ACTION, MY_DAY_ACTION],
    );
  }

  /* ---- subject properties: room / teacher --------------------------- */
  if ((intent.topic.room || intent.topic.teacher) && !intent.topic.lesson) {
    const subjectId = intent.subjectId;
    if (!subjectId) return unresolved;
    const upcoming = findNextLesson(schoolClass.id, subjectId);
    const sample =
      upcoming ??
      (() => {
        for (let day = 1 as Weekday; day <= 6; day = (day + 1) as Weekday) {
          const found = lessonsOfClass(schoolClass.id, day).find((l) => l.subject.id === subjectId);
          if (found) return { entry: found, dateISO: todayISO() };
        }
        return undefined;
      })();

    if (!sample) {
      return result([{ kind: 'empty', titleKey: 'ask.a.notInRecords' }], [SCHEDULE_ACTION]);
    }

    nextFocus.subjectId = subjectId;
    const subject = subjectById(subjectId);
    facts.push(
      `${subject.name[locale]}: room ${sample.entry.lesson.room}, teacher ${sample.entry.teacher.firstName} ${sample.entry.teacher.lastName}`,
    );
    return result(
      [
        { kind: 'text', text: t('ask.a.subjectInfo', { subject: subject.name[locale] }) },
        {
          kind: 'subject',
          subjectId,
          teacherId: sample.entry.teacher.id,
          room: sample.entry.lesson.room,
        },
      ],
      [SCHEDULE_ACTION],
    );
  }

  /* ---- lessons and schedule ------------------------------------------ */
  if (intent.topic.lesson || intent.hasDate || intent.count) {
    /* "When is my next biology lesson?" */
    if (intent.subjectId && (intent.ordinal.next || intent.when || !intent.hasDate)) {
      const found = findNextLesson(schoolClass.id, intent.subjectId);
      const subject = subjectById(intent.subjectId);
      if (!found) {
        return result(
          [{ kind: 'empty', titleKey: 'ask.a.noSubjectLesson' }],
          [SCHEDULE_ACTION],
        );
      }
      nextFocus.subjectId = intent.subjectId;
      nextFocus.lessonId = found.entry.lesson.id;
      nextFocus.dateISO = found.dateISO;
      facts.push(
        `Next ${subject.name[locale]} lesson: ${found.dateISO} ${found.entry.slot.start}, room ${found.entry.lesson.room}`,
      );
      return result(
        [
          { kind: 'text', text: t('ask.a.nextSubjectLesson', { subject: subject.name[locale] }) },
          { kind: 'lesson', lessonId: found.entry.lesson.id, dateISO: found.dateISO },
        ],
        [SCHEDULE_ACTION],
      );
    }

    const dateISO = intent.dateISO ?? todayISO();
    const weekday = weekdayOfISO(dateISO);
    const dayLessons = lessonsOfClass(schoolClass.id, weekday);
    const day = dayLabel(dateISO, t, locale);
    nextFocus.dateISO = dateISO;

    if (!classHasLessonsOn(schoolClass.id, weekday) || dayLessons.length === 0) {
      return result(
        [{ kind: 'text', text: t('ask.a.noLessons', { day }) }],
        [SCHEDULE_ACTION],
      );
    }

    /* "Is there maths on Friday?" */
    if (intent.subjectId) {
      const subject = subjectById(intent.subjectId);
      const match = dayLessons.find((l) => l.subject.id === intent.subjectId);
      nextFocus.subjectId = intent.subjectId;
      if (!match) {
        facts.push(`${subject.name[locale]} is not scheduled on ${dateISO}`);
        return result(
          [
            {
              kind: 'text',
              text: t('ask.a.subjectNotOnDay', { day, subject: subject.name[locale] }),
            },
          ],
          [SCHEDULE_ACTION],
        );
      }
      nextFocus.lessonId = match.lesson.id;
      facts.push(
        `${subject.name[locale]} on ${dateISO} at ${match.slot.start}, room ${match.lesson.room}`,
      );
      return result(
        [
          { kind: 'text', text: t('ask.a.subjectOnDay', { day, subject: subject.name[locale] }) },
          { kind: 'lesson', lessonId: match.lesson.id, dateISO },
        ],
        [SCHEDULE_ACTION],
      );
    }

    /* "What is my first lesson tomorrow?" */
    if (intent.ordinal.first || intent.ordinal.last) {
      const entry = intent.ordinal.last ? dayLessons[dayLessons.length - 1] : dayLessons[0];
      nextFocus.lessonId = entry.lesson.id;
      nextFocus.subjectId = entry.subject.id;
      facts.push(
        `${intent.ordinal.last ? 'Last' : 'First'} lesson on ${dateISO}: ${entry.subject.name[locale]} ${entry.slot.start}, room ${entry.lesson.room}, ${entry.teacher.firstName} ${entry.teacher.lastName}`,
      );
      return result(
        [
          {
            kind: 'text',
            text: intent.ordinal.last ? t('ask.a.lastLesson', { day }) : t('ask.a.firstLesson', { day }),
          },
          { kind: 'lesson', lessonId: entry.lesson.id, dateISO },
        ],
        [SCHEDULE_ACTION, MY_DAY_ACTION],
      );
    }

    /* "How many lessons do I have today?" and plain day schedule. */
    facts.push(
      `Lessons on ${dateISO}: ${dayLessons
        .map((l) => `${l.slot.start} ${l.subject.name[locale]} (room ${l.lesson.room})`)
        .join('; ')}`,
    );
    return result(
      [
        {
          kind: 'text',
          text: intent.count
            ? t('ask.a.lessonCount', { day, n: dayLessons.length })
            : t('ask.a.daySchedule', { day }),
        },
        { kind: 'schedule', dateISO, lessonIds: dayLessons.map((l) => l.lesson.id) },
      ],
      [SCHEDULE_ACTION, MY_DAY_ACTION],
    );
  }

  return unresolved;
}
