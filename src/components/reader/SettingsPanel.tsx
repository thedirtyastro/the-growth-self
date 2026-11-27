import { useEffect } from 'react';
import { X } from 'lucide-react';
import type {
  ReaderAnimation,
  ReaderAppearance,
  ReaderLayout,
  ReaderQuality,
  ReaderZoom,
} from '../../types/models';
import { useSettingsStore } from '../../store/settings';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pillGroup = <T extends string | number>(
    label: string,
    value: T,
    options: Array<{ value: T; label: string }>,
    onChange: (v: T) => void
  ) => (
    <div>
      <p className="editorial-label mb-2 text-[var(--foreground-secondary)]">{label}</p>
      <div className="grid grid-cols-3 border border-[var(--border)] bg-[var(--paper)]">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-9 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors cursor-pointer ${
              value === opt.value
                ? 'bg-[var(--foreground)] text-[var(--surface)]'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="Reader settings"
      className="fixed right-5 top-16 z-40 w-[calc(100vw-40px)] max-w-[340px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl transition-opacity duration-[180ms]"
    >
      <div className="mb-5 flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
        <span className="editorial-label text-[var(--foreground)]">READER SETTINGS</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reader settings"
          className="inline-flex h-8 w-8 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5">
        {pillGroup<ReaderQuality>(
          'RENDER QUALITY',
          settings.quality,
          [
            { value: 'balanced', label: 'Balanced' },
            { value: 'high', label: 'High' },
            { value: 'ultra', label: 'Ultra' },
          ],
          (quality) => void updateSettings({ quality })
        )}

        {pillGroup<ReaderLayout>(
          'PAGE LAYOUT',
          settings.layout,
          [
            { value: 'spread', label: 'Two-page' },
            { value: 'single', label: 'Single' },
            { value: 'auto', label: 'Auto' },
          ],
          (layout) => void updateSettings({ layout })
        )}

        {pillGroup<ReaderAnimation>(
          'ANIMATION',
          settings.animation,
          [
            { value: 'full', label: 'Full' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'off', label: 'Off' },
          ],
          (animation) => void updateSettings({ animation })
        )}

        {pillGroup<ReaderAppearance>(
          'PAPER TONE',
          settings.appearance,
          [
            { value: 'white', label: 'White' },
            { value: 'warm', label: 'Warm' },
            { value: 'cream', label: 'Cream' },
          ],
          (appearance) => void updateSettings({ appearance })
        )}

        <div>
          <p className="editorial-label mb-2 text-[var(--foreground-secondary)]">
            TEXT ZOOM
          </p>
          <div className="grid grid-cols-4 border border-[var(--border)] bg-[var(--paper)]">
            {([100, 125, 150, 200] as ReaderZoom[]).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => void updateSettings({ textZoom: z })}
                className={`h-9 text-[10px] font-medium tabular-nums transition-colors cursor-pointer ${
                  settings.textZoom === z
                    ? 'bg-[var(--foreground)] text-[var(--surface)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {z}%
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() =>
              void updateSettings({
                readerEngine: settings.readerEngine === '3d' ? 'flat' : '3d',
              })
            }
            className="h-10 border border-[var(--border)] bg-[var(--paper)] text-[10px] font-medium uppercase tracking-[0.11em] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer"
          >
            MODE: {settings.readerEngine === '3d' ? '3D BOOK' : 'FLAT'}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={settings.sound}
            onClick={() => void updateSettings({ sound: !settings.sound })}
            className="h-10 border border-[var(--border)] bg-[var(--paper)] text-[10px] font-medium uppercase tracking-[0.11em] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer"
          >
            SOUND: {settings.sound ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}
