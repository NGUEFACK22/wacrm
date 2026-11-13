'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  ImagePlus,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
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
import { SettingsPanelHead } from './settings-panel-head';

const BUCKET = 'branding';
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const DEFAULT_COLOR = '#111827';

interface BrandingState {
  logoUrl: string | null;
  brandName: string;
  brandColor: string;
}

export function BrandingConfig() {
  const t = useTranslations('Settings.branding');
  const supabase = createClient();
  const {
    user,
    accountId,
    loading: authLoading,
    profileLoading,
    canEditSettings,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [branding, setBranding] = useState<BrandingState>({
    logoUrl: null,
    brandName: '',
    brandColor: DEFAULT_COLOR,
  });
  const loadedAccountIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBranding = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('logo_url, brand_name, brand_color')
        .eq('id', acctId)
        .maybeSingle();

      if (error) {
        toast.error(t('loadFailed'));
        return;
      }
      setBranding({
        logoUrl: data?.logo_url ?? null,
        brandName: data?.brand_name ?? '',
        brandColor: data?.brand_color || DEFAULT_COLOR,
      });
    } catch (err) {
      console.error('fetchBranding error:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [supabase, t]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchBranding(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchBranding]);

  async function handleFile(file: File) {
    if (!accountId) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error(t('invalidType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('tooLarge'));
      return;
    }

    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      // Timestamped path → cache-busting on re-upload and no stale CDN copy.
      const path = `${accountId}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

      if (uploadError) {
        toast.error(uploadError.message || t('uploadFailed'));
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = publicUrlData.publicUrl;

      // Persist immediately so the logo survives a page reload even if
      // the user never presses Save on the text fields.
      const { error: updateError } = await supabase
        .from('accounts')
        .update({ logo_url: url })
        .eq('id', accountId);

      if (updateError) {
        toast.error(updateError.message || t('saveFailed'));
        return;
      }

      setBranding((prev) => ({ ...prev, logoUrl: url }));
      toast.success(t('logoUploaded'));
    } catch (err) {
      console.error('logo upload error:', err);
      toast.error(t('uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    if (!accountId) return;
    setUploading(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ logo_url: null })
        .eq('id', accountId);
      if (error) {
        toast.error(error.message || t('saveFailed'));
        return;
      }
      setBranding((prev) => ({ ...prev, logoUrl: null }));
      toast.success(t('logoRemoved'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!accountId) return;
    if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(branding.brandColor)) {
      toast.error(t('invalidColor'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          brand_name: branding.brandName.trim() || null,
          brand_color: branding.brandColor,
        })
        .eq('id', accountId);

      if (error) {
        toast.error(error.message || t('saveFailed'));
        return;
      }
      toast.success(t('saved'));
    } catch (err) {
      console.error('branding save error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t('loading')}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            {/* Logo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <ImagePlus className="size-4 text-primary" />
                  {t('logoTitle')}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('logoDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-3">
                    {branding.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={branding.logoUrl}
                        alt={t('logoTitle')}
                        className="max-h-16 max-w-full object-contain"
                      />
                    ) : (
                      <Building2 className="size-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED.join(',')}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || !canEditSettings}
                      className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('uploading')}
                        </>
                      ) : (
                        <>
                          <UploadCloud className="size-4" />
                          {branding.logoUrl ? t('replaceLogo') : t('uploadLogo')}
                        </>
                      )}
                    </Button>
                    {branding.logoUrl && (
                      <Button
                        variant="ghost"
                        onClick={handleRemoveLogo}
                        disabled={uploading || !canEditSettings}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="size-4" />
                        {t('removeLogo')}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t('logoHint')}</p>
              </CardContent>
            </Card>

            {/* Brand identity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">{t('identityTitle')}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('identityDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{t('brandName')}</Label>
                  <Input
                    value={branding.brandName}
                    onChange={(e) =>
                      setBranding((prev) => ({ ...prev, brandName: e.target.value }))
                    }
                    placeholder={t('brandNamePlaceholder')}
                    disabled={!canEditSettings}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{t('brandColor')}</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={branding.brandColor}
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, brandColor: e.target.value }))
                      }
                      disabled={!canEditSettings}
                      className="h-9 w-14 cursor-pointer rounded-md border border-border bg-muted p-1"
                      aria-label={t('brandColor')}
                    />
                    <Input
                      value={branding.brandColor}
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, brandColor: e.target.value }))
                      }
                      disabled={!canEditSettings}
                      className="w-32 border-border bg-muted font-mono text-foreground"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <Button
                onClick={handleSave}
                disabled={saving || !canEditSettings}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  t('save')
                )}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t('previewTitle')}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('previewDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border border-border bg-white">
                  <div
                    className="h-1 w-full"
                    style={{ backgroundColor: branding.brandColor }}
                  />
                  <div className="flex flex-col items-center gap-2 px-4 py-4">
                    {branding.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={branding.logoUrl}
                        alt={branding.brandName || 'logo'}
                        className="max-h-14 max-w-[180px] object-contain"
                      />
                    ) : (
                      <span
                        className="text-base font-semibold"
                        style={{ color: branding.brandColor }}
                      >
                        {branding.brandName || t('brandNamePlaceholder')}
                      </span>
                    )}
                  </div>
                  <div className="px-4 pb-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                      {t('previewBody')}
                    </p>
                  </div>
                  {branding.brandName && (
                    <div className="border-t border-gray-200 px-4 py-2 text-center text-[11px] text-gray-500">
                      &copy; {new Date().getFullYear()} {branding.brandName}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
