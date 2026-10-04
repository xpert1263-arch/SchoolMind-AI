import { useCallback, useState } from 'react';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { useCurrentTeacher } from '@/state/selectors';
import { postTeacherAi } from './client';

/* ------------------------------------------------------------------
   Drafting a message to a parent.

   Deliberately separate from the Teacher AI conversation: a draft is
   not a chat turn, it is text that lands in a composer the teacher
   then edits. Keeping it apart is also what stops a draft from being
   mistaken for something sent.

   This hook CANNOT send anything. It returns a string. Delivery is a
   different call, behind a Send button the teacher presses, after the
   server has checked they teach the pupil.
   ------------------------------------------------------------------ */

export interface UseMessageDraft {
  busy: boolean;
  errorText: string | null;
  /** Returns the drafted text, or null when no provider could write it. */
  draft: (input: { studentName: string; recipientLabel: string; intent: string }) => Promise<
    string | null
  >;
}

export function useMessageDraft(): UseMessageDraft {
  const { t, locale } = useI18n();
  const { teacher } = useCurrentTeacher();
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const draft = useCallback(
    async ({
      studentName,
      recipientLabel,
      intent,
    }: {
      studentName: string;
      recipientLabel: string;
      intent: string;
    }) => {
      if (busy) return null;
      setBusy(true);
      setErrorText(null);

      /* The instruction is explicit about what the model does not
         know, because a message to a parent is the worst possible
         place to invent a mark or an absence. */
      const message = [
        t('parents.draftInstruction', {
          student: studentName,
          recipient: recipientLabel,
          teacher: fullName(teacher),
        }),
        intent.trim() ? t('parents.draftIntent', { intent: intent.trim() }) : '',
        t('parents.draftRules'),
      ]
        .filter(Boolean)
        .join('\n');

      const response = await postTeacherAi({
        action: 'chat',
        locale,
        teacherId: teacher.id,
        teacherName: fullName(teacher),
        message,
      });

      setBusy(false);

      if (!response.ok || !response.chat?.text) {
        setErrorText(t('parents.draftFailed'));
        return null;
      }
      return response.chat.text;
    },
    [busy, locale, t, teacher],
  );

  return { busy, errorText, draft };
}
