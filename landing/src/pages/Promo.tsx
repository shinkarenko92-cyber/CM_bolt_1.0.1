import { Navbar } from "@/components/landing/Navbar";
import { PromoHero } from "@/components/landing/PromoHero";
import { PromoFeatures } from "@/components/landing/PromoFeatures";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyEarly } from "@/components/landing/WhyEarly";
import { PromoPricing } from "@/components/landing/PromoPricing";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

const Promo = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <PromoHero />
      <section id="features">
        <PromoFeatures />
      </section>
      <section id="why-early">
        <WhyEarly />
      </section>
      <section id="how-it-works">
        <HowItWorks />
      </section>
      <section id="pricing">
        <PromoPricing />
      </section>
      <CTA />
      <Footer />
    </div>
  );
};

export default Promo;
