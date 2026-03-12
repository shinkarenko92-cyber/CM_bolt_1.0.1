import { Calendar, BarChart3, Zap, Shield, Globe, Clock } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

const features = [
  {
    icon: Calendar,
    title: "Единый календарь",
    description: "Все бронирования со всех площадок в одном окне. Забудьте о двойных бронированиях навсегда.",
    accent: "from-blue-500/10 to-blue-600/5",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    large: true,
  },
  {
    icon: Globe,
    title: "Интеграция с каналами",
    description: "Циан, Booking.com, Airbnb, Avito и другие — синхронизация в реальном времени.",
    accent: "from-violet-500/10 to-violet-600/5",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500",
    large: false,
  },
  {
    icon: BarChart3,
    title: "Аналитика и отчёты",
    description: "Понятная статистика по доходам, загрузке и эффективности каждого канала.",
    accent: "from-emerald-500/10 to-emerald-600/5",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    large: false,
  },
  {
    icon: Zap,
    title: "Автоматизация",
    description: "Автоматические ответы, динамическое ценообразование и обновление доступности по всем каналам.",
    accent: "from-amber-500/10 to-amber-600/5",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    large: false,
  },
  {
    icon: Shield,
    title: "Безопасность данных",
    description: "Шифрование, резервное копирование и соответствие стандартам безопасности.",
    accent: "from-rose-500/10 to-rose-600/5",
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-500",
    large: false,
  },
  {
    icon: Clock,
    title: "Экономия времени",
    description: "Сокращение рутинных задач до 80%. Больше времени на развитие бизнеса.",
    accent: "from-cyan-500/10 to-cyan-600/5",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-500",
    large: true,
  },
];

export const Features = () => {
  return (
    <div className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-primary/20">
            Возможности
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Всё необходимое для управления
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Мощные инструменты для эффективного управления апартаментами
          </p>
        </FadeIn>

        {/* Bento grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-auto">
          {/* Row 1: large (col-span-2) + normal */}
          <FadeIn delay={0} className="md:col-span-2">
            <FeatureCard feature={features[0]} />
          </FadeIn>
          <FadeIn delay={80}>
            <FeatureCard feature={features[1]} />
          </FadeIn>

          {/* Row 2: normal + normal + large (col-span-2) starts row 3 */}
          <FadeIn delay={120}>
            <FeatureCard feature={features[2]} />
          </FadeIn>
          <FadeIn delay={160}>
            <FeatureCard feature={features[3]} />
          </FadeIn>
          <FadeIn delay={200}>
            <FeatureCard feature={features[4]} />
          </FadeIn>

          {/* Row 3: large spanning full or col-span-3 */}
          <FadeIn delay={240} className="md:col-span-3">
            <FeatureCardWide feature={features[5]} />
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

function FeatureCard({ feature }: { feature: typeof features[number] }) {
  return (
    <div
      className={`group relative bg-card border border-border/50 rounded-2xl p-7 h-full overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-border hover:-translate-y-0.5`}
    >
      {/* Gradient tint */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.accent} opacity-60 rounded-2xl pointer-events-none`} />
      <div className="relative z-10">
        <div className={`w-12 h-12 ${feature.iconBg} rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}>
          <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
        </div>
        <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
        <p className="text-muted-foreground leading-relaxed text-sm">{feature.description}</p>
      </div>
    </div>
  );
}

function FeatureCardWide({ feature }: { feature: typeof features[number] }) {
  return (
    <div
      className={`group relative bg-card border border-border/50 rounded-2xl p-7 overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-border hover:-translate-y-0.5`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.accent} opacity-60 rounded-2xl pointer-events-none`} />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
        <div className={`w-14 h-14 ${feature.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
          <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
        </div>
        <div>
          <h3 className="text-2xl font-bold mb-2">{feature.title}</h3>
          <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
        </div>
        <div className="md:ml-auto flex-shrink-0">
          <div className={`${feature.iconBg} ${feature.iconColor} rounded-xl px-5 py-3 text-center`}>
            <div className="text-3xl font-bold">−80%</div>
            <div className="text-xs font-medium mt-0.5 opacity-80">времени на рутину</div>
          </div>
        </div>
      </div>
    </div>
  );
}
