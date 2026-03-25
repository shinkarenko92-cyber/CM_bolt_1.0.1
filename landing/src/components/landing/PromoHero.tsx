import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Play, MessageSquare } from "lucide-react";
import promoDashboard from "@/assets/promo-dashboard.png";
import { FadeIn } from "@/components/ui/fade-in";

export const PromoHero = () => {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16"
      style={{ background: "var(--gradient-subtle)" }}
    >
      {/* Aurora background blobs */}
      <div className="absolute top-1/4 right-[-10%] w-[500px] h-[500px] bg-primary/6 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-[-10%] w-[400px] h-[400px] bg-accent/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-6xl mx-auto text-center">

          {/* Badge */}
          <FadeIn className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-full font-bold text-sm border border-amber-200 shadow-sm animate-pulse">
              🚀 Спецпредложение для первых 10 клиентов: 500₽ за первый месяц!
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={120} className="mb-6">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
              Управляйте апартаментами
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ background: "var(--gradient-hero)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                проще и быстрее
              </span>
            </h1>
          </FadeIn>

          {/* Subheading */}
          <FadeIn delay={220} className="mb-10">
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light">
              Roomi синхронизирует все каналы, автоматизирует Авито и предоставляет настраиваемую аналитику.
              Станьте одним из первых 10 пользователей и получите <b>первый месяц за 500₽</b>.
            </p>
          </FadeIn>

          {/* CTA Buttons */}
          <FadeIn delay={320} className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button size="lg" className="text-base px-8 h-12 rounded-lg bg-primary hover:bg-primary/90" asChild>
              <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                Занять место за 500₽
                <ArrowRight className="ml-2 w-5 h-5" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base px-8 h-12 rounded-lg"
              asChild
            >
              <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                <Play className="mr-2 w-4 h-4 fill-current" />
                Смотреть демо
              </a>
            </Button>
          </FadeIn>

          {/* Dashboard screenshot */}
          <FadeIn delay={440}>
            <div className="relative mx-auto max-w-5xl">
              {/* Floating feature — top left */}
              <div className="absolute top-6 -left-4 md:-left-10 z-10 animate-float hidden sm:block text-left">
                <div className="bg-card border border-border/60 rounded-2xl p-3 shadow-lg flex items-center gap-3 min-w-[200px]">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-tight">Мессенджер Авито</div>
                    <div className="text-xs text-muted-foreground">прямо в Roomi</div>
                  </div>
                </div>
              </div>

              {/* Floating feature — top right */}
              <div className="absolute top-6 -right-4 md:-right-10 z-10 animate-float-delay hidden sm:block text-left">
                <div className="bg-card border border-border/60 rounded-2xl p-3 shadow-lg flex items-center gap-3 min-w-[200px]">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-tight">Настраиваемая аналитика</div>
                    <div className="text-xs text-muted-foreground">виджеты под вас</div>
                  </div>
                </div>
              </div>

              {/* Dashboard image */}
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/40 bg-white">
                <img
                  src={promoDashboard}
                  alt="Roomi — панель управления апартаментами"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};
