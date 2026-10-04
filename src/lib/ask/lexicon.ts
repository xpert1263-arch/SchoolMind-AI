import type { Weekday } from '@/data/types';

/* ------------------------------------------------------------------
   One table of Uzbek + Russian cues, shared by the router and the
   school-data engine. Keeping them here (rather than inline regex
   scattered through a component) is what lets both stay small.
   ------------------------------------------------------------------ */

/** Topics that unambiguously point at SchoolMind's own records. */
export const SCHOOL_TOPIC = {
  lesson: ['dars', 'jadval', 'урок', 'уроч', 'расписан', 'пара'],
  homework: ['vazifa', 'topshiriq', 'uy ishi', 'домашк', 'домашн', 'задани'],
  test: ['nazorat', 'imtihon', 'sinov', 'контрольн', 'экзамен', 'тест'],
  teacher: ['ustoz', "o'qituvchi", 'muallim', 'учитель', 'преподавател', 'ведет', 'ведёт'],
  room: ['xona', 'kabinet', 'хона', 'кабинет', 'аудитор'],
  announcement: ["e'lon", 'xabar', 'объявлен'],
  school: ['maktab', 'maktabim', 'akademiya', 'школ', 'академи'],
  /* First-person forms only. A bare "ism" or "класс" would fire on
     general questions; "ismim" and "sinfim" cannot. */
  identity: ['ismim', 'ismimni', 'familiyam', 'kimman', 'меня зовут', 'мое имя', 'моё имя', 'кто я'],
  myClass: [
    'sinfim',
    'sinfda',
    'sinfdaman',
    "o'qiyman",
    'мой класс',
    'моем классе',
    'моём классе',
    'каком классе',
    'какой класс',
    'учусь',
  ],
} as const;

/** Short words that need whole-word matching to avoid colliding. */
export const SCHOOL_TOPIC_WORDS = {
  teacher: ['kim', 'kimdir', 'кто'],
  room: ['qayerda', 'qaerda', 'где'],
} as const;

export const TIME_CUES = {
  today: ['bugun', 'сегодня', 'сегодняшн'],
  tomorrow: ['ertaga', 'ertangi', 'завтра', 'завтрашн'],
  yesterday: ['kecha', 'вчера'],
  week: ['hafta', 'недел'],
} as const;

export const ORDINAL_CUES = {
  first: ['birinchi', '1-dars', 'первый', 'первым', 'перв'],
  next: ['keyingi', 'navbatdagi', 'следующ', 'ближайш'],
  last: ['oxirgi', 'последн'],
} as const;

export const QUESTION_CUES = {
  count: ['nechta', 'necha', 'qancha', 'сколько'],
  when: ['qachon', 'когда', 'во сколько', 'soat necha'],
  deadline: ['muddat', 'qachongacha', 'срок', 'до какого', 'сдавать', 'сдать'],
} as const;

/**
 * Cues that an answer can only come from outside SchoolMind: news, the
 * open internet, a source to cite. These are unambiguous — none of them
 * can mean something about the timetable — so they mark a question as
 * needing live search on their own.
 */
export const WEB_CUES = {
  stems: [
    'yangilik',
    'internetdan',
    'internetda',
    'internet',
    'manba',
    'maqola',
    'ob-havo',
    "ob'havo",
    'obhavo',
    'eng yangi',
    'новост',
    'интернет',
    'источник',
    'погод',
    'свеж',
    'курс валют',
  ],
  words: ['top', 'topib', 'toping', 'topsang', 'qidir', 'qidirib', 'найди', 'найти', 'поищи', 'ищи'],
} as const;

/**
 * "As of right now" cues. These are genuinely ambiguous: "bugungi
 * darslarim" is a timetable question and "bugungi yangiliklar" is not,
 * so they only mean live information when nothing in the question
 * points at a SchoolMind record.
 */
export const LIVE_CUES = [
  'bugungi',
  'hozir',
  'hozirgi',
  'ayni paytda',
  'joriy',
  "so'nggi",
  'songgi',
  'сегодня',
  'сегодняшн',
  'сейчас',
  'последн',
  'нынешн',
  'актуальн',
  'на данный момент',
] as const;

/** Cues that the student wants an explanation rather than a record. */
export const EXPLAIN_CUES = [
  'tushuntir',
  'nima degani',
  "ma'nosi",
  'izohla',
  'nega',
  'qanday ishlaydi',
  'farqi',
  'объясни',
  'что такое',
  'почему',
  'как работает',
  'разниц',
] as const;

/** Weekday names and stems, ISO numbering (1 = Monday). */
export const WEEKDAY_CUES: Array<{ weekday: Weekday; stems: string[] }> = [
  { weekday: 1, stems: ['dushanba', 'понедельник', 'понедельн'] },
  { weekday: 2, stems: ['seshanba', 'вторник'] },
  { weekday: 3, stems: ['chorshanba', 'среда', 'среду', 'сред'] },
  { weekday: 4, stems: ['payshanba', 'четверг'] },
  { weekday: 5, stems: ['juma', 'пятниц'] },
  { weekday: 6, stems: ['shanba', 'суббот'] },
  { weekday: 7, stems: ['yakshanba', 'воскрес'] },
];

/** Extra ways students name a subject, beyond its dictionary names. */
export const SUBJECT_ALIASES: Record<string, string[]> = {
  math: ['matem', 'algebra', 'geometr', 'матем', 'алгебр', 'геометр'],
  physics: ['fizik', 'физик'],
  biology: ['biolog', 'биолог'],
  english: ['ingliz', 'англ', 'english'],
  history: ['tarix', 'истор'],
  native: ['ona tili', 'onatili', 'родн', 'узбекск'],
  it: ['informatika', 'informat', 'kompyuter', 'информат', 'компьютер'],
};
