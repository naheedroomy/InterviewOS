import type { InterviewContextDocumentKind } from '../types/electron';

export interface StagedUploadFile {
  id: string;
  filePath: string;
  name: string;
  sizeBytes: number;
  fileType: string;
  contextKind: InterviewContextDocumentKind;
  contextDescription: string;
}

export const DOCUMENT_KIND_OPTIONS: Array<{ kind: InterviewContextDocumentKind; label: string }> = [
  { kind: 'resume', label: 'CV / Resume' },
  { kind: 'job_description', label: 'Target Role Spec (JD)' },
  { kind: 'cover_letter', label: 'Cover Letter' },
  { kind: 'prep_kit', label: 'Interview Prep Kit' },
  { kind: 'project', label: 'Project Portfolio' },
  { kind: 'notes', label: 'Cheat Sheet & Notes' },
  { kind: 'other', label: 'General Reference' },
];

export function detectContextKindFromName(fileName: string): InterviewContextDocumentKind {
  const lower = fileName.toLowerCase();
  if (lower.includes('resume') || lower.includes('cv')) return 'resume';
  if (
    lower.includes('job') ||
    lower.includes('jd') ||
    lower.includes('spec') ||
    lower.includes('role') ||
    lower.includes('description')
  ) {
    return 'job_description';
  }
  if (lower.includes('cover')) return 'cover_letter';
  if (
    lower.includes('prep') ||
    lower.includes('guide') ||
    lower.includes('cheat') ||
    lower.includes('question') ||
    lower.includes('kit')
  ) {
    return 'prep_kit';
  }
  if (
    lower.includes('project') ||
    lower.includes('portfolio') ||
    lower.includes('system') ||
    lower.includes('arch')
  ) {
    return 'project';
  }
  if (lower.includes('note') || lower.includes('summary')) return 'notes';
  return 'other';
}
