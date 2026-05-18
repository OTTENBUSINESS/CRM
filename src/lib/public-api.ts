/**
 * Public API Client — proxy seguro para formulários públicos
 * Todas as chamadas vão pela edge function quiz-api (service_role)
 * Frontend público NUNCA acessa tabelas sensíveis direto
 */

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quiz-api`;

async function callApi(body: Record<string, any>): Promise<any> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const publicApi = {
  // HR
  async hrFindCandidate(email: string) {
    return callApi({ action: 'hr_find_candidate', email });
  },
  async hrSaveCandidate(data: Record<string, any>) {
    return callApi({ action: 'hr_save_candidate', ...data });
  },
  async hrSaveApplication(data: { candidate_id: string; vacancy_id: string; form_responses?: any; cover_letter?: string }) {
    return callApi({ action: 'hr_save_application', ...data });
  },

  // Onboarding
  async onboardingFind(form_token: string) {
    return callApi({ action: 'onboarding_find', form_token });
  },
  async onboardingUpdate(form_token: string, data: Record<string, any>) {
    return callApi({ action: 'onboarding_update', form_token, ...data });
  },
};
