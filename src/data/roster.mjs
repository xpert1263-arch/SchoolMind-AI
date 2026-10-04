/* ------------------------------------------------------------------
   Who teaches what, to whom — and nothing else.

   This table is the school's permission matrix: a teacher may only
   set work for, see, or contact a class and subject they appear
   against. From v1.6 it is also enforced on the SERVER, because
   Parent Connect lets a teacher reach a child's family and "the
   browser said so" is not an authorisation.

   It therefore lives in plain JavaScript rather than inside
   src/data/school.ts, so the Node side can import the very same rows
   the UI renders instead of keeping a copy that can drift. There is
   nothing secret here: it is the same roster the client already ships.

   Student ids are structural — `<classId>-s<n>` — so a student's class
   can be read back off their id without a second table.
   ------------------------------------------------------------------ */

/** @type {Array<{teacherId: string, subjectId: string, classIds: string[]}>} */
export const teachingAssignments = [
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

/* Teacher names live here, not only in school.ts, because the server
   signs a parent message with the teacher who sent it. A courtesy
   signature taken from the request body would be a claim; taken from
   the authorised id it is a fact. Job titles stay in school.ts, where
   they are UI copy rather than identity. */

/** @type {Array<{id: string, firstName: string, lastName: string}>} */
export const teacherIdentities = [
  { id: 't1', firstName: 'Adolat', lastName: 'Qurbonova' },
  { id: 't2', firstName: 'Bekzod', lastName: 'Tursunov' },
  { id: 't3', firstName: 'Dilnoza', lastName: 'Yusupova' },
  { id: 't4', firstName: 'Kamola', lastName: 'Saidova' },
  { id: 't5', firstName: 'Jasur', lastName: 'Ergashev' },
  { id: 't6', firstName: 'Gulnora', lastName: 'Ismoilova' },
  { id: 't7', firstName: 'Sardor', lastName: 'Qodirov' },
  { id: 't8', firstName: 'Shahnoza', lastName: 'Umarova' },
];

/** The display name of a teacher id, or '' if it names nobody. */
export function teacherNameOf(teacherId) {
  const found = teacherIdentities.find((entry) => entry.id === teacherId);
  return found ? `${found.firstName} ${found.lastName}` : '';
}

/** Every class in the school. */
export const classIds = ['8a', '9a', '10a'];

/** Students per class. Six each; ids run `<classId>-s1` … `-s6`. */
export const studentsPerClass = 6;

/** The class a student id belongs to, or null if it names nobody. */
export function classOfStudentId(studentId) {
  if (typeof studentId !== 'string') return null;
  const match = /^([a-z0-9]+)-s(\d+)$/.exec(studentId);
  if (!match) return null;
  const [, classId, index] = match;
  if (!classIds.includes(classId)) return null;
  const n = Number(index);
  return n >= 1 && n <= studentsPerClass ? classId : null;
}

/** Subjects `teacherId` may set work in for `classId` — empty when the
 *  teacher does not teach that class at all. */
export function subjectIdsTaughtBy(teacherId, classId) {
  return teachingAssignments
    .filter((row) => row.teacherId === teacherId && row.classIds.includes(classId))
    .map((row) => row.subjectId);
}

/** True when this teacher teaches this class anything at all. This is
 *  the gate for seeing a pupil's record and for contacting a parent. */
export function teacherTeachesClass(teacherId, classId) {
  return teachingAssignments.some(
    (row) => row.teacherId === teacherId && row.classIds.includes(classId),
  );
}

/** True when this teacher is authorised for this individual student. */
export function teacherTeachesStudent(teacherId, studentId) {
  const classId = classOfStudentId(studentId);
  return classId !== null && teacherTeachesClass(teacherId, classId);
}
