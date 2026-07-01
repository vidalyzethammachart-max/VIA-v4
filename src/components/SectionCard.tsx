import type { LikertValue, Question, Section } from "../config/sections";
import { useLanguage } from "../i18n/useLanguage";

type Props = {
  section: Section;
  answers: Record<string, LikertValue | undefined>;
  onToggle: (questionId: string, value: LikertValue) => void;
  showValidation?: boolean;
};

export function SectionCard({
  section,
  answers,
  onToggle,
  showValidation = false,
}: Props) {
  const { t } = useLanguage();
  const ratingHeaders: { value: LikertValue; label: string }[] = [
    { value: 1, label: t("dashboard.rating.lowest") },
    { value: 2, label: t("dashboard.rating.low") },
    { value: 3, label: t("dashboard.rating.medium") },
    { value: 4, label: t("dashboard.rating.high") },
    { value: 5, label: t("dashboard.rating.highest") },
  ];

  const unansweredCount = section.questions.filter(
    (question) => typeof answers[question.id] !== "number",
  ).length;

  return (
    <div
      className={`ui-hover-card space-y-4 rounded-2xl bg-white p-4 shadow-sm md:p-6 ${
        showValidation && unansweredCount > 0
          ? "border border-red-300 ring-2 ring-red-100"
          : "border border-slate-200"
      }`}
    >
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {section.id}
          </span>
          <h3 className="text-sm font-semibold text-slate-900 md:text-base">
            {section.title}
          </h3>
          {showValidation && unansweredCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
              {t("form.missingCount", { count: unansweredCount })}
            </span>
          )}
        </div>
        {section.description && (
          <p className="text-xs text-slate-500 md:text-sm">{section.description}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="hidden grid-cols-[50%_repeat(5,10%)] border-b border-slate-200 bg-slate-50 text-[10px] text-slate-600 md:grid md:text-xs">
          <div className="flex items-center px-3 py-2 font-medium md:px-4">
            {t("dashboard.ratingDetail")}
          </div>
          {ratingHeaders.map((header) => (
            <div
              key={header.value}
              className="flex flex-col items-center justify-center border-l border-slate-200 px-1 py-1.5"
            >
              <span>{header.label}</span>
              <span className="text-[9px] text-slate-400 md:text-[10px]">
                ({header.value})
              </span>
            </div>
          ))}
        </div>

        <div className="divide-y divide-slate-100 text-xs md:text-sm">
          {section.questions.map((question: Question, idx: number) => {
            const isAnswered = typeof answers[question.id] === "number";

            return (
              <div
                key={question.id}
                className={`flex flex-col md:grid md:grid-cols-[50%_repeat(5,10%)] ${
                  showValidation && !isAnswered ? "bg-red-50/50" : "bg-white"
                }`}
              >
                <div className="flex items-start gap-2 px-3 py-3 md:px-4">
                  <span
                    className={`mt-0.5 text-[11px] ${
                      showValidation && !isAnswered ? "text-red-500" : "text-slate-400"
                    }`}
                  >
                    {idx + 1}.
                  </span>
                  <p
                    className={`font-medium md:font-normal ${
                      showValidation && !isAnswered ? "text-red-700" : "text-slate-700"
                    }`}
                  >
                    {question.label}
                  </p>
                </div>

                <div className="flex border-t border-slate-50 md:contents md:border-t-0">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const selected = answers[question.id] === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onToggle(question.id, value as LikertValue)}
                        className={`flex flex-1 items-center justify-center border-l border-slate-100 py-3 first:border-l-0 motion-safe:transition motion-safe:duration-200 motion-safe:ease-in-out md:flex-none md:py-2 md:first:border-l ${
                          selected ? "bg-primary/5" : "bg-white motion-safe:hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold motion-safe:transition motion-safe:duration-200 motion-safe:ease-in-out md:h-7 md:w-7 ${
                            selected
                              ? "border-primary bg-primary text-white shadow-sm motion-safe:scale-105"
                              : "border-slate-300 bg-white text-slate-400/60"
                          }`}
                        >
                          {selected ? "✓" : <span className="md:hidden">{value}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
