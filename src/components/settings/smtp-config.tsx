'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  AlertTriangle,
  ExternalLink,
  Zap,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from './settings-panel-head';
import type { SmtpConfigPublic } from '@/lib/email/smtp';

const MASKED = '••••••••••••••••';

export function SmtpConfig() {
  const t = useTranslations('Settings.smtp');
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading, canEditSettings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [config, setConfig] = useState<SmtpConfigPublic | null>(null);
  const loadedAccountIdRef = useRef<string | null>(null);

  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [secure, setSecure] = useState(false);
  const [passwordEdited, setPasswordEdited] = useState(false);

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/email/config', { method: 'GET' });
      const payload = await res.json();
      if (!res.ok) {
        console.error('Failed to load SMTP config:', payload.error);
        return;
      }
      const c = payload.config;
      setConfig(c);
      if (c) {
        setHost(c.host);
        setPort(String(c.port));
        setSmtpUser(c.smtp_user);
        setFromEmail(c.from_email);
        setFromName(c.from_name ?? '');
        setSecure(c.secure);
        setPassword(MASKED);
        setPasswordEdited(false);
      } else {
        setHost('');
        setPort('587');
        setSmtpUser('');
        setFromEmail('');
        setFromName('');
        setSecure(false);
        setPassword('');
        setPasswordEdited(false);
      }
    } catch (err) {
      console.error('fetchSmtpConfig error:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  async function handleSave() {
    if (!host.trim()) {
      toast.error(t('hostRequired'));
      return;
    }
    if (!smtpUser.trim()) {
      toast.error(t('userRequired'));
      return;
    }
    if (!password.trim() || password === MASKED) {
      toast.error(t('passwordRequired'));
      return;
    }
    if (!fromEmail.trim()) {
      toast.error(t('fromEmailRequired'));
      return;
    }
    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      toast.error(t('invalidPort'));
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: host.trim(),
          port: portNum,
          user: smtpUser.trim(),
          password: password.trim(),
          from_email: fromEmail.trim(),
          from_name: fromName.trim() || null,
          secure,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('saveFailed'), { duration: 8000 });
        setSaving(false);
        return;
      }
      toast.success(t('saved'));
      setPasswordEdited(false);
      setPassword(MASKED);
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('SMTP save error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!fromEmail.trim()) {
      toast.error(t('fromEmailRequired'));
      return;
    }
    try {
      setTesting(true);
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ to: fromEmail.trim(), name: fromName.trim() || undefined }],
          subject: t('testSubject'),
          text: t('testBody'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('testFailed'), { duration: 8000 });
        return;
      }
      toast.success(t('testSent', { count: data.sent ?? 0 }));
    } catch (err) {
      console.error('SMTP test error:', err);
      toast.error(t('testFailed'));
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Main form */}
        <div className="space-y-6">
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  {t('personalEmailNoticeTitle')}
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {t('personalEmailNotice')}
                </AlertDescription>
              </div>
            </div>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('serverTitle')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('serverDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('host')}</Label>
                <Input
                  placeholder={t('hostPlaceholder')}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{t('port')}</Label>
                  <Input
                    type="text"
                    placeholder="587"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{t('secure')}</Label>
                  <Switch
                    checked={secure}
                    onCheckedChange={setSecure}
                    disabled={!canEditSettings}
                    aria-label={t('secure')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('user')}</Label>
                <Input
                  placeholder={t('userPlaceholder')}
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('password')}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('passwordPlaceholder')}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordEdited(true);
                    }}
                    onFocus={() => {
                      if (password === MASKED) {
                        setPassword('');
                        setPasswordEdited(true);
                      }
                    }}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {config && !passwordEdited && (
                  <p className="text-xs text-muted-foreground">
                    {t('passwordHidden')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('senderTitle')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('senderDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('fromEmail')}</Label>
                <Input
                  type="email"
                  placeholder={t('fromEmailPlaceholder')}
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('fromName')}</Label>
                <Input
                  placeholder={t('fromNamePlaceholder')}
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('saveConfig')
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !canEditSettings}
              className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('testing')}
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  {t('testConnection')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Sidebar: common providers */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground text-base">
                {t('providersTitle')}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('providersDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ProviderCard
                  name="Gmail"
                  host="smtp.gmail.com"
                  port="587"
                  secure={false}
                  note={t('gmailNote')}
                />
                <ProviderCard
                  name="Outlook / Hotmail"
                  host="smtp.office365.com"
                  port="587"
                  secure={false}
                  note={t('outlookNote')}
                />
                <ProviderCard
                  name="Yahoo"
                  host="smtp.mail.yahoo.com"
                  port="465"
                  secure={true}
                  note={t('yahooNote')}
                />
                <ProviderCard
                  name="iCloud / me.com"
                  host="smtp.mail.me.com"
                  port="587"
                  secure={false}
                  note={t('icloudNote')}
                />
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 pt-4 border-t border-border">
            <a
              href="https://support.google.com/accounts/answer/185833"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="size-3.5" />
              {t('gmailAppPassword')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProviderCard({
  name,
  host,
  port,
  secure,
  note,
}: {
  name: string;
  host: string;
  port: string;
  secure: boolean;
  note: string;
}) {
  return (
    <div className="rounded border border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-foreground">{name}</div>
          <div className="flex gap-1.5 text-[10px] text-muted-foreground mt-0.5">
            <span>{host}:{port}</span>
            <span>{secure ? 'TLS/SSL' : 'STARTTLS'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{note}</p>
        </div>
      </div>
    </div>
  );
}
