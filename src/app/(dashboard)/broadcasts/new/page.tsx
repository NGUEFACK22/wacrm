'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Step1ChooseTemplate,
  WizardTemplate,
  IndustryFilter,
} from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Contact } from '@/types';

const steps = [
  { label: 'template', key: 'template' },
  { label: 'audience', key: 'audience' },
  { label: 'personalize', key: 'personalize' },
  { label: 'send', key: 'send' },
] as const;

export type BroadcastChannel = 'whatsapp' | 'email';

export default function NewBroadcastPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.new');
  const tWizard = useTranslations('Broadcasts.wizard');
  const { accountId } = useAuth();
  const { createAndSendBroadcast, isProcessing, progress } = useBroadcastSending();

  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<WizardTemplate | null>(null);
  const [industry, setIndustry] = useState<IndustryFilter>(null);
  const [audience, setAudience] = useState<{
    type: 'all' | 'tags' | 'custom_field' | 'csv';
    tagIds?: string[];
    customField?: {
      fieldId: string;
      operator: 'is' | 'is_not' | 'contains';
      value: string;
    };
    csvContacts?: { phone: string; name?: string }[];
    excludeTagIds?: string[];
  }>({ type: 'all' });
  const [variables, setVariables] = useState<
    Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>
  >({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [name, setName] = useState('');
  /** Which channel the user picked to deliver on step 4. */
  const [channel, setChannelState] = useState<BroadcastChannel>('whatsapp');

  function setChannel(next: BroadcastChannel) {
    setChannelState(next);
    // Clear template selection if it doesn't match the new channel —
    // step 1 filters by channel, so a mismatch would be confusing.
    if (template && (template.channel ?? 'whatsapp') !== next) {
      setTemplate(null);
    }
  }

  async function handleSend() {
    if (!template) return;

    // Email channel: build a mailto: link from the audience's contacts
    // and hand off to the user's mail client. No Meta round-trip.
    if (channel === 'email') {
      handleSendEmail();
      return;
    }

    try {
      const { broadcastId, interruption } = await createAndSendBroadcast({
        name,
        template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
        },
        variables,
        headerMediaUrl,
      });
      if (interruption === 'lease_lost') toast.warning(t('toastSendTakenOver'));
      if (interruption === 'lease_error') toast.error(t('toastSendInterrupted'));
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      // Previously swallowed with console.error — the wizard would
      // just no-op, leaving the user confused. Surface the reason.
      const message = err instanceof Error ? err.message : t('broadcastFailed');
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  /**
   * Email channel — persist the broadcast + its recipients in Supabase,
   * then send via SMTP if configured, otherwise fall back to a
   * `mailto:` draft in the user's default mail client.
   *
   * SMTP path (server-side, free):
   *   - Each recipient gets an individual email via POST /api/email/send
   *   - Recipient status (sent/failed) is persisted per row
   *   - No mail client required on the user's machine
   *
   * mailto: fallback path (client-side, free):
   *   - Opens the user's default mail client with a pre-filled draft
   *   - Recipients are marked 'sent' (draft opened = send action)
   */
  async function handleSendEmail() {
    if (!template) return;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) {
      toast.error(t('toastNotSignedIn'));
      return;
    }

    try {
      // Resolve the audience and pull the email addresses.
      const {
        resolveAudienceContacts,
        buildMailtoLink,
      } = await import('@/lib/broadcast-audience');
      const { resolveVariables } = await import('@/hooks/use-broadcast-sending');

      const contacts: Contact[] = await resolveAudienceContacts(
        supabase,
        {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
        },
        async () => {
          // CSV audience — raw CSV rows carry phone-only pairs with no
          // addresses, so there is nothing to send to by email.
          return [] as Contact[];
        },
      );

      const withEmail = contacts.filter((c) => c.email?.trim());
      if (withEmail.length === 0) {
        toast.error(tWizard('channel.emailNoRecipient'));
        return;
      }

      // Render the body once with the first contact's values — every
      // recipient gets the same email body.
      const first = withEmail[0];
      const params = resolveVariables(variables, first, undefined);

      const unique: string[] = [];
      for (const m of template.body_text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
        if (!unique.includes(m[1])) unique.push(m[1]);
      }
      const body = template.body_text.replace(
        /\{\{([A-Za-z0-9_]+)\}\}/g,
        (m, key: string) => {
          const i = unique.indexOf(key);
          return i >= 0 && params[i] ? params[i] : m;
        },
      );

      const subject = name.trim() || template.name;

      // ── 1. Create the broadcast row ─────────────────────────────
      const now = new Date().toISOString();
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: subject,
          template_name: template.name,
          template_language: template.language ?? 'en_US',
          template_variables: variables,
          audience_filter: {
            type: audience.type,
            tagIds: audience.tagIds,
            customField: audience.customField,
            csvContacts: audience.csvContacts,
            excludeTagIds: audience.excludeTagIds,
            channel: 'email',
          },
          status: 'sending',
          total_recipients: withEmail.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (broadcastError || !broadcast) {
        throw new Error(
          t('createBroadcastFailed', {
            error: broadcastError?.message ?? t('unknownErrorLower'),
          }),
        );
      }

      // ── 2. Try SMTP via API route; fall back to mailto: ─────────
      // The API route runs server-side and holds the SMTP credentials.
      // The client never touches nodemailer or SMTP passwords.
      const smtpRes = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: withEmail.map((c) => ({
            to: c.email!.trim(),
            name: c.name ?? null,
          })),
          subject,
          text: body,
          // Campaign header image, placed at the top of the branded
          // email shell. Empty string → omitted, plain body only.
          headerImageUrl: headerMediaUrl.trim() || undefined,
        }),
      });

      const smtpResult = await smtpRes.json().catch(() => ({}));

      if (smtpRes.ok && smtpResult.sent > 0) {
        // SMTP sent at least one email — finalize broadcast with results.
        const finalStatus =
          smtpResult.failed === withEmail.length ? 'failed' : 'sent';
        await supabase
          .from('broadcasts')
          .update({
            status: finalStatus,
            sent_count: smtpResult.sent ?? 0,
            failed_count: smtpResult.failed ?? 0,
          })
          .eq('id', broadcast.id);

        // Update recipient rows to reflect actual send status.
        for (const r of (smtpResult.results ?? [])) {
          const contact = withEmail.find((c) => c.email?.trim() === r.to);
          if (!contact) continue;
          await supabase
            .from('broadcast_recipients')
            .upsert({
              broadcast_id: broadcast.id,
              contact_id: contact.id,
              status: r.status === 'sent' ? 'sent' : 'failed',
              sent_at: r.status === 'sent' ? now : null,
              error_message: r.error ?? null,
              whatsapp_message_id: r.messageId ?? null,
            })
            .eq('broadcast_id,contact_id', `${broadcast.id},${contact.id}`);
        }

        toast.success(
          tWizard('channel.emailSmtpSent', {
            count: smtpResult.sent ?? 0,
            failed: smtpResult.failed ?? 0,
          }),
        );
        router.push(`/broadcasts/${broadcast.id}`);
      } else if (smtpResult.fallback === 'mailto' || !smtpRes.ok) {
        // No SMTP configured or SMTP error — fall back to mailto:.
        const link = buildMailtoLink(
          withEmail.map((c) => ({
            address: c.email!.trim(),
            name: c.name ?? null,
          })),
          subject,
          body,
        );
        window.location.href = link;

        // Mark recipients as 'sent' (opening the draft is the send action).
        const recipientRows = withEmail.map((c) => ({
          broadcast_id: broadcast.id,
          contact_id: c.id,
          status: 'sent' as const,
          sent_at: now,
          template_params: params,
          whatsapp_message_id: null,
        }));

        const INSERT_CHUNK = 200;
        for (let i = 0; i < recipientRows.length; i += INSERT_CHUNK) {
          const chunk = recipientRows.slice(i, i + INSERT_CHUNK);
          const { error: recipientError } = await supabase
            .from('broadcast_recipients')
            .insert(chunk);
          if (recipientError) {
            await supabase
              .from('broadcasts')
              .update({ status: 'failed', failed_count: withEmail.length })
              .eq('id', broadcast.id);
            throw new Error(
              t('insertRecipientBatchFailed', {
                batch: i / INSERT_CHUNK + 1,
                error: recipientError.message,
              }),
            );
          }
        }

        await supabase
          .from('broadcasts')
          .update({
            status: 'sent',
            sent_count: withEmail.length,
          })
          .eq('id', broadcast.id);

        toast.success(tWizard('channel.emailOpened', { count: withEmail.length }));
        router.push(`/broadcasts/${broadcast.id}`);
      } else {
        // SMTP returned an error but no fallback flag.
        throw new Error(
          smtpResult.error ?? t('email.smtpNotConfigured'),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('broadcastFailed');
      console.error('Email broadcast failed:', err);
      toast.error(message);
    }
  }

  /**
   * Writes a draft broadcast row — no recipients, no sending. The user
   * can revisit it via the list page to finish the flow later.
   */
  async function handleSaveDraft() {
    if (!template || !name.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      toast.error(t('toastNotSignedIn'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNotLinked'));
      return;
    }

    const { error } = await supabase.from('broadcasts').insert({
      user_id: user.id,
      account_id: accountId,
      name: name.trim(),
      template_name: template.name,
      template_language: template.language ?? 'en_US',
      template_variables: variables,
      audience_filter: {
        type: audience.type,
        tagIds: audience.tagIds,
        channel,
      },
      status: 'draft',
      total_recipients: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    });

    if (error) {
      toast.error(t('toastFailedDraft', { error: error.message }));
      return;
    }
    toast.success(t('toastDraftSaved'));
    router.push('/broadcasts');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary bg-primary/10 text-primary'
                        : 'border border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isActive ? 'text-foreground' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {t(`steps.${step.label}`)}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-px flex-1 ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="relative min-h-[400px]">
        <div
          className="transition-all duration-300 ease-in-out"
          style={{
            opacity: isProcessing ? 0.6 : 1,
            pointerEvents: isProcessing ? 'none' : 'auto',
          }}
        >
          {currentStep === 0 && (
            <Step1ChooseTemplate
              selectedTemplate={template}
              onSelect={setTemplate}
              industry={industry}
              onIndustryChange={setIndustry}
              channel={channel}
              onNext={() => setCurrentStep(1)}
              onBack={() => router.push('/broadcasts')}
            />
          )}
          {currentStep === 1 && (
            <Step2SelectAudience
              audience={audience}
              onUpdate={setAudience}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}
          {currentStep === 2 && template && (
            <Step3Personalize
              template={template}
              variables={variables}
              onUpdate={setVariables}
              headerMediaUrl={headerMediaUrl}
              onHeaderMediaUrlChange={setHeaderMediaUrl}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && template && (
            <Step4ScheduleSend
              name={name}
              onNameChange={setName}
              template={template}
              audience={audience}
              channel={channel}
              onChannelChange={setChannel}
              onSend={handleSend}
              onSaveDraft={handleSaveDraft}
              onBack={() => setCurrentStep(2)}
              isProcessing={isProcessing}
              progress={progress}
            />
          )}
        </div>
      </div>
    </div>
  );
}
