import { createHash } from 'node:crypto';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {
  EMAIL_TEMPLATE_CONFIG,
  TEMPLATE_VARIABLES,
  COMMON_TEMPLATE_VARIABLES,
} from '@passvault/shared';
import type {
  EmailTemplateMeta,
  EmailTemplateType,
  EmailTemplateImportResult,
  EmailTemplateExportManifest,
} from '@passvault/shared';
import AdmZip from 'adm-zip';

const s3 = new S3Client({});
const BUCKET = process.env.TEMPLATES_BUCKET ?? '';
const VALID_TYPES = new Set<string>(EMAIL_TEMPLATE_CONFIG.TEMPLATE_TYPES);
const VALID_LANGS = new Set<string>(EMAIL_TEMPLATE_CONFIG.SUPPORTED_LANGUAGES);

export function isValidTemplateType(type: string): type is EmailTemplateType {
  return VALID_TYPES.has(type);
}

export function isValidLanguage(lang: string): boolean {
  return VALID_LANGS.has(lang);
}

// ── Original meta (hash manifest) cache ─────────────────────────────────────

interface OriginalMeta {
  version: string;
  hashes: Record<string, string>;
}

let cachedMeta: OriginalMeta | undefined;

async function getOriginalMeta(): Promise<OriginalMeta | undefined> {
  if (cachedMeta) return cachedMeta;
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: 'templates/_meta.json' }),
    );
    const body = await res.Body?.transformToString('utf-8');
    if (body) {
      cachedMeta = JSON.parse(body) as OriginalMeta;
      return cachedMeta;
    }
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return undefined;
    console.warn('Failed to load _meta.json:', err);
  }
  return undefined;
}

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ── List templates with hash comparison ─────────────────────────────────────

export async function listTemplates(): Promise<EmailTemplateMeta[]> {
  const keys: Array<{
    key: string;
    type: EmailTemplateType;
    language: string;
    lastModifiedAt: string;
    sizeBytes: number;
  }> = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'templates/',
      ContinuationToken: continuationToken,
    }));

    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;

      const match = key.match(/^templates\/([^/]+)\/([^/]+)\.html$/);
      if (!match) continue;

      const [, language, type] = match;
      if (!VALID_TYPES.has(type) || !VALID_LANGS.has(language)) continue;

      keys.push({
        key,
        type: type as EmailTemplateType,
        language,
        lastModifiedAt: obj.LastModified?.toISOString() ?? new Date().toISOString(),
        sizeBytes: obj.Size ?? 0,
      });
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  // Load original hashes and compute current hashes in parallel
  const [meta, contents] = await Promise.all([
    getOriginalMeta(),
    Promise.all(
      keys.map(async (k) => {
        const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: k.key }));
        return res.Body?.transformToString('utf-8') ?? '';
      }),
    ),
  ]);

  return keys.map((k, i) => {
    const content = contents[i];
    const currentHash = computeHash(content);
    const metaKey = `${k.language}/${k.type}.html`;
    const originalHash = meta?.hashes[metaKey];
    const modified = originalHash !== undefined ? currentHash !== originalHash : false;

    return {
      type: k.type,
      language: k.language,
      lastModifiedAt: k.lastModifiedAt,
      sizeBytes: k.sizeBytes,
      modified,
    };
  });
}

// ── Get a single template ───────────────────────────────────────────────────

export async function getTemplate(type: string, language: string): Promise<string | undefined> {
  const key = `templates/${language}/${type}.html`;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return await res.Body?.transformToString('utf-8');
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return undefined;
    throw err;
  }
}

// ── Upload or replace a template ────────────────────────────────────────────

export async function putTemplate(type: string, language: string, html: string): Promise<void> {
  const key = `templates/${language}/${type}.html`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: html,
    ContentType: 'text/html; charset=utf-8',
  }));
}

// ── Export templates ────────────────────────────────────────────────────────

export async function exportTemplates(
  modifiedOnly: boolean,
): Promise<{ filename: string; data: string }> {
  const templates = await listTemplates();
  const filtered = modifiedOnly ? templates.filter((t) => t.modified) : templates;

  // Download all template contents in parallel
  const contents = await Promise.all(
    filtered.map(async (t) => {
      const html = await getTemplate(t.type, t.language);
      return { type: t.type, language: t.language, html: html ?? '' };
    }),
  );

  // Build _export.json manifest
  const manifest: EmailTemplateExportManifest = {
    version: EMAIL_TEMPLATE_CONFIG.TEMPLATE_VERSION,
    exportedAt: new Date().toISOString(),
    templates: contents.map((c) => ({
      type: c.type,
      language: c.language,
      hash: computeHash(c.html),
    })),
  };

  // Create zip archive in memory using AdmZip (synchronous, no stream issues in Lambda)
  const zip = new AdmZip();
  zip.addFile('_export.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  for (const c of contents) {
    zip.addFile(`${c.language}/${c.type}.html`, Buffer.from(c.html, 'utf-8'));
  }
  const zipBuffer = zip.toBuffer();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `passvault-templates-${timestamp}.zip`;

  return { filename, data: zipBuffer.toString('base64') };
}

// ── Import templates ────────────────────────────────────────────────────────

export async function importTemplates(
  zipBase64: string,
): Promise<EmailTemplateImportResult> {
  const result: EmailTemplateImportResult = { imported: 0, warnings: [], errors: [] };

  let zipBuffer: Buffer;
  try {
    zipBuffer = Buffer.from(zipBase64, 'base64');
  } catch {
    result.errors.push('Invalid base64 data');
    return result;
  }

  // Validate zip magic bytes (PK\x03\x04)
  if (zipBuffer.length < 4 || zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4B) {
    result.errors.push('Invalid zip archive');
    return result;
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    result.errors.push('Invalid zip archive');
    return result;
  }

  // Read and validate _export.json
  const manifestEntry = zip.getEntry('_export.json');
  if (manifestEntry) {
    try {
      const manifest = JSON.parse(
        manifestEntry.getData().toString('utf-8'),
      ) as EmailTemplateExportManifest;
      if (manifest.version !== EMAIL_TEMPLATE_CONFIG.TEMPLATE_VERSION) {
        result.warnings.push(
          `Version mismatch: archive=${manifest.version}, current=${EMAIL_TEMPLATE_CONFIG.TEMPLATE_VERSION}`,
        );
      }
    } catch {
      result.warnings.push('Could not parse _export.json manifest');
    }
  } else {
    result.warnings.push('No _export.json manifest found in archive');
  }

  // Process each .html entry
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith('.html'));
  const uploads: Array<Promise<void>> = [];

  for (const entry of entries) {
    const pathMatch = entry.entryName.match(/^([^/]+)\/([^/]+)\.html$/);
    if (!pathMatch) {
      result.errors.push(`Invalid path format: ${entry.entryName}`);
      continue;
    }

    const [, language, type] = pathMatch;

    if (!isValidLanguage(language)) {
      result.errors.push(`Unknown language '${language}' in ${entry.entryName}`);
      continue;
    }

    if (!isValidTemplateType(type)) {
      result.errors.push(`Unknown template type '${type}' in ${entry.entryName}`);
      continue;
    }

    const html = entry.getData().toString('utf-8');

    if (html.length > EMAIL_TEMPLATE_CONFIG.MAX_TEMPLATE_SIZE_BYTES) {
      result.errors.push(
        `${entry.entryName} exceeds maximum size of ${EMAIL_TEMPLATE_CONFIG.MAX_TEMPLATE_SIZE_BYTES} bytes`,
      );
      continue;
    }

    // Validate placeholders
    const placeholders = [...html.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const knownVars = new Set<string>([
      ...COMMON_TEMPLATE_VARIABLES,
      ...(TEMPLATE_VARIABLES[type] ?? []),
    ]);

    for (const placeholder of placeholders) {
      if (!knownVars.has(placeholder)) {
        result.warnings.push(
          `Unknown placeholder '{{${placeholder}}}' in ${entry.entryName}`,
        );
      }
    }

    uploads.push(putTemplate(type, language, html).then(() => { result.imported++; }));
  }

  await Promise.all(uploads);

  return result;
}
