import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { mergeUniqueTags, normalizeTag } from '../../lib/domain/tags';

interface TagEditorProps {
  tags: string[];
  onChange: (nextTags: string[]) => void;
  suggestions?: string[];
  inputId?: string;
  placeholder?: string;
  compact?: boolean;
}

export function TagEditor({
  tags,
  onChange,
  suggestions = [],
  inputId = 'book-tag-input',
  placeholder = 'Add tag (e.g. Classic, Must Read)...',
  compact = false,
}: TagEditorProps) {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const clean = normalizeTag(raw);
    if (!clean) return;
    onChange(mergeUniqueTags([...tags, clean]));
    setDraft('');
  };

  const removeTag = (target: string) => {
    const key = normalizeTag(target).toLowerCase();
    onChange(tags.filter((t) => normalizeTag(t).toLowerCase() !== key));
  };

  const activeSet = new Set(tags.map((t) => normalizeTag(t).toLowerCase()));
  const availableSuggestions = suggestions
    .filter((s) => !activeSet.has(normalizeTag(s).toLowerCase()))
    .slice(0, 8);

  return (
    <div className="space-y-2.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Assigned book tags">
          {tags.map((tag) => (
            <span
              key={tag}
              role="listitem"
              className="inline-flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--foreground)]"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="inline-flex h-5 w-5 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--foreground)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag(draft);
            }
          }}
          placeholder={placeholder}
          className={`${compact ? 'h-10' : 'h-11'} flex-1 border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]`}
        />
        <button
          type="button"
          onClick={() => addTag(draft)}
          disabled={!normalizeTag(draft)}
          className={`${compact ? 'h-10 px-3.5' : 'h-11 px-4'} inline-flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--surface)] text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-45 cursor-pointer disabled:cursor-default`}
        >
          <Plus className="h-3.5 w-3.5" />
          ADD TAG
        </button>
      </div>

      {availableSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="editorial-label mr-1 text-[var(--foreground-secondary)]">
            SUGGESTED:
          </span>
          {availableSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              aria-label={`Add suggested tag ${s}`}
              className="border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--foreground-secondary)] transition-colors hover:border-[var(--foreground)] hover:text-[var(--foreground)] cursor-pointer"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
