'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, FileText, ArrowRight, Sparkles, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Every industry a starter template can be tagged with. `null` means
 * "show all".
 */
export type IndustryFilter = string | null;

/**
 * Template selectable in step 1. Wraps the DB row with the flag the
 * wizard needs to render the "WhatsApp" vs "Starter" badge, and to
 * gate the email channel (only starter / non-Meta templates can be
 * reused as plain email bodies without a Meta round-trip).
 */
export interface WizardTemplate extends MessageTemplate {
  /** True when the template was authored locally and is not a Meta row. */
  isStarter: boolean;
}

const INDUSTRIES = [
  'general',
  'saas',
  'ecommerce',
  'health',
  'fitness',
  'education',
  'restaurant',
  'agency',
  'b2b',
  'realestate',
] as const;

export const INDUSTRY_LABELS: Record<string, string> = {};

function toWizardTemplate(row: MessageTemplate): WizardTemplate {
  return {
    ...row,
    isStarter: row.is_built_in === true,
  };
}

function categoryColor(category: string): string {
  switch (category) {
    case 'Marketing':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'Utility':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'Authentication':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    default:
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  }
}

export type BroadcastChannel = 'whatsapp' | 'email';

/** Language narrowing for the catalogue. `all` keeps every locale. */
export type LanguageFilter = 'all' | 'fr' | 'en';

interface Step1Props {
  selectedTemplate: WizardTemplate | null;
  onSelect: (template: WizardTemplate) => void;
  industry: IndustryFilter;
  onIndustryChange: (industry: IndustryFilter) => void;
  /** Channel picked in step 4 — the wizard shows only templates
   *  whose `channel` matches. Legacy templates without a channel
   *  are treated as 'whatsapp'. */
  channel: BroadcastChannel;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Step 1 of the broadcast wizard — pick a template.
 *
 * Loads every template in the account and shows them all, but splits
 * them visually:
 *   - built-in starters (is_built_in = true, no Meta counterpart) get
 *     a "Starter" badge and a Sparkles icon; they can be sent on the
 *     Email channel without a Meta round-trip.
 *   - Meta-synced rows keep the classic category chip.
 *
 * The industry filter (top of the screen) narrows the list to one
 * company type. `null` shows everything.
 */
export function Step1ChooseTemplate({
  selectedTemplate,
  onSelect,
  industry,
  onIndustryChange,
  channel,
  onNext,
  onBack,
}: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [templates, setTemplates] = useState<WizardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<LanguageFilter>('all');

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        // Every locally visible template: Meta-synced AND built-in
        // starters. The wizard's email channel depends on the starters
        // existing without Meta, so we can no longer filter by
        // status='APPROVED' alone — a starter row is APPROVED locally
        // but has no meta_template_id.
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .order('is_built_in', { ascending: false })
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setTemplates((data ?? []).map(toWizardTemplate));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('chooseTemplate.errorLoad'));
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, [t]);

  const visibleTemplates = useMemo(() => {
    let list = templates;
    if (industry) list = list.filter((tpl) => tpl.industry === industry);
    // Filter by channel: show only templates tagged for the picked
    // channel. Legacy templates (no channel column) default to
    // 'whatsapp', so they show only in WhatsApp mode.
    list = list.filter((tpl) => (tpl.channel ?? 'whatsapp') === channel);
    // Language narrowing — the catalogue ships an English and a French
    // variant of every starter, so this is the fastest way to surface
    // the French set. Rows without a language count as English.
    if (language !== 'all') {
      list = list.filter((tpl) =>
        (tpl.language ?? 'en').toLowerCase().startsWith(language),
      );
    }
    return list;
  }, [templates, industry, channel, language]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('chooseTemplate.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('chooseTemplate.subtitle')}
        </p>
      </div>

      {/* Industry + language filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <Select
          value={industry ?? 'all'}
          onValueChange={(v) => onIndustryChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-56 border-border bg-muted text-foreground">
            <SelectValue placeholder={t('chooseTemplate.allIndustries')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            <SelectItem value="all">{t('chooseTemplate.allIndustries')}</SelectItem>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {t(`chooseTemplate.industries.${ind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={language}
          onValueChange={(v) => setLanguage(v as LanguageFilter)}
        >
          <SelectTrigger className="w-40 border-border bg-muted text-foreground">
            <SelectValue placeholder={t('chooseTemplate.allLanguages')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            <SelectItem value="all">{t('chooseTemplate.allLanguages')}</SelectItem>
            <SelectItem value="fr">{t('chooseTemplate.languages.fr')}</SelectItem>
            <SelectItem value="en">{t('chooseTemplate.languages.en')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('chooseTemplate.headerImageHint')}{' '}
        <a
          href="/settings?tab=templates"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2"
        >
          {t('chooseTemplate.headerImageLink')}
        </a>
      </p>

      {visibleTemplates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('chooseTemplate.noTemplates')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('chooseTemplate.createFirst')}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('chooseTemplate.noTemplatesForChannel', {
              channel: channel === 'email' ? 'Email' : 'WhatsApp',
            })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            const catColor = categoryColor(template.category);

            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card/50 hover:border-border hover:bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                  <div className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        (template.channel ?? 'whatsapp') === 'email'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                          : 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {(template.channel ?? 'whatsapp') === 'email' ? 'Email' : 'WhatsApp'}
                    </span>
                    {template.isStarter ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        <Sparkles className="h-2.5 w-2.5" />
                        {t('chooseTemplate.builtIn')}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                      >
                        {template.category}
                      </span>
                    )}
                  </div>
                </div>
                {template.header_type === 'image' && template.header_media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={template.header_media_url}
                    alt={template.name}
                    className="h-24 w-full rounded-md border border-border object-cover"
                  />
                ) : template.header_type === 'text' && template.header_content ? (
                  <p className="line-clamp-1 text-xs font-medium text-foreground">
                    {template.header_content}
                  </p>
                ) : null}
                <p className="line-clamp-3 text-xs text-muted-foreground">{template.body_text}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {template.isStarter && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {template.industry ? t(`chooseTemplate.industries.${template.industry}`) : ''}
                    </span>
                  )}
                  <span>{template.language ?? 'en_US'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
