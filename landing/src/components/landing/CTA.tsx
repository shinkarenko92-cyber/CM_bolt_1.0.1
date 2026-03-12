import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

export const CTA = () => {
  return (
    <section className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <FadeIn>
          <div className="max-w-4xl mx-auto relative rounded-3xl overflow-hidden shadow-2xl">
            {/* Gradient background */}
            <div className="absolute inset-0 gradient-hero" />
            {/* Decorative blobs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />

            <div className="relative z-10 px-8 py-14 md:px-16 md:py-16 text-center">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
                Готовы увеличить доход
                <br className="hidden md:block" /> от апартаментов?
              </h2>
              <p className="text-xl text-white/85 mb-10 max-w-2xl mx-auto font-light leading-relaxed">
                Присоединяйтесь к тысячам владельцев апартаментов, которые уже
                автоматизировали бизнес с Roomi
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Button
                  size="lg"
                  className="text-base px-8 h-13 rounded-xl bg-white text-primary hover:bg-white/92 shadow-lg font-semibold transition-all"
                  asChild
                >
                  <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                    Начать бесплатно
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base px-8 h-13 rounded-xl border-white/40 text-white hover:bg-white/10 hover:border-white/60 font-medium"
                  asChild
                >
                  <a href="mailto:hello@roomi.pro">
                    <MessageCircle className="mr-2 w-4 h-4" />
                    Связаться с нами
                  </a>
                </Button>
              </div>

              {/* Risk reducers */}
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-white/70 text-sm">
                {[
                  "7 дней бесплатно",
                  "Без кредитной карты",
                  "Настройка за 5 минут",
                  "Отмена в любой момент",
                ].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};
