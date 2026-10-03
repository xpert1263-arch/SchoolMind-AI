import {
  ArrowUpRight,
  DoorClosed,
  Globe,
  GraduationCap,
  Info,
  School,
  Sparkles,
  User,
} from 'lucide-react';
import { announcements as allAnnouncements, school } from '@/data/school';
import {
  fullName,
  initialsOf,
  scheduledLessonById,
  subjectById,
  teacherById,
  toHomeworkItem,
} from '@/data/queries';
import type { AnswerBlock, AnswerSource } from '@/lib/ask/types';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/dates';
import { useAllAssignments, useCurrentStudent } from '@/state/selectors';
import { useApp } from '@/state/store';
import { Avatar } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/Feedback';
import { Panel, Rows } from '@/components/ui/Surface';
import { SubjectDot } from '@/components/ui/Status';
import { AnnouncementRow } from '@/components/school/AnnouncementRow';
import { HomeworkRow } from '@/components/school/HomeworkRow';
import { LessonRow } from '@/components/school/LessonRow';

/* Answers are composed of these blocks rather than one prose dump, so
   a schedule looks like a schedule and homework stays interactive. */

const BADGE_STYLE: Record<AnswerSource, string> = {
  school: 'bg-accent-soft text-accent-text border-accent-line',
  ai: 'bg-surface-muted text-ink-muted border-line',
  web: 'bg-info-soft text-info-text border-info-line',
};

export function SourceBadges({ sources }: { sources: AnswerSource[] }) {
  const { t } = useI18n();
  if (sources.length === 0) return null;

  const icon = {
    school: <GraduationCap size={12} aria-hidden />,
    ai: <Sparkles size={12} aria-hidden />,
    web: <Globe size={12} aria-hidden />,
  } as const;

  const label = {
    school: t('ask.badgeSchool'),
    ai: t('ask.badgeAi'),
    web: t('ask.badgeWeb'),
  } as const;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.map((source) => (
        <span
          key={source}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
            BADGE_STYLE[source],
          )}
        >
          {icon[source]}
          {label[source]}
        </span>
      ))}
    </div>
  );
}

/** Renders model prose, turning "- " runs into a real list. */
function TextBlock({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•*]\s+/.test(l));

  if (bullets.length >= 2 && bullets.length === lines.length) {
    return (
      <ul className="flex flex-col gap-1.5">
        {bullets.map((line, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink">
            <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0">{line.replace(/^[-•*]\s+/, '')}</span>
          </li>
        ))}
      </ul>
    );
  }

  return <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{text}</p>;
}

export function AnswerBlockView({ block }: { block: AnswerBlock }) {
  const { t, text: localized, locale } = useI18n();
  const { state, toggleAssignmentDone } = useApp();
  const assignments = useAllAssignments();
  const currentStudent = useCurrentStudent();

  switch (block.kind) {
    case 'text':
      return <TextBlock text={block.text} />;

    case 'lesson': {
      const entry = scheduledLessonById(block.lessonId);
      if (!entry) return null;
      return (
        <Panel>
          <p className="border-b border-line px-4 py-2 text-[12px] text-ink-subtle">
            {formatLongDate(block.dateISO, locale)}
          </p>
          <Rows>
            <LessonRow entry={entry} />
          </Rows>
        </Panel>
      );
    }

    case 'schedule': {
      const entries = block.lessonIds
        .map(scheduledLessonById)
        .filter((e): e is NonNullable<typeof e> => Boolean(e));
      if (entries.length === 0) return null;
      return (
        <Panel>
          <Rows>
            {entries.map((entry) => (
              <LessonRow key={entry.lesson.id} entry={entry} />
            ))}
          </Rows>
        </Panel>
      );
    }

    case 'homework':
    case 'tests': {
      const items = block.assignmentIds
        .map((id) => assignments.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .map((a) => toHomeworkItem(a, state.completedAssignmentIds));
      if (items.length === 0) return null;
      return (
        <Panel>
          <Rows>
            {items.map((item) => (
              <HomeworkRow
                key={item.assignment.id}
                item={item}
                onToggle={block.kind === 'homework' ? toggleAssignmentDone : undefined}
              />
            ))}
          </Rows>
        </Panel>
      );
    }

    case 'announcements': {
      const items = block.announcementIds
        .map((id) => allAnnouncements.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      if (items.length === 0) return null;
      return (
        <Panel>
          <Rows>
            {items.map((item) => (
              <AnnouncementRow key={item.id} item={item} />
            ))}
          </Rows>
        </Panel>
      );
    }

    case 'subject': {
      const subject = subjectById(block.subjectId);
      const teacher = teacherById(block.teacherId);
      return (
        <Panel className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <SubjectDot subject={subject} size={9} />
            {localized(subject.name)}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <DoorClosed size={14} aria-hidden className="text-ink-subtle" />
            {t('common.roomShort', { room: block.room })}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <User size={14} aria-hidden className="text-ink-subtle" />
            {fullName(teacher)}
          </span>
        </Panel>
      );
    }

    case 'profile': {
      const { student, schoolClass } = currentStudent;
      return (
        <Panel className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
          <span className="flex items-center gap-2.5">
            <Avatar name={fullName(student)} initials={initialsOf(student)} size={32} />
            <span className="text-[15px] font-semibold text-ink">{fullName(student)}</span>
          </span>
          <span className="text-[13px] text-ink-muted">
            {t('mode.student')} · {schoolClass.name}
          </span>
          <span className="text-[13px] text-ink-muted">{localized(school.name)}</span>
        </Panel>
      );
    }

    case 'school': {
      const { schoolClass } = currentStudent;
      return (
        <Panel className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <School size={16} aria-hidden className="text-accent-text" />
            {localized(school.name)}
          </span>
          <span className="text-[13px] text-ink-muted">{localized(school.city)}</span>
          <span className="text-[13px] text-ink-muted">
            {t('common.class')}: {schoolClass.name}
          </span>
        </Panel>
      );
    }

    case 'sources':
      return (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
            <Globe size={12} aria-hidden />
            {t('ask.sourcesTitle')}
          </h3>
          <Panel>
            <Rows>
              {block.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted/70"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-info-soft text-[10px] font-semibold uppercase text-info-text">
                      {source.domain.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[13.5px] font-medium leading-snug text-ink group-hover:text-accent-text">
                        {source.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">
                        {source.domain}
                      </span>
                    </span>
                    <ArrowUpRight
                      size={14}
                      aria-hidden
                      className="mt-1 shrink-0 text-ink-subtle group-hover:text-accent-text"
                    />
                  </a>
                </li>
              ))}
            </Rows>
          </Panel>
        </section>
      );

    case 'warning':
      return (
        <p className="flex items-start gap-2 rounded-md border border-warn-line bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-warn-text">
          <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
          {t(block.textKey)}
        </p>
      );

    case 'empty':
      return (
        <EmptyState
          dense
          title={t(block.titleKey)}
          body={block.bodyKey ? t(block.bodyKey) : undefined}
        />
      );

    default:
      return null;
  }
}
