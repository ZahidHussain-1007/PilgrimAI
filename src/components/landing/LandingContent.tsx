"use client"
import Link from "next/link"
import { TempleSlideshow, type Slide } from "./TempleSlideshow"
import { useT } from "../../lib/i18n"
import { CalendarIcon, RouteIcon, TempleIcon } from "../ui/icons"

/** Landing content flows naturally; the decorative landscape remains behind it. */
export function LandingContent({ slides }: { slides: Slide[] }) {
  const { t } = useT()
  const steps = [
    { title: t("landing.step1Title"), body: t("landing.step1Body"), Icon: TempleIcon },
    { title: t("landing.step2Title"), body: t("landing.step2Body"), Icon: CalendarIcon },
    { title: t("landing.step3Title"), body: t("landing.step3Body"), Icon: RouteIcon },
  ]
  return (
    <div className="relative flex min-h-full flex-col">
      {/* bottom decorative landscape — behind content, low opacity */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-0 select-none">
        <svg viewBox="0 0 1400 240" preserveAspectRatio="xMidYMax slice" className="h-[240px] w-full" fill="none">
          <path d="M0 240C140 176 300 150 460 158c150 8 260 62 420 58 140-4 250-52 380-46 60 3 100 12 140 24v46H0z" fill="#f0e2c8" opacity="0.6" />
          <path d="M0 240C200 190 360 172 560 182c170 8 300 52 470 46 150-5 250-40 370-42v54H0z" fill="#ecdcc0" opacity="0.5" />
          <circle cx="1210" cy="158" r="56" fill="#eccf9b" opacity="0.6" />
          <circle cx="1210" cy="158" r="80" fill="#eccf9b" opacity="0.18" />
          {/* bottom-right temple: curved shikhara + flag + mandapa */}
          <path d="M1102 240v-64c0-2 1-4 3-5l38-19 38 19c2 1 3 3 3 5v64z" fill="#e4cb9e" opacity="0.55" />
          <path d="M1120 172v-26c0-14 8-26 23-34 15 8 23 20 23 34v26z" fill="#e0c292" opacity="0.6" />
          <path d="M1143 112V96" stroke="#cfa96e" strokeWidth="3" strokeLinecap="round" />
          <path d="M1143 96l16 6-16 6z" fill="#d99a4e" opacity="0.75" />
          <path d="M1178 240v-44l16-10 16 10v44zM1076 240v-38l14-9 14 9v38z" fill="#e9d5b0" opacity="0.5" />
          <path d="M1131 240v-28a12 12 0 0 1 24 0v28z" fill="#f6ecd8" opacity="0.55" />
          {/* birds */}
          <path d="M980 128c4-3 7-3 10 0M995 116c4-3 7-3 10 0M1010 132c3.4-2.6 6-2.6 9 0" stroke="#cbb28a" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col gap-[26px] px-[30px] py-[30px]">
        {/* HERO — 316px, normal flow */}
        <div className="h-[240px] shrink-0 lg:h-[316px]">
          <TempleSlideshow slides={slides} />
        </div>

        {/* MAIN — 40 / 60 with vertical divider */}
        <div className="grid flex-1 grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.34em] text-[#79440f]">
              {t("landing.namaste")}
            </p>
            <h1 className="landing-h1 mt-1.5 font-serif text-[clamp(2rem,3.4vw,3.25rem)] font-semibold leading-[1.1] tracking-tight">
              <span className="text-[#29251f]">{t("landing.titleBefore")}</span>{" "}
              <span className="text-[#b66a13]">{t("landing.titleAccent")}</span>
            </h1>
            <p className="mt-3 max-w-[560px] text-[16px] leading-6 text-[#796b5d]">
              {t("landing.sub")}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3.5">
              <Link
                href="/plan"
                className="inline-flex h-[50px] items-center gap-2.5 rounded-full bg-[#b66a13] px-7 text-[15px] font-medium text-white shadow-[0_8px_20px_rgba(182,106,19,0.30)] transition hover:bg-[#99580d]"
              >
                <RouteIcon size={18} />
                {t("landing.cta")}
              </Link>
            </div>
          </div>

          <div className="lg:border-l lg:border-[#e9d8c1] lg:pl-10">
            <h2 className="how-title font-serif text-[21px] font-semibold tracking-tight">
              {t("how.title")}
            </h2>
            <div className="mt-4 flex items-stretch gap-2">
              {steps.map((step, i) => (
                <div key={i} className="flex flex-1 items-stretch gap-2">
                  <div className="relative mt-3 flex h-[178px] flex-1 flex-col rounded-[20px] border border-[#e9d8c1] bg-[#fffdf9] px-4 pb-4 pt-6 text-center">
                    <span className="absolute -left-2.5 -top-2.5 grid h-7 w-7 place-items-center rounded-full border border-[#e9d8c1] bg-[#f5e9d7] text-[11px] font-semibold text-[#b66a13] shadow-sm">
                      {i + 1}
                    </span>
                    <span className="mx-auto text-[#b66a13]" aria-hidden="true">
                      <step.Icon size={30} />
                    </span>
                    <p className="mt-2 text-[14px] font-bold text-[#29251f]">
                      {step.title}
                    </p>
                    <p className="step-body mt-1.5 text-[12px] leading-[1.5] text-[#796b5d]">
                      {step.body}
                    </p>
                  </div>
                  {i < steps.length - 1 && (
                    <span className="self-center text-[#d69a42]" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
