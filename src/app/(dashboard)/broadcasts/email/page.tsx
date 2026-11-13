'use client';

/**
 * Email broadcast composer.
 *
 * The split this screen enforces: a campaign has ONE amount and ONE link
 * — campaign constants — and the only thing that changes from one
 * recipient to the next is personal data, in practice the name. The
 * template body is sent as-is; the server resolves `{{1}}` / `{{name}}`
 * and the "DEAR CUSTOMER," greeting per recipient while `{{2}}` /
 * `{{amount}}` resolve to the single campaign amount.
 *
 * Sending is chunked: `/api/email/send` fans a batch out sequentially, so
 * 200 recipients in one request would sit on the socket for minutes and
 * burn the route's rate-limit budget. Batches of 10 with a short pause
 * stay under the 60 req/min bucket while keeping the UI responsive.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Link2,
  Loader2,
  Mail,
  Search,
  Send,
  Users,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { personalizeBody, personalizeSubject } from '@/lib/email/personalize';
import type { MessageTemplate } from '@/types';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1_200;
const SAMPLE_NAME = 'Jean Dupont';

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface SendResultRow {
  to: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}

interface Progress {
  sent: number;
  failed: number;
  total: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function EmailBroadcastPage() {
  const t = useTranslations('Broadcasts.email');
  const router = useRouter();
  const { user, accountId, profileLoading } = useAuth();
  const canSend = useCan('send-messages');

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [amount, setAmount] = useState('');
  const [link, setLink] = useState('');
  const [subject, setSubject] = useState('');
  const [senderName, setSenderName] = useState('');

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  const template = useMemo(
    () => templates.find((tpl) => tpl.id === templateId) ?? null,
    [templates, templateId],
  );

  // ── Load templates, contacts, SMTP default sender name ──────────
  useEffect(() => {
    if (profileLoading || !accountId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const [tplRes, contactRes] = await Promise.all([
          supabase
            .from('message_templates')
            .select('*')
            .eq('channel', 'email')
            .order('name'),
          supabase
            .from('contacts')
            .select('id, name, email')
            .not('email', 'is', null)
            .order('name'),
        ]);

        if (cancelled) return;
        if (tplRes.error) throw tplRes.error;

        setTemplates((tplRes.data ?? []) as MessageTemplate[]);
        setContacts(
          ((contactRes.data ?? []) as ContactRow[]).filter((c) => c.email?.trim()),
        );

        const first = (tplRes.data ?? [])[0] as MessageTemplate | undefined;
        if (first) {
          setTemplateId((prev) => prev || first.id);
          setSubject((prev) => prev || first.name);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[email-broadcast] load failed:', err);
        toast.error(t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, profileLoading, t]);

  // Sender display name default. Needs admin role — agents get a 403 and
  // simply keep the field empty (the server falls back to the SMTP name).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/email/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.config) return;
        setSenderName((prev) => prev || (data.config.from_name ?? ''));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const chosen = useMemo(
    () => contacts.filter((c) => selected.has(c.id)),
    [contacts, selected],
  );

  const previewName = chosen[0]?.name?.trim() || SAMPLE_NAME;
  const previewBody = useMemo(
    () =>
      template
        ? personalizeBody(template.body_text, { name: previewName, amount, link })
        : '',
    [template, previewName, amount, link],
  );
  const previewSubject = useMemo(
    () => personalizeSubject(subject.trim() || template?.name || '', amount),
    [subject, template, amount],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of filtered) next.add(c.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleSend() {
    if (!template) {
      toast.error(t('needTemplate'));
      return;
    }
    if (!amount.trim()) {
      toast.error(t('needAmount'));
      return;
    }
    if (chosen.length === 0) {
      toast.error(t('needRecipients'));
      return;
    }
    const trimmedLink = link.trim();
    if (trimmedLink) {
      try {
        const u = new URL(trimmedLink);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          toast.error(t('invalidLink'));
          return;
        }
      } catch {
        toast.error(t('invalidLink'));
        return;
      }
    }
    if (!user || !accountId) return;

    const finalSubject =
      personalizeSubject(subject.trim() || template.name, amount).slice(0, 200);

    setSending(true);
    setProgress({ sent: 0, failed: 0, total: chosen.length });

    const supabase = createClient();
    let broadcastId: string | null = null;

    try {
      // ── 1. Parent row. Status 'sending' so the list shows the pulse.
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: finalSubject,
          template_name: template.name,
          template_language: template.language ?? 'en_US',
          template_variables: [amount.trim()],
          audience_filter: { type: 'database', channel: 'email' },
          status: 'sending',
          total_recipients: chosen.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (broadcastError || !broadcast) {
        throw broadcastError ?? new Error(t('createFailed'));
      }
      broadcastId = broadcast.id;

      // ── 2. Fan out in batches. `text` stays a template; the server
      // resolves the name per recipient and keeps the amount identical.
      let sent = 0;
      let failed = 0;
      const results: SendResultRow[] = [];

      for (let i = 0; i < chosen.length; i += BATCH_SIZE) {
        const batch = chosen.slice(i, i + BATCH_SIZE);

        try {
          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: batch.map((c) => ({
                to: c.email!.trim(),
                name: c.name?.trim() || null,
              })),
              subject: finalSubject,
              text: template.body_text,
              fromName: senderName.trim() || undefined,
              personalize: {
                amount: amount.trim(),
                link: trimmedLink || undefined,
              },
            }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            failed += batch.length;
            for (const c of batch) {
              results.push({
                to: c.email!.trim(),
                status: 'failed',
                error: data?.error ?? t('sendFailed'),
              });
            }
          } else {
            sent += Number(data.sent ?? 0);
            failed += Number(data.failed ?? 0);
            for (const r of (data.results ?? []) as SendResultRow[]) results.push(r);
          }
        } catch (err) {
          failed += batch.length;
          const message = err instanceof Error ? err.message : t('sendFailed');
          for (const c of batch) {
            results.push({ to: c.email!.trim(), status: 'failed', error: message });
          }
        }

        setProgress({ sent, failed, total: chosen.length });
        if (i + BATCH_SIZE < chosen.length) await sleep(BATCH_DELAY_MS);
      }

      // ── 3. Recipient rows. The DB trigger aggregates these into the
      // parent counts, so we must NOT write sent_count by hand — that
      // would count every message twice.
      const byEmail = new Map(
        chosen.map((c) => [(c.email ?? '').trim().toLowerCase(), c]),
      );
      const rows = results
        .map((r) => {
          const contact = byEmail.get(r.to.trim().toLowerCase());
          if (!contact) return null;
          return {
            broadcast_id: broadcastId,
            contact_id: contact.id,
            status: r.status,
            sent_at: r.status === 'sent' ? new Date().toISOString() : null,
            error_message: r.error ?? null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        const { error: rowsError } = await supabase
          .from('broadcast_recipients')
          .insert(rows);
        if (rowsError) console.error('[email-broadcast] recipients insert:', rowsError);
      }

      await supabase
        .from('broadcasts')
        .update({ status: sent > 0 ? 'sent' : 'failed' })
        .eq('id', broadcastId);

      if (failed === 0) toast.success(t('doneAll', { count: sent }));
      else if (sent === 0) toast.error(t('doneNone', { count: failed }));
      else toast.warning(t('donePartial', { sent, failed }));

      if (sent > 0) router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      console.error('[email-broadcast] send failed:', err);
      toast.error(err instanceof Error ? err.message : t('sendFailed'));
      if (broadcastId) {
        await supabase
          .from('broadcasts')
          .update({ status: 'failed' })
          .eq('id', broadcastId);
      }
    } finally {
      setSending(false);
    }
  }

  const pct = progress?.total
    ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/broadcasts')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="space-y-6">
            {/* Modèle */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Mail className="size-4 text-primary" />
                  {t('templateTitle')}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('templateDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('templateEmpty')}</p>
                ) : (
                  templates.map((tpl) => {
                    const active = tpl.id === templateId;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setTemplateId(tpl.id);
                          if (!subject.trim() || subject === template?.name) {
                            setSubject(tpl.name);
                          }
                        }}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? 'border-primary/60 bg-primary/5'
                            : 'border-border bg-muted/30 hover:bg-muted/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {tpl.name}
                          </span>
                          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {tpl.language ?? 'en_US'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {tpl.body_text.replace(/\s+/g, ' ').slice(0, 120)}
                        </p>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Contenu — le montant est unique pour toute la diffusion */}
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">{t('contentTitle')}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('contentDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="amount" className="text-muted-foreground">
                      {t('amount')}
                    </Label>
                    <Input
                      id="amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={t('amountPlaceholder')}
                      className="border-border bg-muted text-foreground"
                    />
                    <p className="text-xs text-muted-foreground">{t('amountHint')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sender" className="text-muted-foreground">
                      {t('sender')}
                    </Label>
                    <Input
                      id="sender"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder={t('senderPlaceholder')}
                      maxLength={120}
                      className="border-border bg-muted text-foreground"
                    />
                    <p className="text-xs text-muted-foreground">{t('senderHint')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-muted-foreground">
                    {t('subject')}
                  </Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('subjectPlaceholder')}
                    className="border-border bg-muted text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">{t('subjectHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="link" className="flex items-center gap-1.5 text-muted-foreground">
                    <Link2 className="size-3.5" />
                    {t('link')}
                  </Label>
                  <Input
                    id="link"
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder={t('linkPlaceholder')}
                    className="border-border bg-muted text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">{t('linkHint')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Destinataires */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Users className="size-4 text-primary" />
                  {t('recipientsTitle')}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('recipientsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('searchPlaceholder')}
                      className="border-border bg-muted pl-8 text-foreground"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={selectAllVisible}>
                    {t('selectAll')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    {t('clear')}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('selectedCount', { count: chosen.length })}
                </p>

                <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                  {contacts.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      {t('noContacts')}
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      {t('noMatch')}
                    </p>
                  ) : (
                    filtered.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {c.name?.trim() || t('unnamed')}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.email}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Aperçu + envoi */}
          <div className="space-y-6 lg:sticky lg:top-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">
                  {t('previewTitle')}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('previewDesc', { name: previewName })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('subjectLabel')}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                    {previewSubject || '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                    {previewBody || '—'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                  <Send className="size-4 text-primary" />
                  {t('sendTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('summaryRecipients')}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {chosen.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('summaryAmount')}</span>
                  <span className="font-medium text-foreground">{amount.trim() || '—'}</span>
                </div>

                {progress && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('progress', {
                        done: progress.sent + progress.failed,
                        total: progress.total,
                      })}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleSend}
                  disabled={sending || !canSend || chosen.length === 0}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t('sending')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 size-4" />
                      {t('sendButton', { count: chosen.length })}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
