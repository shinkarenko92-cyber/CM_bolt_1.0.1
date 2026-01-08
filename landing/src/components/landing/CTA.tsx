import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
export const CTA = () => {
  return <section className="py-24 gradient-subtle">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <div className="gradient-hero rounded-3xl p-12 md:p-16 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-pattern opacity-10" />
            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Готовы увеличить доход от апартаментов?
              </h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Присоединяйтесь к счастливым владельцам апартаментов, которые уже автоматизировали свой бизнес с Roomi</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="accent" size="lg" className="text-lg px-8 py-6 h-auto bg-white text-primary hover:bg-white/90" asChild>
                  <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                    Начать бесплатно
                    <ArrowRight className="ml-2" />
                  </a>
                </Button>
                <Button variant="outline" size="lg" className="text-lg px-8 py-6 h-auto border-white text-white hover:bg-white/10">
                  Связаться с нами
                </Button>
              </div>
              <p className="text-white/80 text-sm mt-6">
                Кредитная карта не требуется • Настройка за 5 минут
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>;
};