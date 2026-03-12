import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Users, Star, Zap, Play } from "lucide-react";
import heroDashboard from "@/assets/hero-dashboard.jpg";
import { FadeIn } from "@/components/ui/fade-in";

const floatingStats = [
  {
    icon: TrendingUp,
    value: "+40%",
    label: "рост дохода",
    color: "text-green-500",
    bg: "bg-green-500/10",
    position: "top-6 -left-4 md:-left-10",
  },
  {
    icon: Users,
    value: "5 000+",
    label: "объектов",
    color: "text-primary",
    bg: "bg-primary/10",
    position: "top-6 -right-4 md:-right-10",
  },
];

export const Hero = () => {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16"
      style={{ background: "var(--gradient-subtle)" }}
    >
      {/* Aurora background blobs */}
      <div className="absolute top-1/4 right-[-10%] w-[500px] h-[500px] bg-primary/6 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-[-10%] w-[400px] h-[400px] bg-accent/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-6xl mx-auto">

          {/* Badge */}
          <FadeIn className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full font-medium text-sm border border-primary/20">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Канальный менеджер нового поколения
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={120} className="text-center mb-6">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
              Управляйте апартаментами
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ background: "var(--gradient-hero)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                с Roomi
              </span>
            </h1>
          </FadeIn>

          {/* Subheading */}
          <FadeIn delay={220} className="text-center mb-10">
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light">
              Roomi синхронизирует все каналы продаж, автоматизирует бронирования и
              помогает увеличить доход от апартаментов до&nbsp;40%
            </p>
          </FadeIn>

          {/* CTA Buttons */}
          <FadeIn delay={320} className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button variant="hero" size="lg" className="text-base px-8 h-13 rounded-xl shadow-lg" asChild>
              <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                Начать бесплатно
                <ArrowRight className="ml-2 w-5 h-5" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base px-8 h-13 rounded-xl"
              asChild
            >
              <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                <Play className="mr-2 w-4 h-4 fill-current" />
                Смотреть демо
              </a>
            </Button>
          </FadeIn>

          {/* Dashboard screenshot with floating cards */}
          <FadeIn delay={440}>
            <div className="relative mx-auto max-w-5xl">
              {/* Floating stat — top left */}
              <div className="absolute top-6 -left-4 md:-left-10 z-10 animate-float hidden sm:block">
                <div className="bg-card border border-border/60 rounded-2xl p-3 shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-500 leading-tight">+40%</div>
                    <div className="text-xs text-muted-foreground">рост дохода</div>
                  </div>
                </div>
              </div>

              {/* Floating stat — top right */}
              <div className="absolute top-6 -right-4 md:-right-10 z-10 animate-float-delay hidden sm:block">
                <div className="bg-card border border-border/60 rounded-2xl p-3 shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-primary leading-tight">5 000+</div>
                    <div className="text-xs text-muted-foreground">объектов</div>
                  </div>
                </div>
              </div>

              {/* Floating stat — bottom center */}
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-10 hidden sm:block">
                <div className="bg-card border border-border/60 rounded-2xl px-5 py-3 shadow-lg flex items-center gap-5">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-accent fill-accent" />
                    <span className="font-bold text-sm">4.9</span>
                    <span className="text-xs text-muted-foreground">рейтинг</span>
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm">−80%</span>
                    <span className="text-xs text-muted-foreground">рутины</span>
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="font-bold text-sm">7 дней</span>
                    <span className="text-xs text-muted-foreground">бесплатно</span>
                  </div>
                </div>
              </div>

              {/* Dashboard image */}
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/40">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-accent/10 mix-blend-overlay pointer-events-none" />
                <img
                  src={heroDashboard}
                  alt="Roomi — панель управления апартаментами"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </FadeIn>

          {/* Mobile stats strip */}
          <div className="sm:hidden mt-10 grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, value: "+40%", label: "доход", color: "text-green-500", bg: "bg-green-500/10" },
              { icon: Users, value: "5K+", label: "объектов", color: "text-primary", bg: "bg-primary/10" },
              { icon: Zap, value: "−80%", label: "рутины", color: "text-accent", bg: "bg-accent/10" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border/50 rounded-xl p-3 text-center">
                <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mx-auto mb-1`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div className={`text-base font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
