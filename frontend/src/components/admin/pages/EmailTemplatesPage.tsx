import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnvelopeIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { EmailTemplateMeta, EmailTemplateImportResult, EmailTemplateType } from '@passvault/shared';
import { EMAIL_TEMPLATE_CONFIG } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { Button } from '@/components/ui/button';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TEMPLATE_INFO: Record<EmailTemplateType, { name: string; description: string }> = {
  'invitation': { name: 'Invitation', description: 'Sent when a new user is created with their one-time password.' },
  'otp-refresh': { name: 'OTP Refresh', description: 'Sent when an admin refreshes a user\'s one-time password.' },
  'account-reset': { name: 'Account Reset', description: 'Sent when an admin resets a user account.' },
  'email-verification': { name: 'Email Verification', description: 'Sent to verify the email address during registration.' },
  'email-change-verify': { name: 'Email Change Verify', description: 'Sent to the new email address to confirm an email change.' },
  'email-change-notify': { name: 'Email Change Notify', description: 'Sent to the old email address when an email change is initiated.' },
  'vault-export': { name: 'Vault Export', description: 'Sent when a vault is exported and emailed to the user.' },
  'vault-backup': { name: 'Vault Backup', description: 'Periodic vault backup sent based on user notification preferences.' },
};

const LANGUAGES = EMAIL_TEMPLATE_CONFIG.SUPPORTED_LANGUAGES;

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'EN',
  de: 'DE',
  fr: 'FR',
  ru: 'RU',
};

const COMMON_PREVIEW_DATA: Record<string, string> = {
  appName: 'PassVault',
  appUrl: window.location.origin,
  logoUrl: `${window.location.origin}/logo.png`,
  recoveryGuideUrl: 'https://github.com/tinkivity/passvault/blob/main/docs/RECOVERY.md',
  year: new Date().getFullYear().toString(),
};

const PREVIEW_DATA: Record<string, Record<string, string>> = {
  'invitation': { userName: 'john@example.com', otpCode: 'AbC1dEfG2hIjKlMn', otpExpiryMinutes: '30', verifyUrl: 'https://app.example.com/verify-email?token=abc123', linkExpiryDays: '7' },
  'otp-refresh': { userName: 'john@example.com', otpCode: 'AbC1dEfG2hIjKlMn', otpExpiryMinutes: '30' },
  'account-reset': { userName: 'john@example.com', otpCode: 'AbC1dEfG2hIjKlMn' },
  'email-verification': { verifyUrl: 'https://app.example.com/verify-email?token=abc123', linkExpiryHours: '24' },
  'email-change-verify': { verifyUrl: 'https://app.example.com/verify-email-change?token=abc123', linkExpiryHours: '24' },
  'email-change-notify': { newEmail: 'new@example.com', lockUrl: 'https://app.example.com/lock-account?token=abc123', linkExpiryHours: '1' },
  'vault-export': { userName: 'john@example.com', exportDate: '2026-04-06', filename: 'passvault-john-2026-04-06.vault.gz' },
  'vault-backup': { userName: 'john@example.com', vaultName: 'Personal', backupDate: '2026-04-06', unsubscribeUrl: 'https://app.example.com/unsubscribe?token=preview', currentFrequency: 'weekly' },
};

function replaceVariables(html: string, type: string): string {
  const data = { ...COMMON_PREVIEW_DATA, ...(PREVIEW_DATA[type] ?? {}) };
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] ?? '');
}

/* -------------------------------------------------------------------------- */
/*  Template Card                                                             */
/* -------------------------------------------------------------------------- */

interface TemplateCardProps {
  type: EmailTemplateType;
  metas: EmailTemplateMeta[];
  onDownload: (type: string, language: string) => Promise<void>;
  onUpload: (type: string, language: string, html: string) => Promise<void>;
  onPreview: (type: string, language: string) => Promise<void>;
  loading: boolean;
}

function TemplateCard({ type, metas, onDownload, onUpload, onPreview, loading }: TemplateCardProps) {
  const [activeTab, setActiveTab] = useState<string>(LANGUAGES[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const metaByLang = new Map(metas.map(m => [m.language, m]));
  const activeMeta = metaByLang.get(activeTab);
  const info = TEMPLATE_INFO[type];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const html = reader.result as string;
      onUpload(type, activeTab, html);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <EnvelopeIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium text-sm">{info.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
        </div>
      </div>

      {/* Language tabs */}
      <div className="flex gap-1 border-b border-border">
        {LANGUAGES.map(lang => (
          <button
            key={lang}
            type="button"
            onClick={() => setActiveTab(lang)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === lang
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  metaByLang.has(lang) ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              {LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}
              {metaByLang.get(lang)?.modified && (
                <span className="text-xs text-amber-600 ml-1">edited</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="text-xs text-muted-foreground space-y-3">
        {activeMeta ? (
          <div className="flex items-center gap-4">
            <span>Last modified: {new Date(activeMeta.lastModifiedAt).toLocaleDateString()}</span>
            <span>{(activeMeta.sizeBytes / 1024).toFixed(1)} KB</span>
          </div>
        ) : (
          <p>No template uploaded for this language.</p>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!activeMeta || loading}
            onClick={() => onDownload(type, activeTab)}
          >
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!activeMeta || loading}
            onClick={() => onPreview(type, activeTab)}
          >
            Preview
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export function EmailTemplatesPage() {
  const { token } = useAuth();
  const admin = useAdmin(token);
  const { t } = useTranslation('admin');

  const [templates, setTemplates] = useState<EmailTemplateMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [modifiedOnly, setModifiedOnly] = useState(true);
  const [importResult, setImportResult] = useState<EmailTemplateImportResult | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await admin.listEmailTemplates();
      setTemplates(res.templates);
      setLoaded(true);
    } catch {
      // error shown via admin.error
    }
  }, [admin.listEmailTemplates]);

  useEffect(() => {
    if (!token || loaded) return;
    load();
  }, [token, loaded, load]);

  const handleDownload = useCallback(async (type: string, language: string) => {
    setActionLoading(true);
    try {
      const res = await admin.getEmailTemplate(type, language);
      const blob = new Blob([res.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${language}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setActionLoading(false);
    }
  }, [admin.getEmailTemplate]);

  const handleUpload = useCallback(async (type: string, language: string, html: string) => {
    setActionLoading(true);
    try {
      await admin.putEmailTemplate(type, language, html);
      await load();
    } finally {
      setActionLoading(false);
    }
  }, [admin.putEmailTemplate, load]);

  const handlePreview = useCallback(async (type: string, language: string) => {
    setActionLoading(true);
    try {
      const res = await admin.getEmailTemplate(type, language);
      const rendered = replaceVariables(res.html, type);
      const tab = window.open('', '_blank');
      if (tab) {
        tab.document.write(rendered);
        tab.document.close();
        tab.document.title = `Preview: ${TEMPLATE_INFO[type as EmailTemplateType].name} (${language.toUpperCase()})`;
      }
    } finally {
      setActionLoading(false);
    }
  }, [admin.getEmailTemplate]);

  const handleExport = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await admin.exportEmailTemplates(modifiedOnly);
      const raw = atob(res.data);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setActionLoading(false);
    }
  }, [admin.exportEmailTemplates, modifiedOnly]);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setActionLoading(true);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const result = await admin.importEmailTemplates(base64);
      setImportResult(result);
      await load();
    } catch {
      // error shown via admin.error
    } finally {
      setActionLoading(false);
    }
  }, [admin.importEmailTemplates, load]);

  const templateTypes = EMAIL_TEMPLATE_CONFIG.TEMPLATE_TYPES;
  const isLoading = admin.loading || actionLoading;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">{t('emailTemplates')}</h1>

      {admin.error && (
        <p className="text-destructive text-sm mb-4">{admin.error}</p>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4 p-3 bg-card rounded-xl border border-border">
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={handleExport}
        >
          <ArrowDownTrayIcon className="h-4 w-4 mr-1.5" />
          Export
        </Button>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={modifiedOnly}
            onChange={(e) => setModifiedOnly(e.target.checked)}
          />
          Modified only
        </label>

        <div className="w-px h-6 bg-border" />

        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={() => importFileRef.current?.click()}
        >
          <ArrowUpTrayIcon className="h-4 w-4 mr-1.5" />
          Import
        </Button>
        <input
          ref={importFileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`mb-4 p-3 rounded-xl border ${
          importResult.errors.length > 0
            ? 'border-red-300 bg-red-50'
            : 'border-green-300 bg-green-50'
        }`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className={`text-sm font-medium ${
                importResult.errors.length > 0 ? 'text-red-800' : 'text-green-800'
              }`}>
                Imported {importResult.imported} template(s)
              </p>
              {importResult.warnings.map((w, i) => (
                <p key={`w-${i}`} className="text-xs text-amber-700">{w}</p>
              ))}
              {importResult.errors.map((e, i) => (
                <p key={`e-${i}`} className="text-xs text-red-700">{e}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templateTypes.map(type => (
          <TemplateCard
            key={type}
            type={type}
            metas={templates.filter(m => m.type === type)}
            onDownload={handleDownload}
            onUpload={handleUpload}
            onPreview={handlePreview}
            loading={isLoading}
          />
        ))}
      </div>

    </div>
  );
}
