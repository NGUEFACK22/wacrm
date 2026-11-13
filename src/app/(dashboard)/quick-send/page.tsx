'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Send, Mail, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function QuickSendPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.wizard');
  const { accountId } = useAuth();
  const supabase = createClient();

  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  // Template text (paypal_deposit_verification)
  const templateBody = `DEAR CUSTOMER,

YOU HAVE RECEIVED A DEPOSIT OF {{2}} IN YOUR PAYPAL ACCOUNT.

TO ENSURE THAT THIS FUND ARRIVES ON YOUR MAIN ACCOUNT, YOU MUST VERIFY THAT IT CAME FROM A LEGAL SOURCE OF INCOME.

TO DO THIS, PLEASE MAKE A TRANSACTION OF 30% OF THE AMOUNT YOU HAVE RECEIVED TO ONE OF OUR ACCOUNTS.

AFTER THE TRANSACTION, THE AMOUNT YOU HAVE TRANSFERRED WILL BE RETURNED WITHIN 2 HOURS, AND THE SUM SENT TO YOU WILL BE RESTORED ON YOUR MAIN ACCOUNT.

IF THE VERIFICATION OF YOUR ACCOUNT IS NOT DONE WITHIN 24 HOURS, THE AMOUNT WILL BE AUTOMATICALLY BLOCKED AND WILL NO LONGER BE RETURNED.

FOR THE VERIFICATION, CONTACT OUR SERVICE AT THIS ADDRESS: aliceleston1@gmail.com`;

  async function handleSend() {
    if (!recipientName.trim() || !recipientEmail.trim() || !amount.trim()) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setSending(true);
    try {
      const body = templateBody
        .replace(/\{\{1\}\}/g, recipientName.trim())
        .replace(/\{\{2\}\}/g, amount.trim());

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ to: recipientEmail.trim(), name: recipientName.trim() }],
          subject: 'YOU HAVE RECEIVED A DEPOSIT OF ' + amount.trim() + ' IN YOUR PAYPAL ACCOUNT',
          text: body,
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
    } catch (err) {
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
          <h1 className="text-xl font-semibold">Envoi rapide — Template PayPal</h1>
          <p className="text-sm text-muted-foreground">Remplissez les champs et envoyez</p>
        </div>
      </div>

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
