import { Link } from "react-router-dom";

import Logo from "../assets/logo_no_bg.png";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";

type HomeAction = {
  href: string;
  title: string;
  variant: "primary" | "secondary";
};

const ACTIONS: HomeAction[] = [
  {
    href: "/form-submit",
    title: "home.startEvaluation",
    variant: "primary",
  },
  {
    href: "/dashboard",
    title: "home.viewResults",
    variant: "secondary",
  },
];

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-white">
      <MainNavbar />

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-white">
          <div className="relative mx-auto grid min-h-[calc(100vh-96px)] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
            <div className="max-w-3xl">

              <h1 className="text-3xl font-bold leading-tight text-slate-950 sm:text-4xl lg:text-5xl">
                {t("navbar.title")}
              </h1>
              <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-[#04418b] sm:text-lg">
                {t("navbar.subtitle")}
              </p>
              <p className="mt-6 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                {t("home.heroDescription")}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {ACTIONS.map((action) => (
                  <Link
                    key={action.href}
                    to={action.href}
                    className={
                      action.variant === "primary"
                        ? "ui-hover-button inline-flex min-h-12 items-center justify-center rounded-lg border border-[#04418b] bg-[#04418b] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#03326a]"
                        : "ui-hover-button inline-flex min-h-12 items-center justify-center rounded-lg border border-[#04418b]/30 bg-white px-6 py-3 text-center text-sm font-semibold text-[#04418b] shadow-sm hover:bg-[#04418b]/5"
                    }
                  >
                    {t(action.title)}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
                <div className="relative flex min-h-72 flex-col items-center justify-center rounded-2xl border border-[#04418b]/10 bg-slate-50 px-6 py-10 text-center">
                  <img
                    src={Logo}
                    alt="VIA"
                    className="h-28 w-auto object-contain sm:h-36"
                  />
        
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* <section className="bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#04418b]">
                VIA Capabilities
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
                {t("home.featuresTitle")}
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature, index) => (
                <article
                  key={feature.title}
                  className="ui-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#04418b] text-sm font-bold text-white">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="text-base font-bold text-slate-950">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section> */}
      </main>
    </div>
  );
}
