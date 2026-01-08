import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import heroDashboard from "@/assets/hero-dashboard.jpg";
export const Hero = () => {
  return <section className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-subtle">
      <div className="container mx-auto px-6 md:px-4 py-32 md:py-20 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6 font-medium text-sm">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Канальный менеджер нового поколения
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Управляйте апартаментами c  Roomi
            <br />
              
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
              Roomi синхронизирует все каналы продаж, автоматизирует бронирования и 
              помогает увеличить доход от апартаментов до 40%
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button variant="hero" size="lg" className="text-lg px-8 py-6 h-auto" asChild>
                <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                  Начать бесплатно
                  <ArrowRight className="ml-2" />
                </a>
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6 h-auto">
                <Play className="mr-2" />
                Смотреть демо
              </Button>
            </div>
          </div>

          <div className="mt-16 animate-slide-up">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/50">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-accent/20 mix-blend-overlay" />
              <img src={heroDashboard} alt="Roomi Dashboard Interface" className="w-full h-auto" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-grid-pattern opacity-5" />
    </section>;
};