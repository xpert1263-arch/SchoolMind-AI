import { AnimatePresence, motion } from 'framer-motion';
import type { AppMode } from '@/data/types';
import { modeIcons } from '@/app/navigation';
import { fullName, initialsOf, subjectById } from '@/data/queries';
import { useCurrentStudent, useCurrentTeacher } from '@/state/selectors';
import { Avatar } from '@/components/ui/Display';
import { useI18n } from '@/i18n/useI18n';

/** Shows whose workspace is open — the thing that makes the mode
 *  switch feel like changing context rather than changing website. */
export function WorkspaceBadge({ mode }: { mode: AppMode }) {
  const { t, text } = useI18n();
  const { student, schoolClass } = useCurrentStudent();
  const { teacher } = useCurrentTeacher();
  const Icon = modeIcons[mode];

  const person = mode === 'student' ? student : teacher;
  /* The mode label already says "teacher", so the caption carries the
     subject rather than repeating the job title. */
  const caption =
    mode === 'student'
      ? schoolClass.name
      : /* Several subjects would truncate mid-word in this narrow row,
           so only the first is named and the rest are counted. */
        [
          text(subjectById(teacher.subjectIds[0]).name),
          teacher.subjectIds.length > 1 ? `+${teacher.subjectIds.length - 1}` : null,
        ]
          .filter(Boolean)
          .join(' ');

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface-muted px-3 py-2.5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          className="flex items-center gap-2.5"
        >
          <Avatar name={fullName(person)} initials={initialsOf(person)} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{fullName(person)}</p>
            <p className="flex items-center gap-1 truncate text-[11.5px] text-ink-subtle">
              <Icon size={11} aria-hidden />
              {t(`mode.${mode}`)} · {caption}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
