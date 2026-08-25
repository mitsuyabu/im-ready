import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import ValuePropsSection from "@/components/landing/ValuePropsSection";
import ClosingCtaSection from "@/components/landing/ClosingCtaSection";
import LandingFooter from "@/components/landing/LandingFooter";

/**
 * ログイン前の公開サービス紹介ページ。以前はBrandLogo＋簡易テキストのみの入口だったが、
 * サービス説明はここに集約する方針（/mypage・/loginでは行わない）。
 * AppNav配下ではないため（/mypage・/plans等の5つのlayout.tsxとは無関係）、
 * 専用のLandingHeader/LandingFooterで独立して構成する。
 */
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-worksheet-surface">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <ValuePropsSection />
        <ClosingCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
