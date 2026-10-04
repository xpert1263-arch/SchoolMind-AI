import type {
  Announcement,
  Assignment,
  ID,
  Lesson,
  LessonSlot,
  LocalizedText,
  PersonalTask,
  School,
  SchoolClass,
  Student,
  Subject,
  Teacher,
  Weekday,
} from './types';
import { isoFromToday, isoTeachingFromToday, relativeDayWord } from '@/lib/dates';
import { teacherIdentities, teachingAssignments as teachingRows } from './roster.mjs';

/* ------------------------------------------------------------------
   Demo dataset — one small, believable Uzbek school.

   NOTHING HERE IS A FIXED DATE. Every dated record is an offset from
   "today", so the dataset reads as current on whatever day the demo
   runs — including 8 October 2026 — and can never go stale the way a
   hardcoded "29 September" does.

   Schoolwork is offset in TEACHING days rather than calendar days.
   Offsets count TEACHING days, not calendar days: this school does
   not teach on Sundays, so a naive offset can land a deadline on a
   day with no lessons. Counting teaching days is what a timetable
   means by "the next day".
   ------------------------------------------------------------------ */

export const school: School = {
  /* A proper name: identical in both locales, never translated. */
  name: { uz: 'Math Academy Private School', ru: 'Math Academy Private School' },
  city: { uz: 'Toshkent', ru: 'Ташкент' },
};

export const lessonSlots: LessonSlot[] = [
  { index: 1, start: '08:30', end: '09:15' },
  { index: 2, start: '09:25', end: '10:10' },
  { index: 3, start: '10:20', end: '11:05' },
  { index: 4, start: '11:25', end: '12:10' },
  { index: 5, start: '12:20', end: '13:05' },
  { index: 6, start: '13:15', end: '14:00' },
];

export const subjects: Subject[] = [
  { id: 'math', name: { uz: 'Matematika', ru: 'Математика' }, short: 'MAT', hue: 214 },
  { id: 'physics', name: { uz: 'Fizika', ru: 'Физика' }, short: 'FIZ', hue: 266 },
  { id: 'chemistry', name: { uz: 'Kimyo', ru: 'Химия' }, short: 'KIM', hue: 95 },
  { id: 'biology', name: { uz: 'Biologiya', ru: 'Биология' }, short: 'BIO', hue: 152 },
  { id: 'english', name: { uz: 'Ingliz tili', ru: 'Английский язык' }, short: 'ENG', hue: 30 },
  { id: 'history', name: { uz: 'Tarix', ru: 'История' }, short: 'TAR', hue: 350 },
  { id: 'native', name: { uz: 'Ona tili', ru: 'Родной язык' }, short: 'ONA', hue: 192 },
  { id: 'it', name: { uz: 'Informatika', ru: 'Информатика' }, short: 'INF', hue: 310 },
];

/** Each subject has a fixed classroom in this school. */
const subjectRooms: Record<ID, string> = {
  math: '24',
  physics: '18',
  chemistry: '19',
  biology: '21',
  english: '12',
  history: '30',
  native: '15',
  it: '9',
};

/**
 * Who teaches what, to whom.
 *
 * The rows themselves live in `roster.mjs`, because from v1.6 the
 * server enforces them too: a teacher may only set work for, see, or
 * message the family of a class they actually teach, and that check
 * cannot live in the browser. Importing them keeps one table instead
 * of two that can drift apart.
 *
 * Adolat carries mathematics across all three classes and physics for
 * 10-A — a normal pairing, and the reason subject choice is a real
 * decision in the assignment form rather than a single fixed value.
 *
 * Every row is a permission as much as a fact.
 */
export { teachingAssignments } from './roster.mjs';

/* Names and ids come from the shared roster — the same rows the
   server reads — so a teacher cannot be renamed on one side only.
   The job title is UI copy and stays here. */
const teacherTitles: Record<ID, LocalizedText> = {
  t1: { uz: 'Matematika va fizika oʻqituvchisi', ru: 'Учитель математики и физики' },
  t2: { uz: 'Fizika oʻqituvchisi', ru: 'Учитель физики' },
  t3: { uz: 'Biologiya oʻqituvchisi', ru: 'Учитель биологии' },
  t4: { uz: 'Ingliz tili oʻqituvchisi', ru: 'Учитель английского' },
  t5: { uz: 'Tarix oʻqituvchisi', ru: 'Учитель истории' },
  t6: { uz: 'Ona tili oʻqituvchisi', ru: 'Учитель родного языка' },
  t7: { uz: 'Informatika oʻqituvchisi', ru: 'Учитель информатики' },
  t8: { uz: 'Kimyo oʻqituvchisi', ru: 'Учитель химии' },
};

const teacherSeeds = teacherIdentities.map((identity) => ({
  ...identity,
  title: teacherTitles[identity.id],
}));


/** A teacher's subjects and classes are the union of their teaching rows. */
export const teachers: Teacher[] = teacherSeeds.map((seed) => {
  const rows = teachingRows.filter((row) => row.teacherId === seed.id);
  return {
    ...seed,
    subjectIds: [...new Set(rows.map((row) => row.subjectId))],
    classIds: [...new Set(rows.flatMap((row) => row.classIds))],
  };
});

/** The teacher who delivers `subjectId` to `classId`. */
export function teacherForSubject(subjectId: ID, classId: ID): ID {
  const row = teachingRows.find(
    (entry) => entry.subjectId === subjectId && entry.classIds.includes(classId),
  );
  if (!row) throw new Error(`No teacher teaches ${subjectId} to ${classId}`);
  return row.teacherId;
}

export { subjectIdsTaughtBy } from './roster.mjs';

const roster = (classId: ID, names: string[]): Student[] =>
  names.map((full, i) => {
    const [firstName, ...rest] = full.split(' ');
    return {
      id: `${classId}-s${i + 1}`,
      firstName,
      lastName: rest.join(' '),
      classId,
    };
  });

/* Six students per class: small enough that every one of them has a
   real account, large enough for the teacher's class views to look
   like a class.

   9-A leads the list because account numbers follow it: student1 is
   Shohjahon, the student the demo opens on. */
export const students: Student[] = [
  ...roster('9a', [
    'Shohjahon Inoyatov',
    'Malika Rahimova',
    'Jasurbek Toʻxtasinov',
    'Nodira Abdullayeva',
    'Javohir Sattorov',
    'Zilola Mahmudova',
  ]),
  ...roster('8a', [
    'Islombek Nazarov',
    'Sevinch Mirzayeva',
    'Doniyor Hamroyev',
    'Charos Olimova',
    'Asadbek Nurmatov',
    'Madina Xolmatova',
  ]),
  ...roster('10a', [
    'Ulugʻbek Toshmatov',
    'Dilshoda Ikromova',
    'Behruz Normatov',
    'Mohira Rasulova',
    'Sanjar Yoqubov',
    'Kamila Baxtiyorova',
  ]),
];

const studentIdsOf = (classId: ID) => students.filter((s) => s.classId === classId).map((s) => s.id);

export const classes: SchoolClass[] = [
  {
    id: '8a',
    name: '8-A',
    grade: 8,
    letter: 'A',
    homeroomTeacherId: 't3',
    studentIds: studentIdsOf('8a'),
    room: '26',
  },
  {
    id: '9a',
    name: '9-A',
    grade: 9,
    letter: 'A',
    homeroomTeacherId: 't1',
    studentIds: studentIdsOf('9a'),
    room: '24',
  },
  {
    id: '10a',
    name: '10-A',
    grade: 10,
    letter: 'A',
    homeroomTeacherId: 't5',
    studentIds: studentIdsOf('10a'),
    room: '31',
  },
];

/* ---- weekly timetable --------------------------------------------- */

/** Subjects in lesson-slot order. Every class day runs from the first
 *  period with no free gaps, and the arrangement is conflict-free: no
 *  teacher and no subject room is ever booked twice in one period. */
type WeekPlan = Partial<Record<Weekday, ID[]>>;

/* Laid out column by column rather than class by class: within one
   period the three classes always take three different subjects, which
   keeps every subject room and every teacher singly booked. Mathematics
   and physics never share a period, because Adolat teaches both. */
const timetables: Record<ID, WeekPlan> = {
  '8a': {
    1: ['math', 'native', 'biology', 'english', 'history'],
    2: ['physics', 'chemistry', 'english', 'biology', 'history'],
    3: ['math', 'history', 'english', 'native', 'chemistry', 'biology'],
    4: ['physics', 'english', 'biology', 'chemistry', 'native'],
    5: ['math', 'english', 'history', 'chemistry', 'native'],
    6: ['biology', 'english', 'native'],
  },
  '9a': {
    1: ['english', 'math', 'chemistry', 'native', 'biology'],
    2: ['biology', 'physics', 'it', 'english', 'native'],
    3: ['history', 'math', 'biology', 'english', 'native', 'chemistry'],
    4: ['english', 'physics', 'native', 'biology', 'it'],
    5: ['it', 'math', 'english', 'history', 'chemistry'],
    6: ['math', 'biology', 'history'],
  },
  '10a': {
    1: ['history', 'english', 'math', 'it', 'chemistry'],
    2: ['it', 'english', 'physics', 'native', 'biology'],
    3: ['english', 'biology', 'math', 'chemistry', 'history', 'it'],
    4: ['it', 'native', 'physics', 'english', 'biology'],
    5: ['english', 'history', 'math', 'native', 'it'],
    6: ['english', 'math', 'chemistry'],
  },
};

function buildLessons(): Lesson[] {
  const out: Lesson[] = [];
  for (const [classId, plan] of Object.entries(timetables)) {
    for (const [day, subjectIds] of Object.entries(plan)) {
      const weekday = Number(day) as Weekday;
      subjectIds.forEach((subjectId, i) => {
        out.push({
          id: `${classId}-${weekday}-${i + 1}`,
          classId,
          subjectId,
          teacherId: teacherForSubject(subjectId, classId),
          weekday,
          slot: i + 1,
          room: subjectRooms[subjectId],
        });
      });
    }
  }
  return out;
}

export const lessons: Lesson[] = buildLessons();

/* ---- assignments --------------------------------------------------- */

/* `createdAgo` is capped at two teaching days on purpose. A seeded
   assignment "created" six days before the demo day would be dated in
   early October and read as last month's leftover on the Assignments
   screen, which is the one thing these fixtures must never look like.
   Two teaching days back from Thursday 8 October is Tuesday the
   every seeded record stays inside the demo week. */
type AssignmentSeed = Omit<Assignment, 'dueDate' | 'createdAt' | 'teacherId' | 'origin'> & {
  dueIn: number;
  createdAgo: number;
};

const assignmentSeeds: AssignmentSeed[] = [
  {
    id: 'a1',
    kind: 'homework',
    subjectId: 'math',
    classId: '9a',
    title: {
      uz: 'Kvadrat tenglamalar — 12-mashq',
      ru: 'Квадратные уравнения — упражнение 12',
    },
    description: {
      uz: 'Darslikning 48-betidagi 12-mashq. Tenglamalarni diskriminant orqali yeching va yechim bosqichlarini yozib boring.',
      ru: 'Упражнение 12 на стр. 48. Решите уравнения через дискриминант и запишите ход решения.',
    },
    dueIn: 0,
    createdAgo: 2,
  },
  {
    id: 'a2',
    kind: 'homework',
    subjectId: 'biology',
    classId: '9a',
    title: { uz: 'Hujayra tuzilishi boʻyicha konspekt', ru: 'Конспект по строению клетки' },
    description: {
      uz: '9-mavzuni oʻqing va hujayra organoidlari jadvalini tuzing: nomi, tuzilishi, vazifasi.',
      ru: 'Прочитайте тему 9 и составьте таблицу органоидов: название, строение, функция.',
    },
    dueIn: 1,
    createdAgo: 1,
  },
  {
    id: 'a3',
    kind: 'homework',
    subjectId: 'english',
    classId: '9a',
    title: { uz: 'Unit 4 — Reading & vocabulary', ru: 'Unit 4 — Reading & vocabulary' },
    description: {
      uz: 'Workbook 26–27-betlar. Yangi 15 ta soʻzni yozma ravishda yod oling.',
      ru: 'Workbook, стр. 26–27. Выучите 15 новых слов письменно.',
    },
    dueIn: 0,
    createdAgo: 2,
  },
  {
    id: 'a4',
    kind: 'homework',
    subjectId: 'native',
    classId: '9a',
    title: { uz: 'Insho: «Mening kelajak kasbim»', ru: 'Сочинение: «Моя будущая профессия»' },
    description: {
      uz: '150–200 soʻzdan iborat insho. Kirish, asosiy qism va xulosa tuzilishiga rioya qiling.',
      ru: 'Сочинение на 150–200 слов. Соблюдайте структуру: введение, основная часть, вывод.',
    },
    dueIn: 2,
    createdAgo: 2,
  },
  {
    id: 'a5',
    kind: 'project',
    subjectId: 'it',
    classId: '9a',
    title: { uz: 'Mini-loyiha: shaxsiy veb-sahifa', ru: 'Мини-проект: личная веб-страница' },
    description: {
      uz: 'HTML va CSS yordamida oʻzingiz haqingizda bir sahifali sayt tayyorlang. Sarlavha, rasm va roʻyxat boʻlishi shart.',
      ru: 'Сделайте одностраничный сайт о себе на HTML и CSS. Обязательны заголовок, изображение и список.',
    },
    dueIn: 5,
    createdAgo: 2,
  },
  {
    id: 'a6',
    kind: 'homework',
    subjectId: 'physics',
    classId: '9a',
    title: { uz: 'Tezlanish — 3, 5, 7-masalalar', ru: 'Ускорение — задачи 3, 5, 7' },
    description: {
      uz: 'Har bir masalada berilganlar, formula va javobni alohida koʻrsating.',
      ru: 'В каждой задаче отдельно укажите данные, формулу и ответ.',
    },
    dueIn: -1,
    createdAgo: 2,
  },
  {
    id: 'a7',
    kind: 'homework',
    subjectId: 'history',
    classId: '9a',
    title: {
      uz: 'Amir Temur davri — xronologik jadval',
      ru: 'Эпоха Амира Темура — хронологическая таблица',
    },
    description: {
      uz: 'Asosiy 10 ta sanani jadvalga tushiring va har biriga bir jumlalik izoh yozing.',
      ru: 'Внесите 10 ключевых дат в таблицу и добавьте к каждой короткий комментарий.',
    },
    dueIn: 3,
    createdAgo: 1,
  },
  {
    id: 'a8',
    kind: 'test',
    subjectId: 'biology',
    classId: '9a',
    title: { uz: 'Nazorat ishi: hujayra va toʻqimalar', ru: 'Контрольная: клетка и ткани' },
    description: {
      uz: '7–10-mavzular. 20 ta test savoli va 2 ta ochiq savol.',
      ru: 'Темы 7–10. 20 тестовых вопросов и 2 открытых.',
    },
    dueIn: 1,
    createdAgo: 2,
  },
  {
    id: 'a9',
    kind: 'test',
    subjectId: 'math',
    classId: '9a',
    title: { uz: 'Nazorat ishi: kvadrat tenglamalar', ru: 'Контрольная: квадратные уравнения' },
    description: {
      uz: 'Diskriminant, Viet teoremasi va matnli masalalar.',
      ru: 'Дискриминант, теорема Виета и текстовые задачи.',
    },
    dueIn: 4,
    createdAgo: 2,
  },
  {
    id: 'a10',
    kind: 'test',
    subjectId: 'english',
    classId: '9a',
    title: { uz: 'Unit 4 test', ru: 'Unit 4 test' },
    description: {
      uz: 'Grammar: present perfect. Vocabulary: Unit 4 soʻzlari.',
      ru: 'Grammar: present perfect. Vocabulary: слова Unit 4.',
    },
    dueIn: 7,
    createdAgo: 2,
  },
  {
    id: 'b1',
    kind: 'homework',
    subjectId: 'math',
    classId: '8a',
    title: { uz: 'Chiziqli tenglamalar — 9-mashq', ru: 'Линейные уравнения — упражнение 9' },
    description: {
      uz: 'Darslikning 45-betidagi 9-mashq, 1–8-misollar.',
      ru: 'Упражнение 9 на стр. 45, примеры 1–8.',
    },
    dueIn: 1,
    createdAgo: 1,
  },
  {
    id: 'b2',
    kind: 'homework',
    subjectId: 'biology',
    classId: '8a',
    title: { uz: 'Fotosintez — sxema', ru: 'Фотосинтез — схема' },
    description: {
      uz: 'Fotosintez bosqichlarini sxema koʻrinishida chizing.',
      ru: 'Нарисуйте схему этапов фотосинтеза.',
    },
    dueIn: 2,
    createdAgo: 2,
  },
  {
    id: 'b3',
    kind: 'test',
    subjectId: 'math',
    classId: '8a',
    title: { uz: 'Nazorat ishi: chiziqli tenglamalar', ru: 'Контрольная: линейные уравнения' },
    description: {
      uz: 'Bir va ikki bosqichli tenglamalar, qavslarni ochish.',
      ru: 'Уравнения в одно и два действия, раскрытие скобок.',
    },
    dueIn: 4,
    createdAgo: 2,
  },
  {
    id: 'b4',
    kind: 'homework',
    subjectId: 'chemistry',
    classId: '8a',
    title: { uz: 'Atom tuzilishi — jadval', ru: 'Строение атома — таблица' },
    description: {
      uz: 'Birinchi 20 element uchun proton, neytron va elektron sonini jadvalga yozing.',
      ru: 'Запишите в таблицу число протонов, нейтронов и электронов для первых 20 элементов.',
    },
    dueIn: 3,
    createdAgo: 1,
  },
  {
    id: 'a11',
    kind: 'homework',
    subjectId: 'chemistry',
    classId: '9a',
    title: { uz: 'Oksidlar — 10-mashq', ru: 'Оксиды — упражнение 10' },
    description: {
      uz: 'Oksidlarni turlarga ajrating va reaksiya tenglamalarini tenglashtiring.',
      ru: 'Распределите оксиды по типам и уравняйте реакции.',
    },
    dueIn: 4,
    createdAgo: 1,
  },
  {
    id: 'd1',
    kind: 'homework',
    subjectId: 'math',
    classId: '10a',
    title: { uz: 'Progressiyalar — 21-mashq', ru: 'Прогрессии — упражнение 21' },
    description: {
      uz: 'Arifmetik va geometrik progressiyaga oid masalalar.',
      ru: 'Задачи на арифметическую и геометрическую прогрессию.',
    },
    dueIn: 2,
    createdAgo: 1,
  },
  {
    id: 'd2',
    kind: 'homework',
    subjectId: 'it',
    classId: '10a',
    title: { uz: 'Algoritm blok-sxemasi', ru: 'Блок-схема алгоритма' },
    description: {
      uz: 'Berilgan masala uchun blok-sxema tuzing va qisqacha izohlang.',
      ru: 'Составьте блок-схему для задачи и кратко поясните её.',
    },
    dueIn: 3,
    createdAgo: 2,
  },
  {
    id: 'd3',
    kind: 'homework',
    subjectId: 'physics',
    classId: '10a',
    title: { uz: 'Dinamika — 5, 8-masalalar', ru: 'Динамика — задачи 5, 8' },
    description: {
      uz: 'Nyuton qonunlariga oid masalalar. Kuchlar sxemasini ham chizing.',
      ru: 'Задачи на законы Ньютона. Начертите также схему сил.',
    },
    dueIn: 1,
    createdAgo: 1,
  },
];

export const seedAssignments: Assignment[] = assignmentSeeds.map(
  ({ dueIn, createdAgo, ...rest }) => ({
    ...rest,
    teacherId: teacherForSubject(rest.subjectId, rest.classId),
    /* Deadlines land on teaching days only — no homework is ever due
       on a Sunday, whichever day the demo runs on. */
    dueDate: isoTeachingFromToday(dueIn),
    createdAt: isoTeachingFromToday(-createdAgo),
    origin: 'seed' as const,
  }),
);

/** The biology test in the seed set (a8), due on the next teaching
 *  day. The pinned announcement below refers to this very date, so the
 *  two can never disagree about when it is. */
export const BIOLOGY_TEST_DATE = isoTeachingFromToday(1);

/** Homework the student had already ticked off before the demo starts. */
export const seedCompletedAssignmentIds: ID[] = ['a3'];

/* ---- announcements -------------------------------------------------- */

type AnnouncementSeed = Omit<Announcement, 'date'> & { daysAgo: number };

const announcementSeeds: AnnouncementSeed[] = [
  {
    id: 'an1',
    category: 'exam',
    audience: 'all',
    classId: '9a',
    pinned: true,
    /* "Tomorrow" is computed, not written. The test is scheduled in
       teaching days, so on a Saturday it is the Monday — and an
       announcement that insisted on "ertaga" would be lying about a
       date the student can see two screens away. */
    title: {
      uz: `Biologiyadan nazorat ishi — ${relativeDayWord(BIOLOGY_TEST_DATE, 'uz')}`,
      ru: `Контрольная по биологии — ${relativeDayWord(BIOLOGY_TEST_DATE, 'ru')}`,
    },
    body: {
      uz: '9-A sinf uchun nazorat ishi 21-xonada, 1-darsda oʻtkaziladi. Daftar va qalam olib keling.',
      ru: 'Контрольная для 9-A пройдёт в каб. 21 на первом уроке. Возьмите тетрадь и ручку.',
    },
    daysAgo: 0,
  },
  {
    id: 'an2',
    category: 'event',
    audience: 'all',
    title: {
      uz: 'Maktab fan olimpiadasi — roʻyxatdan oʻtish ochiq',
      ru: 'Школьная олимпиада — открыта регистрация',
    },
    body: {
      uz: 'Matematika, fizika va informatika yoʻnalishlari boʻyicha roʻyxatdan oʻtish shu hafta yakunlanadi.',
      ru: 'Регистрация по математике, физике и информатике завершается на этой неделе.',
    },
    daysAgo: 1,
  },
  {
    id: 'an3',
    category: 'schedule',
    audience: 'all',
    title: { uz: 'Juma kuni 5-dars oʻzgartirildi', ru: 'В пятницу изменён 5-й урок' },
    body: {
      uz: '9-A sinfida juma kuni 5-dars Kimyo xonasida (19-xona) oʻtadi.',
      ru: 'В 9-A в пятницу 5-й урок пройдёт в кабинете химии (каб. 19).',
    },
    daysAgo: 2,
  },
  {
    id: 'an4',
    category: 'general',
    audience: 'all',
    title: { uz: 'Kutubxonaga yangi kitoblar keldi', ru: 'В библиотеку поступили новые книги' },
    body: {
      uz: 'Ilmiy-ommabop adabiyotlar boʻlimi yangilandi. Kutubxona 09:00–17:00 ishlaydi.',
      ru: 'Обновлён раздел научно-популярной литературы. Библиотека работает 09:00–17:00.',
    },
    /* Two teaching days back. The notice board is meant to read as
       "this week": anything older looks like a demo nobody has
       touched since last term. */
    daysAgo: 2,
  },
];

export const announcements: Announcement[] = announcementSeeds
  .map(({ daysAgo, ...rest }) => ({ ...rest, date: isoTeachingFromToday(-daysAgo) }))
  .sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.date.localeCompare(a.date);
  });

/* ---- personal tasks (student-owned, not school-owned) ---------------- */

type PersonalTaskSeed = Omit<PersonalTask, 'dueDate'> & { dueIn: number };

const personalTaskSeeds: PersonalTaskSeed[] = [
  {
    id: 'p1',
    title: { uz: 'Ingliz tili soʻzlarini takrorlash', ru: 'Повторить английские слова' },
    minutes: 20,
    dueIn: 0,
  },
  {
    id: 'p2',
    title: {
      uz: 'Nazorat ishiga tayyorgarlik — 7–10-mavzular',
      ru: 'Подготовка к контрольной — темы 7–10',
    },
    minutes: 40,
    dueIn: 0,
  },
  {
    id: 'p3',
    title: { uz: 'Kitob oʻqish — 30 bet', ru: 'Чтение книги — 30 страниц' },
    minutes: 25,
    dueIn: 0,
  },
];

export const personalTasks: PersonalTask[] = personalTaskSeeds.map(({ dueIn, ...rest }) => ({
  ...rest,
  dueDate: isoFromToday(dueIn),
}));

/* ---- demo identities ------------------------------------------------- */

/** Shohjahon Inoyatov, 9-A — the student a `student` login signs in as. */
export const DEMO_STUDENT_ID: ID = '9a-s1';
/** Adolat Qurbonova, mathematics — the teacher a `teacher` login signs in as. */
export const DEMO_TEACHER_ID: ID = 't1';
