/**
 * Nationwide profile migration boundary.
 * Education membership is optional and must never be synthesized as a fake
 * university/campus merely to bypass legacy Firestore Rules.
 * This is metadata normalization, NOT Firebase Auth identity verification.
 */
export type OptionalAcademicSelection = {
  institution_id?: string;
  institution_name?: string;
  campus_id?: string;
  campus_name?: string;
};

export function nationalAcademicMetadata(input: OptionalAcademicSelection): Record<string, string> {
  const institutionId = String(input.institution_id || '').trim();
  const campusId = String(input.campus_id || '').trim();
  const institutionName = String(input.institution_name || '').trim();
  const campusName = String(input.campus_name || '').trim();
  if (!institutionId && !campusId) {
    if (institutionName || campusName) throw new Error('ACADEMIC_SELECTION_INCOMPLETE');
    return {};
  }
  if (!institutionId || !campusId) throw new Error('ACADEMIC_SELECTION_INCOMPLETE');
  const fake = /^(?:none|null|undefined|national|mexico|mx|sin[ _-]?universidad|no[ _-]?campus)$/i;
  if (fake.test(institutionId) || fake.test(campusId)) throw new Error('ACADEMIC_PLACEHOLDER_FORBIDDEN');
  if (institutionId.length < 2 || institutionId.length > 120 || campusId.length < 2 || campusId.length > 120) {
    throw new Error('ACADEMIC_ID_INVALID');
  }
  if (!institutionName || !campusName || institutionName.length > 120 || campusName.length > 120) {
    throw new Error('ACADEMIC_NAME_INVALID');
  }
  return {
    institution_id: institutionId,
    institution_name: institutionName,
    campus_id: campusId,
    campus_name: campusName,
  };
}
