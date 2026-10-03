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
  TeachingAssignment,
  Weekday,
} from './types';
import { isoFromToday } from '@/lib/dates';

/* ------------------------------------------------------------------
   Demo dataset — one small, believable Uzbek school.

   Everything dated is expressed as an offset from "today" so the demo
   never looks stale during a presentation.
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
 * Who teaches what, to whom. This is the single source of truth for the
 * teacher/subject/class relation: the teacher roster, the timetable and
 * the assignment form all derive from it, so a teacher is never offered
 * a subject they do not actually teach to the selected class.
 *
 * Adolat carries mathematics across all three classes and physics for
 * 10-A — a normal pairing, and the reason subject choice is a real
 * decision in the assignment form rather than a single fixed value.
 *
 * Every row here is a permission as much as a fact: a teacher may only
 * set work for a class and subject they appear against.
 */
export const teachingAssignments: TeachingAssignment[] = [
  { teacherId: 't1', subjectId: 'math', classIds: ['8a', '9a', '10a'] },
  { teacherId: 't1', subjectId: 'physics', classIds: ['10a'] },
  { teacherId: 't2', subjectId: 'physics', classIds: ['8a', '9a'] },
  { teacherId: 't3', subjectId: 'biology', classIds: ['8a', '9a', '10a'] },
  { teacherId: 't4', subjectId: 'english', classIds: ['8a', '9a', '10a'] },
  { teacherId: 't5', subjectId: 'history', classIds: ['8a', '9a', '10a'] },
  { teacherId: 't6', subjectId: 'native', classIds: ['8a', '9a', '10a'] },
  { teacherId: 't7', subjectId: 'it', classIds: ['9a', '10a'] },
  { teacherId: 't8', subjectId: 'chemistry', classIds: ['8a', '9a', '10a'] },
];

interface TeacherSeed {
  id: ID;
  firstName: string;
  lastName: string;
  title: LocalizedText;
}

const teacherSeeds: TeacherSeed[] = [
  {
    id: 't1',
    firstName: 'Adolat',
    lastName: 'Qurbonova',
    title: { uz: 'Matematika va fizika oʻqituvchisi', ru: 'Учитель математики и физики' },
  },
  {
    id: 't2',
    firstName: 'Bekzod',
    lastName: 'Tursunov',
    title: { uz: 'Fizika oʻqituvchisi', ru: 'Учитель физики' },
  },
  {
    id: 't3',
    firstName: 'Dilnoza',
    lastName: 'Yusupova',
    title: { uz: 'Biologiya oʻqituvchisi', ru: 'Учитель биологии' },
  },
  {
    id: 't4',
    firstName: 'Kamola',
    lastName: 'Saidova',
    title: { uz: 'Ingliz tili oʻqituvchisi', ru: 'Учитель английского' },
  },
  {
    id: 't5',
    firstName: 'Jasur',
    lastName: 'Ergashev',
    title: { uz: 'Tarix oʻqituvchisi', ru: 'Учитель истории' },
  },
  {
    id: 't6',
    firstName: 'Gulnora',
    lastName: 'Ismoilova',
    title: { uz: 'Ona tili oʻqituvchisi', ru: 'Учитель родного языка' },
  },
  {
    id: 't7',
    firstName: 'Sardor',
    lastName: 'Qodirov',
    title: { uz: 'Informatika oʻqituvchisi', ru: 'Учитель информатики' },
  },
  {
    id: 't8',
    firstName: 'Shahnoza',
    lastName: 'Umarova',
    title: { uz: 'Kimyo oʻqituvchisi', ru: 'Учитель химии' },
  },
];

/** A teacher's subjects and classes are the union of their teaching rows. */
export const teachers: Teacher[] = teacherSeeds.map((seed) => {
  const rows = teachingAssignments.filter((row) => row.teacherId === seed.id);
  return {
    ...seed,
    subjectIds: [...new Set(rows.map((row) => row.subjectId))],
    classIds: [...new Set(rows.flatMap((row) => row.classIds))],
  };
});

/** The teacher who delivers `subjectId` to `classId`. */
export function teacherForSubject(subjectId: ID, classId: ID): ID {
  const row = teachingAssignments.find(
    (entry) => entry.subjectId === subjectId && entry.classIds.includes(classId),
  );
  if (!row) throw new Error(`No teacher teaches ${subjectId} to ${classId}`);
  return row.teacherId;
}

/** Subjects a teacher may set work in for a given class. */
export function subjectIdsTaughtBy(teacherId: ID, classId: ID): ID[] {
  return teachingAssignments
    .filter((row) => row.teacherId === teacherId && row.classIds.includes(classId))
    .map((row) => row.subjectId);
}

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
    createdAgo: 3,
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
    createdAgo: 4,
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
    createdAgo: 4,
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
    createdAgo: 6,
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
    createdAgo: 5,
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
    createdAgo: 5,
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
    dueDate: isoFromToday(dueIn),
    createdAt: isoFromToday(-createdAgo),
    origin: 'seed' as const,
  }),
);

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
    title: { uz: 'Biologiyadan nazorat ishi — ertaga', ru: 'Контрольная по биологии — завтра' },
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
    daysAgo: 4,
  },
];

export const announcements: Announcement[] = announcementSeeds
  .map(({ daysAgo, ...rest }) => ({ ...rest, date: isoFromToday(-daysAgo) }))
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
