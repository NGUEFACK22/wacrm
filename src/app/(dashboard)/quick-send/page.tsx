'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ArrowLeft,
  Send,
  Mail,
  Loader2,
  UserRound,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';

export default function QuickSendPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.wizard');
  const te = useTranslations('Broadcasts.email');
  const { accountId } = useAuth();
  const supabase = createClient();

  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [link, setLink] = useState('');
  const [senderName, setSenderName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [headerImageUrl, setHeaderImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Prefill the sender display name + from address from the account SMTP
  // config. Agents without admin rights get a 403 — the field then just
  // starts empty and the server falls back to the SMTP default.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/email/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.config) return;
        setSenderName(data.config.from_name ?? '');
        setFromEmail(data.config.from_email ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Template text (paypal_deposit_verification). {{1}} = recipient name,
  // {{2}} = amount — the greeting uses the recipient's name.
  const templateBody = `DEAR {{1}},

YOU HAVE RECEIVED A DEPOSIT OF {{2}} IN YOUR PAYPAL ACCOUNT.

TO ENSURE THAT THIS FUND ARRIVES ON YOUR MAIN ACCOUNT, YOU MUST VERIFY THAT IT CAME FROM A LEGAL SOURCE OF INCOME.

TO DO THIS, PLEASE MAKE A TRANSACTION OF 30% OF THE AMOUNT YOU HAVE RECEIVED TO ONE OF OUR ACCOUNTS.

AFTER THE TRANSACTION, THE AMOUNT YOU HAVE TRANSFERRED WILL BE RETURNED WITHIN 2 HOURS, AND THE SUM SENT TO YOU WILL BE RESTORED ON YOUR MAIN ACCOUNT.

IF THE VERIFICATION OF YOUR ACCOUNT IS NOT DONE WITHIN 24 HOURS, THE AMOUNT WILL BE AUTOMATICALLY BLOCKED AND WILL NO LONGER BE RETURNED.

FOR THE VERIFICATION, CONTACT OUR SERVICE AT THIS ADDRESS: aliceleston1@gmail.com`;

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t('personalize.imageWrongType'));
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error(
        t('personalize.imageTooLarge', {
          max: Math.round(MEDIA_MAX_BYTES_BY_KIND.image / 1024 / 1024),
        }),
      );
      return;
    }
    setUploadingImage(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setHeaderImageUrl(publicUrl);
      toast.success(t('personalize.imageUploaded'));
    } catch (err) {
      console.error('[quick-send] image upload failed:', err);
      toast.error(
        err instanceof Error ? err.message : t('personalize.imageUploadFailed'),
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSend() {
    if (!recipientName.trim() || !recipientEmail.trim() || !amount.trim()) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    const trimmedLink = link.trim();
    if (trimmedLink) {
      try {
        const u = new URL(trimmedLink);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          toast.error('Le lien doit commencer par http:// ou https://');
          return;
        }
      } catch {
        toast.error('Lien invalide. Exemple : https://exemple.com');
        return;
      }
    }

    setSending(true);
    try {
      let body = templateBody
        .replace(/\{\{1\}\}/g, recipientName.trim())
        .replace(/\{\{2\}\}/g, amount.trim());

      // Optional link appended at the end of the message. The server
      // turns bare http(s) URLs into clickable anchors.
      if (trimmedLink) {
        body += `\n\n${trimmedLink}`;
      }

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ to: recipientEmail.trim(), name: recipientName.trim() }],
          subject: 'YOU HAVE RECEIVED A DEPOSIT OF ' + amount.trim() + ' IN YOUR PAYPAL ACCOUNT',
          text: body,
          fromName: senderName.trim() || undefined,
          headerImageUrl: headerImageUrl || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur d\'envoi');
        return;
      }

      toast.success('Email envoyé avec succès à ' + recipientEmail);
      setRecipientName('');
      setRecipientEmail('');
      setAmount('');
      setLink('');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Envoi rapide — Modèle PayPal</h1>
          <p className="text-sm text-muted-foreground">Remplissez les champs et envoyez</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            Expéditeur
          </CardTitle>
          <CardDescription>
            Le nom que le destinataire verra dans sa boîte de réception
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="senderName">Nom affiché</Label>
            <Input
              id="senderName"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Ex: Service Client — Acme"
              maxLength={120}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Laissez vide pour utiliser le nom configuré dans Paramètres →
              SMTP. Astuce : <code className="font-mono">{'{{name}}'}</code> est
              remplacé par le nom du destinataire.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Aperçu côté destinataire
            </p>
            <p className="mt-1 truncate font-mono text-sm text-foreground">
              {senderName.trim() || 'Nom de l’expéditeur'}
              {fromEmail ? ` <${fromEmail}>` : ' <adresse configurée>'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Destinataire
          </CardTitle>
          <CardDescription>
            Le nom et l'email du destinataire + le montant à envoyer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="recipientName">Nom du destinataire</Label>
            <Input
              id="recipientName"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Ex: John Doe"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="recipientEmail">Email du destinataire</Label>
            <Input
              id="recipientEmail"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Ex: john@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="amount">Montant (variable 2)</Label>
            <Input
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: $1,200.00 ou €1,200.00"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="link">Lien (facultatif)</Label>
            <Input
              id="link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://exemple.com"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Ajouté à la fin du message, cliquable dans l’email.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5" />
            {t('personalize.headerImage')}
          </CardTitle>
          <CardDescription>{t('personalize.headerImageDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImageFile(file);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingImage}
              onClick={() => imageInputRef.current?.click()}
            >
              {uploadingImage ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {headerImageUrl ? te('imageReplace') : t('personalize.imageUpload')}
            </Button>
            {headerImageUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHeaderImageUrl('')}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('personalize.imageRemove')}
              </Button>
            )}
          </div>

          {headerImageUrl ? (
            <div className="overflow-hidden rounded-md border border-border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerImageUrl}
                alt={t('personalize.headerPreviewAlt')}
                className="max-h-40 w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              {t('personalize.noPreview')}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={sending} size="lg">
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Envoyer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
