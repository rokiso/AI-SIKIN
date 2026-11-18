import { z } from "zod";
export const consentSubmissionSchema = z
  .object({
    consentType: z.literal("BIOMETRIC_FACE_DATA"),
    termsVersion: z.string().min(1).max(40),
    isAgreed: z.literal(true),
  })
  .strict();
export const consentTermsSchema = z.object({
  termsId: z.uuid(),
  consentType: z.literal("BIOMETRIC_FACE_DATA"),
  version: z.string(),
  title: z.string(),
  contentMarkdown: z.string(),
  enactedAt: z.iso.datetime(),
});
export type ConsentTerms = z.infer<typeof consentTermsSchema>;
export const consentStatusSchema = z.object({
  consentType: z.literal("BIOMETRIC_FACE_DATA"),
  hasValidConsent: z.boolean(),
  requiresReconsent: z.boolean(),
  activeVersion: z.string(),
  consentedVersion: z.string().nullable(),
  consentedAt: z.iso.datetime().nullable(),
});
export type ConsentStatus = z.infer<typeof consentStatusSchema>;
