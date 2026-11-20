export type EvaluationDeleteErrorCode = "in_use" | "not_allowed" | "failed";

export class EvaluationDeleteError extends Error {
  code: EvaluationDeleteErrorCode;
  constructor(code: EvaluationDeleteErrorCode, message: string);
}

export function deleteEvaluationById(client: unknown, id: number | string): Promise<void>;
