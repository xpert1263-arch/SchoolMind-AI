import { useRef, useState, type DragEvent } from 'react';
import { Camera, ImageUp, Loader2, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { ACCEPT_ATTRIBUTE, formatBytes } from '@/lib/snap/image';
import { HELP_LEVELS, type HelpLevel, type SelectedImage, type SnapStatus } from '@/lib/snap/types';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Surface';

/* Upload, preview and the help-level choice. Analysis only runs when
   the student presses the button — never on selection. */

export function ImageWorkspace({
  image,
  status,
  mode,
  onSelect,
  onRemove,
  onAnalyse,
  onModeChange,
}: {
  image: SelectedImage | null;
  status: SnapStatus;
  mode: HelpLevel;
  onSelect: (file: File) => void;
  onRemove: () => void;
  onAnalyse: () => void;
  onModeChange: (mode: HelpLevel) => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const busy = status === 'analysing';

  const pick = (file?: File | null) => {
    if (file) onSelect(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  };

  const helpLabel: Record<HelpLevel, string> = {
    hint: t('snap.helpHint'),
    explain: t('snap.helpExplain'),
    solve: t('snap.helpSolve'),
  };
  const helpNote: Record<HelpLevel, string> = {
    hint: t('snap.helpHintNote'),
    explain: t('snap.helpExplainNote'),
    solve: t('snap.helpSolveNote'),
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label={t('snap.a11yChoose')}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {/* `capture` asks a phone for the camera; desktop ignores it. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={t('snap.camera')}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {image ? (
        <Panel className="overflow-hidden">
          <img
            src={image.dataUrl}
            alt={t('snap.a11yPreview')}
            className="max-h-[420px] w-full bg-surface-sunken object-contain"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5">
            <span className="truncate text-[12px] text-ink-subtle">
              {image.width}×{image.height} · {formatBytes(image.sizeBytes)}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileRef.current?.click()}
                iconLeft={<RefreshCw size={13} aria-hidden />}
              >
                {t('snap.replace')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                iconLeft={<Trash2 size={13} aria-hidden />}
              >
                {t('snap.remove')}
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft/60' : 'border-line bg-surface-muted/40',
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-accent-text shadow-subtle">
            <ImageUp size={20} aria-hidden />
          </span>
          <div>
            <p className="text-[14px] font-medium text-ink">{t('snap.dropHint')}</p>
            <p className="mt-1 text-[12px] text-ink-subtle">{t('snap.formats')}</p>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => fileRef.current?.click()}
              iconLeft={<ImageUp size={15} aria-hidden />}
            >
              {t('snap.upload')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => cameraRef.current?.click()}
              iconLeft={<Camera size={15} aria-hidden />}
            >
              {t('snap.camera')}
            </Button>
          </div>
        </div>
      )}

      {image ? (
        <Panel className="flex flex-col gap-3 px-4 py-3.5">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('snap.helpTitle')}
            </p>
            <div
              role="radiogroup"
              aria-label={t('snap.helpTitle')}
              className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-line bg-surface-muted p-0.5"
            >
              {HELP_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={level === mode}
                  disabled={busy}
                  onClick={() => onModeChange(level)}
                  className={cn(
                    'rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-60',
                    level === mode
                      ? 'bg-surface text-ink shadow-subtle'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {helpLabel[level]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-subtle">{helpNote[mode]}</p>
          </div>

          <Button
            variant="primary"
            size="lg"
            disabled={busy}
            onClick={onAnalyse}
            iconLeft={
              busy ? (
                <Loader2 size={15} aria-hidden className="animate-spin" />
              ) : (
                <Wand2 size={15} aria-hidden />
              )
            }
          >
            {status === 'done' ? t('snap.reanalyze') : t('snap.analyze')}
          </Button>
        </Panel>
      ) : null}
    </div>
  );
}
