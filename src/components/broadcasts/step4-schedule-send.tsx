'use client';

import { useEffect, useState } from 'react';
import { countAudience, type AudienceConfig } from '@/lib/broadcast-audience';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Send, Loader2, Users, Save, Mail, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type BroadcastChannel = 'whatsapp' | 'email';

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  channel: BroadcastChannel;
  onChannelChange: (channel: BroadcastChannel) => void;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  channel,
  onChannelChange,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        setEstimatedReach((await countAudience(createClient(), audience)) ?? 0);
      } catch {
        setEstimatedReach(0);
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  /**
   * Envoie un email de test unique via SMTP pour vérifier que la
   * configuration fonctionne avant de lancer la diffusion complète.
   */
  async function handleTestSmtp() {
    if (!testEmail.trim()) {
      setTestMessage(t('smtpTest.emailRequired'));
      setTestResult('error');
      return;
    }
    setTestingSmtp(true);
    setTestResult(null);
    setTestMessage('');
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ to: testEmail.trim(), name: undefined }],
          subject: `wacrm — Test SMTP (${template.name})`,
          text: `Ceci est un email de test depuis wacrm.\n\nSi vous le recevez, votre configuration SMTP fonctionne correctement.\n\nDiffusion : ${template.name}\nDestinataire : ${testEmail}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult('error');
        setTestMessage(data.error ?? t('smtpTest.failed', { error: '' }));
        return;
      }
      setTestResult('success');
      setTestMessage(t('smtpTest.sent', { count: data.sent ?? 0 }));
    } catch (err) {
      setTestResult('error');
      setTestMessage(
        err instanceof Error ? err.message : t('smtpTest.failed', { error: '' }),
      );
    } finally {
      setTestingSmtp(false);
    }
  }

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : t('scheduleSend.audienceField');

  const channelLabel =
    channel === 'whatsapp'
      ? t('scheduleSend.channelWhatsapp')
      : t('scheduleSend.channelEmail');

  /**
   * Whether the current selection can deliver. The email channel only
   * makes sense if the audience has at least one contact with an email
   * address; we surface that on the Send button and in the summary.
   */
  const [emailReach, setEmailReach] = useState<number>(0);
  const [loadingEmailReach, setLoadingEmailReach] = useState(true);

  useEffect(() => {
    async function calculateEmailReach() {
      if (channel !== 'email') {
        setLoadingEmailReach(false);
        setEmailReach(0);
        return;
      }
      setLoadingEmailReach(true);
      try {
        const supabase = createClient();
        const { resolveAudienceContacts } = await import('@/lib/broadcast-audience');
        const contacts = await resolveAudienceContacts(supabase, audience, async () => []);
        setEmailReach(contacts.filter((c) => c.email?.trim()).length);
      } catch {
        setEmailReach(0);
      } finally {
        setLoadingEmailReach(false);
      }
    }

    calculateEmailReach();
  }, [channel, audience]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('scheduleSend.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('scheduleSend.broadcastName')}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Channel selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('channel.title')}</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChannelChange('whatsapp')}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
              channel === 'whatsapp'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border bg-card/50 hover:border-border hover:bg-card'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{t('channel.whatsapp')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('channel.whatsappDesc')}</p>
          </button>
          <button
            type="button"
            onClick={() => onChannelChange('email')}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
              channel === 'email'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border bg-card/50 hover:border-border hover:bg-card'
            }`}
          >
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{t('channel.email')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('channel.emailDesc')}</p>
          </button>
        </div>
      </div>

      {/* SMTP Test — only shown when the email channel is selected */}
      {channel === 'email' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">{t('scheduleSend.smtpTestTitle')}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {t('scheduleSend.smtpTestDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t('scheduleSend.testEmail')}
              </Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={t('scheduleSend.testEmailPlaceholder')}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Button
              onClick={handleTestSmtp}
              disabled={testingSmtp || !testEmail.trim()}
              className="w-full border-border bg-muted text-foreground disabled:opacity-50"
            >
              {testingSmtp ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('sending')}
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  {t('scheduleSend.sendTestEmail')}
                </>
              )}
            </Button>
            {testResult === 'success' && (
              <Alert className="bg-emerald-950/30 border-emerald-700/50">
                <AlertTitle className="text-emerald-200 mb-1">
                  {t('smtpTest.ok')}
                </AlertTitle>
                <AlertDescription className="text-emerald-100/80 text-sm">
                  {testMessage}
                </AlertDescription>
              </Alert>
            )}
            {testResult === 'error' && (
              <Alert className="bg-red-950/30 border-red-700/50">
                <AlertTitle className="text-red-200 mb-1">
                  {t('smtpTest.error')}
                </AlertTitle>
                <AlertDescription className="text-red-100/80 text-sm">
                  {testMessage}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">{t('scheduleSend.summary')}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.template')}</p>
            <p className="text-foreground">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.audience')}</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.channel')}</p>
            <p className="text-foreground">{channelLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {channel === 'email'
                ? t('scheduleSend.emailEstimatedReach')
                : t('scheduleSend.estimatedReach')}
            </p>
            <div className="flex items-center gap-1.5">
              {channel === 'email' && loadingEmailReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  {channel === 'email' ? (
                    <Mail className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Users className="h-3.5 w-3.5 text-primary" />
                  )}
                  <p className="font-medium text-foreground">
                    {(channel === 'email' ? emailReach : estimatedReach).toLocaleString()}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        {channel === 'email' && !loadingEmailReach && emailReach === 0 && (
          <p className="text-xs text-amber-300">{t('scheduleSend.emailNoRecipients')}</p>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{t('scheduleSend.sending')}</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          {channel === 'email' ? (
            <Button
              onClick={onSend}
              disabled={!name.trim() || isProcessing || (emailReach === 0 && !loadingEmailReach)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {t('scheduleSend.emailNow')}
            </Button>
          ) : (
            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogTrigger
              render={
                <Button
                  disabled={!name.trim() || isProcessing}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                />
              }
            >
              <Send className="h-4 w-4" />
              {t('scheduleSend.sendNow')}
            </DialogTrigger>
            <DialogContent className="border-border bg-popover sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-popover-foreground">{t('scheduleSend.confirmTitle')}</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {t.rich('scheduleSend.confirmDesc', {
                    count: estimatedReach,
                    template: template.name,
                    b: (chunks) => (
                      <span className="font-medium text-popover-foreground">{chunks}</span>
                    ),
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="border-border text-muted-foreground"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => {
                    setShowConfirm(false);
                    onSend();
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                  {t('scheduleSend.sendNow')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
